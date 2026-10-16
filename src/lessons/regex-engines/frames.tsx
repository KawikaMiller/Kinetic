import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { EPSILON, type State } from '../../core/automata';
import { STEP_BUDGET, type NfaRun, type RunMode } from './engines';
import type { BacktrackResult, TraceEvent } from './backtrack';
import { countParts, nodeText, nodesInOrder, type ParsedRegex, type RegexNode } from './regexParse';
import { edgeKey, symbolOf, type Construction } from './thompson';

const quote = (s: string) => <code>{s}</code>;

// ── Construction ─────────────────────────────────────────────────────

export interface BuildFrame extends Frame {
  /** Node id built last (-1: nothing yet). */
  built: number;
  states: number;
  arrows: number;
  epsilons: number;
}

function builtCaption(n: RegexNode, newStates: number, newArrows: number): ReactNode {
  switch (n.kind) {
    case 'lit':
      return <>Literal {quote(n.ch)}: {plural(newStates, 'state')} and one arrow that consumes {quote(n.ch)}.</>;
    case 'any':
      return <>The dot: {plural(newStates, 'state')} and one arrow that consumes any character.</>;
    case 'set':
      return <>Set {quote(nodeText(n))}: {plural(newStates, 'state')} and one arrow that consumes any one of {n.chars.length === 1 ? 'its character' : 'its characters'}.</>;
    case 'cat':
      return <>Concatenation {quote(nodeText(n))}: {plural(newArrows, 'ε arrow')} join each piece's end to the next piece's start, and no new state.</>;
    case 'alt':
      return <>Alternation {quote(nodeText(n))}: a new split and a new join ({plural(newStates, 'state')}), with an ε arrow into and out of each of the {n.options.length} options ({newArrows} arrows).</>;
    case 'rep':
      return n.op === '*' ? (
        <>Star {quote(nodeText(n))}: a new start and end, an ε arrow that loops back to run the body again, and one that skips it, so zero repeats are allowed.</>
      ) : n.op === '+' ? (
        <>Plus {quote(nodeText(n))}: a new start and end and the loop-back arrow, with no skip arrow, so the body runs at least once.</>
      ) : (
        <>Optional {quote(nodeText(n))}: a new start and end and the skip arrow, with no loop-back, so the body runs once or not at all.</>
      );
    case 'group':
      return <>Parentheses {quote(nodeText(n))} only group: nothing new is drawn.</>;
    case 'backref':
      return <>A back-reference has no fragment.</>;
  }
}

export function buildFrames(parsed: ParsedRegex, c: Construction): BuildFrame[] {
  const nodes = nodesInOrder(parsed.root);
  const counts = (upTo: number) => ({
    states: c.states.filter((s) => s.addedBy <= upTo).length,
    arrows: c.edges.filter((e) => e.addedBy <= upTo).length,
    epsilons: c.edges.filter((e) => e.addedBy <= upTo && e.symbols[0] === EPSILON).length,
  });
  const parts = countParts(parsed.root);
  const bound = 2 * (parts.atoms + parts.operators);
  const frames: BuildFrame[] = [
    { built: -1, ...counts(-1), say: <>The pattern {quote(parsed.source)} is a tree. Thompson's construction turns each node into a small machine fragment, from the leaves up. Press play.</> },
  ];
  for (const n of nodes) {
    const newStates = c.states.filter((s) => s.addedBy === n.id).length;
    const newArrows = c.edges.filter((e) => e.addedBy === n.id).length;
    frames.push({ built: n.id, ...counts(n.id), say: builtCaption(n, newStates, newArrows) });
  }
  const last = frames[frames.length - 1];
  frames.push({
    ...last,
    say: (
      <>
        Done: {plural(last.states, 'state')} and {plural(last.epsilons, 'ε arrow')}. An atom costs 2 states, an alternation or a repeat 2 more, a join none, so {last.states} stays within the Thompson bound 2 × ({parts.atoms} atoms + {plural(parts.operators, 'operator')}) = {bound}.
      </>
    ),
  });
  return frames;
}

// ── Simulation ───────────────────────────────────────────────────────

export interface RunFrame extends Frame {
  /** Characters read so far. */
  read: number;
  set: State[];
  /** Arrows (`from→to` keys) the last character consumed. */
  taken: Set<string>;
  accepting: boolean;
  /** State-reads so far. */
  work: number;
  /** null while reading; the final verdict on the last frame. */
  verdict: boolean | null;
}

export const takenEdges = (c: Construction, prev: readonly State[], ch: string): Set<string> => {
  const symbol = symbolOf(c.nfa.alphabet, ch);
  const from = new Set(prev);
  return new Set(c.edges.filter((e) => from.has(e.from) && e.symbols.includes(symbol)).map(edgeKey));
};

export function runFrames(c: Construction, subject: readonly string[], run: NfaRun, mode: RunMode): RunFrame[] {
  const frames: RunFrame[] = [];
  let work = 0;
  run.sets.forEach((set, i) => {
    if (i > 0) work += run.sets[i - 1].length;
    const accepting = run.accepting[i];
    const last = i === subject.length;
    const lit = plural(set.length, 'state');
    const base = { read: i, set, accepting, work, taken: i > 0 ? takenEdges(c, run.sets[i - 1], subject[i - 1]) : new Set<string>() };
    const verdict = last ? run.accepted : null;
    const say = (
      <>
        {i === 0 ? <>Start: the start state and everything it reaches through ε arrows, {lit} lit.</> : <>Read {quote(subject[i - 1])}: the arrows that consume it, then the ε arrows after them, leave {lit} lit ({plural(work, 'state-read')} so far).</>}
        {accepting ? <> The accepting state is lit: {mode === 'full' ? <>the first {plural(i, 'character')} match the pattern.</> : <>a match ends after {plural(i, 'character')}.</>}</> : null}
        {set.length === 0 ? <> Nothing is lit, so this run is dead{mode === 'full' ? ' and the whole subject cannot match' : ''}.</> : null}
        {last ? <> {run.accepted ? (mode === 'full' ? 'The whole subject matches.' : 'The subject contains a match.') : mode === 'full' ? 'The whole subject does not match.' : 'No match anywhere in the subject.'}</> : null}
      </>
    );
    frames.push({ ...base, verdict, say });
  });
  return frames;
}

// ── Backtracking ─────────────────────────────────────────────────────

/** The trace the player steps through: the matcher's first attempts, no more than this many. */
export const TRACE_LIMIT = 200;

export interface TraceFrame extends Frame {
  /** Index into the trace of the attempt on show (-1: before the first). */
  at: number;
}

const outcomeText = (ok: boolean | null) => (ok === null ? 'it was still running when the budget ran out (a deeper attempt was the one stopped)' : ok ? 'it fit, and the rest of the pattern went on to match' : 'it failed, so the matcher backs up');

export function traceFrames(parsed: ParsedRegex, result: BacktrackResult, subject: readonly string[]): TraceFrame[] {
  const byId = new Map(nodesInOrder(parsed.root).map((n) => [n.id, n]));
  const frames: TraceFrame[] = [
    { at: -1, say: <>The matcher tries {quote(parsed.source)} on {quote(subject.join('') || '(empty)')}. Each step is one attempt of one node at one position. Press play.</> },
  ];
  result.trace.forEach((e: TraceEvent, i) => {
    const node = byId.get(e.node)!;
    frames.push({
      at: i,
      say: (
        <>
          Step {e.step}: {quote(nodeText(node))} at position {e.pos}: {outcomeText(e.ok)}. The outcome shown is the one this attempt ended with.
        </>
      ),
    });
  });
  const shown = result.trace.length;
  frames.push({ at: shown - 1, say: <>{finalText(result)}{result.traceTruncated ? <> The player shows the first {shown} of {result.steps.toLocaleString('en-US')} steps.</> : null}</> });
  return frames;
}

/** The sentence for a finished backtracking run. */
export function finalText(r: BacktrackResult): ReactNode {
  if (r.status === 'budget') return <>Did not finish within {STEP_BUDGET.toLocaleString('en-US')} steps. That says nothing about the answer, only that this matcher gave up.</>;
  if (r.status === 'fail') return <>No match, after {r.steps.toLocaleString('en-US')} {r.steps === 1 ? 'step' : 'steps'}.</>;
  return <>Matched after {r.steps.toLocaleString('en-US')} {r.steps === 1 ? 'step' : 'steps'}.</>;
}
