/**
 * A hand-driven store-buffer machine for the "try it yourself" panel: SC and x86-style only. It is written
 * separately from `core/memModel` (its own state, its own moves), so the tests can enumerate every schedule
 * of this machine and compare the outcome set with the explorer's: a second formulation of both models.
 * The weak model is not offered by hand, because a load there chooses among several writes; "show it" lists them.
 */
import { instrText, type Instr, type Litmus, type Snapshot } from '../../core/memModel';

export type ManualModel = 'sc' | 'tso';

export interface MState {
  pcs: number[];
  regs: Record<string, number>;
  mem: Record<string, number>;
  /** Per thread, oldest first: [location, value]. Always empty under SC. */
  buffers: [string, number][][];
}

export type Move = { kind: 'step' | 'drain'; thread: number };

/** Counterfactual switches for the tests: a wrong machine must fail the tests the right one passes. */
export interface Quirks {
  /** Drain the buffer right after every store: SC in disguise. */
  eagerDrain?: boolean;
  /** Let a fence run with a non-empty buffer. */
  ignoreFences?: boolean;
}

const locationsOf = (l: Litmus): string[] => [...new Set([...Object.keys(l.init), ...l.threads.flatMap((p) => p.flatMap((i) => (i.op === 'fence' ? [] : [i.loc])))])].sort();
const registerKeys = (l: Litmus): string[] => l.threads.flatMap((p, t) => [...new Set(p.flatMap((i) => (i.op === 'load' ? [i.reg] : [])))].sort().map((r) => `T${t}.${r}`));

export function initialState(l: Litmus): MState {
  return {
    pcs: l.threads.map(() => 0),
    regs: Object.fromEntries(registerKeys(l).map((k) => [k, 0])),
    mem: Object.fromEntries(locationsOf(l).map((x) => [x, l.init[x] ?? 0])),
    buffers: l.threads.map(() => []),
  };
}

export const nextInstr = (l: Litmus, s: MState, t: number): Instr | undefined => l.threads[t][s.pcs[t]];

/** null when the move can be made, else the reason, in words, that the model disables it. */
export function blockedReason(l: Litmus, s: MState, m: Move, quirks: Quirks = {}): string | null {
  if (m.kind === 'drain') return s.buffers[m.thread].length === 0 ? `T${m.thread}'s buffer is empty` : null;
  const i = nextInstr(l, s, m.thread);
  if (!i) return `T${m.thread} has no instruction left`;
  if (i.op === 'fence' && s.buffers[m.thread].length > 0 && !quirks.ignoreFences) return `T${m.thread}'s fence waits for its buffer to drain`;
  return null;
}

/** The state after the move, and what happened in words. The move must not be blocked. */
export function applyMove(l: Litmus, s: MState, m: Move, model: ManualModel, quirks: Quirks = {}): { state: MState; text: string } {
  const t = m.thread;
  const withBuffer = (b: [string, number][]) => s.buffers.map((x, a) => (a === t ? b : x));
  if (m.kind === 'drain') {
    const [loc, value] = s.buffers[t][0];
    return { state: { ...s, mem: { ...s.mem, [loc]: value }, buffers: withBuffer(s.buffers[t].slice(1)) }, text: `T${t} drains ${loc} = ${value} to memory` };
  }
  const i = nextInstr(l, s, t)!;
  const pcs = s.pcs.map((p, a) => (a === t ? p + 1 : p));
  if (i.op === 'store') {
    if (model === 'sc' || quirks.eagerDrain) return { state: { ...s, pcs, mem: { ...s.mem, [i.loc]: i.value } }, text: `T${t} stores ${i.loc} = ${i.value} straight to memory` };
    return { state: { ...s, pcs, buffers: withBuffer([...s.buffers[t], [i.loc, i.value]]) }, text: `T${t} puts ${i.loc} = ${i.value} in its buffer` };
  }
  if (i.op === 'load') {
    const own = [...s.buffers[t]].reverse().find(([loc]) => loc === i.loc);
    const value = own ? own[1] : s.mem[i.loc];
    return { state: { ...s, pcs, regs: { ...s.regs, [`T${t}.${i.reg}`]: value } }, text: `T${t}: ${instrText(i)} reads ${value} from ${own ? 'its own buffer' : 'memory'}` };
  }
  return { state: { ...s, pcs }, text: `T${t} runs a fence` };
}

export const isFinished = (l: Litmus, s: MState): boolean => s.pcs.every((p, t) => p >= l.threads[t].length) && s.buffers.every((b) => b.length === 0);

export const allMoves = (l: Litmus, model: ManualModel): Move[] =>
  l.threads.flatMap((_, thread): Move[] => (model === 'tso' ? [{ kind: 'step', thread }, { kind: 'drain', thread }] : [{ kind: 'step', thread }]));

/** The machine's state as the trace view draws it (the same shape the explorer's witness steps use). */
export function toSnapshot(s: MState): Snapshot {
  return { pcs: s.pcs, regs: s.regs, mem: s.mem, buffers: s.buffers.map((b) => b.map(([loc, v]) => `${loc}=${v}`)), views: [] };
}

const regsKeyOf = (s: MState): string => Object.entries(s.regs).map(([k, v]) => `${k}=${v}`).join(' ');

/** Every register outcome reachable by SOME schedule of this machine, by depth-first search over distinct states. */
export function reachableOutcomes(l: Litmus, model: ManualModel, quirks: Quirks = {}): Set<string> {
  const seen = new Set<string>();
  const found = new Set<string>();
  const visit = (s: MState): void => {
    const key = JSON.stringify(s);
    if (seen.has(key)) return;
    seen.add(key);
    if (isFinished(l, s)) found.add(regsKeyOf(s));
    for (const m of allMoves(l, model)) if (blockedReason(l, s, m, quirks) === null) visit(applyMove(l, s, m, model, quirks).state);
  };
  visit(initialState(l));
  return found;
}

export const outcomeKey = regsKeyOf;
