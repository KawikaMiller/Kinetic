/**
 * The toy table and the six migration steps. A "migration" here is an ordered list of steps run against a
 * 12-row table while a fleet of 10 app instances keeps sending reads and writes; every request is evaluated
 * against the table's current columns, and each one carries the SQL it stands for, so a test can replay the
 * very same statements in real SQLite and compare verdicts.
 */
import { mulberry32 } from '../../core/random';

export type StepId = 'expand' | 'dualWrite' | 'backfill' | 'switchReads' | 'stopWriting' | 'contract';

/** The six steps in the order that respects their dependencies. */
export const STEP_IDS: readonly StepId[] = ['expand', 'dualWrite', 'backfill', 'switchReads', 'stopWriting', 'contract'];

export const ROWS = 12;
export const INSTANCES = 10;
/** The rolling deploy keeps going while the migration runs: this share of the fleet upgrades per step. */
export const DEPLOY_PER_STAGE = 20;
/** Rows copied per backfill statement in the toy table. */
export const TOY_BATCH = 4;
export const DEFAULT_DEPLOY = 60;
export const DEFAULT_SEED = 7;
export const FIRST_VALUE = 100;

export const OLD_COLUMN = 'name';
export const NEW_COLUMN = 'full_name';

export interface Flags {
  /** v2 writes both columns. */
  dualWrite: boolean;
  /** v2 reads the new column. */
  switchReads: boolean;
  /** v2 no longer writes the old column. */
  stopWriting: boolean;
}

export interface Row {
  name: number | null;
  full: number | null;
}

export interface Table {
  hasName: boolean;
  hasFull: boolean;
  flags: Flags;
  rows: Row[];
  /** The last value successfully written to each row by any version: the answer the table should hold. */
  truth: number[];
}

export type Version = 1 | 2;

export interface SqlEvent {
  /** Unique within a run. */
  id: number;
  /** The frame that first shows it: 0 is the table before anything happens. */
  frame: number;
  who: 'v1' | 'v2' | 'migration';
  instance: number | null;
  op: 'write' | 'read' | 'step';
  step: StepId | null;
  /** Empty for a step that only flips a flag in the v2 release (no SQL runs). */
  sql: string;
  params: number[];
  ok: boolean;
  /** The missing column's error, worded as SQLite words it. */
  error: string | null;
  /** The value a read returned (null for NULL or a failed read). */
  result: number | null;
  /** A read that returned something other than the last value written. */
  stale: boolean;
  /** A short human label of the request. */
  text: string;
}

export interface Snapshot {
  frame: number;
  hasName: boolean;
  hasFull: boolean;
  flags: Flags;
  rows: Row[];
  truth: number[];
  /** Instances on v2 while this frame's requests ran. */
  v2: number;
  /** The step this frame applied, null for the first and last frames. */
  step: StepId | null;
  errors: number;
  stale: number;
}

export interface Run {
  order: StepId[];
  deploy: number;
  seed: number;
  events: SqlEvent[];
  frames: Snapshot[];
  errors: number;
  staleReads: number;
  /** Row indexes whose final value is not the last value written. */
  lostRows: number[];
  /** Steps of the six that were not run. */
  skipped: StepId[];
  /** Ran all six steps with no error, no stale read and no lost row. */
  clean: boolean;
}

const copyFlags = (f: Flags): Flags => ({ ...f });
const copyRows = (rows: readonly Row[]): Row[] => rows.map((r) => ({ ...r }));

export function freshTable(): Table {
  const values = Array.from({ length: ROWS }, (_, i) => FIRST_VALUE + i);
  return {
    hasName: true,
    hasFull: false,
    flags: { dualWrite: false, switchReads: false, stopWriting: false },
    rows: values.map((v) => ({ name: v, full: null })),
    truth: [...values],
  };
}

/** How many instances run v2 at a stage (stage = steps applied so far), given where the deploy stood when the migration began. */
export function v2Count(deployPercent: number, stage: number): number {
  return Math.round((Math.min(100, deployPercent + stage * DEPLOY_PER_STAGE) / 100) * INSTANCES);
}

const missing = (column: string) => `no such column: ${column}`;

/** The columns a v2 write names under the current flags. */
export function v2WriteColumns(f: Flags): string[] {
  if (f.stopWriting) return [NEW_COLUMN];
  return f.dualWrite ? [OLD_COLUMN, NEW_COLUMN] : [OLD_COLUMN];
}

const has = (t: Table, column: string) => (column === OLD_COLUMN ? t.hasName : t.hasFull);
const firstMissing = (t: Table, columns: readonly string[]) => columns.find((c) => !has(t, c)) ?? null;

export const BACKFILL_SQL = `UPDATE users SET ${NEW_COLUMN} = ${OLD_COLUMN} WHERE id BETWEEN ? AND ?`;
export const STEP_SQL: Partial<Record<StepId, string>> = {
  expand: `ALTER TABLE users ADD COLUMN ${NEW_COLUMN} INTEGER`,
  contract: `ALTER TABLE users DROP COLUMN ${OLD_COLUMN}`,
};

export function writeSql(columns: readonly string[]): string {
  return `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
}
export const readSql = (column: string) => `SELECT ${column} FROM users WHERE id = ?`;

/** Is a row's final value the last value written? The surviving column decides: the new one once it exists, the old one before. */
export function rowIsRight(t: Table, row: number): boolean {
  const v = t.hasFull ? t.rows[row].full : t.hasName ? t.rows[row].name : null;
  return v === t.truth[row];
}

export const lostRowsOf = (t: Table): number[] => t.truth.map((_, i) => i).filter((i) => !rowIsRight(t, i));

/** Runs an ordered list of steps (any order, any subset) against the live fleet and returns every request, frame by frame. */
export function runMigration(order: readonly StepId[], deployPercent: number, seed: number): Run {
  const rnd = mulberry32(seed);
  const t = freshTable();
  const events: SqlEvent[] = [];
  const frames: Snapshot[] = [];
  let value = FIRST_VALUE + ROWS;
  let frame = 0;
  let stage = 0;
  let frameErrors = 0;
  let frameStale = 0;

  const push = (e: Omit<SqlEvent, 'id' | 'frame'>) => {
    events.push({ ...e, id: events.length, frame });
    if (!e.ok) frameErrors++;
    if (e.stale) frameStale++;
  };
  const snapshot = (step: StepId | null) => {
    frames.push({ frame, hasName: t.hasName, hasFull: t.hasFull, flags: copyFlags(t.flags), rows: copyRows(t.rows), truth: [...t.truth], v2: v2Count(deployPercent, stage), step, errors: frameErrors, stale: frameStale });
    frame++;
    frameErrors = 0;
    frameStale = 0;
  };

  const request = (instance: number, version: Version, op: 'write' | 'read', row: number, v: number) => {
    const who = version === 1 ? 'v1' : 'v2';
    const id = row + 1;
    if (op === 'write') {
      const columns = version === 1 ? [OLD_COLUMN] : v2WriteColumns(t.flags);
      const bad = firstMissing(t, columns);
      const params = [...columns.map(() => v), id];
      const text = `${who} #${instance + 1} writes row ${id} = ${v} to ${columns.join(' and ')}`;
      if (bad) {
        push({ who, instance, op, step: null, sql: writeSql(columns), params, ok: false, error: missing(bad), result: null, stale: false, text: `${text}: ${missing(bad)}` });
        return;
      }
      for (const c of columns) t.rows[row][c === OLD_COLUMN ? 'name' : 'full'] = v;
      t.truth[row] = v;
      push({ who, instance, op, step: null, sql: writeSql(columns), params, ok: true, error: null, result: null, stale: false, text });
      return;
    }
    const column = version === 2 && t.flags.switchReads ? NEW_COLUMN : OLD_COLUMN;
    const bad = firstMissing(t, [column]);
    if (bad) {
      push({ who, instance, op, step: null, sql: readSql(column), params: [id], ok: false, error: missing(bad), result: null, stale: false, text: `${who} #${instance + 1} reads row ${id} from ${column}: ${missing(bad)}` });
      return;
    }
    const result = t.rows[row][column === OLD_COLUMN ? 'name' : 'full'];
    const stale = result !== t.truth[row];
    push({ who, instance, op, step: null, sql: readSql(column), params: [id], ok: true, error: null, result, stale, text: `${who} #${instance + 1} reads row ${id} from ${column}: ${result === null ? 'NULL' : result}${stale ? ` (stale: last write was ${t.truth[row]})` : ''}` });
  };

  const round = () => {
    const v2 = v2Count(deployPercent, stage);
    for (let i = 0; i < INSTANCES; i++) {
      const version: Version = i < v2 ? 2 : 1;
      request(i, version, 'write', Math.floor(rnd() * ROWS), value++);
      request(i, version, 'read', Math.floor(rnd() * ROWS), 0);
    }
  };

  const step = (id: StepId) => {
    const base = { who: 'migration' as const, instance: null, op: 'step' as const, step: id, params: [], result: null, stale: false };
    if (id === 'expand') {
      const sql = STEP_SQL.expand!;
      if (t.hasFull) push({ ...base, sql, ok: false, error: `duplicate column name: ${NEW_COLUMN}`, text: `expand: duplicate column name: ${NEW_COLUMN}` });
      else {
        t.hasFull = true;
        push({ ...base, sql, ok: true, error: null, text: `expand: add ${NEW_COLUMN}, nullable` });
      }
    } else if (id === 'contract') {
      const sql = STEP_SQL.contract!;
      if (!t.hasName) push({ ...base, sql, ok: false, error: missing(OLD_COLUMN), text: `contract: ${missing(OLD_COLUMN)}` });
      else {
        t.hasName = false;
        for (const r of t.rows) r.name = null;
        push({ ...base, sql, ok: true, error: null, text: `contract: drop ${OLD_COLUMN}` });
      }
    } else if (id === 'backfill') {
      const bad = firstMissing(t, [OLD_COLUMN, NEW_COLUMN]);
      if (bad) {
        push({ ...base, sql: BACKFILL_SQL, params: [1, TOY_BATCH], ok: false, error: missing(bad), text: `backfill: ${missing(bad)}` });
        return;
      }
      for (let from = 0; from < ROWS; from += TOY_BATCH) {
        const to = Math.min(ROWS, from + TOY_BATCH) - 1;
        for (let r = from; r <= to; r++) t.rows[r].full = t.rows[r].name;
        push({ ...base, sql: BACKFILL_SQL, params: [from + 1, to + 1], ok: true, error: null, text: `backfill: copy ${OLD_COLUMN} into ${NEW_COLUMN} for rows ${from + 1} to ${to + 1}` });
        if (to < ROWS - 1) round();
      }
    } else {
      const text = { dualWrite: 'dual-write: v2 now writes both columns', switchReads: 'switch reads: v2 now reads the new column', stopWriting: 'stop writing: v2 no longer writes the old column' }[id];
      t.flags[id] = true;
      push({ ...base, sql: '', ok: true, error: null, text });
    }
  };

  snapshot(null);
  for (const id of order) {
    round();
    step(id);
    stage++;
    snapshot(id);
  }
  round();
  snapshot(null);

  const errors = events.filter((e) => !e.ok).length;
  const staleReads = events.filter((e) => e.stale).length;
  const lostRows = lostRowsOf(t);
  const skipped = STEP_IDS.filter((s) => !order.includes(s));
  // Frame 0 is the untouched table: the first request round belongs to frame 1, whose snapshot is taken after its step.
  return { order: [...order], deploy: deployPercent, seed, events, frames, errors, staleReads, lostRows, skipped, clean: skipped.length === 0 && errors === 0 && staleReads === 0 && lostRows.length === 0 };
}

/** All orderings of a list, in lexicographic order of position. */
export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

export const ALL_ORDERS: readonly StepId[][] = permutations(STEP_IDS);

/** How many of the 720 orderings of the six steps run clean at this deploy position and seed. */
export function cleanOrderCount(deployPercent: number, seed: number): number {
  return ALL_ORDERS.filter((o) => runMigration(o, deployPercent, seed).clean).length;
}

export interface Preset {
  id: 'correct' | 'skipDual' | 'contractEarly' | 'backfillFirst';
  label: string;
  order: StepId[];
}

export const PRESETS: readonly Preset[] = [
  { id: 'correct', label: 'Correct order', order: [...STEP_IDS] },
  { id: 'skipDual', label: 'Skip dual-write', order: ['expand', 'backfill', 'switchReads', 'stopWriting', 'contract'] },
  { id: 'contractEarly', label: 'Contract too early', order: ['expand', 'dualWrite', 'contract', 'backfill', 'switchReads', 'stopWriting'] },
  { id: 'backfillFirst', label: 'Backfill before expand', order: ['backfill', 'expand', 'dualWrite', 'switchReads', 'stopWriting', 'contract'] },
];
