import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  GD_TOL, accuracyAt, biggestResidual, linearFit, separates, stillGrowing, weightNorm,
  type Dims, type Labeled, type LineDescent, type LogisticRun, type Pt,
} from './model';

/** A number as the readouts show it: rounded, trailing zeros dropped, a real minus sign. */
export function num(v: number, dp = 3): string {
  const r = Number(v.toFixed(dp));
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** "y = 2.1 + 0.6x", with the sign folded in. */
export const lineText = (b: number, m: number) => `y = ${num(b, 2)} ${m < 0 ? '−' : '+'} ${num(Math.abs(m), 3)}x`;

export function linearCaption(points: readonly Pt[], compare: boolean): ReactNode {
  const fit = linearFit(points);
  if (!fit.ok) return <>No line: {fit.reason}</>;
  const main = <>Least squares: <span className="hl">{lineText(fit.b, fit.m)}</span>. MSE {num(fit.mse)} is the average area of the orange squares, and no other straight line has a smaller one.</>;
  if (!compare) return main;
  const k = biggestResidual(points)!;
  const without = linearFit(points.filter((_, i) => i !== k));
  if (!without.ok) return <>{main} Without its biggest residual there'd be too few distinct x values to fit a line.</>;
  return <>{main} Leave out the point with the biggest residual and the line would be {lineText(without.b, without.m)}: that one point moved the slope from {num(without.m)} to {num(fit.m)}.</>;
}

export function gdCaption(run: LineDescent, index: number, points: readonly Pt[]): ReactNode {
  const s = run.snapshots[index];
  const fit = linearFit(points);
  if (!fit.ok) return null;
  const closed = <>closed form {lineText(fit.b, fit.m)}</>;
  if (index < run.snapshots.length - 1) {
    return <>Gradient descent, step {s.step.toLocaleString('en-US')}: {lineText(s.b, s.m)}, MSE {num(s.mse)}. It started from the flat line y = 0 and steps with η = {num(run.rate, 4)} (1/L for this data). Target: {closed}.</>;
  }
  const gap = Math.max(Math.abs(s.b - fit.b), Math.abs(s.m - fit.m));
  const stop = run.converged
    ? <>stopped after {run.steps.toLocaleString('en-US')} steps (gradient below {GD_TOL.toExponential(0)})</>
    : <>ran out of steps at {run.steps.toLocaleString('en-US')}</>;
  return <>Gradient descent {stop} at {lineText(s.b, s.m)}; the {closed}. {gap < 1e-6 ? 'They agree to 6 decimal places' : `They differ by at most ${num(gap, 6)}`}: same line, found by walking downhill.</>;
}

export interface TrainFrame extends Frame {
  /** Index into the run's snapshots. */
  snap: number;
}

const paramText = (params: readonly number[]) =>
  params.length === 2
    ? `b = ${num(params[0], 2)}, w = ${num(params[1], 2)}`
    : `b = ${num(params[0], 2)}, w = (${num(params[1], 2)}, ${num(params[2], 2)})`;

export function trainFrames(run: LogisticRun, pts: readonly Labeled[], dims: Dims, l2: boolean): TrainFrame[] {
  const frames: TrainFrame[] = run.snapshots.slice(0, -1).map((s, i) => ({
    snap: i,
    say: i === 0
      ? <>Every weight starts at 0, so every point gets p = 0.5: log loss {num(s.loss)}. Each gradient step on log loss sharpens the {dims === 1 ? 'curve' : 'boundary'}.</>
      : <>Step {s.step.toLocaleString('en-US')}: log loss {num(s.loss, 4)}, {paramText(s.params)}, ‖w‖ = {num(weightNorm(s.params), 2)}.</>,
    quiet: i > 0,
  }));
  frames.push({ snap: run.snapshots.length - 1, say: trainVerdict(run, pts, dims, l2), hold: 2 });
  return frames;
}

export function trainVerdict(run: LogisticRun, pts: readonly Labeled[], dims: Dims, l2: boolean): ReactNode {
  const end = run.snapshots.at(-1)!;
  const mid = [...run.snapshots].reverse().find((s) => s.step <= end.step / 2)!;
  const norm = num(weightNorm(end.params), 2);
  const head = <>After {end.step.toLocaleString('en-US')} steps: log loss {num(end.loss, 4)}, ‖w‖ = {norm}.</>;
  if (stillGrowing(run)) {
    const why = separates(end.params, pts, dims)
      ? <>The classes are perfectly separable, so a steeper sigmoid always fits a little better and there is no finite best.</>
      : <>The fit hasn't settled yet.</>;
    return <>{head} The weights are <span className="hl bad">still growing</span> (‖w‖ was {num(weightNorm(mid.params), 2)} at step {mid.step.toLocaleString('en-US')}). {why} That's why regularisation exists: switch L2 on.</>;
  }
  if (l2) return <>{head} With L2 the weights <span className="hl ok">settled</span>: the penalty λ/2·‖w‖² outweighs any gain from an ever-steeper sigmoid.</>;
  return <>{head} The weights <span className="hl ok">settled</span>. The model gives every point a probability; the threshold below turns that into a class.</>;
}

export function thresholdCaption(params: readonly number[], pts: readonly Labeled[], dims: Dims, t: number): ReactNode {
  const right = accuracyAt(params, pts, dims, t);
  return <>Threshold {num(t, 2)}: a point is called class 1 when p ≥ {num(t, 2)}. {right} of {pts.length} points get their true class. The probabilities didn't change; only the cut did.</>;
}
