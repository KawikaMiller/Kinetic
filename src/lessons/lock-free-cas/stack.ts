/**
 * A Treiber stack over a three-node heap with a free list, as a pure state machine for `core/explore` (scene 2).
 * Every step is one atomic action on a sequentially consistent machine: load head, load h.next, CAS head,
 * store n.next, an allocator call. There are three modes: plain CAS, a tagged head (node plus counter) and hazard
 * pointers. The invariant checked after every step is that the stack from `head` is acyclic and every node is in
 * exactly one place: on the stack, on the free list, retired, or held by one thread.
 *
 * The allocator hands back the most recently freed node first (a modelled choice). Not modelled: epoch-based
 * reclamation, real allocators, queues, a real heap.
 */
import { explore, type ActionLabel, type PathStep, type Transition } from '../../core/explore';

export type NodeId = 'A' | 'B' | 'C';
export const NODES: readonly NodeId[] = ['A', 'B', 'C'];
export type Mode = 'plain' | 'tagged' | 'hazard';
export const MODES: readonly Mode[] = ['plain', 'tagged', 'hazard'];
export type Op = 'pop' | 'push r1' | 'push r2' | 'free r1' | 'free r2' | 'new';
export const OPS: readonly Op[] = ['pop', 'push r1', 'push r2', 'free r1', 'free r2', 'new'];

export const MAX_THREADS = 3;
export const MAX_OPS = 5;
export const BUDGET = 250_000;

/** Counterfactual switches for the tests: a deliberately broken fix must fail like plain CAS. */
export interface Quirks {
  /** Tagged head whose counter is never incremented. */
  staticTag?: boolean;
  /** Hazard pointers that never publish before the re-check. */
  noPublish?: boolean;
}

export interface Config { mode: Mode; quirks?: Quirks }

type Slot = NodeId | null;
interface Head { node: Slot; tag: number }
interface Thread {
  pc: number;
  phase: string;
  h: Slot;
  ht: number;
  nx: Slot;
  /** A node allocated by `new`, not yet pushed. */
  tmp: Slot;
  regs: [Slot, Slot];
  /** The hazard pointer this thread has published. */
  hp: Slot;
}
export interface StackState {
  head: Head;
  next: Record<NodeId, Slot>;
  free: NodeId[];
  retired: NodeId[];
  threads: Thread[];
}

const phaseFor = (op: Op | undefined): string => (op === undefined ? 'done' : op === 'pop' ? 'p0' : op.startsWith('push') ? 'u0' : op.startsWith('free') ? 'f0' : 'n0');
const regIndex = (op: Op): 0 | 1 => (op.endsWith('r2') ? 1 : 0);

export function initialState(programs: readonly (readonly Op[])[]): StackState {
  return {
    head: { node: 'A', tag: 0 },
    next: { A: 'B', B: 'C', C: null },
    free: [],
    retired: [],
    threads: programs.map((p) => ({ pc: 0, phase: phaseFor(p[0]), h: null, ht: 0, nx: null, tmp: null, regs: [null, null], hp: null })),
  };
}

// ── Editing programs ────────────────────────────────────────────────────

export type Edited = { ok: true; ops: Op[] } | { ok: false; message: string };

/** null when the operations can run in order, else why the one at `index` cannot (a register is empty or full). */
export function programError(ops: readonly Op[]): { index: number; message: string } | null {
  const full: [boolean, boolean] = [false, false];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === 'pop') {
      const free = full.indexOf(false);
      if (free < 0) return { index: i, message: 'r1 and r2 are both full: free or push one of them before the next pop' };
      full[free] = true;
    } else if (op !== 'new') {
      const k = regIndex(op);
      if (!full[k]) return { index: i, message: `r${k + 1} is empty: pop first` };
      full[k] = false;
    }
  }
  return null;
}

/** Append an operation, or refuse with the reason. */
export function addOp(ops: readonly Op[], op: Op): Edited {
  if (ops.length >= MAX_OPS) return { ok: false, message: `At most ${MAX_OPS} operations per thread.` };
  const next = [...ops, op];
  const bad = programError(next);
  return bad ? { ok: false, message: bad.message } : { ok: true, ops: next };
}

/** Drop the last operation: shorter programs are always valid. */
export const removeLastOp = (ops: readonly Op[]): Op[] => ops.slice(0, -1);

export const PRESETS: readonly { id: string; label: string; programs: readonly (readonly Op[])[] }[] = [
  { id: 'reuse', label: 'ABA via reuse', programs: [['pop'], ['pop', 'pop', 'free r2', 'free r1', 'new']] },
  { id: 'repush', label: 'ABA by re-push', programs: [['pop'], ['pop', 'pop', 'push r1']] },
  { id: 'poppers', label: 'two poppers', programs: [['pop'], ['pop']] },
];

// ── The step function ───────────────────────────────────────────────────

export interface StackLabel extends ActionLabel { /** the thread's index */ thread: number }

const setThread = (s: StackState, t: number, patch: Partial<Thread>): Thread[] => s.threads.map((th, i) => (i === t ? { ...th, ...patch } : th));
const advance = (programs: readonly (readonly Op[])[], s: StackState, t: number): Partial<Thread> => ({ pc: s.threads[t].pc + 1, phase: phaseFor(programs[t][s.threads[t].pc + 1]) });
const place = (n: Slot): string => n ?? 'null';

/** Nodes some thread has published as a hazard pointer. */
const protectedNodes = (s: StackState): Set<NodeId> => new Set(s.threads.flatMap((th) => (th.hp ? [th.hp] : [])));

/** Move retired nodes that nobody protects onto the free list, in the order they were retired. */
function scan(s: StackState): { free: NodeId[]; retired: NodeId[]; released: NodeId[] } {
  const guarded = protectedNodes(s);
  const free = [...s.free];
  const released: NodeId[] = [];
  const retired: NodeId[] = [];
  for (const n of s.retired) { if (guarded.has(n)) retired.push(n); else { free.unshift(n); released.push(n); } }
  return { free, retired, released };
}

/** The one step thread `t` can take, or null when it has finished its program. */
export function stepThread(programs: readonly (readonly Op[])[], cfg: Config, s: StackState, t: number): Transition<StackState, StackLabel> | null {
  const th = s.threads[t];
  const actor = `T${t + 1}`;
  const op = programs[t][th.pc];
  if (th.phase === 'done' || op === undefined) return null;
  const out = (text: string, next: StackState): Transition<StackState, StackLabel> => ({ label: { actor, text, thread: t }, next });
  const tagged = cfg.mode === 'tagged';
  const hazard = cfg.mode === 'hazard';
  const casHolds = (h: Slot, ht: number) => s.head.node === h && (!tagged || s.head.tag === ht);
  const newHead = (node: Slot): Head => ({ node, tag: tagged && !cfg.quirks?.staticTag ? s.head.tag + 1 : s.head.tag });
  const tagText = tagged ? `, tag ${th.ht}` : '';

  switch (th.phase) {
    case 'p0': {
      if (s.head.node === null) return out('load head: the stack is empty, pop returns nothing', { ...s, threads: setThread(s, t, advance(programs, s, t)) });
      return out(`load head, reads ${s.head.node}${tagged ? ` (tag ${s.head.tag})` : ''}`, { ...s, threads: setThread(s, t, { h: s.head.node, ht: s.head.tag, phase: hazard && !cfg.quirks?.noPublish ? 'p1' : hazard ? 'p2' : 'p3' }) });
    }
    case 'p1':
      return out(`publish hazard pointer ${th.h}`, { ...s, threads: setThread(s, t, { hp: th.h, phase: 'p2' }) });
    case 'p2':
      return s.head.node === th.h
        ? out(`re-check head: still ${th.h}`, { ...s, threads: setThread(s, t, { phase: 'p3' }) })
        : out(`re-check head: it is now ${place(s.head.node)}, retry`, { ...s, threads: setThread(s, t, { hp: null, phase: 'p0' }) });
    case 'p3':
      return out(`load ${th.h}.next, reads ${place(s.next[th.h!])}`, { ...s, threads: setThread(s, t, { nx: s.next[th.h!], phase: 'p4' }) });
    case 'p4': {
      if (casHolds(th.h, th.ht)) {
        const reg = th.regs[0] === null ? 0 : 1;
        const regs: [Slot, Slot] = reg === 0 ? [th.h, th.regs[1]] : [th.regs[0], th.h];
        return out(`cas(head, ${th.h}${tagText} to ${place(th.nx)}) succeeds: pops ${th.h} into r${reg + 1}`, {
          ...s, head: newHead(th.nx), threads: setThread(s, t, { regs, hp: null, h: null, nx: null, ...advance(programs, s, t) }),
        });
      }
      return out(`cas(head, ${th.h}${tagText} to ${place(th.nx)}) fails: head changed, retry`, { ...s, threads: setThread(s, t, { hp: null, phase: 'p0' }) });
    }
    case 'n0': {
      if (s.free.length === 0) return out('allocate: the free list is empty, nothing to push', { ...s, threads: setThread(s, t, advance(programs, s, t)) });
      const [node, ...rest] = s.free;
      return out(`allocate ${node} from the free list`, { ...s, free: rest, threads: setThread(s, t, { tmp: node, phase: 'u0' }) });
    }
    case 'u0':
      return out(`load head, reads ${place(s.head.node)}${tagged ? ` (tag ${s.head.tag})` : ''}`, { ...s, threads: setThread(s, t, { h: s.head.node, ht: s.head.tag, phase: 'u1' }) });
    case 'u1': {
      const node = th.tmp ?? th.regs[regIndex(op)]!;
      return out(`store ${node}.next = ${place(th.h)}`, { ...s, next: { ...s.next, [node]: th.h }, threads: setThread(s, t, { phase: 'u2' }) });
    }
    case 'u2': {
      const node = th.tmp ?? th.regs[regIndex(op)]!;
      if (casHolds(th.h, th.ht)) {
        const regs: [Slot, Slot] = op.startsWith('push') ? (regIndex(op) === 0 ? [null, th.regs[1]] : [th.regs[0], null]) : th.regs;
        return out(`cas(head, ${place(th.h)}${tagText} to ${node}) succeeds: ${node} is pushed`, { ...s, head: newHead(node), threads: setThread(s, t, { regs, tmp: null, h: null, ...advance(programs, s, t) }) });
      }
      return out(`cas(head, ${place(th.h)}${tagText} to ${node}) fails: head changed, retry`, { ...s, threads: setThread(s, t, { phase: 'u0' }) });
    }
    case 'f0': {
      const k = regIndex(op);
      const node = th.regs[k]!;
      const regs: [Slot, Slot] = k === 0 ? [null, th.regs[1]] : [th.regs[0], null];
      const threads = setThread(s, t, { regs, ...advance(programs, s, t) });
      if (!hazard) return out(`free ${node}: it goes back to the free list`, { ...s, free: [node, ...s.free], threads });
      const retiredState: StackState = { ...s, retired: [...s.retired, node], threads };
      const swept = scan(retiredState);
      const note = swept.released.length === 0 ? `free ${node}: a hazard pointer protects it, so it is deferred` : swept.retired.length ? `free ${node}: released ${swept.released.join(', ')}; ${swept.retired.join(', ')} still protected` : `free ${node}: nothing protects it, so it goes back to the free list`;
      return out(note, { ...retiredState, free: swept.free, retired: swept.retired });
    }
    default:
      return null;
  }
}

export function actions(programs: readonly (readonly Op[])[], cfg: Config, s: StackState): Transition<StackState, StackLabel>[] {
  return s.threads.flatMap((_, t) => { const step = stepThread(programs, cfg, s, t); return step ? [step] : []; });
}

export const stateKey = (s: StackState): string =>
  JSON.stringify([s.head.node, s.head.tag, NODES.map((n) => s.next[n]), s.free, s.retired, s.threads.map((t) => [t.pc, t.phase, t.h, t.ht, t.nx, t.tmp, t.regs, t.hp])]);

// ── The invariant ───────────────────────────────────────────────────────

/** The nodes on the stack from head, and a cycle message if the walk comes back to a node it has seen. */
export function walkStack(s: StackState): { nodes: NodeId[]; cycle: string | null } {
  const nodes: NodeId[] = [];
  for (let n: Slot = s.head.node; n !== null; n = s.next[n]) {
    if (nodes.includes(n)) return { nodes, cycle: `The stack has a cycle: ${nodes[nodes.length - 1]} leads back to ${n}` };
    nodes.push(n);
  }
  return { nodes, cycle: null };
}

/** null while every node is in exactly one place and the stack has no cycle; else the first failing check, naming the node. */
export function invariant(s: StackState): string | null {
  const { nodes, cycle } = walkStack(s);
  if (cycle) return cycle;
  for (const n of NODES) {
    const where: string[] = [];
    if (nodes.includes(n)) where.push('on the stack');
    if (s.free.includes(n)) where.push('on the free list');
    if (s.retired.includes(n)) where.push('retired');
    s.threads.forEach((th, t) => { if (th.regs.includes(n) || th.tmp === n) where.push(`held by T${t + 1}`); });
    if (where.length > 1) return `${n} is ${where.join(' and ')}`;
    if (where.length === 0) return `${n} is lost: no stack, list or thread has it`;
  }
  return null;
}

// ── Exploring and replaying ─────────────────────────────────────────────

export interface Search {
  states: number;
  truncated: boolean;
  violation: { message: string; path: PathStep<StackState, StackLabel>[] } | null;
}

export function search(programs: readonly (readonly Op[])[], cfg: Config, budget: number = BUDGET): Search {
  if (programs.length < 1 || programs.length > MAX_THREADS) throw new RangeError(`Use 1 to ${MAX_THREADS} threads: that is ${programs.length}.`);
  const bad = programs.find((p) => p.length > MAX_OPS || programError(p));
  if (bad) throw new RangeError('A program is too long or uses an empty register.');
  const r = explore<StackState, StackLabel>({
    init: initialState(programs),
    actions: (s) => actions(programs, cfg, s),
    key: stateKey,
    invariant,
    maxStates: budget,
  });
  return { states: r.states, truncated: r.truncated, violation: r.violation };
}

export interface Replay {
  state: StackState;
  steps: StackLabel[];
  /** The first failing check and the step after which it failed (1-based), or null. */
  broken: { message: string; atStep: number } | null;
  /** Index of the first pick that could not be made (a finished thread), or null. */
  refusedAt: number | null;
}

/** Replay thread choices (0-based) from the start, reporting the first failing check. */
export function replay(programs: readonly (readonly Op[])[], cfg: Config, picks: readonly number[]): Replay {
  let state = initialState(programs);
  const steps: StackLabel[] = [];
  let broken: Replay['broken'] = null;
  for (let i = 0; i < picks.length; i++) {
    const step = picks[i] >= 0 && picks[i] < programs.length ? stepThread(programs, cfg, state, picks[i]) : null;
    if (!step) return { state, steps, broken, refusedAt: i };
    state = step.next;
    steps.push(step.label);
    if (!broken) { const m = invariant(state); if (m) broken = { message: m, atStep: steps.length }; }
  }
  return { state, steps, broken, refusedAt: null };
}

export const isFinished = (s: StackState): boolean => s.threads.every((t) => t.phase === 'done');

/** The sentence for a hazard-pointer run that still fails: hazard pointers defer frees, so a program that never frees has nothing to defer. */
export function hazardWhy(programs: readonly (readonly Op[])[], cfg: Config, s: Search): string | null {
  if (cfg.mode !== 'hazard' || !s.violation) return null;
  if (programs.some((p) => p.some((o) => o.startsWith('free')))) return null;
  return 'Hazard pointers protect reclamation, not a program that recycles a node itself: this program never frees a node, so nothing is deferred and the stale CAS still succeeds.';
}
