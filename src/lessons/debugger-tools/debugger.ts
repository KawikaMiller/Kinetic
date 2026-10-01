// Debugger controls over the precomputed trace. Pure functions, unit-tested in debugger.test.ts.
import { evaluate, logLine, splitArgs, type Scope } from './expr';
import type { FrameSnap, Pause, Trace, Value } from './program';

export type BreakpointKind = 'break' | 'cond' | 'log';

export interface Breakpoint {
  line: number;
  kind: BreakpointKind;
  /** The condition (cond) or the message expressions (log). */
  text: string;
}

export type Action = 'resume' | 'over' | 'into' | 'out';

export interface ConsoleEntry {
  text: string;
  /** 'out': the program's console.log; 'log': a logpoint; 'in'/'result'/'error': the console prompt. */
  kind: 'out' | 'log' | 'in' | 'result' | 'error';
}

export interface Move {
  /** The pause we stopped at, or null if the program ran to the end. */
  to: number | null;
  /** The breakpoint that stopped us, if that's why we stopped. */
  hit: Breakpoint | null;
  /** Everything printed on the way: program output and logpoints, in order. */
  printed: ConsoleEntry[];
  /** Pauses run through without stopping (for "step over ran N lines"). */
  ranThrough: number;
  /** Conditions that threw: DevTools doesn't pause on those, it just carries on. */
  conditionErrors: string[];
}

/** Scope chain of one frame at one pause, innermost first: block, local, script. */
export function scopeOf(pause: Pause, frame: FrameSnap): Scope {
  return [...(frame.block ? [frame.block] : []), frame.locals, pause.script];
}

const depth = (p: Pause) => p.stack.length;

/**
 * Run from pause `from` (-1 = not started yet) until the action's stopping rule, a breakpoint
 * that fires, or the end of the program. Logpoints print on the way and never stop.
 *
 * - into: the very next pause, which may be inside a function that's being called.
 * - over: the next pause at the same depth or shallower. The call still runs completely.
 * - out: the next pause shallower than now, i.e. back in the caller after this function returns.
 * - resume: only a breakpoint stops it.
 * As in real debuggers, a breakpoint inside a call you step over or out of still pauses.
 */
export function move(trace: Trace, from: number, action: Action, breakpoints: readonly Breakpoint[]): Move {
  const { pauses } = trace;
  const startDepth = from < 0 ? 0 : depth(pauses[from]);
  const byLine = new Map(breakpoints.map((b) => [b.line, b]));
  const printed: ConsoleEntry[] = [];
  const conditionErrors: string[] = [];
  let shown = from < 0 ? 0 : pauses[from].printed;
  const flushOutput = (upTo: number) => {
    for (; shown < upTo; shown++) printed.push({ text: trace.output[shown], kind: 'out' });
  };

  for (let j = from + 1; j < pauses.length; j++) {
    const p = pauses[j];
    flushOutput(p.printed);
    const top = p.stack[0];
    const bp = byLine.get(p.line);
    if (bp?.kind === 'log') printed.push({ text: logpointText(bp.text, scopeOf(p, top)), kind: 'log' });
    if (bp && bp.kind !== 'log') {
      const fires = bp.kind === 'break' || conditionHolds(bp.text, scopeOf(p, top), conditionErrors);
      if (fires) return { to: j, hit: bp, printed, ranThrough: j - from - 1, conditionErrors };
    }
    const stops =
      (action === 'into' && j === from + 1) ||
      (action === 'over' && depth(p) <= startDepth) ||
      (action === 'out' && depth(p) < startDepth);
    if (stops) return { to: j, hit: null, printed, ranThrough: j - from - 1, conditionErrors };
  }
  flushOutput(trace.output.length);
  return { to: null, hit: null, printed, ranThrough: pauses.length - from - 1, conditionErrors };
}

function conditionHolds(src: string, scope: Scope, errors: string[]): boolean {
  const r = evaluate(src, scope);
  if (!r.ok) {
    errors.push(r.error);
    return false;
  }
  return Boolean(r.value);
}

/** What a logpoint prints: each comma-separated expression, strings bare, like console.log. */
export function logpointText(src: string, scope: Scope): string {
  const values: Value[] = [];
  for (const part of splitArgs(src)) {
    const r = evaluate(part, scope);
    if (!r.ok) return r.error;
    values.push(r.value);
  }
  return logLine(values);
}

/** Variables whose value differs between two snapshots of the same frame. */
export function changedVars(before: FrameSnap | undefined, after: FrameSnap): Set<string> {
  const changed = new Set<string>();
  if (!before || before.id !== after.id) return changed;
  const all = { ...after.block, ...after.locals };
  const prev: Record<string, Value> = { ...before.block, ...before.locals };
  for (const [k, v] of Object.entries(all)) if (!(k in prev) || !Object.is(prev[k], v)) changed.add(k);
  return changed;
}

/** Pauses needed to reach `line` pressing only Step into from the start (the brute-force route). */
export function stepsToLineByStepInto(trace: Trace, line: number): number {
  return trace.pauses.findIndex((p) => p.line === line) + 1;
}
