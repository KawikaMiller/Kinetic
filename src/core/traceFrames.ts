/**
 * traceFrames: the pure side of `components/TracePlayer`. A counterexample, from `explore` (a
 * path of labelled actions and the states they lead to) or from `distSim` (trace rows), becomes
 * a list of frames a step player can walk, frame 0 being the start.
 */
import { decimal } from './format';
import { payloadLabel } from './distSim/trace';
import type { ActionLabel, PathStep } from './explore';
import type { TraceRow } from './distSim/trace';
import type { Frame } from './types';

export interface TraceStep<S> {
  /** The thread or node that acted, when known. */
  actor?: string;
  /** What it did, in words. */
  text: string;
  /** The state after the step. */
  state: S;
}

export interface TraceFrame<S> extends Frame {
  /** 0 for the start, k after the k-th step. */
  index: number;
  actor?: string;
  text: string;
  state: S;
}

export const START_TEXT = 'start';

/** Frame 0 is `initial`; frame k is the state after step k. Each frame's caption names who did what. */
export function traceFrames<S>(initial: S, steps: readonly TraceStep<S>[], startText = START_TEXT): TraceFrame<S>[] {
  const caption = (text: string, actor?: string) => (actor ? `${actor}: ${text}` : text);
  return [
    { index: 0, text: startText, state: initial, say: startText },
    ...steps.map((s, i) => ({ index: i + 1, actor: s.actor, text: s.text, state: s.state, say: caption(s.text, s.actor) })),
  ];
}

/** An explorer path as steps. The labels follow the `ActionLabel` convention (actor and text). */
export function explorePathSteps<S>(path: readonly PathStep<S, ActionLabel>[]): TraceStep<S>[] {
  return path.map((p) => ({ actor: p.label.actor, text: p.label.text, state: p.state }));
}

/** One distSim trace row in words, with its time. */
export function traceRowText<M>(row: TraceRow<M>, describe: (payload: M) => string = payloadLabel): string {
  const at = `t=${decimal(row.t, 1)}ms`;
  const copy = row.dup ? ' (duplicate)' : '';
  switch (row.kind) {
    case 'send': return `${at} ${row.from} sends ${describe(row.payload as M)} to ${row.to}`;
    case 'deliver': return `${at} ${row.to} receives ${describe(row.payload as M)} from ${row.from}${copy}`;
    case 'drop': return `${at} ${describe(row.payload as M)} from ${row.from} to ${row.to} is dropped (${row.reason})${copy}`;
    case 'timer': return `${at} ${row.node} timer ${row.detail}`;
    case 'partition': return `${at} link cut between ${row.from} and ${row.to}`;
    case 'heal': return `${at} link healed between ${row.from} and ${row.to}`;
    default: return `${at} ${row.node} ${row.kind}`;
  }
}

/** A distSim trace (a `forSeeds` violation's `trace`) as steps; the state of a step is its own row. */
export function traceRowSteps<M>(rows: readonly TraceRow<M>[], describe?: (payload: M) => string): TraceStep<TraceRow<M>>[] {
  return rows.map((row) => ({ actor: row.kind === 'deliver' ? row.to : row.kind === 'send' || row.kind === 'drop' ? row.from : row.node, text: traceRowText(row, describe), state: row }));
}

/**
 * A value signature of a trace, so a player can tell "the same trace" from "a new one" even when
 * the caller rebuilds the arrays on every render.
 */
export function traceSignature<S>(initial: S, steps: readonly TraceStep<S>[], stateKey: (s: S) => string): string {
  return [stateKey(initial), ...steps.map((s) => `${s.actor ?? ''}|${s.text}|${stateKey(s.state)}`)].join('\u0001');
}
