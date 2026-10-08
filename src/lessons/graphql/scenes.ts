/**
 * Scene logic that isn't drawing: what each level of a resolver run did, and what the cost
 * scene does with a nested-friends query under the server's limits. Pure.
 */
import { POOL_SIZE, runQuery, type DbCall, type Execution, type Outcome } from './exec';
import { LIMITS, friendsQuery, validate, type Sel } from './schema';

// ── Level by level ──────────────────────────────────────────────────────

export interface LevelSummary {
  level: number;
  /** Resolver calls at this level, by "Type.field", in the order they first ran. */
  resolvers: { typeField: string; count: number }[];
  total: number;
  calls: DbCall[];
  /** When the level's database calls were done, ms. */
  endsAt: number;
}

export function levelSummary(exec: Execution, level: number): LevelSummary {
  const here = exec.invocations.filter((i) => i.level === level);
  const resolvers: LevelSummary['resolvers'] = [];
  for (const inv of here) {
    const row = resolvers.find((r) => r.typeField === inv.typeField);
    if (row) row.count++;
    else resolvers.push({ typeField: inv.typeField, count: 1 });
  }
  return { level, resolvers, total: here.length, calls: exec.dbCalls.filter((c) => c.level === level), endsAt: exec.levelEnds[level] ?? 0 };
}

/** Every level the run has resolvers at. */
export const levelCount = (exec: Execution): number => Math.max(...exec.invocations.map((i) => i.level)) + 1;

/** Rounds a level's naive calls need on the pool. */
export const roundsFor = (calls: number): number => Math.ceil(calls / POOL_SIZE);

// ── The cost scene ──────────────────────────────────────────────────────

/** The most resolver calls the lesson will actually run in the browser. */
export const EXEC_CAP = 5000;

export type CostView =
  | { status: 'rejected'; query: Sel[]; outcome: Extract<Outcome, { status: 'rejected' }>; names: number }
  | { status: 'skipped'; query: Sel[]; cost: number; depth: number; names: number }
  | { status: 'executed'; query: Sel[]; outcome: Extract<Outcome, { status: 'executed' }>; names: number };

/** How many `name` values the nested-friends query asks for: first^levels, or 1 with no friends level. */
export const namesAsked = (levels: number, first: number): number => (levels === 0 ? 1 : first ** levels);

/** The nested-friends query under the server's limits (or with them off). */
export function costView(levels: number, first: number, limitsOn: boolean): CostView {
  const query = friendsQuery(levels, first);
  const names = namesAsked(levels, first);
  const limits = limitsOn ? LIMITS : null;
  // The static check comes first, and the browser's own cap before anything runs: a deep query
  // with the limits off could need billions of resolver calls.
  const verdict = validate(query, limits ?? { maxDepth: Infinity, maxCost: Infinity });
  if (verdict.ok && verdict.cost > EXEC_CAP) return { status: 'skipped', query, cost: verdict.cost, depth: verdict.depth, names };
  const outcome = runQuery(query, { dataLoader: false, failProductId: null }, limits);
  if (outcome.status === 'rejected') return { status: 'rejected', query, outcome, names };
  if (outcome.status !== 'executed') throw new Error('the nested-friends query is always valid');
  return { status: 'executed', query, outcome, names };
}

/** Count the `name` leaves in a nested-friends response. */
export function countNames(data: unknown): number {
  if (Array.isArray(data)) return data.reduce((s: number, d) => s + countNames(d), 0);
  if (data && typeof data === 'object') {
    return Object.entries(data).reduce((s, [k, v]) => s + (k === 'name' ? 1 : countNames(v)), 0);
  }
  return 0;
}


// ── Display helpers ─────────────────────────────────────────────────────

export interface ResponseLines {
  lines: string[];
  /** Lines left out after the cut. */
  cut: number;
}

/** A response as indented JSON, cut to `max` lines (the cut is reported, never hidden). */
export function responseLines(body: unknown, max: number): ResponseLines {
  const all = JSON.stringify(body, null, 2).split('\n');
  return { lines: all.slice(0, max), cut: Math.max(0, all.length - max) };
}

export interface DbRow {
  id: number;
  level: number;
  start: number;
  sql: string;
  batched: boolean;
}

/** The database calls that have finished by the end of `level`, the first `max` of them, and how many more there were. */
export function dbRows(exec: Execution, level: number, max: number): { rows: DbRow[]; more: number } {
  const done = exec.dbCalls.filter((c) => c.level <= level);
  return { rows: done.slice(0, max).map((c) => ({ id: c.id, level: c.level, start: c.start, sql: c.sql, batched: c.batched })), more: Math.max(0, done.length - max) };
}
