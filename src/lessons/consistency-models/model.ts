/**
 * consistency-models, scene 1 and 2: a history of reads and writes on ONE register `x` (initial value 0),
 * drawn by the learner as bars on client rows, and the four verdicts about it.
 *
 * The order-based verdicts come from the shared register-history checkers in `core/distSim`
 * (`linearizable`, `sequential`, `causal`, `convergent`); this file turns the learner's bars into a
 * `RegisterOp` history, finds the smallest violating subset, and finds one witness order for a model that holds.
 * The checkers are exhaustive on tiny histories (a toy: real checkers use smarter search).
 *
 * Time: an operation covers slots `start..end` of the editor. Its invocation is slot `start` and its response is slot
 * `end`, so two operations on different clients overlap when they share a slot and are ordered in real time when one
 * ends in an earlier slot than the other starts.
 */
import { convergent, causal, linearizable, sequential, type RegisterOp } from '../../core/distSim';
import { buildLaneModel, itemById, type LaneItem, type LaneLimits, type LaneModel } from '../../core/laneEditor';

export const CLIENTS = ['C1', 'C2', 'C3'] as const;
export const SLOTS = 20;
export const MAX_OPS = 10;
/** What a read returns before any write. */
export const INITIAL_VALUE = 0;
/** The largest value a write can carry (each write needs its own value, and the editor holds at most MAX_OPS operations). */
export const VALUE_MAX = MAX_OPS;
export const LIMITS: LaneLimits = { lanes: CLIENTS.length, slots: SLOTS, maxItems: MAX_OPS, minSpan: 1 };
/** Quiet reads happen after every operation has ended, so they sit past the last slot. */
export const QUIET_AT = SLOTS + 1;
/** "No quiet read set yet" for the quiet-read control. */
export const NO_QUIET = -1;

export type Kind = 'write' | 'read';
export interface OpData {
  kind: Kind;
  value: number;
}
export type OpModel = LaneModel<OpData>;
export type OpItem = LaneItem<OpData>;

export type OrderModel = 'linearizable' | 'sequential' | 'causal';
export const ORDER_MODELS: readonly OrderModel[] = ['linearizable', 'sequential', 'causal'];
export const MODEL_NAME: Record<OrderModel, string> = { linearizable: 'Linearizable', sequential: 'Sequentially consistent', causal: 'Causally consistent' };
/** Short names for pills and the chain. */
export const MODEL_SHORT: Record<OrderModel, string> = { linearizable: 'linearizable', sequential: 'sequential', causal: 'causal' };

/** The text on a bar and in sentences: `W(x=1)` or `R(x)→1`. */
export const opLabel = (d: OpData): string => (d.kind === 'write' ? `W(x=${d.value})` : `R(x)→${d.value}`);
export const barLabel = (d: OpData): string => (d.kind === 'write' ? `W ${d.value}` : `R→${d.value}`);

/** An operation as the checkers and the sentences see it. */
export interface Op {
  id: string;
  client: string;
  kind: Kind;
  value: number;
  invoke: number;
  response: number;
}

export const opsOf = (model: OpModel): Op[] =>
  model.items.map((it) => ({ id: it.id, client: CLIENTS[it.lane], kind: it.data.kind, value: it.data.value, invoke: it.start, response: it.end }));

const asRegisterOp = (o: Op): RegisterOp<number> => ({ process: o.client, kind: o.kind, value: o.value, invoke: o.invoke, response: o.response });
export const registerOps = (ops: readonly Op[]): RegisterOp<number>[] => ops.map(asRegisterOp);

const written = (ops: readonly Op[]): Set<number> => new Set(ops.filter((o) => o.kind === 'write').map((o) => o.value));

/** The operation text used in sentences: "C2's R(x)→0". */
export const describeOp = (o: Op): string => `${o.client}'s ${opLabel(o)}`;

/* ---------- editing rules the editor itself does not know ---------- */

/** The smallest write value no operation uses yet, or null when all are used. */
export function nextWriteValue(model: OpModel): number | null {
  const used = written(opsOf(model));
  for (let v = 1; v <= VALUE_MAX; v++) if (!used.has(v)) return v;
  return null;
}

/** What a new read returns by default: the value of the write that ended last before the read begins, else the starting value. */
export function freshReadValue(model: OpModel, slot: number): number {
  const before = model.items.filter((i) => i.data.kind === 'write' && i.end < slot).sort((a, b) => b.end - a.end || b.start - a.start);
  return before[0]?.data.value ?? INITIAL_VALUE;
}

export type ValueEdit = { ok: true; model: OpModel } | { ok: false; reason: string };

/** Change the value of one operation, refusing a write value that is 0 (the starting value), out of range or already used. */
export function setValue(model: OpModel, id: string, value: number): ValueEdit {
  const item = itemById(model, id);
  if (!item) return { ok: false, reason: 'Select an operation first.' };
  if (!Number.isInteger(value) || value < 0 || value > VALUE_MAX) return { ok: false, reason: `A value is a whole number from 0 to ${VALUE_MAX}.` };
  if (item.data.kind === 'write') {
    if (value === INITIAL_VALUE) return { ok: false, reason: `A write cannot write ${INITIAL_VALUE}: that is the value x starts with, so a read of it would not tell the writes apart.` };
    const clash = model.items.find((i) => i.id !== id && i.data.kind === 'write' && i.data.value === value);
    if (clash) return { ok: false, reason: `Another write already uses the value ${value}. Every write needs its own value, or a read could not say which write it saw.` };
  }
  return { ok: true, model: { ...model, items: model.items.map((i) => (i.id === id ? { ...i, data: { ...i.data, value } } : i)) } };
}

/* ---------- verdicts ---------- */

export interface Quiet {
  /** One per client, in order: the value it reads after everything has settled, or NO_QUIET. */
  values: readonly number[];
}

export type Verdict = { ok: true } | { ok: false; message: string };

/** Everything the four pills say, from the history and the quiet reads. */
export interface Verdicts {
  linearizable: Verdict;
  sequential: Verdict;
  causal: Verdict;
  /** `na` until every client has a quiet read. */
  converged: { state: 'ok' | 'bad' | 'na'; message: string };
}

const unwrittenRead = (ops: readonly Op[]): Op | undefined => {
  const seen = written(ops);
  return ops.find((o) => o.kind === 'read' && o.value !== INITIAL_VALUE && !seen.has(o.value));
};

const rejection = (o: Op): string => `${describeOp(o)} returned ${o.value}, which no write wrote and is not the starting value ${INITIAL_VALUE}.`;

const runChecker = (name: OrderModel, ops: readonly Op[]): string | null => {
  const history = registerOps(ops);
  const opts = { initial: INITIAL_VALUE };
  if (name === 'linearizable') return linearizable(history, opts);
  if (name === 'sequential') return sequential(history, opts);
  return causal(history, opts);
};

/** A model accepts a history only if every read returned something it could have: a write's value or the starting value. */
export function orderVerdict(name: OrderModel, ops: readonly Op[]): Verdict {
  const bad = unwrittenRead(ops);
  if (bad) return { ok: false, message: rejection(bad) };
  const message = runChecker(name, ops);
  return message === null ? { ok: true } : { ok: false, message };
}

export function convergedVerdict(ops: readonly Op[], quiet: Quiet): Verdicts['converged'] {
  const missing = CLIENTS.filter((_, i) => quiet.values[i] === NO_QUIET);
  if (missing.length > 0) return { state: 'na', message: `Needs a quiet read at every client (missing: ${missing.join(', ')}).` };
  const seen = written(ops);
  const stray = CLIENTS.findIndex((_, i) => quiet.values[i] !== INITIAL_VALUE && !seen.has(quiet.values[i]));
  if (stray >= 0) return { state: 'bad', message: `${CLIENTS[stray]}'s quiet read returned ${quiet.values[stray]}, which no write wrote.` };
  const reads: RegisterOp<number>[] = CLIENTS.map((c, i) => ({ process: c, kind: 'read', value: quiet.values[i], invoke: QUIET_AT, response: QUIET_AT + 1 }));
  const message = convergent([...registerOps(ops.filter((o) => o.kind === 'write')), ...reads]);
  const lost = message === null && seen.size > 0 && !seen.has(quiet.values[0]);
  if (lost) return { state: 'bad', message: `Every client reads the starting value ${INITIAL_VALUE} after the writes stop: they agree, but every write was lost.` };
  if (message === null) return { state: 'ok', message: `After the writes stop, every client reads ${quiet.values[0]}.` };
  const sees = CLIENTS.map((c, i) => `${c} reads ${quiet.values[i]}`).join(', ');
  return { state: 'bad', message: `After the writes stop the clients still disagree: ${sees}.` };
}

export function verdictsOf(ops: readonly Op[], quiet: Quiet): Verdicts {
  return {
    linearizable: orderVerdict('linearizable', ops),
    sequential: orderVerdict('sequential', ops),
    causal: orderVerdict('causal', ops),
    converged: convergedVerdict(ops, quiet),
  };
}

/** The strongest order model the history satisfies, or null when it satisfies none of them. */
export function strongestHolding(v: Pick<Verdicts, OrderModel>): OrderModel | null {
  return ORDER_MODELS.find((m) => v[m].ok) ?? null;
}

/* ---------- the smallest violating subset ---------- */

/**
 * The smallest set of operations that already breaks `name`. Dropping a write that some kept read returned would make that
 * read a brand-new violation ("returned a value no one wrote"), so a subset keeps the write behind every read it keeps.
 * Smaller sets are tried first and, within a size, in order of appearance, so the answer is the same on every run.
 * Returns the operations (in order of appearance), or null when the history is fine.
 */
export function smallestViolation(name: OrderModel, ops: readonly Op[]): Op[] | null {
  if (orderVerdict(name, ops).ok) return null;
  const n = ops.length;
  const sourceOf = (i: number): number => {
    const o = ops[i];
    if (o.kind !== 'read' || o.value === INITIAL_VALUE) return -1;
    return ops.findIndex((w) => w.kind === 'write' && w.value === o.value);
  };
  const subsets = (size: number, from: number, picked: number[]): number[] | null => {
    if (picked.length === size) {
      const keep = new Set(picked);
      if (picked.some((i) => sourceOf(i) >= 0 && !keep.has(sourceOf(i)))) return null;
      return !orderVerdict(name, picked.map((i) => ops[i])).ok ? picked : null;
    }
    for (let i = from; i < n; i++) {
      const found = subsets(size, i + 1, [...picked, i]);
      if (found) return found;
    }
    return null;
  };
  for (let size = 1; size <= n; size++) {
    const found = subsets(size, 0, []);
    if (found) return found.map((i) => ops[i]);
  }
  return null;
}

/** The ops a violating subset cannot do without: dropping `drop` and the reads of its value must leave a history that passes. */
export const withoutOp = (subset: readonly Op[], drop: Op): Op[] =>
  subset.filter((o) => o !== drop && !(drop.kind === 'write' && o.kind === 'read' && o.value === drop.value));

/** Which rule a violating subset breaks, in plain words (the checkers' own messages are generic). */
export function explainViolation(name: OrderModel, subset: readonly Op[]): string {
  const bad = unwrittenRead(subset);
  if (bad) return rejection(bad);
  const clients = new Set(subset.map((o) => o.client));
  if (name !== 'linearizable' && clients.size === 1) {
    const read = subset.filter((o) => o.kind === 'read').sort((a, b) => b.invoke - a.invoke)[0];
    const own = read && subset.filter((o) => o.kind === 'write' && o.invoke < read.invoke).sort((a, b) => b.invoke - a.invoke)[0];
    if (own && read.value !== own.value) return `${own.client} wrote ${own.value} and then read ${read.value}: a client has to see its own earlier write.`;
  }
  if (name === 'linearizable' && subset.length === 2) {
    const [w, r] = subset[0].kind === 'write' ? [subset[0], subset[1]] : [subset[1], subset[0]];
    if (w.kind === 'write' && r.kind === 'read' && r.value !== w.value && w.response < r.invoke) {
      return `${describeOp(r)} began after ${describeOp(w)} was acknowledged, yet returned the older value ${r.value}: a read that starts after a write finished has to see it.`;
    }
  }
  if (name === 'linearizable') return 'No single order of these operations both respects real time and explains what every read returned.';
  if (name === 'sequential') return "No single order of these operations keeps each client's own order and explains what every read returned.";
  return 'Some client cannot see these writes in any order that respects cause and effect.';
}

/* ---------- a witness order for a model that holds ---------- */

/**
 * One order the operations can be put in so that `name` holds (null when none exists). For `causal` it is the order for
 * one client's view: every write plus that client's own reads. Depth-first with a memo on (placed set, current value).
 */
export function witnessOrder(name: OrderModel, ops: readonly Op[], client?: string): Op[] | null {
  if (!orderVerdict(name, ops).ok) return null;
  const view = name === 'causal' ? ops.filter((o) => o.kind === 'write' || o.client === client) : [...ops];
  const must = precedence(name, ops, view);
  const n = view.length;
  const dead = new Set<string>();
  const order: Op[] = [];
  const go = (done: number, current: number): boolean => {
    if (done === (1 << n) - 1) return true;
    const key = `${done}|${current}`;
    if (dead.has(key)) return false;
    for (let i = 0; i < n; i++) {
      if (done & (1 << i) || must[i].some((j) => !(done & (1 << j)))) continue;
      const o = view[i];
      if (o.kind === 'read' && o.value !== current) continue;
      order.push(o);
      if (go(done | (1 << i), o.kind === 'write' ? o.value : current)) return true;
      order.pop();
    }
    dead.add(key);
    return false;
  };
  return go(0, INITIAL_VALUE) ? order : null;
}

/** For each op of `view`, the indices (into `view`) that must come before it under `name`. */
function precedence(name: OrderModel, all: readonly Op[], view: readonly Op[]): number[][] {
  const idx = new Map(all.map((o, i) => [o.id, i]));
  const n = all.length;
  const before = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const [a, b] = [all[i], all[j]];
      if (name === 'linearizable' && a.response < b.invoke) before[i][j] = true;
      if (name !== 'linearizable' && a.client === b.client && a.invoke < b.invoke) before[i][j] = true;
      if (name === 'causal' && a.kind === 'write' && b.kind === 'read' && a.value === b.value) before[i][j] = true;
    }
  }
  if (name === 'causal') for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (before[i][k] && before[k][j]) before[i][j] = true;
  return view.map((b) => view.flatMap((a, ai) => (before[idx.get(a.id)!][idx.get(b.id)!] ? [ai] : [])));
}

/* ---------- presets ---------- */

export interface Preset {
  id: string;
  label: string;
  /** What the learner is shown first, in one line. */
  blurb: string;
  model: () => OpModel;
  quiet: readonly number[];
}

const seeds = (rows: readonly (readonly [lane: number, start: number, end: number, kind: Kind, value: number])[]) =>
  buildLaneModel<OpData>(
    LIMITS,
    rows.map(([lane, start, end, kind, value]) => ({ lane, slot: start, span: end - start, data: { kind, value } })),
  );

export const PRESETS: readonly Preset[] = [
  {
    id: 'stale-read',
    label: 'stale read after an acknowledged write',
    blurb: 'C1 writes 1 and is told it is done. Then C2 reads 0.',
    model: () => seeds([[0, 1, 3, 'write', 1], [1, 5, 7, 'read', 0], [2, 9, 10, 'read', 1]]),
    quiet: [1, 1, 1],
  },
  {
    id: 'own-write',
    label: 'read your own write fails',
    blurb: 'C1 writes 1 and then reads 0 from the same register.',
    model: () => seeds([[0, 1, 3, 'write', 1], [0, 5, 6, 'read', 0], [1, 8, 9, 'read', 1]]),
    quiet: [1, 1, 1],
  },
  {
    id: 'two-orders',
    label: 'concurrent writes seen in two orders',
    blurb: 'W(1) and W(2) overlap. C1 sees 1 then 2; C2 sees 2 then 1.',
    model: () =>
      seeds([[0, 1, 3, 'write', 1], [1, 1, 3, 'write', 2], [0, 5, 6, 'read', 1], [1, 5, 6, 'read', 2], [0, 8, 9, 'read', 2], [1, 8, 9, 'read', 1]]),
    quiet: [2, 1, 2],
  },
  {
    id: 'causality-broken',
    label: 'causality broken',
    blurb: 'C1 writes 1. C2 reads 1 and then writes 2. C3 reads 2 and then reads 1.',
    model: () => seeds([[0, 1, 3, 'write', 1], [1, 4, 5, 'read', 1], [1, 6, 8, 'write', 2], [2, 10, 11, 'read', 2], [2, 13, 14, 'read', 1]]),
    quiet: [2, 2, 2],
  },
  {
    id: 'all-good',
    label: 'all good',
    blurb: 'One write, two reads that see it, and everyone agrees at the end.',
    model: () => seeds([[0, 1, 3, 'write', 1], [1, 5, 6, 'read', 1], [2, 8, 9, 'read', 1]]),
    quiet: [1, 1, 1],
  },
];

export const DEFAULT_PRESET = PRESETS[0];
export const presetById = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;

export interface Profile {
  linearizable: boolean;
  sequential: boolean;
  causal: boolean;
  /** null when the quiet reads are incomplete. */
  converged: boolean | null;
}

export function profileOf(ops: readonly Op[], quiet: Quiet): Profile {
  const v = verdictsOf(ops, quiet);
  return {
    linearizable: v.linearizable.ok,
    sequential: v.sequential.ok,
    causal: v.causal.ok,
    converged: v.converged.state === 'na' ? null : v.converged.state === 'ok',
  };
}
