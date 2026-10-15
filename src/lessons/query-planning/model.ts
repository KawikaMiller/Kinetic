import { DAYS, STALE_STATUS_SHARE, STATUS_SHARE, type Counts, type Status, type TableShape } from './table';

/** The toy cost constants: the PostgreSQL planner defaults as the author remembers them (check the docs). */
export interface Costs {
  seqPage: number;
  randomPage: number;
  cpuTuple: number;
  cpuIndexTuple: number;
  cpuOperator: number;
}

export const DEFAULT_COSTS: Costs = { seqPage: 1, randomPage: 4, cpuTuple: 0.01, cpuIndexTuple: 0.005, cpuOperator: 0.0025 };

/** random_page_cost for fast storage: a common setting, to be checked against your own system. */
export const FAST_STORAGE_RANDOM_PAGE_COST = 1.1;

/** Pages a B-tree descent touches before the first leaf (the toy's tree height). */
export const DESCENT_PAGES = 3;

/** An estimate this many times off (either way) is flagged. */
export const MISESTIMATE_FLAG = 10;

const sum = (...xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A seq scan with one predicate: every page read in order, every row visited and tested. */
export const seqScanCost = (t: TableShape, c: Costs): number => sum(t.pages * c.seqPage, t.rows * c.cpuTuple, t.rows * c.cpuOperator);

/** Expected distinct pages touched when m rows land at random on `pages` pages. */
export const pagesFetched = (pages: number, m: number): number => pages * (1 - (1 - 1 / pages) ** m);

/** The index scan's descent, charged up front. */
export const indexStartup = (c: Costs): number => DESCENT_PAGES * c.randomPage;

/** An index scan that returns m rows: the descent, one random page per distinct page, and per-row CPU. */
export const indexScanCost = (t: TableShape, m: number, c: Costs): number =>
  sum(indexStartup(c), pagesFetched(t.pages, m) * c.randomPage, m * (c.cpuIndexTuple + c.cpuTuple));

/**
 * The first row count at which the index scan costs more than the seq scan (the index wins below it),
 * or null when it never does. Binary search: the index cost only grows with m.
 */
export function crossoverRows(t: TableShape, c: Costs): number | null {
  const seq = seqScanCost(t, c);
  if (indexScanCost(t, t.rows, c) <= seq) return null;
  let lo = 1;
  let hi = t.rows;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (indexScanCost(t, mid, c) > seq) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// ── Queries ───────────────────────────────────────────────────────────

export type QueryId = 'customer' | 'status' | 'recent' | 'customerNewest' | 'statusNewest';
export type Column = 'customer_id' | 'status' | 'created_at';

export interface Params {
  customerId: number;
  status: Status;
  day: number;
}

export interface QueryDef {
  id: QueryId;
  label: string;
  where: Column;
  /** ORDER BY created_at DESC, then LIMIT. */
  newestFirst: boolean;
  limit: number | null;
  /** An equality on a column the toy can index: SQLite's access path is checked against it. */
  deterministic: boolean;
}

export const NEWEST_LIMIT = 10;

export const QUERIES: readonly QueryDef[] = [
  { id: 'customer', label: 'One customer', where: 'customer_id', newestFirst: false, limit: null, deterministic: true },
  { id: 'status', label: 'By status', where: 'status', newestFirst: false, limit: null, deterministic: false },
  { id: 'recent', label: 'Since a day', where: 'created_at', newestFirst: false, limit: null, deterministic: false },
  { id: 'customerNewest', label: 'Customer, newest 10', where: 'customer_id', newestFirst: true, limit: NEWEST_LIMIT, deterministic: true },
  { id: 'statusNewest', label: 'Status, newest 10', where: 'status', newestFirst: true, limit: NEWEST_LIMIT, deterministic: false },
];

export const queryById = (id: QueryId): QueryDef => QUERIES.find((q) => q.id === id)!;

export const predicateText = (q: QueryDef, p: Params): string =>
  q.where === 'customer_id' ? `customer_id = ${p.customerId}` : q.where === 'status' ? `status = '${p.status}'` : `created_at >= ${p.day}`;

/** The SQL the learner sees, one line each. */
export function sqlLines(q: QueryDef, p: Params): string[] {
  const lines = ['SELECT * FROM orders', `WHERE ${predicateText(q, p)}`];
  if (q.newestFirst) lines.push('ORDER BY created_at DESC');
  if (q.limit !== null) lines.push(`LIMIT ${q.limit};`);
  else lines[lines.length - 1] += ';';
  return lines;
}

// ── Statistics and true counts ────────────────────────────────────────

export type StatsMode = 'fresh' | 'stale';

/** Rows the optimiser believes the WHERE clause returns. */
export function estimatedRows(q: QueryDef, p: Params, stats: StatsMode, t: TableShape): number {
  if (q.where === 'customer_id') return t.rows / t.customers;
  if (q.where === 'status') return (stats === 'stale' ? STALE_STATUS_SHARE : STATUS_SHARE)[p.status] * t.rows;
  return (t.rows * (DAYS - p.day + 1)) / DAYS;
}

/** Rows the WHERE clause really returns, counted from the data. */
export function actualRows(q: QueryDef, p: Params, counts: Counts): number {
  if (q.where === 'customer_id') return counts.byCustomer.get(p.customerId) ?? 0;
  if (q.where === 'status') return counts.byStatus[p.status];
  return counts.sinceDay[p.day] ?? 0;
}

/** How far off an estimate is: the bigger over the smaller, and which way. */
export function misestimate(est: number, actual: number): { ratio: number; direction: 'over' | 'under' | 'exact'; flagged: boolean } {
  if (est === actual) return { ratio: 1, direction: 'exact', flagged: false };
  const ratio = Math.max(est, actual) / Math.max(1, Math.min(est, actual));
  return { ratio, direction: est > actual ? 'over' : 'under', flagged: ratio >= MISESTIMATE_FLAG };
}

// ── Indexes and plans ─────────────────────────────────────────────────

export type IndexId = 'customer' | 'status' | 'created' | 'composite';

export interface IndexDef {
  id: IndexId;
  name: string;
  columns: string;
  /** The first column: the toy only considers an index when the WHERE clause tests it. */
  leading: Column;
}

export const INDEXES: readonly IndexDef[] = [
  { id: 'customer', name: 'orders_customer_idx', columns: 'customer_id', leading: 'customer_id' },
  { id: 'status', name: 'orders_status_idx', columns: 'status', leading: 'status' },
  { id: 'created', name: 'orders_created_idx', columns: 'created_at', leading: 'created_at' },
  { id: 'composite', name: 'orders_customer_created_idx', columns: 'customer_id, created_at', leading: 'customer_id' },
];

export const indexById = (id: IndexId): IndexDef => INDEXES.find((i) => i.id === id)!;

export type IndexSet = Readonly<Record<IndexId, boolean>>;
export const NO_INDEXES: IndexSet = { customer: false, status: false, created: false, composite: false };

export interface Setup {
  indexes: IndexSet;
  stats: StatsMode;
}

export type NodeKind = 'Limit' | 'Sort' | 'Seq Scan' | 'Index Scan';

export interface PlanNode {
  kind: NodeKind;
  title: string;
  detail: string[];
  startup: number;
  total: number;
  estRows: number;
  actualRows: number;
  /** The arithmetic behind `total`, in the numbers the model used. */
  formula: string;
  child: PlanNode | null;
}

export interface Candidate {
  id: string;
  label: string;
  root: PlanNode;
  total: number;
  /** The index it reads, or null for a seq scan. */
  index: IndexDef | null;
  hasSort: boolean;
}

export interface PlanResult {
  query: QueryDef;
  params: Params;
  candidates: Candidate[];
  /** Index into `candidates` of the cheapest (the first on a tie). */
  chosen: number;
}

const money = (x: number): string => x.toFixed(2);
const compact = (x: number): string => x.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** What the cost formulas are fed: row counts the optimiser believes, or the true ones. */
export type Basis = 'estimate' | 'actual';

interface PlanInput {
  query: QueryDef;
  params: Params;
  setup: Setup;
  costs: Costs;
  table: TableShape;
  counts: Counts;
  basis?: Basis;
}

const sortCost = (m: number, c: Costs): number => 2 * c.cpuOperator * m * Math.log2(Math.max(m, 2));

function seqNode(i: PlanInput, est: number, actual: number, m: number): PlanNode {
  const { table: t, costs: c } = i;
  return {
    kind: 'Seq Scan', title: 'Seq Scan on orders', detail: [`Filter: (${predicateText(i.query, i.params)})`], startup: 0, total: seqScanCost(t, c), estRows: est, actualRows: actual,
    formula: `${compact(t.pages)} pages × ${c.seqPage} + ${compact(t.rows)} rows × ${c.cpuTuple} + ${compact(t.rows)} rows × ${c.cpuOperator} = ${money(seqScanCost(t, c))} (the same for any ${m.toLocaleString('en-US')} matching rows)`,
    child: null,
  };
}

function indexNode(i: PlanInput, ix: IndexDef, est: number, actual: number, m: number, backward: boolean): PlanNode {
  const { table: t, costs: c } = i;
  const pages = pagesFetched(t.pages, m);
  return {
    kind: 'Index Scan', title: `Index Scan${backward ? ' Backward' : ''} using ${ix.name} on orders`, detail: [`Index Cond: (${predicateText(i.query, i.params)})`], startup: indexStartup(c), total: indexScanCost(t, m, c), estRows: est, actualRows: actual,
    formula: `${DESCENT_PAGES} × ${c.randomPage} + ${compact(Number(pages.toFixed(1)))} pages × ${c.randomPage} + ${compact(Number(m.toFixed(1)))} rows × ${c.cpuIndexTuple + c.cpuTuple} = ${money(indexScanCost(t, m, c))}`,
    child: null,
  };
}

function sortNode(child: PlanNode, m: number, c: Costs): PlanNode {
  const compares = sortCost(m, c);
  const startup = child.total + compares;
  return {
    kind: 'Sort', title: 'Sort', detail: ['Sort Key: created_at DESC'], startup, total: startup + c.cpuOperator * m, estRows: child.estRows, actualRows: child.actualRows,
    formula: `input ${money(child.total)} + 2 × ${c.cpuOperator} × ${compact(Number(m.toFixed(1)))} × log2(${compact(Number(Math.max(m, 2).toFixed(1)))}) + ${compact(Number(m.toFixed(1)))} × ${c.cpuOperator} = ${money(startup + c.cpuOperator * m)}`,
    child,
  };
}

function limitNode(child: PlanNode, limit: number, m: number): PlanNode {
  const share = Math.min(1, limit / Math.max(m, 1));
  return {
    kind: 'Limit', title: 'Limit', detail: [], startup: child.startup, total: child.startup + (child.total - child.startup) * share, estRows: Math.min(limit, child.estRows), actualRows: Math.min(limit, child.actualRows),
    formula: `${money(child.startup)} + (${money(child.total)} − ${money(child.startup)}) × ${Math.min(1, share).toFixed(3)} (the share of the input that is read before ${limit} rows come out)`,
    child,
  };
}

/**
 * Every plan the toy planner considers for a query, and which is cheapest. Candidates: a seq scan, and a
 * scan of each enabled index whose leading column the WHERE clause tests. A (customer_id, created_at) index
 * also returns rows in created_at order, so a backward scan of it needs no Sort.
 */
export function planQuery(i: PlanInput): PlanResult {
  const { query: q, setup, costs, counts } = i;
  const est = estimatedRows(q, i.params, setup.stats, i.table);
  const actual = actualRows(q, i.params, counts);
  const m = i.basis === 'actual' ? actual : est;
  const wrap = (scan: PlanNode, ordered: boolean): PlanNode => {
    const sorted = q.newestFirst && !ordered ? sortNode(scan, m, costs) : scan;
    return q.limit !== null ? limitNode(sorted, q.limit, m) : sorted;
  };
  const candidates: Candidate[] = [
    { id: 'seq', label: 'Seq Scan', root: wrap(seqNode(i, est, actual, m), false), total: 0, index: null, hasSort: q.newestFirst },
  ];
  for (const ix of INDEXES) {
    if (!setup.indexes[ix.id] || ix.leading !== q.where) continue;
    const ordered = q.newestFirst && ix.id === 'composite';
    candidates.push({ id: ix.id, label: `Index Scan: ${ix.name}`, root: wrap(indexNode(i, ix, est, actual, m, ordered), ordered), total: 0, index: ix, hasSort: q.newestFirst && !ordered });
  }
  for (const cand of candidates) cand.total = cand.root.total;
  const chosen = candidates.reduce((best, cand, idx) => (cand.total < candidates[best].total ? idx : best), 0);
  return { query: q, params: i.params, candidates, chosen };
}

/** The nodes of a plan from the root down. */
export function planNodes(root: PlanNode): PlanNode[] {
  return root.child ? [root, ...planNodes(root.child)] : [root];
}

/** The scan at the bottom of a plan. */
export const scanOf = (root: PlanNode): PlanNode => planNodes(root).at(-1)!;
