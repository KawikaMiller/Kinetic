import { beforeAll, describe, expect, it } from 'vitest';
import { openSqlite, type SqliteDb } from '../../core/testing/sqlite';
import {
  AGGS, FILTERS, FRAMES, GROUP_COLS, RANK_SQL, SALES, WINDOW_ORDER, aggregate, groupSql, queryError, runGroup, runRanking, runWindow, windowSql,
  type Cell, type GroupQuery,
} from './model';

let db: SqliteDb<Record<string, Cell>>;
beforeAll(() => {
  db = openSqlite<Record<string, Cell>>();
  db.exec('CREATE TABLE sales (id INTEGER, region TEXT, rep TEXT, month TEXT, amount INTEGER)');
  for (const s of SALES) db.exec(`INSERT INTO sales VALUES (${s.id}, '${s.region}', '${s.rep}', '${s.month}', ${s.amount ?? 'NULL'})`);
});
const query = (sql: string[]) => db.prepare(sql.join('\n')).all().map((r) => Object.values(r));
const close = (a: Cell, b: Cell) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);
const sameOrdered = (a: Cell[][], b: Cell[][]) => a.length === b.length && a.every((r, i) => r.length === b[i].length && r.every((v, j) => close(v, b[i][j])));

const ALL: GroupQuery[] = GROUP_COLS.flatMap((by) => AGGS.flatMap((a) => FILTERS.flatMap((f) => (['where', 'having'] as const).flatMap((place) =>
  [false, true].map((withRep) => ({ by, agg: a.id, filter: f.id, place, withRep }))))));

describe('GROUP BY: every builder combination against SQLite', () => {
  it(`covers all ${ALL.length} combinations`, () => {
    let valid = 0;
    for (const q of ALL) {
      const run = runGroup(q);
      const label = `${JSON.stringify(q)}\n${run.sql.join(' ')}`;
      if (run.error) {
        // Where we call it an error, SQLite either agrees or is the documented lenient exception.
        let sqliteOk = true;
        try {
          query(run.sql);
        } catch {
          sqliteOk = false;
        }
        expect(sqliteOk, label).toBe(run.error.sqliteAccepts);
        continue;
      }
      valid++;
      expect(sameOrdered(run.result, query(run.sql)), label).toBe(true);
    }
    expect(valid).toBeGreaterThan(150);
  });

  it('COUNT(amount) is smaller than COUNT(*) wherever a group holds a NULL amount', () => {
    for (const by of GROUP_COLS) {
      const star = runGroup({ by, agg: 'count-star', filter: 'none', place: 'where', withRep: false });
      const col = runGroup({ by, agg: 'count-amount', filter: 'none', place: 'where', withRep: false });
      star.groups.forEach((g, i) => {
        const nulls = g.rows.filter((r) => SALES[r].amount === null).length;
        expect(col.groups[i].value).toBe((g.value as number) - nulls);
      });
    }
    const whole = (agg: 'count-star' | 'count-amount') => runGroup({ by: 'none', agg, filter: 'none', place: 'where', withRep: false }).result[0][0];
    expect(whole('count-star')).toBe(16);
    expect(whole('count-amount')).toBe(14);
  });

  it('a filter on the grouped column gives the same rows in WHERE and HAVING; one on amount only works in WHERE', () => {
    const w = runGroup({ by: 'region', agg: 'sum', filter: 'not-west', place: 'where', withRep: false });
    const h = runGroup({ by: 'region', agg: 'sum', filter: 'not-west', place: 'having', withRep: false });
    expect(w.result).toEqual(h.result);
    expect(w.whereKept.filter((k) => !k).length).toBe(6);
    expect(h.groups.filter((g) => !g.kept).map((g) => g.key)).toEqual(['West']);
    expect(runGroup({ by: 'region', agg: 'sum', filter: 'amount-100', place: 'having', withRep: false }).error?.kind).toBe('ungrouped-in-having');
  });

  it('amount >= 100 drops the NULL amounts too (NULL >= 100 is UNKNOWN)', () => {
    const r = runGroup({ by: 'none', agg: 'count-star', filter: 'amount-100', place: 'where', withRep: false });
    expect(r.result[0][0]).toBe(SALES.filter((s) => s.amount !== null && s.amount >= 100).length);
  });

  it('aggregates in WHERE are an error in SQLite too; a bare rep is accepted by SQLite only', () => {
    expect(queryError({ by: 'region', agg: 'sum', filter: 'sum-450', place: 'where', withRep: false })?.sqliteAccepts).toBe(false);
    const bare = { by: 'region', agg: 'sum', filter: 'none', place: 'where', withRep: true } as const;
    expect(queryError(bare)?.kind).toBe('ungrouped-select');
    expect(query(groupSql(bare)).length).toBe(3);
  });

  it('hand-worked: sales per region', () => {
    expect(runGroup({ by: 'region', agg: 'sum', filter: 'none', place: 'where', withRep: false }).result).toEqual([['North', 500], ['South', 550], ['West', 405]]);
    expect(runGroup({ by: 'region', agg: 'sum', filter: 'sum-450', place: 'having', withRep: false }).result).toEqual([['North', 500], ['South', 550]]);
  });

  it('aggregates over nothing: COUNT gives 0, the rest NULL', () => {
    expect(aggregate('count-star', [])).toBe(0);
    expect(aggregate('count-amount', [null])).toBe(0);
    expect(aggregate('sum', [null, null])).toBeNull();
    expect(aggregate('avg', [])).toBeNull();
  });
});

describe('window functions against SQLite', () => {
  for (const f of FRAMES)
    it(`${f.id} matches SQLite row for row`, () => {
      const ours = runWindow(f.id).map((w) => [SALES[w.sale].id, w.value]);
      const theirs = query(windowSql(f.id)).map((r) => [r[0], r[5]]);
      expect(ours).toEqual(theirs);
    });

  it('a window keeps every row, unlike GROUP BY', () => {
    for (const f of FRAMES) expect(runWindow(f.id).length).toBe(SALES.length);
  });

  it('the default frame (RANGE) gives tied months one shared total; ROWS splits them', () => {
    const def = runWindow('default');
    const rows = runWindow('rows-unbounded');
    const south = (w: ReturnType<typeof runWindow>) => w.filter((x) => SALES[x.sale].region === 'South' && SALES[x.sale].month === '2026-02').map((x) => x.value);
    expect(south(def)).toEqual([350, 350]);
    expect(south(rows)).toEqual([290, 350]);
  });

  it('ROWS 2 PRECEDING never holds more than three rows, all from one region', () => {
    for (const w of runWindow('rows-2')) {
      expect(w.frame.length).toBeLessThanOrEqual(3);
      expect(new Set(w.frame.map((i) => SALES[i].region)).size).toBe(1);
    }
  });

  it('the table order is region, month, id', () => {
    expect(WINDOW_ORDER.slice(0, 5).map((i) => SALES[i].id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('ranking against SQLite', () => {
  it('ROW_NUMBER, RANK and DENSE_RANK match SQLite on the ties', () => {
    const ours = runRanking().map((r) => [SALES[r.sale].region, SALES[r.sale].rep, SALES[r.sale].amount, r.rowNumber, r.rank, r.denseRank]);
    expect(ours).toEqual(query(RANK_SQL));
  });

  it('hand-worked South: 200, 110, 90, 90, 60', () => {
    const south = runRanking().filter((r) => SALES[r.sale].region === 'South');
    expect(south.map((r) => r.rowNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(south.map((r) => r.rank)).toEqual([1, 2, 3, 3, 5]);
    expect(south.map((r) => r.denseRank)).toEqual([1, 2, 3, 3, 4]);
    expect(south.filter((r) => r.tied).length).toBe(2);
  });
});
