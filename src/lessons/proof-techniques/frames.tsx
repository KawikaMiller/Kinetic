import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { accepted, READING_OF, TECHNIQUE_NAMES, type Claim, type Technique } from './model';

export interface PtFrame extends Frame {
  /** How many proof lines are locked in at this frame. */
  locked: number;
  /** The closing frame of a finished proof. */
  complete: boolean;
}

/** What the finished proof was, as propositional logic. */
export function readingText(claim: Claim, technique: Technique): ReactNode {
  const p = <i>{claim.p}</i>;
  const q = claim.q ? <i>{claim.q}</i> : null;
  switch (READING_OF[technique]) {
    case 'implies':
      return <>Direct proof of p → q, with p = {p} and q = {q}: assume p, derive q. That rules out the one row where p → q is false.</>;
    case 'contrapositive':
      return <>We proved ¬q → ¬p (p = {p}, q = {q}). It has the same truth table as p → q, the equivalence the propositional-logic lesson shows, so the claim is proved.</>;
    case 'contradiction':
      return <>We proved ¬p → ⊥ (p = {p}, ⊥ = a contradiction): assuming ¬p leads to something false, and ¬p → ⊥ is true exactly when p is.</>;
    case 'refute':
      return <>We proved ∃n ¬P(n), which is ¬∀n P(n): one counterexample refutes a claim about every n (the negation rule from the predicate-logic lesson).</>;
  }
}

/**
 * The proof so far as a history the learner can scrub: frame i has i lines locked in.
 * A finished proof gets a closing frame with its propositional reading.
 */
export function proofFrames(claim: Claim, technique: Technique, locked: number): PtFrame[] {
  const route = claim.routes[technique];
  const rec = createRecorder<PtFrame>({ locked: 0, complete: false });
  if (route.kind === 'stall') {
    rec.snap(<>{TECHNIQUE_NAMES[technique]}: {route.why}</>);
    return rec.frames;
  }
  const n = route.lines.length;
  rec.snap(<>{TECHNIQUE_NAMES[technique]} proof of "{claim.statement}" Pick line 1 from the chips.</>);
  for (let i = 0; i < Math.min(locked, n); i++) {
    const step = accepted(route.lines[i]);
    rec.snap(
      <>
        Line {i + 1} locked in: <span className="hl ok">{step.reason}</span>.{i + 1 < n ? <> Next: line {i + 2}.</> : null}
      </>,
      1,
      { locked: i + 1 },
    );
  }
  if (locked >= n) {
    rec.set({ complete: true });
    rec.close(<>Proof complete. {readingText(claim, technique)}</>, 2);
  }
  return rec.frames;
}
