import { describe, expect, it } from 'vitest';
import { ORDERS, USERS, type Cell } from './data';
import { QUERIES } from './queries';

// An independent, deliberately boring evaluation of each query, written straight from
// the SQL text, to check the animated frame builders end with the same result.
const expected: Record<string, { cols: string[]; rows: Cell[][]; ordered: boolean }> = {
  select: { cols: ['name', 'city'], rows: USERS.map((u) => [u.name, u.city]), ordered: false },
  where: {
    cols: ['name', 'city'],
    rows: USERS.filter((u) => u.city === 'London').map((u) => [u.name, u.city]),
    ordered: false,
  },
  order: {
    cols: ['name', 'city'],
    rows: [...USERS].sort((a, b) => a.name.localeCompare(b.name)).map((u) => [u.name, u.city]),
    ordered: true,
  },
  join: {
    cols: ['name', 'item'],
    rows: USERS.flatMap((u) => ORDERS.filter((o) => o.userId === u.id).map((o) => [u.name, o.item])),
    ordered: false,
  },
  left: {
    cols: ['name', 'item'],
    rows: USERS.flatMap((u) => {
      const mine = ORDERS.filter((o) => o.userId === u.id);
      return mine.length ? mine.map((o) => [u.name, o.item]) : [[u.name, null]];
    }),
    ordered: false,
  },
  group: {
    cols: ['name', 'orders'],
    rows: USERS.map((u) => [u.name, ORDERS.filter((o) => o.userId === u.id).length]).filter(([, n]) => (n as number) > 0),
    ordered: false,
  },
};

const sortRows = (rows: Cell[][]) => [...rows].map((r) => JSON.stringify(r)).sort();

describe('every query ends with the result its SQL produces', () => {
  for (const q of QUERIES) {
    it(q.id, () => {
      const frames = q.build();
      const last = frames[frames.length - 1];
      const exp = expected[q.id];
      expect(last.resultCols).toEqual(exp.cols);
      const got = last.result.map((r) => r.cells);
      if (exp.ordered) expect(got).toEqual(exp.rows);
      else expect(sortRows(got)).toEqual(sortRows(exp.rows));
    });
  }
});

describe('the numbers the captions and stats quote', () => {
  const last = (id: string) => {
    const frames = QUERIES.find((q) => q.id === id)!.build();
    return frames[frames.length - 1];
  };

  it('inner JOIN gives 6 rows and drops the users without orders', () => {
    expect(last('join').result).toHaveLength(6);
    const names = new Set(last('join').result.map((r) => r.cells[0]));
    expect(names.has('Linus')).toBe(false);
    expect(names.has('Margaret')).toBe(false);
  });

  it('LEFT JOIN gives 8 rows, keeping Linus and Margaret with NULL items', () => {
    const rows = last('left').result;
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.cells[1] === null).map((r) => r.cells[0]).sort()).toEqual(['Linus', 'Margaret']);
    expect(rows.filter((r) => r.cells[0] === 'Ada')).toHaveLength(3);
  });

  it('examines 5 rows for single-table queries and 5 × 6 row pairs for joins', () => {
    for (const id of ['select', 'where', 'order']) expect(last(id).examined).toBe(USERS.length);
    for (const id of ['join', 'left', 'group']) expect(last(id).examined).toBe(USERS.length * ORDERS.length);
  });

  it('GROUP BY buckets by user id, not by the (non-unique) name', () => {
    const groups = last('group').result;
    expect(new Set(groups.map((g) => g.userId)).size).toBe(groups.length);
    expect(groups.map((g) => g.cells)).toEqual([['Ada', 3], ['Grace', 2], ['Alan', 1]]);
  });

  it('runs the clauses in SQL’s logical order, not the written order', () => {
    for (const q of QUERIES) {
      const frames = q.build();
      const seen: string[] = [];
      for (const f of frames) if (f.step && seen[seen.length - 1] !== f.step) seen.push(f.step);
      expect(seen).toEqual(q.steps);
    }
  });
});
