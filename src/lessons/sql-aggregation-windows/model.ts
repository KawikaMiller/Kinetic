// GROUP BY, aggregates and window functions over one small sales table: a query builder made
// of menus, evaluated here with SQL's rules (aggregates skip NULL, WHERE runs before grouping,
// HAVING after, a window keeps every row). The tests run every combination through SQLite.

export interface Sale {
  id: number;
  region: string;
  rep: string;
  month: string;
  /** NULL: a sale logged before its amount was booked. */
  amount: number | null;
}

const row = (id: number, region: string, rep: string, month: string, amount: number | null): Sale => ({ id, region, rep, month, amount });

export const SALES: readonly Sale[] = [
  row(1, 'North', 'Ana', '2026-01', 120),
  row(2, 'North', 'Ben', '2026-01', 80),
  row(3, 'North', 'Ana', '2026-02', 150),
  row(4, 'North', 'Ben', '2026-03', 150),
  row(5, 'North', 'Ana', '2026-04', null),
  row(6, 'South', 'Cy', '2026-01', 200),
  row(7, 'South', 'Dee', '2026-02', 90),
  row(8, 'South', 'Cy', '2026-02', 60),
  row(9, 'South', 'Dee', '2026-03', 90),
  row(10, 'South', 'Cy', '2026-04', 110),
  row(11, 'West', 'Eli', '2026-01', 70),
  row(12, 'West', 'Fay', '2026-02', 70),
  row(13, 'West', 'Eli', '2026-03', 130),
  row(14, 'West', 'Fay', '2026-03', null),
  row(15, 'West', 'Eli', '2026-04', 95),
  row(16, 'West', 'Fay', '2026-04', 40),
];

export const COLS = ['id', 'region', 'rep', 'month', 'amount'] as const;
export type Cell = string | number | null;
export const cells = (s: Sale): Cell[] => [s.id, s.region, s.rep, s.month, s.amount];

// ── GROUP BY ────────────────────────────────────────────────────────────

export type GroupCol = 'none' | 'region' | 'rep' | 'month';
export type AggId = 'count-star' | 'count-amount' | 'sum' | 'avg' | 'max';
export type FilterId = 'none' | 'amount-100' | 'not-west' | 'count-5' | 'sum-450';
export type Place = 'where' | 'having';

export const GROUP_COLS: readonly GroupCol[] = ['none', 'region', 'rep', 'month'];
export const AGGS: { id: AggId; sql: string }[] = [
  { id: 'count-star', sql: 'COUNT(*)' },
  { id: 'count-amount', sql: 'COUNT(amount)' },
  { id: 'sum', sql: 'SUM(amount)' },
  { id: 'avg', sql: 'AVG(amount)' },
  { id: 'max', sql: 'MAX(amount)' },
];

interface FilterDef {
  id: FilterId;
  sql: string;
  /** Uses an aggregate: legal only in HAVING. */
  aggregate: boolean;
  /** The plain column it tests, if any: in HAVING that column must be grouped. */
  col?: 'amount' | 'region';
}

export const FILTERS: FilterDef[] = [
  { id: 'none', sql: '', aggregate: false },
  { id: 'amount-100', sql: 'amount >= 100', aggregate: false, col: 'amount' },
  { id: 'not-west', sql: "region <> 'West'", aggregate: false, col: 'region' },
  { id: 'count-5', sql: 'COUNT(*) >= 5', aggregate: true },
  { id: 'sum-450', sql: 'SUM(amount) > 450', aggregate: true },
];

export interface GroupQuery {
  by: GroupCol;
  agg: AggId;
  filter: FilterId;
  place: Place;
  /** Also SELECT rep, grouped or not: the "non-aggregated column" trap. */
  withRep: boolean;
}

export type QueryError = { kind: 'aggregate-in-where' | 'ungrouped-in-having' | 'ungrouped-select'; message: string; sqliteAccepts: boolean };

export interface Group {
  key: string;
  /** Indexes into SALES, in table order. */
  rows: number[];
  value: number | null;
  /** HAVING's verdict for this group (true when there is no HAVING). */
  kept: boolean;
}

export interface GroupRun {
  sql: string[];
  error: QueryError | null;
  /** WHERE's verdict for each row: true = kept. NULL compared with a number is UNKNOWN, which drops the row too. */
  whereKept: boolean[];
  groups: Group[];
  /** Result rows: [group value?, aggregate value]. */
  result: Cell[][];
  resultCols: string[];
}

/** SQL's aggregates: everything but COUNT(*) skips NULL; an aggregate over no values is NULL (COUNT gives 0). */
export function aggregate(agg: AggId, values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  switch (agg) {
    case 'count-star':
      return values.length;
    case 'count-amount':
      return present.length;
    case 'sum':
      return present.length ? present.reduce((a, b) => a + b, 0) : null;
    case 'avg':
      return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
    case 'max':
      return present.length ? Math.max(...present) : null;
  }
}

const groupValue = (s: Sale, by: GroupCol): string => (by === 'none' ? '' : String(s[by]));

function rowFilter(f: FilterId, s: Sale): boolean {
  switch (f) {
    case 'amount-100':
      return s.amount !== null && s.amount >= 100;
    case 'not-west':
      return s.region !== 'West';
    default:
      return true;
  }
}

function groupFilter(f: FilterId, rows: readonly Sale[]): boolean {
  switch (f) {
    case 'count-5':
      return rows.length >= 5;
    case 'sum-450': {
      const s = aggregate('sum', rows.map((r) => r.amount));
      return s !== null && s > 450;
    }
    case 'not-west':
      return rows[0].region !== 'West';
    default:
      return true;
  }
}

export function queryError(q: GroupQuery): QueryError | null {
  const f = FILTERS.find((x) => x.id === q.filter)!;
  if (q.place === 'where' && f.aggregate)
    return { kind: 'aggregate-in-where', message: `${f.sql} uses an aggregate, and WHERE runs before any groups exist: aggregates belong in HAVING`, sqliteAccepts: false };
  if (q.place === 'having' && f.col && f.col !== q.by)
    return {
      kind: 'ungrouped-in-having',
      message: `HAVING sees groups, and ${f.col} isn't grouped${q.by === 'none' ? '' : ` (only ${q.by} is)`}, so one group has many ${f.col} values: standard SQL rejects it`,
      sqliteAccepts: true,
    };
  if (q.withRep && q.by !== 'rep')
    return {
      kind: 'ungrouped-select',
      message: `rep is neither grouped nor aggregated, so each ${q.by === 'none' ? 'result' : q.by} row would need one rep out of several: standard SQL rejects it`,
      sqliteAccepts: true,
    };
  return null;
}

export function aggSql(agg: AggId): string {
  return AGGS.find((a) => a.id === agg)!.sql;
}

export function groupSql(q: GroupQuery): string[] {
  const f = FILTERS.find((x) => x.id === q.filter)!;
  const select = [...(q.by !== 'none' ? [q.by] : []), ...(q.withRep && q.by !== 'rep' ? ['rep'] : []), aggSql(q.agg)];
  return [
    `SELECT ${select.join(', ')}`,
    'FROM sales',
    ...(f.id !== 'none' && q.place === 'where' ? [`WHERE ${f.sql}`] : []),
    ...(q.by !== 'none' ? [`GROUP BY ${q.by}`] : []),
    ...(f.id !== 'none' && q.place === 'having' ? [`HAVING ${f.sql}`] : []),
    ...(q.by !== 'none' ? [`ORDER BY ${q.by}`] : []),
  ];
}

export function runGroup(q: GroupQuery): GroupRun {
  const sql = groupSql(q);
  const error = queryError(q);
  const resultCols = [...(q.by !== 'none' ? [q.by] : []), aggSql(q.agg)];
  const whereKept = SALES.map((s) => (q.place === 'where' ? rowFilter(q.filter, s) : true));
  if (error) return { sql, error, whereKept: SALES.map(() => true), groups: [], result: [], resultCols };
  const keys: string[] = [];
  const members = new Map<string, number[]>();
  SALES.forEach((s, i) => {
    if (!whereKept[i]) return;
    const k = groupValue(s, q.by);
    if (!members.has(k)) {
      members.set(k, []);
      keys.push(k);
    }
    members.get(k)!.push(i);
  });
  // A query with no GROUP BY is one group, even over no rows (COUNT(*) is then 0).
  if (q.by === 'none' && keys.length === 0) {
    keys.push('');
    members.set('', []);
  }
  keys.sort();
  const groups: Group[] = keys.map((key) => {
    const rows = members.get(key)!;
    const sales = rows.map((i) => SALES[i]);
    const kept = q.place === 'having' && q.filter !== 'none' ? sales.length > 0 && groupFilter(q.filter, sales) : true;
    return { key, rows, value: aggregate(q.agg, sales.map((s) => s.amount)), kept };
  });
  const result = groups.filter((g) => g.kept).map((g) => [...(q.by !== 'none' ? [g.key] : []), g.value]);
  return { sql, error, whereKept, groups, result, resultCols };
}

// ── Window functions ────────────────────────────────────────────────────

export type FrameId = 'partition' | 'default' | 'rows-unbounded' | 'rows-2';

export const FRAMES: { id: FrameId; label: string; over: string }[] = [
  { id: 'partition', label: 'no ORDER BY', over: 'PARTITION BY region' },
  { id: 'default', label: 'ORDER BY month (the default frame)', over: 'PARTITION BY region ORDER BY month' },
  { id: 'rows-unbounded', label: 'ROWS UNBOUNDED PRECEDING', over: 'PARTITION BY region ORDER BY month, id ROWS UNBOUNDED PRECEDING' },
  { id: 'rows-2', label: 'ROWS 2 PRECEDING', over: 'PARTITION BY region ORDER BY month, id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW' },
];

/** Every row stays; this is the order the table shows them in (and the query's ORDER BY). */
export const WINDOW_ORDER: readonly number[] = SALES.map((_, i) => i).sort((a, b) => {
  const x = SALES[a];
  const y = SALES[b];
  return x.region.localeCompare(y.region) || x.month.localeCompare(y.month) || x.id - y.id;
});

export interface WindowRow {
  /** Index into SALES. */
  sale: number;
  /** Indexes into SALES of the rows in this row's frame. */
  frame: number[];
  value: number | null;
}

/**
 * SUM(amount) OVER (...) for every row. The default frame with ORDER BY is
 * RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW: it runs to the last row with the same
 * month (its peers), so tied months share one total. ROWS counts physical rows instead.
 */
export function runWindow(frame: FrameId): WindowRow[] {
  return WINDOW_ORDER.map((i) => {
    const me = SALES[i];
    const part = WINDOW_ORDER.filter((j) => SALES[j].region === me.region);
    const pos = part.indexOf(i);
    let members: number[];
    switch (frame) {
      case 'partition':
        members = part;
        break;
      case 'default':
        members = part.filter((j) => SALES[j].month <= me.month);
        break;
      case 'rows-unbounded':
        members = part.slice(0, pos + 1);
        break;
      case 'rows-2':
        members = part.slice(Math.max(0, pos - 2), pos + 1);
        break;
    }
    return { sale: i, frame: members, value: aggregate('sum', members.map((j) => SALES[j].amount)) };
  });
}

export function windowSql(frame: FrameId): string[] {
  const f = FRAMES.find((x) => x.id === frame)!;
  return [
    'SELECT id, region, rep, month, amount,',
    '  SUM(amount) OVER (',
    `    ${f.over}`,
    '  ) AS total',
    'FROM sales',
    'ORDER BY region, month, id',
  ];
}

// ── Ranking ─────────────────────────────────────────────────────────────

export interface RankRow {
  sale: number;
  rowNumber: number;
  rank: number;
  denseRank: number;
  /** Shares its amount with another row of its region. */
  tied: boolean;
}

/** ROW_NUMBER, RANK and DENSE_RANK by amount, highest first, per region; rows with no amount are left out. */
export function runRanking(): RankRow[] {
  const ranked = SALES.map((_, i) => i).filter((i) => SALES[i].amount !== null);
  const order = [...ranked].sort((a, b) => {
    const x = SALES[a];
    const y = SALES[b];
    return x.region.localeCompare(y.region) || y.amount! - x.amount! || x.id - y.id;
  });
  const out: RankRow[] = [];
  for (const i of order) {
    const me = SALES[i];
    const part = order.filter((j) => SALES[j].region === me.region);
    const higher = part.filter((j) => SALES[j].amount! > me.amount!);
    out.push({
      sale: i,
      rowNumber: part.indexOf(i) + 1,
      rank: higher.length + 1,
      denseRank: new Set(higher.map((j) => SALES[j].amount)).size + 1,
      tied: part.some((j) => j !== i && SALES[j].amount === me.amount),
    });
  }
  return out;
}

export const RANK_SQL = [
  'SELECT region, rep, amount,',
  '  ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC, id) AS row_num,',
  '  RANK()       OVER (PARTITION BY region ORDER BY amount DESC) AS rank_pos,',
  '  DENSE_RANK() OVER (PARTITION BY region ORDER BY amount DESC) AS dense_pos',
  'FROM sales',
  'WHERE amount IS NOT NULL',
  'ORDER BY region, amount DESC, id',
];
