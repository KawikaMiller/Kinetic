/**
 * The CAS counter and the progress experiments (scenes 1 and 3). Pure, sequentially consistent: every step is
 * atomic and in order (ordering of the CAS itself is a memory-ordering-atomics question). Each thread runs
 * `old = load x; if cas(x, old, old + 1) done else retry`. The executions are enumerated by `core/explore`.
 */
import { explore, type ActionLabel, type Transition } from '../../core/explore';

export const MIN_THREADS = 2;
export const MAX_THREADS = 3;

export type Phase = 'load' | 'cas' | 'done';
export interface CasThread { phase: Phase; old: number }
export interface CasState { x: number; threads: CasThread[]; ok: number; failed: number }
export interface CasLabel extends ActionLabel { failed: boolean }

export function casInit(n: number): CasState {
  if (!Number.isInteger(n) || n < MIN_THREADS || n > MAX_THREADS) throw new RangeError(`Use ${MIN_THREADS} or ${MAX_THREADS} threads: that is ${n}.`);
  return { x: 0, threads: Array.from({ length: n }, () => ({ phase: 'load', old: 0 })), ok: 0, failed: 0 };
}

const withThread = (s: CasState, t: number, th: CasThread): CasThread[] => s.threads.map((x, i) => (i === t ? th : x));

/** One step of thread `t`, or null when it is done. */
export function casStep(s: CasState, t: number): Transition<CasState, CasLabel> | null {
  const th = s.threads[t];
  const actor = `T${t + 1}`;
  if (th.phase === 'done') return null;
  if (th.phase === 'load') {
    return { label: { actor, text: `load x, reads ${s.x}`, failed: false }, next: { ...s, threads: withThread(s, t, { phase: 'cas', old: s.x }) } };
  }
  if (s.x === th.old) {
    return { label: { actor, text: `cas(x, ${th.old}, ${th.old + 1}) succeeds`, failed: false }, next: { ...s, x: th.old + 1, ok: s.ok + 1, threads: withThread(s, t, { phase: 'done', old: th.old }) } };
  }
  return { label: { actor, text: `cas(x, ${th.old}, ${th.old + 1}) fails: x is now ${s.x}, you expected ${th.old}; retry`, failed: true }, next: { ...s, failed: s.failed + 1, threads: withThread(s, t, { phase: 'load', old: th.old }) } };
}

export function casActions(s: CasState): Transition<CasState, CasLabel>[] {
  return s.threads.flatMap((_, t) => { const step = casStep(s, t); return step ? [step] : []; });
}

export const casDone = (s: CasState): boolean => s.threads.every((t) => t.phase === 'done');
export const casKey = (s: CasState): string => JSON.stringify([s.x, s.threads.map((t) => [t.phase, t.old]), s.ok, s.failed]);

/** Replay a list of thread choices (0-based) from the start; a choice of a finished thread is refused by returning how far it got. */
export function casRun(n: number, picks: readonly number[]): { state: CasState; steps: CasLabel[]; refusedAt: number | null } {
  let state = casInit(n);
  const steps: CasLabel[] = [];
  for (let i = 0; i < picks.length; i++) {
    const step = picks[i] >= 0 && picks[i] < n ? casStep(state, picks[i]) : null;
    if (!step) return { state, steps, refusedAt: i };
    state = step.next;
    steps.push(step.label);
  }
  return { state, steps, refusedAt: null };
}

/** The presets: a schedule of thread choices for the first steps, the rest left to the learner. */
export const CAS_PRESETS: readonly { id: string; label: string; picks: (n: number) => number[] }[] = [
  { id: 'fair', label: 'fair alternation', picks: (n) => Array.from({ length: 2 * n }, (_, i) => i % n) },
  { id: 'stall', label: 'T1 stalls after its load', picks: () => [0, 1, 1] },
  { id: 'sneak', label: 'T2 sneaks in', picks: () => [0, 1, 1, 0] },
];

export interface ExecutionStats {
  threads: number;
  /** Every distinct schedule from the start to all threads done. */
  executions: number;
  /** executions with 0, 1, 2, ... failed CAS (retries). */
  byRetries: number[];
  /** x at the end, for each execution: every execution ends at the thread count. */
  finalValues: number[];
  states: number;
  truncated: boolean;
}

/** Count the executions by dynamic programming over the explored state graph (a DAG: x only grows). */
export function executionStats(n: number): ExecutionStats {
  const r = explore<CasState, CasLabel>({ init: casInit(n), actions: casActions, key: casKey, graph: true });
  const g = r.graph!;
  // ways[i]: schedules from the start to state i, by how many CASes they failed. Visit states in topological order.
  const ways: Map<number, number>[] = g.states.map(() => new Map());
  ways[0].set(0, 1);
  const indeg = g.states.map(() => 0);
  g.edges.forEach((es) => es.forEach((e) => { indeg[e.to] += 1; }));
  const queue = g.states.flatMap((_, i) => (indeg[i] === 0 ? [i] : []));
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const e of g.edges[i]) {
      for (const [k, c] of ways[i]) {
        const nk = k + (e.label.failed ? 1 : 0);
        ways[e.to].set(nk, (ways[e.to].get(nk) ?? 0) + c);
      }
      indeg[e.to] -= 1;
      if (indeg[e.to] === 0) queue.push(e.to);
    }
  }
  const byRetries: number[] = [];
  const finalValues = new Set<number>();
  let executions = 0;
  g.states.forEach((st, i) => {
    if (!casDone(st)) return;
    finalValues.add(st.x);
    for (const [k, c] of ways[i]) { byRetries[k] = (byRetries[k] ?? 0) + c; executions += c; }
  });
  return { threads: n, executions, byRetries: Array.from(byRetries, (v) => v ?? 0), finalValues: [...finalValues], states: r.states, truncated: r.truncated };
}

export interface FirstAttempt {
  threads: number;
  /** Interleavings of each thread's (load, one attempt at the update). */
  interleavings: number;
  /** In the CAS counter, how many of them fail at least one CAS. */
  retrying: number;
  /** In the unlocked counter (store old + 1), how many keep every update. */
  unlockedKeepsAll: number;
  /** Unlocked counter: interleavings by final value, index = final value. */
  unlockedByFinal: number[];
  /** True when the CAS-without-retry interleavings and the unlocked keeps-all interleavings are the same set. */
  sameSet: boolean;
}

/** Every interleaving of (load, update) per thread, run once through the CAS rule and once through the unlocked store. */
export function firstAttempt(n: number): FirstAttempt {
  casInit(n);
  const casClean = new Set<string>();
  const unlockedKeepsAll = new Set<string>();
  const unlockedByFinal: number[] = Array.from({ length: n + 1 }, () => 0);
  let interleavings = 0;
  let retrying = 0;
  // A word lists thread numbers; a thread's first appearance is its load, its second its update.
  const run = (word: number[]): void => {
    const seen = new Array<number>(n).fill(0);
    const oldCas = new Array<number>(n).fill(0);
    const oldUn = new Array<number>(n).fill(0);
    let xCas = 0;
    let xUn = 0;
    let failed = 0;
    for (const t of word) {
      if (seen[t] === 0) { oldCas[t] = xCas; oldUn[t] = xUn; } else {
        if (xCas === oldCas[t]) xCas = oldCas[t] + 1; else failed += 1;
        xUn = oldUn[t] + 1;
      }
      seen[t] += 1;
    }
    const key = word.join('');
    interleavings += 1;
    if (failed > 0) retrying += 1; else casClean.add(key);
    unlockedByFinal[xUn] += 1;
    if (xUn === n) unlockedKeepsAll.add(key);
  };
  const build = (word: number[], counts: number[]): void => {
    if (word.length === 2 * n) { run(word); return; }
    counts.forEach((c, t) => { if (c < 2) build([...word, t], counts.map((q, i) => (i === t ? q + 1 : q))); });
  };
  build([], new Array<number>(n).fill(0));
  const sameSet = casClean.size === unlockedKeepsAll.size && [...casClean].every((k) => unlockedKeepsAll.has(k));
  return { threads: n, interleavings, retrying, unlockedKeepsAll: unlockedKeepsAll.size, unlockedByFinal, sameSet };
}

// ── Scene 3: lock-based, lock-free (CAS) and wait-free (fetch_add) under two schedules ───────────

export const SUSPEND_STEPS = 20;
export const ADVERSARY_ROUNDS = 12;
export type CounterKind = 'lock' | 'cas' | 'fetch_add';
export type StepKind = 'ok' | 'failed' | 'wait' | 'work';
export interface ProgressStep { thread: 1 | 2; kind: StepKind; text: string }
export interface Progress {
  steps: ProgressStep[];
  /** Increments each thread completed. */
  completed: [number, number];
  /** Failed CAS per thread. */
  failed: [number, number];
  /** Steps T1 needed for its first increment, or null when it had none in the run. */
  t1Steps: number | null;
}

const empty = (): Progress => ({ steps: [], completed: [0, 0], failed: [0, 0], t1Steps: null });

/** T1 is suspended in the middle of its increment; T2 runs for `SUSPEND_STEPS` steps. */
export function suspendedRun(kind: CounterKind): Progress {
  const p = empty();
  let x = 0;
  let t2Phase: 'acquire' | 'load' | 'cas' | 'store' = kind === 'lock' ? 'acquire' : 'load';
  let old = 0;
  for (let i = 0; i < SUSPEND_STEPS; i++) {
    const push = (kind2: StepKind, text: string) => p.steps.push({ thread: 2, kind: kind2, text });
    if (kind === 'lock') {
      push('wait', 'T2 tries the lock: T1 holds it, retry');
    } else if (kind === 'fetch_add') {
      x += 1; p.completed[1] += 1; push('ok', `T2 fetch_add: x is ${x}`);
    } else if (t2Phase === 'load') {
      old = x; t2Phase = 'cas'; push('work', `T2 loads x, reads ${x}`);
    } else {
      // T1 is suspended after its load, so x is unchanged and the CAS succeeds.
      x = old + 1; p.completed[1] += 1; t2Phase = 'load'; push('ok', `T2 cas succeeds: x is ${x}`);
    }
  }
  return p;
}

/** Each round, T2 completes a whole load and CAS between T1's load and T1's CAS. */
export function adversaryRun(kind: CounterKind): Progress {
  const p = empty();
  let x = 0;
  const add = (thread: 1 | 2, k: StepKind, text: string) => p.steps.push({ thread, kind: k, text });
  for (let r = 0; r < ADVERSARY_ROUNDS; r++) {
    if (kind === 'fetch_add') {
      x += 1; p.completed[0] += 1; add(1, 'ok', `T1 fetch_add: x is ${x}`);
      if (p.t1Steps === null) p.t1Steps = 1;
      x += 1; p.completed[1] += 1; add(2, 'ok', `T2 fetch_add: x is ${x}`);
    } else {
      const old1 = x;
      add(1, 'work', `T1 loads x, reads ${old1}`);
      add(2, 'work', `T2 loads x, reads ${x}`);
      x += 1; p.completed[1] += 1; add(2, 'ok', `T2 cas succeeds: x is ${x}`);
      // The script puts T2's whole increment between T1's load and CAS, so T1's CAS always fails.
      p.failed[0] += 1; add(1, 'failed', `T1 cas fails: x is now ${x}, it expected ${old1}`);
    }
  }
  return p;
}

export type Schedule = 'suspend' | 'adversary';

/** The sentence of scene 3 for a counter kind and a schedule, derived from the run. */
export function progressVerdict(kind: CounterKind, schedule: Schedule, p: Progress): string {
  if (schedule === 'suspend') {
    if (kind === 'lock') return `T1 holds the lock and is suspended. After ${SUSPEND_STEPS} steps T2 has completed ${p.completed[1]} increments: it did not complete within ${SUSPEND_STEPS} steps.`;
    return `${kind === 'cas' ? 'T1 is suspended between its load and its CAS' : 'T1 is suspended (a fetch_add is one atomic step, so there is no middle to be stuck in)'}. T2 completed ${p.completed[1]} increments in ${SUSPEND_STEPS} steps.`;
  }
  if (kind === 'cas') return `In ${ADVERSARY_ROUNDS} rounds T1 failed ${p.failed[0]} times and completed ${p.completed[0]} increments, while T2 completed ${p.completed[1]}. A thread completed in each round, and T1 got nothing in ${ADVERSARY_ROUNDS} rounds.`;
  return `On the same schedule each fetch_add (modelled as one atomic instruction) finishes in one step: T1 needed ${p.t1Steps} step for its first increment and completed ${p.completed[0]} in ${ADVERSARY_ROUNDS} rounds, T2 ${p.completed[1]}.`;
}
