/**
 * Invariants for distSim: the enforcement point for AC-0/T3 rule 20.
 *
 * A distributed lesson must not stage its failure, it must produce it. So its test runs the
 * protocol over many seeded fault schedules and asserts a *safety* property after every
 * event; its "broken" mode must violate that property on some seed (and a test says which),
 * and its fixed mode must hold on all of them. Liveness ("it eventually elects a leader") is
 * a different claim: assert it separately and never imply it from safety.
 *
 *   const safety = [(s) => leaders(s) > 1 ? 'two leaders' : null];
 *   const verdict = forSeeds(500, (seed) => electionScenario(seed), safety);
 *   if (!verdict.ok) show(verdict.seed, verdict.message, toSequence(verdict.trace));
 *
 * Two kinds of check live here:
 * - Safety predicates over a cluster `Snapshot` (`checkInvariants`, `forSeeds`): a function
 *   returns null when the property holds and a message when it is broken.
 * - Register-history checkers (`linearizable`, `sequential`, `causal`, `convergent`) over a
 *   recorded list of operations, for the consistency lessons. Same convention: null or message.
 */
import type { Cluster, Snapshot } from './cluster';
import type { TraceRow } from './trace';

/** A safety property: null while it holds, else what is wrong. */
export type Safety<S> = (snapshot: Snapshot<S>) => string | null;

export interface Violation<M> {
  /** Which event (1-based; 0 is the state after init) broke it. */
  step: number;
  /** True time of that event. */
  time: number;
  message: string;
  /** Index into `safety` of the check that failed. */
  rule: number;
  /** The trace up to and including the violating event; nothing after it. */
  trace: readonly TraceRow<M>[];
}

export type CheckResult<M> = ({ ok: true; steps: number } | ({ ok: false } & Violation<M>));

export interface RunBounds {
  /** Run to this true time (default: until the queue empties). */
  until?: number;
  maxEvents?: number;
}

const DEFAULT_MAX_EVENTS = 100_000;

/**
 * Run `cluster` event by event, checking every safety property on the initial state and after
 * each event, and stop at the first violation. Safety is a claim about *every* state, which
 * is why this checks per step rather than at the end.
 */
export function checkInvariants<M, S>(cluster: Cluster<M, S>, safety: readonly Safety<S>[], bounds: RunBounds = {}): CheckResult<M> {
  const maxEvents = bounds.maxEvents ?? DEFAULT_MAX_EVENTS;
  const until = bounds.until ?? Infinity;
  cluster.start();
  const verify = (): Violation<M> | null => {
    const snap = cluster.snapshot();
    for (let rule = 0; rule < safety.length; rule++) {
      const message = safety[rule](snap);
      if (message !== null) return { step: snap.step, time: snap.time, message, rule, trace: cluster.trace.slice() };
    }
    return null;
  };
  let bad = verify();
  let steps = 0;
  while (!bad && steps < maxEvents && cluster.queued > 0 && cluster.nextTime() <= until) {
    cluster.step();
    steps++;
    bad = verify();
  }
  return bad ? { ok: false, ...bad } : { ok: true, steps };
}

export type SeedRange = number | { from: number; to: number };

export type SeedsResult<M> = { ok: true; seeds: number } | ({ ok: false; seed: number } & Violation<M>);

/**
 * Run `scenario(seed)` for each seed in the range (a count, meaning seeds 0 to n-1, or
 * `{ from, to }` with `to` exclusive) and check `safety` on each. Seeds are tried in
 * ascending order, so a failure reports the *lowest* failing seed, with the trace cut off at
 * the violation: the shortest honest counterexample, and the same one on every run.
 * `scenario` builds a fresh cluster (nodes, faults, injected requests) from the seed.
 */
export function forSeeds<M, S>(
  range: SeedRange,
  scenario: (seed: number) => Cluster<M, S>,
  safety: readonly Safety<S>[],
  bounds: RunBounds = {},
): SeedsResult<M> {
  const [from, to] = typeof range === 'number' ? [0, range] : [range.from, range.to];
  for (let seed = from; seed < to; seed++) {
    const result = checkInvariants(scenario(seed), safety, bounds);
    if (!result.ok) return { ...result, seed };
  }
  return { ok: true, seeds: Math.max(0, to - from) };
}

/* ---------- register histories ---------- */

/**
 * One completed operation on a register, as a client saw it. `invoke` and `response` are
 * true times (a lesson records them around its request); an operation overlaps another when
 * their intervals do. A write's `value` is what it wrote, a read's what it returned. Values
 * are compared with `===`. Causal checking needs each written value to be unique per key
 * (it is how a read names the write it saw).
 */
export interface RegisterOp<V = unknown> {
  process: string;
  kind: 'write' | 'read';
  value: V;
  invoke: number;
  response: number;
  /** Which register (default: the one register). */
  key?: string;
}

export interface HistoryOptions<V> {
  /** What a read returns before any write (default null). */
  initial?: V | null;
}

/** The most operations the exhaustive checkers take: they search orderings, so cost is exponential. */
export const MAX_HISTORY_OPS = 24;

const keyOf = (op: RegisterOp<unknown>) => op.key ?? '';

function validate(history: readonly RegisterOp<unknown>[]) {
  if (history.length > MAX_HISTORY_OPS) throw new RangeError(`history checkers take at most ${MAX_HISTORY_OPS} operations`);
  for (const op of history) if (!(op.response >= op.invoke)) throw new RangeError('an operation must respond at or after it was invoked');
}

const opText = (op: RegisterOp<unknown>) => `${op.process} ${op.kind} ${keyOf(op) ? `${keyOf(op)}=` : ''}${String(op.value)}`;

/**
 * Search for an order of `ops` satisfying `canGo(i, done)` (which ops may come next) in which
 * every read sees the latest earlier write. `stateKey` memoises (done set, registers) so the
 * search never repeats a dead end. Returns true when some full order exists.
 */
function searchOrder<V>(ops: readonly RegisterOp<V>[], initial: V | null, canGo: (i: number, done: number) => boolean): boolean {
  const dead = new Set<string>();
  const go = (done: number, regs: Map<string, V | null>): boolean => {
    if (done === (1 << ops.length) - 1) return true;
    const memo = `${done}|${[...regs].sort().map(([k, v]) => `${k}=${String(v)}`).join(',')}`;
    if (dead.has(memo)) return false;
    for (let i = 0; i < ops.length; i++) {
      if (done & (1 << i) || !canGo(i, done)) continue;
      const op = ops[i];
      if (op.kind === 'read' && (regs.has(keyOf(op)) ? regs.get(keyOf(op)) : initial) !== op.value) continue;
      const next = op.kind === 'write' ? new Map(regs).set(keyOf(op), op.value) : regs;
      if (go(done | (1 << i), next)) return true;
    }
    dead.add(memo);
    return false;
  };
  return go(0, new Map());
}

/**
 * Linearizability: the operations can be put in one total order that (a) makes every read
 * return the latest write before it and (b) respects real time: if A responded before B was
 * invoked, A comes first. The strongest register model.
 */
export function linearizable<V>(history: readonly RegisterOp<V>[], o: HistoryOptions<V> = {}): string | null {
  validate(history);
  const ok = searchOrder(history, o.initial ?? null, (i, done) =>
    history.every((other, j) => j === i || done & (1 << j) || !(other.response < history[i].invoke)),
  );
  return ok ? null : 'no single order of the operations both makes every read see the latest write and respects real time';
}

/**
 * Sequential consistency: one total order that makes every read return the latest write
 * before it and keeps each process's own operations in the order it issued them (by
 * invoke time), but ignores real time across processes. Every linearizable history is
 * sequential; a read may be stale in wall-clock terms and still be sequential.
 */
export function sequential<V>(history: readonly RegisterOp<V>[], o: HistoryOptions<V> = {}): string | null {
  validate(history);
  const ok = searchOrder(history, o.initial ?? null, (i, done) =>
    history.every((other, j) => j === i || done & (1 << j) || other.process !== history[i].process || other.invoke >= history[i].invoke),
  );
  return ok ? null : 'no single order of the operations both makes every read see the latest write and keeps each process in its own order';
}

/**
 * Causal consistency (causal memory): operations related by cause must be seen in cause order
 * by everyone, while unrelated (concurrent) writes may be seen in different orders by
 * different processes. The causal order is each process's own order plus "this read returned
 * that write", closed under transitivity. The history is causal when, for every process, the
 * writes of everybody plus that process's own reads fit one order that respects the causal
 * order and in which each read returns the latest write before it.
 * Every sequential history is causal.
 */
export function causal<V>(history: readonly RegisterOp<V>[], o: HistoryOptions<V> = {}): string | null {
  validate(history);
  const initial = o.initial ?? null;
  const n = history.length;
  const before: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && history[i].process === history[j].process && history[i].invoke < history[j].invoke) before[i][j] = true;
    }
  }
  for (let r = 0; r < n; r++) {
    const read = history[r];
    if (read.kind !== 'read' || read.value === initial) continue;
    const sources = history.map((w, i) => (w.kind === 'write' && keyOf(w) === keyOf(read) && w.value === read.value ? i : -1)).filter((i) => i >= 0);
    if (sources.length === 0) return `${opText(read)} returned a value no one wrote`;
    if (sources.length > 1) throw new RangeError('causal checking needs each written value to be unique per key');
    before[sources[0]][r] = true;
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (before[i][k] && before[k][j]) before[i][j] = true;
  for (let i = 0; i < n; i++) if (before[i][i]) return `${opText(history[i])} would have to come before itself`;

  for (const process of new Set(history.map((op) => op.process))) {
    const view = history.map((_, i) => i).filter((i) => history[i].kind === 'write' || history[i].process === process);
    const ops = view.map((i) => history[i]);
    const ok = searchOrder(ops, initial, (a, done) => view.every((gi, b) => b === a || done & (1 << b) || !before[gi][view[a]]));
    if (!ok) return `${process} cannot see the writes in any order that respects cause and effect`;
  }
  return null;
}

export interface ConvergenceOptions {
  /** Reads starting at least this long after a key's last write count as "after the dust settles" (default 0). */
  settleMs?: number;
}

/**
 * Eventual consistency, the testable part: once writes stop, replicas agree. For each key,
 * every read invoked at least `settleMs` after the last write responded must return the same
 * value. (It does not say *which* value won: that is the conflict-resolution rule's job.)
 */
export function convergent<V>(history: readonly RegisterOp<V>[], o: ConvergenceOptions = {}): string | null {
  validate(history);
  const settle = o.settleMs ?? 0;
  for (const key of new Set(history.map(keyOf))) {
    const ops = history.filter((op) => keyOf(op) === key);
    const lastWrite = Math.max(-Infinity, ...ops.filter((op) => op.kind === 'write').map((op) => op.response));
    const late = ops.filter((op) => op.kind === 'read' && op.invoke >= lastWrite + settle);
    const distinct = new Set(late.map((op) => op.value));
    if (distinct.size > 1) return `after the last write${key ? ` to ${key}` : ''}, reads still disagree: ${[...distinct].map(String).join(' vs ')}`;
  }
  return null;
}
