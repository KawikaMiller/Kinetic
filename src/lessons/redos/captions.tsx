import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { BUDGET, backtrackVisits, growthSeries, letters, nfaVisits, parseText } from './engines';
import type { FixesOutcome, FixesState } from './fixes';
import { classifyGrowth, growthText, type Growth } from './growth';
import { COUNTER_PATTERN, SHAPES_FROM, SHAPES_TO } from './opening';
import { PATTERNS, anchored, patternById, type PatternId } from './patterns';

export const num = (v: number) => v.toLocaleString('en-US');

/** What "visit" means, said once on screen. */
export const VISIT_DEFINITION = 'A visit is one (part of the pattern, position in the text) pair examined, repeats counted. Counted, never timed.';

/** The lazy DFA counts differently from the other two engines, so its definition is shown beside its numbers. */
export const LAZY_DFA_VISIT_DEFINITION =
  'For the lazy DFA a visit is one table lookup per character, plus the number of NFA states inside each DFA state the first time that state is built. That is a different quantity from the pattern-and-position visits above, so comparing it with backtracking is only illustrative.';

/** Visits of the counter pattern at n letters, and the growth from n - 1 when both finished. */
export function counterNumbers(n: number) {
  const bt = backtrackVisits(COUNTER_PATTERN, letters(n));
  const nfa = nfaVisits(COUNTER_PATTERN, letters(n));
  const prev = n > 1 ? backtrackVisits(COUNTER_PATTERN, letters(n - 1)) : null;
  const ratio = prev && !prev.gaveUp && !bt.gaveUp ? bt.visits / prev.visits : null;
  return { bt, nfa, ratio };
}

export function counterCaption(n: number): ReactNode {
  const { bt, nfa, ratio } = counterNumbers(n);
  const text = (
    <>
      <code>{anchored(COUNTER_PATTERN)}</code> on {plural(n, 'letter')} then <code>!</code>:{' '}
    </>
  );
  if (bt.gaveUp) {
    return (
      <>
        {text}the backtracking matcher gave up at the step budget of {num(BUDGET)} visits without an answer; the linear-time engine finished in {num(nfa.visits)} visits and said no match.
      </>
    );
  }
  return (
    <>
      {text}the backtracking matcher made {num(bt.visits)} visits before it said no match; the linear-time engine made {num(nfa.visits)}.
      {ratio === null ? null : <> One more letter multiplied the backtracking work by {ratio.toFixed(2)}.</>}
    </>
  );
}

export interface ShapeRow {
  id: PatternId;
  growth: Growth;
}

/** The growth class of each pattern, read from its measured visits for n = SHAPES_FROM..SHAPES_TO. */
export const shapeRows = (): ShapeRow[] =>
  PATTERNS.map((p) => ({ id: p.id, growth: classifyGrowth(growthSeries(p.source, SHAPES_FROM, SHAPES_TO)) }));

export function shapesCaption(selected: PatternId, text: string): ReactNode {
  const p = patternById(selected);
  const row = shapeRows().find((r) => r.id === selected)!;
  const typed = parseText(text);
  return (
    <>
      <code>{p.shown}</code> measured on n letters then <code>!</code>, n = {SHAPES_FROM} to {SHAPES_TO}: {growthText(row.growth)}. {p.mechanism}
      {typed.ok ? null : <> Your text is not used yet: {typed.error}</>}
    </>
  );
}

export function fixesCaption(s: FixesState, o: FixesOutcome): ReactNode {
  const how =
    s.engine === 'backtracking' ? 'the backtracking engine' : s.engine === 'nfa' ? 'the linear-time NFA engine' : 'the lazy DFA engine';
  if (o.verdict === 'refused') {
    return (
      <>
        The input is {plural(o.length, 'character')}, over the cap of {s.cap}: it is refused at the boundary before any matching, so {how} spends 0 visits on <code>{o.shown}</code>.
      </>
    );
  }
  if (o.verdict === 'cut-off') {
    return (
      <>
        <code>{o.shown}</code> on {plural(o.length, 'character')} with {how}: cut off at the budget of {num(s.budget)} visits, with no answer. The request would be abandoned rather than hang.
      </>
    );
  }
  return (
    <>
      <code>{o.shown}</code> on {plural(o.length, 'character')} with {how}: answered no match after {num(o.visits)} visits.
    </>
  );
}
