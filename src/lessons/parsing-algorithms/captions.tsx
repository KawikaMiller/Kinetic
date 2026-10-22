import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { EMPTY_STRING, type BuFrame, type BuRun, type TdFrame, type TdRun } from './runs';

const names = (xs: readonly string[]) => <code>{xs.join(', ')}</code>;

export interface TopDownState {
  conflictCells: number;
  leftRecursive: string[];
  run: TdRun;
}

/** The top-down scene's caption, from the table's conflicts, the left-recursion check and the run. */
export function topDownCaption(s: TopDownState): ReactNode {
  return (
    <>
      {s.conflictCells === 0 ? <>No cell holds two rules, so one token of lookahead always picks the rule: this grammar is LL(1).</> : <>{plural(s.conflictCells, 'cell')} hold two rules, so one token of lookahead cannot choose: this grammar is not LL(1).</>}{' '}
      {s.leftRecursive.length ? <>Left recursion in {names(s.leftRecursive)}: such a rule calls itself before reading a token.</> : null} Recursive descent on the tokens: {s.run.message}
    </>
  );
}

export interface BottomUpState {
  states: number;
  conflictCells: number;
  unresolved: number;
}

export function bottomUpCaption(s: BottomUpState): ReactNode {
  return (
    <>
      The LR(0) automaton has {plural(s.states, 'state')}. {s.conflictCells === 0 ? <>No ACTION cell holds two actions, so the grammar is SLR(1).</> : <>{plural(s.conflictCells, 'ACTION cell')} hold a shift and a reduce (or two reduces): {s.unresolved === 0 ? 'each has a choice now.' : `${s.unresolved} still need a choice.`}</>}
    </>
  );
}

/** One lockstep caption: what each parser just did. */
export function lockstepCaption(td: TdFrame, bu: BuFrame, tdRun: TdRun, buRun: BuRun, tdIndex: number, buIndex: number): ReactNode {
  const tdLast = tdIndex === tdRun.frames.length - 1;
  const buLast = buIndex === buRun.frames.length - 1;
  return (
    <>
      <b>Top-down:</b> {td.action} <b>Bottom-up:</b> {bu.action}
      {tdLast && buLast ? <> Both parsers have finished.</> : tdLast ? <> The top-down parser has finished; the bottom-up one continues.</> : buLast ? <> The bottom-up parser has finished; the top-down one continues.</> : null}
    </>
  );
}

/** The derivation as a line of text: forms joined by an arrow. */
export const derivationText = (forms: readonly (readonly string[])[], arrow: string) => forms.map((f) => (f.length ? f.join(' ') : EMPTY_STRING)).join(` ${arrow} `);

export interface PrecedenceState {
  value: number | null;
  usual: number | null;
  matchesUsual: boolean;
  status: BuRun['status'];
}

export function precedenceCaption(s: PrecedenceState): ReactNode {
  if (s.status === 'conflict') return <>A conflict has no choice yet.</>;
  if (s.value === null) return <>This choice does not produce a complete tree: the parse {s.status === 'rejected' ? 'was rejected' : 'did not finish'}.</>;
  return (
    <>
      With these choices the tree evaluates to <b>{s.value}</b> (ids numbered 2, 3, 4, ... left to right). The usual precedence choices give {s.usual}. {s.matchesUsual ? <>These four choices are the usual ones.</> : <>These choices are not the usual precedence rule.</>}
    </>
  );
}


export interface LockFrame extends Frame {
  td: number;
  bu: number;
}

/** One frame per step of the longer run; the shorter parser holds on its last frame. */
export function lockstepFrames(td: TdRun, bu: BuRun): LockFrame[] {
  const n = Math.max(td.frames.length, bu.frames.length);
  return Array.from({ length: n }, (_, i) => {
    const t = Math.min(i, td.frames.length - 1);
    const b = Math.min(i, bu.frames.length - 1);
    return { td: t, bu: b, say: lockstepCaption(td.frames[t], bu.frames[b], td, bu, t, b) };
  });
}
