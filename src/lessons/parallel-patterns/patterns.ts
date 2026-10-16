/**
 * Map, reduce and scan as data-parallel steps, counted in operations (work) and steps (span). Steps are model
 * steps: real hardware has a fixed number of processors and memory costs the model ignores.
 */
import { parseIntegers } from '../../core/parse';

export type Value = number | string;
export type OpId = 'plus' | 'max' | 'concat' | 'subtract';

export interface Op {
  id: OpId;
  label: string;
  symbol: string;
  apply: (a: Value, b: Value) => Value;
  /** What pads a scan to a power of two. Subtract has no true identity: 0 is used and the lesson says so. */
  identity: Value;
  /** Used only to explain; the lesson's verdicts come from running both versions, never from these flags. */
  associative: boolean;
  commutative: boolean;
}

export const OPS: Record<OpId, Op> = {
  plus: { id: 'plus', label: '+', symbol: '+', apply: (a, b) => (a as number) + (b as number), identity: 0, associative: true, commutative: true },
  max: { id: 'max', label: 'max', symbol: 'max', apply: (a, b) => Math.max(a as number, b as number), identity: -Infinity, associative: true, commutative: true },
  concat: { id: 'concat', label: 'concatenate', symbol: '·', apply: (a, b) => `${a}${b}`, identity: '', associative: true, commutative: false },
  subtract: { id: 'subtract', label: 'subtract', symbol: '−', apply: (a, b) => (a as number) - (b as number), identity: 0, associative: false, commutative: false },
};
export const OP_IDS: OpId[] = ['plus', 'max', 'concat', 'subtract'];

export const INPUT_LIMIT = { count: 16, magnitude: 9999 } as const;
export const MAX_PROCESSORS = 16;

export type ListParse = { ok: true; values: number[] } | { ok: false; error: string };

/** A typed list of up to 16 integers within ±9,999 (negatives refused when the values are digit strings), or the sentence to show instead. */
export function parseInputs(text: string, op: OpId): ListParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Type a list of integers, like 3, 1, 4, 1, 5.' };
  const values = parseIntegers(trimmed);
  if (values === null) return { ok: false, error: 'Use whole numbers separated by commas or spaces: decimals, exponents like 1e3 and text are refused.' };
  if (values.length > INPUT_LIMIT.count) return { ok: false, error: `At most ${INPUT_LIMIT.count} values (you typed ${values.length}).` };
  if (values.some((v) => Math.abs(v) > INPUT_LIMIT.magnitude)) return { ok: false, error: `Keep each value between −${INPUT_LIMIT.magnitude.toLocaleString('en-US')} and ${INPUT_LIMIT.magnitude.toLocaleString('en-US')}.` };
  if (op === 'concat' && values.some((v) => v < 0)) return { ok: false, error: 'Concatenation treats values as digit strings, so negatives are refused in this mode.' };
  return { ok: true, values };
}

/** The list as the operator's own kind of value: digit strings for concatenation, numbers otherwise. */
export const lift = (values: readonly (number | string)[], op: OpId): Value[] => (op === 'concat' ? values.map((v) => String(v)) : values.slice());

/** How a value reads on screen: full for numbers and short strings, and an abbreviated head and tail for a long digit string. */
export function showValue(v: Value, max = 6): string {
  if (v === -Infinity) return '−∞';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v).replace('-', '−') : String(v);
  if (v === '') return '∅';
  return v.length <= max ? v : `${v.slice(0, 2)}…${v.slice(-2)}`;
}

export const sameValue = (a: Value, b: Value): boolean => a === b;
export const log2ceil = (n: number): number => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));
export const nextPow2 = (n: number): number => 2 ** log2ceil(n);

// ── map ──────────────────────────────────────────────────────────────────

export const doubled = (v: number): number => v * 2;
export const mapSteps = (n: number, p: number): number => Math.ceil(n / p);

// ── reduce ───────────────────────────────────────────────────────────────

export interface Fold {
  result: Value;
  /** The running accumulator after each element. */
  prefix: Value[];
  ops: number;
  steps: number;
}

export function foldSequential(vals: readonly Value[], op: Op): Fold {
  const prefix: Value[] = [vals[0]];
  for (let i = 1; i < vals.length; i++) prefix.push(op.apply(prefix[i - 1], vals[i]));
  return { result: prefix[prefix.length - 1], prefix, ops: vals.length - 1, steps: vals.length - 1 };
}

export interface Tree {
  result: Value;
  /** levels[0] is the input; each next level pairs neighbours and carries an odd one up. */
  levels: Value[][];
  ops: number;
  steps: number;
}

/** Pair neighbours, halve the array each level. `arrival` makes the second partial result of each pair arrive first, so the operator sees them swapped. */
export function treeReduce(vals: readonly Value[], op: Op, arrival = false): Tree {
  let cur = vals.slice();
  const levels: Value[][] = [cur];
  let ops = 0;
  while (cur.length > 1) {
    const next: Value[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) {
      next.push(arrival ? op.apply(cur[i + 1], cur[i]) : op.apply(cur[i], cur[i + 1]));
      ops++;
    }
    if (cur.length % 2 === 1) next.push(cur[cur.length - 1]);
    levels.push(next);
    cur = next;
  }
  return { result: cur[0], levels, ops, steps: levels.length - 1 };
}

export type Reason = 'regrouping' | 'reordering';
export interface ReduceVerdict {
  fold: Fold;
  tree: Tree;
  agree: boolean;
  /** Why they differ: the same order regrouped already changes the answer, or only the arrival order does. Null when they agree. */
  reason: Reason | null;
}

export function reduceVerdict(vals: readonly Value[], op: Op, arrival: boolean): ReduceVerdict {
  const fold = foldSequential(vals, op);
  const tree = treeReduce(vals, op, arrival);
  const agree = sameValue(tree.result, fold.result);
  let reason: Reason | null = null;
  if (!agree) reason = sameValue(treeReduce(vals, op, false).result, fold.result) ? 'reordering' : 'regrouping';
  return { fold, tree, agree, reason };
}

// ── scan ─────────────────────────────────────────────────────────────────

export type ScanKind = 'hillis-steele' | 'blelloch';
export type ScanMode = 'inclusive' | 'exclusive';

export interface ScanRow {
  label: string;
  cells: Value[];
  /** Cells read as operands in this step. */
  reads: number[];
  /** Cells written in this step. */
  writes: number[];
}

export interface ScanTrace {
  kind: ScanKind;
  rows: ScanRow[];
  /** The scan of the n inputs in the requested mode. */
  result: Value[];
  ops: number;
  steps: number;
  /** Columns: n, or n padded to a power of two for Blelloch. */
  width: number;
  /** How many of the columns are padding (the identity, not an input). */
  padding: number;
}

const row = (label: string, cells: Value[], reads: number[] = [], writes: number[] = []): ScanRow => ({ label, cells: cells.slice(), reads, writes });

export function hillisSteele(vals: readonly Value[], op: Op, mode: ScanMode): ScanTrace {
  const n = vals.length;
  let cur = vals.slice();
  const rows: ScanRow[] = [row('input', cur)];
  let ops = 0;
  let steps = 0;
  for (let d = 1; d < n; d *= 2) {
    const reads: number[] = [];
    const writes: number[] = [];
    const next = cur.map((v, i) => {
      if (i < d) return v;
      reads.push(i - d, i);
      writes.push(i);
      ops++;
      return op.apply(cur[i - d], v);
    });
    cur = next;
    steps++;
    rows.push(row(`stride ${d}`, cur, [...new Set(reads)], writes));
  }
  const result = mode === 'inclusive' ? cur : [op.identity, ...cur.slice(0, n - 1)];
  return { kind: 'hillis-steele', rows, result, ops, steps, width: n, padding: 0 };
}

export function blelloch(vals: readonly Value[], op: Op, mode: ScanMode): ScanTrace {
  const n = vals.length;
  const m = nextPow2(n);
  const a: Value[] = [...vals, ...Array.from({ length: m - n }, () => op.identity)];
  const rows: ScanRow[] = [row('input', a)];
  let ops = 0;
  let steps = 0;
  let level = 0;
  for (let d = 1; d < m; d *= 2) {
    const reads: number[] = [];
    const writes: number[] = [];
    for (let i = 2 * d - 1; i < m; i += 2 * d) {
      a[i] = op.apply(a[i - d], a[i]);
      reads.push(i - d, i);
      writes.push(i);
      ops++;
    }
    level++;
    steps++;
    rows.push(row(`up-sweep ${level}`, a, reads, writes));
  }
  const total = a[m - 1];
  if (m > 1) {
    a[m - 1] = op.identity;
    rows.push(row('clear the last cell', a, [], [m - 1]));
  }
  level = 0;
  for (let d = m / 2; d >= 1; d /= 2) {
    const reads: number[] = [];
    const writes: number[] = [];
    for (let i = 2 * d - 1; i < m; i += 2 * d) {
      // the prefix arriving at this block goes to the left half unchanged; the right half's prefix is that prefix followed by the left half's total
      // (in that order: it matters for an operator that is not commutative)
      const prefix = a[i];
      const leftTotal = a[i - d];
      a[i - d] = prefix;
      a[i] = op.apply(prefix, leftTotal);
      reads.push(i - d, i);
      writes.push(i - d, i);
      ops++;
    }
    level++;
    steps++;
    rows.push(row(`down-sweep ${level}`, a, reads, writes));
  }
  const exclusive = n === 1 ? [op.identity] : a.slice(0, n);
  const inclusive = Array.from({ length: n }, (_, i) => (i + 1 < m ? (n === 1 ? vals[0] : a[i + 1]) : total));
  return { kind: 'blelloch', rows, result: mode === 'inclusive' ? inclusive : exclusive, ops, steps, width: m, padding: m - n };
}

export const scan = (kind: ScanKind, vals: readonly Value[], op: Op, mode: ScanMode): ScanTrace =>
  kind === 'hillis-steele' ? hillisSteele(vals, op, mode) : blelloch(vals, op, mode);

/** The loop: the prefix computed one element at a time. */
export function sequentialScan(vals: readonly Value[], op: Op, mode: ScanMode): Value[] {
  const out: Value[] = [];
  let acc: Value = op.identity;
  vals.forEach((v) => {
    out.push(mode === 'exclusive' ? acc : op.apply(acc, v));
    acc = op.apply(acc, v);
  });
  return out;
}

// ── cost: work, span, and the estimate on p processors ───────────────────

export interface Cost {
  work: number;
  span: number;
}

export const mapCost = (n: number): Cost => ({ work: n, span: 1 });
export const foldCost = (n: number): Cost => ({ work: Math.max(0, n - 1), span: Math.max(0, n - 1) });
export const treeCost = (n: number): Cost => ({ work: Math.max(0, n - 1), span: log2ceil(n) });
export const hillisCost = (n: number): Cost => {
  let work = 0;
  for (let d = 1; d < n; d *= 2) work += n - d;
  return { work, span: log2ceil(n) };
};
export const blellochCost = (n: number): Cost => {
  const m = nextPow2(n);
  return { work: 2 * (m - 1), span: 2 * log2ceil(m) };
};

/** On p processors the time lies between ceil(work / p) and work / p + span (Brent). */
export function brentRange(c: Cost, p: number): { low: number; high: number } {
  return { low: Math.max(Math.ceil(c.work / p), c.span === 0 ? 0 : 1), high: c.work / p + c.span };
}

// ── what a scan is for ───────────────────────────────────────────────────

export const isEven = (v: number): boolean => v % 2 === 0;

export interface Compaction {
  flags: number[];
  /** Where each kept element goes: the exclusive scan of the flags. */
  slots: number[];
  out: number[];
}

/** Stream compaction by scan: keep the elements the predicate allows; an exclusive scan of 0/1 flags gives their output slots. */
export function compact(values: readonly number[], keep: (v: number) => boolean): Compaction {
  const flags = values.map((v) => (keep(v) ? 1 : 0));
  const slots = blelloch(flags, OPS.plus, 'exclusive').result as number[];
  const out: number[] = [];
  values.forEach((v, i) => {
    if (flags[i] === 1) out[slots[i]] = v;
  });
  return { flags, slots, out };
}

/** Bucket start offsets: the exclusive scan of the bucket counts. */
export const bucketOffsets = (counts: readonly number[]): number[] => blelloch(counts, OPS.plus, 'exclusive').result as number[];

// ── floating point: even + regroups ──────────────────────────────────────

/** Eight tenths-style floats whose sum differs between a left-to-right fold and a tree, in real JavaScript. */
export const FLOAT_PRESET: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

/** (0.1 + 0.2) + 0.3 against 0.1 + (0.2 + 0.3), computed by the engine running this page. */
export const floatGroupings = (): { leftToRight: number; rightToLeft: number } => ({ leftToRight: 0.1 + 0.2 + 0.3, rightToLeft: 0.1 + (0.2 + 0.3) });
