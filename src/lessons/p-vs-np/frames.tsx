import type { ReactNode } from 'react';
import { humanDuration, superscript } from '../../core/format';
import { EXTRAPOLATE_N, extrapolatedSeconds, type SolverState, type Verification } from './subset';

/** Captions for the actions in the subset-sum scene, worked out from real results. */

export function verifyCaption(v: Verification, target: number, picked: number): ReactNode {
  if (picked === 0 && target !== 0) return <>Nothing selected: the empty subset sums to 0, not {target}. Click numbers to build a subset, then verify it.</>;
  return v.ok ? (
    <>
      Verified in {v.steps} steps: the chosen numbers add up to {v.sum}, <span className="hl ok">the target</span>. Checking a proposed answer takes one pass, polynomial time: that's what puts subset sum in NP.
    </>
  ) : (
    <>
      Checked in {v.steps} steps: they add up to {v.sum}, <span className="hl bad">not {target}</span>. The check was still quick; finding a subset that works is the hard part.
    </>
  );
}

export function solveCaption(s: SolverState, n: number, perMs: number | null): ReactNode {
  const tried = s.tried.toLocaleString('en');
  const total = s.total.toLocaleString('en');
  const found = s.hits === 0 ? <span className="hl bad">no subset hits the target</span> : <><span className="hl ok">{s.hits.toLocaleString('en')} subset{s.hits === 1 ? '' : 's'}</span> hit the target</>;
  const extrapolation =
    perMs !== null && perMs > 0 ? (
      <> At this browser's measured {Math.round(perMs).toLocaleString('en')} subsets per ms, n = {EXTRAPOLATE_N} would take about {humanDuration(extrapolatedSeconds(perMs))}.</>
    ) : null;
  if (!s.done) return <>Brute force: {tried} of {total} subsets tried so far (2{superscript(n)}).{extrapolation}</>;
  return (
    <>
      Brute force tried all {total} = 2{superscript(n)} subsets: {found}.{extrapolation}
    </>
  );
}

/** The DP solver's result, compared honestly with brute force at this n. */
export function dpCaption(cells: number, n: number, possible: boolean): ReactNode {
  const subsets = 2 ** n;
  const answer = possible ? <span className="hl ok">a subset exists</span> : <span className="hl bad">no subset works</span>;
  const vs =
    cells < subsets ? (
      <>far fewer than the {subsets.toLocaleString('en')} subsets brute force would try. Fast because the target is small, not because the problem got easy.</>
    ) : (
      <>more work than the {subsets.toLocaleString('en')} subsets brute force needs here: with so few numbers, brute force is the cheaper one.</>
    );
  return (
    <>
      The DP table filled {cells.toLocaleString('en')} cells ((n + 1) × (target + 1)): {answer}. That is {vs}
    </>
  );
}
