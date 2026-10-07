import type { ReactNode } from 'react';
import { EPSILON, subsetConstruct, subsetName, type Dfa, type Nfa, type State } from '../../core/automata';
import { power } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { isAccepting, runSteps, type Drawn } from './model';

// ── Running a machine on the tape ────────────────────────────────────

export interface RunFrame extends Frame {
  /** Symbols read so far. */
  read: number;
  states: State[];
  taken: { from: State; to: State; symbol: string }[];
  /** Null until the run is over. */
  verdict: boolean | null;
}

const set = (states: readonly State[]) => (states.length ? `{${states.join(', ')}}` : '∅');

export function symbolText(d: Drawn<Dfa | Nfa>, ch: string): string {
  const name = d.symbolNames?.[ch];
  return name ? `${ch} (${name})` : ch;
}

export function verdictText(accepted: boolean): ReactNode {
  return accepted ? <span className="hl ok">accepted</span> : <span className="hl bad">rejected</span>;
}

export function runFrames(d: Drawn<Dfa | Nfa>, symbols: readonly string[]): RunFrame[] {
  const m = d.machine;
  const steps = runSteps(m, symbols);
  const rec = createRecorder<RunFrame>({ read: 0, states: steps[0].states, taken: steps[0].taken, verdict: null });
  const isNfa = m.kind === 'nfa';
  const startLit = steps[0].states;
  rec.snap(
    isNfa && startLit.length > 1
      ? <>Start in {m.start} and follow its ε-arrows for free: {set(startLit)} are all lit before a single symbol is read.</>
      : <>Start in {m.start} (the incoming arrow). Each step reads one symbol and follows {isNfa ? 'every arrow labelled with it' : 'the one arrow labelled with it'}.</>,
  );

  let died = false;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].states;
    const { states, taken } = steps[i];
    const ch = symbols[i - 1];
    const sym = symbolText(d, ch);
    if (!states.length) {
      rec.snap(
        isNfa
          ? <>Read {sym}: no lit state has an arrow for it, so every token dies. Nothing can bring them back: {verdictText(false)}.</>
          : <>Read {sym}: {prev[0]} has no arrow for it, so the machine dies. A dead machine stays dead: {verdictText(false)}.</>,
        1.5,
        { read: i, states, taken, verdict: false },
      );
      died = true;
      break;
    }
    const eps = taken.some((t) => t.symbol === EPSILON);
    rec.snap(
      isNfa
        ? <>Read {sym}: the tokens on {set(prev)} move to {set(states)}{eps ? <>, then follow ε-arrows for free</> : null}.{states.length > 1 ? ' Several states are lit at once.' : ''}</>
        : <>Read {sym}: {prev[0]} → {states[0]}.</>,
      undefined,
      { read: i, states, taken },
    );
  }
  if (!died) {
    const last = steps[steps.length - 1].states;
    const ok = isAccepting(m, last);
    const hits = last.filter((s) => m.accept.includes(s));
    rec.set({ verdict: ok, taken: [] });
    rec.close(
      symbols.length === 0
        ? <>The empty string: no symbols to read, so the verdict is the start{isNfa ? ' closure' : ''} itself. {verdictText(ok)}.</>
        : isNfa
          ? ok
            ? <>End of input with {set(last)} lit. {hits.join(' and ')} {hits.length === 1 ? 'has' : 'have'} a double ring, and one accepting token is enough: {verdictText(true)}.</>
            : <>End of input with {set(last)} lit. None of them has a double ring: {verdictText(false)}.</>
          : ok
            ? <>End of input in {last[0]}, which has a double ring: {verdictText(true)}.</>
            : <>End of input in {last[0]}, which has a single ring: {verdictText(false)}.</>,
      2,
    );
  }
  return rec.frames;
}

// ── The subset construction, one table cell at a time ────────────────

export interface SubsetFrame extends Frame {
  /** Table cells filled so far. */
  filled: number;
  /** The row being filled now (violet), or null. */
  current: number | null;
}

export interface SubsetPlan {
  nfa: Nfa;
  result: ReturnType<typeof subsetConstruct>;
  /** For each DFA state (in discovery order), the number of filled cells after which it exists. */
  bornAfter: Record<State, number>;
}

export function subsetPlan(nfa: Nfa): SubsetPlan {
  const result = subsetConstruct(nfa);
  const bornAfter: Record<State, number> = { [result.dfa.start]: 0 };
  result.rows.forEach((r, i) => {
    if (r.isNew) bornAfter[subsetName(r.to)] = i + 1;
  });
  return { nfa, result, bornAfter };
}

/** The closing count: 2ⁿ is named only when it's exactly what the construction produced. */
export function countCaption(plan: SubsetPlan, n: number | null): ReactNode {
  const k = plan.result.dfa.states.length;
  const m = plan.nfa.states.length;
  if (n !== null && k === 2 ** n)
    return <>Done: <b>{k} = {power(n)}</b> DFA states from an NFA of {m}. Every pattern of the last {n} symbols needs its own state, so each extra n doubles it.</>;
  return <>Done: <b>{k}</b> DFA states from an NFA of {m}. The worst case is {power(m)} (one per subset); only the reachable ones are built.</>;
}

export function subsetFrames(plan: SubsetPlan, n: number | null): SubsetFrame[] {
  const { nfa, result } = plan;
  const rec = createRecorder<SubsetFrame>({ filled: 0, current: null });
  const start = result.members[result.dfa.start];
  rec.snap(
    <>The DFA's start state is the set of NFA states the NFA can be in before reading anything: the ε-closure of {nfa.start}, <b>{subsetName(start)}</b>.</>,
  );
  const seen = new Set([result.dfa.start]);
  result.rows.forEach((r, i) => {
    const toName = subsetName(r.to);
    const fresh = !seen.has(toName);
    seen.add(toName);
    rec.snap(
      <>
        From <b>{subsetName(r.from)}</b> on {r.symbol}: the NFA could be in <b>{toName}</b>.{' '}
        {fresh ? <>That set is new, so it becomes DFA state #{seen.size}.</> : <>That set is already a DFA state.</>}
      </>,
      undefined,
      { filled: i + 1, current: i },
    );
  });
  rec.set({ current: null });
  rec.close(countCaption(plan, n), 2);
  return rec.frames;
}
