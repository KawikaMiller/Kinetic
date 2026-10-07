import type { ReactNode } from 'react';
import { pct } from '../../core/format';
import type { Frame } from '../../core/types';
import { RESTARTS, type InitMethod, type Step } from './model';
import { CLUSTER_NAMES, CLUSTER_TONES, num } from './view';

export interface KFrame extends Frame {
  step: number;
}

export interface RunContext {
  k: number;
  method: InitMethod;
  /** Best final inertia over the restarts, for the verdict on the last frame. */
  bestInertia: number;
  /** Share of points matching their generating group (null when not comparable). */
  agreement: number | null;
}

/** Inertias within 1% of each other count as the same optimum in the verdict. */
export const SAME_WITHIN = 0.01;

const START_TEXT: Record<InitMethod, string> = {
  random: 'picked as random data points (a random start)',
  plusplus: 'picked by k-means++: the first at random, each next one more likely the farther it is from those already chosen (D² sampling)',
  fixed: 'hand-placed by this preset, on purpose',
};

const centroidName = (j: number) => <b className={`km-name tone-${CLUSTER_TONES[j]}`}>{CLUSTER_NAMES[j]}</b>;

export function stepCaption(steps: readonly Step[], i: number, ctx: RunContext): ReactNode {
  const s = steps[i];
  if (s.phase === 'init') {
    return <>{ctx.k} {ctx.k === 1 ? 'centroid' : 'centroids'} {START_TEXT[ctx.method]}. The points are grey: no cluster yet. Step forward to assign them.</>;
  }
  if (s.phase === 'assign') {
    const moved = s.iteration === 1 ? <>Every point joins its nearest centroid.</> : <>Every point joins its nearest centroid; {s.changed} changed cluster.</>;
    return <>Assign (iteration {s.iteration}): {moved} Inertia, the sum of squared distances to each point's centroid, is {num(s.inertia!)}.</>;
  }
  if (s.phase === 'update') {
    const before = steps[i - 1].inertia!;
    const reseed = s.reseeded.map((r) => (
      <span key={r.cluster}> The {centroidName(r.cluster)} centroid won no points, so it is reseeded onto the point farthest from its own centroid (an empty cluster has no mean to move to).</span>
    ));
    return <>Update (iteration {s.iteration}): each centroid slides to the mean of its points. Inertia {num(before)} → {num(s.inertia!)}{s.inertia! < before ? '' : ', unchanged'}.{reseed}</>;
  }
  const stuck = s.inertia! > ctx.bestInertia * (1 + SAME_WITHIN);
  const better = s.inertia! < ctx.bestInertia * (1 - SAME_WITHIN);
  const verdict = stuck
    ? <> The best of {RESTARTS} k-means++ restarts reaches <span className="hl ok">{num(ctx.bestInertia)}</span>: this start got stuck in a worse local optimum.</>
    : better
      ? <> That beats all {RESTARTS} k-means++ restarts ({num(ctx.bestInertia)} at best).</>
      : <> That's within 1% of the best of {RESTARTS} k-means++ restarts ({num(ctx.bestInertia)}), though no number of restarts proves it's the best possible.</>;
  const truth = ctx.agreement === null
    ? null
    : <> Against the groups this synthetic data was generated from (k-means never sees them), {pct(ctx.agreement)} of points land with their own group.</>;
  return <>Converged after {s.iteration} {s.iteration === 1 ? 'iteration' : 'iterations'}: an assign step changed nothing. Inertia {num(s.inertia!)}.{verdict}{truth}</>;
}

export const buildFrames = (steps: readonly Step[], ctx: RunContext): KFrame[] =>
  steps.map((_, i) => ({ step: i, say: stepCaption(steps, i, ctx) }));
