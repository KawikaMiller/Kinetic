/**
 * inverted-index, scene 2: the frames of one two-list merge, one per comparison, with the pointers, what each cell has become and
 * a caption built from the comparison itself.
 */
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import type { MergeKind, MergeStep } from './query';

export interface MergeFrame extends Frame {
  /** The heads being compared (null on the first and last frame). */
  i: number | null;
  j: number | null;
  out: number[];
  /** Positions in each list that went into the result, and that were dropped, before this frame. */
  keptLeft: number[];
  keptRight: number[];
  skippedLeft: number[];
  skippedRight: number[];
}

const verb: Record<MergeKind, string> = { intersect: 'Intersect', union: 'Union', difference: 'Subtract' };

const decision = (kind: MergeKind, step: MergeStep, left: number, right: number): ReactNode => {
  if (step.kind === 'match') return kind === 'difference' ? <>{left} is in both: it is removed.</> : <>{left} is in both lists: {kind === 'intersect' ? 'a match' : 'kept once'}.</>;
  if (step.kind === 'left-behind') return kind === 'intersect' ? <>{left} is smaller, so it cannot be in the right list: skip it.</> : <>{left} is smaller: {kind === 'union' ? 'it goes out and the left cursor moves on' : 'it survives and the left cursor moves on'}.</>;
  if (step.kind === 'right-behind') return kind === 'union' ? <>{right} is smaller: it goes out and the right cursor moves on.</> : <>{right} is smaller, so it cannot be in the left list: skip it.</>;
  return <>One list is used up: the rest of the other goes straight out.</>;
};

/** Frames for a merge: an opening frame, one per step, and a closing one. */
export function mergeFrames(left: readonly number[], right: readonly number[], kind: MergeKind, steps: readonly MergeStep[]): MergeFrame[] {
  const blank = { keptLeft: [], keptRight: [], skippedLeft: [], skippedRight: [] };
  const frames: MergeFrame[] = [
    { ...blank, i: null, j: null, out: [], say: <>{verb[kind]}: two sorted lists of document ids, left {left.length} long and right {right.length}. One cursor on each, and each comparison moves one of them (or both) forward.</> },
  ];
  const keptLeft: number[] = [];
  const keptRight: number[] = [];
  const skippedLeft: number[] = [];
  const skippedRight: number[] = [];
  steps.forEach((s, n) => {
    const before = { keptLeft: [...keptLeft], keptRight: [...keptRight], skippedLeft: [...skippedLeft], skippedRight: [...skippedRight] };
    const compared = s.kind !== 'tail';
    frames.push({
      ...before,
      i: s.i < left.length ? s.i : null,
      j: s.j < right.length ? s.j : null,
      out: n === 0 ? [] : steps[n - 1].out,
      say: <>{compared ? <>Comparison {steps.slice(0, n + 1).filter((x) => x.kind !== 'tail').length}: {left[s.i]} against {right[s.j]}. </> : null}{decision(kind, s, left[s.i], right[s.j])}</>,
    });
    const consumesLeft = s.kind === 'match' || s.kind === 'left-behind' || (s.kind === 'tail' && s.i < left.length);
    const consumesRight = s.kind === 'match' || s.kind === 'right-behind' || (s.kind === 'tail' && s.i >= left.length);
    const keeps = s.kind === 'match' ? kind !== 'difference' : s.kind === 'tail' ? true : s.kind === 'left-behind' ? kind !== 'intersect' : kind === 'union';
    if (consumesLeft) (keeps ? keptLeft : skippedLeft).push(s.i);
    if (consumesRight) (keeps ? keptRight : skippedRight).push(s.j);
  });
  const result = steps.at(-1)?.out ?? [];
  const comparisons = steps.filter((s) => s.kind !== 'tail').length;
  frames.push({ keptLeft, keptRight, skippedLeft, skippedRight, i: null, j: null, out: result, say: <>Done after {comparisons} {comparisons === 1 ? 'comparison' : 'comparisons'}: {result.length === 0 ? 'nothing is left' : `${result.length} ${result.length === 1 ? 'document' : 'documents'}`}.</>, hold: 2 });
  return frames;
}
