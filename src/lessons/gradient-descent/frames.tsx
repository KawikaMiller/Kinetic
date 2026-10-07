import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { BATCH_SIZE, DIVERGE_LOSS, DIVERGE_RADIUS, MAX_STEPS, REGRESSION_DATA, SURFACES, zigzagShare, type Run, type W } from './model';

/** A number as the readouts show it: rounded, trailing zeros dropped, a real minus sign. */
export function num(v: number, dp = 3): string {
  const r = Number(v.toFixed(dp));
  const s = String(Math.abs(r));
  return r < 0 ? `−${s}` : s;
}

/** Losses span many decades: 4 significant figures, or an exponent for tiny or huge ones. */
export function lossText(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2).replace('-', '−');
  return num(v, 4);
}

export const vec = ([a, b]: W, dp = 3) => `(${num(a, dp)}, ${num(b, dp)})`;

export interface DescentFrame extends Frame {
  /** Steps taken so far: the ball is at run.points[iter]. */
  iter: number;
}

/** Above this share of direction reversals a run reads as zig-zagging. */
export const ZIGZAG = 0.5;

/** One frame per press of "step": `perPress` gradient steps each, then the verdict. */
export function descentFrames(run: Run, perPress: number): DescentFrame[] {
  const n = run.steps.length;
  const frames: DescentFrame[] = [];
  for (let iter = 0; iter < n; iter += perPress) frames.push({ iter, say: stepCaption(run, iter) });
  frames.push({ iter: n, say: verdict(run), hold: 2 });
  return frames;
}

function stepCaption(run: Run, iter: number): ReactNode {
  const st = run.steps[iter];
  const push: W = [-run.options.rate * st.grad[0], -run.options.rate * st.grad[1]];
  const grad = run.options.batchSeed !== null && run.surface === 'regression' ? <>this mini-batch's ∇L</> : <>∇L</>;
  const momentum = run.options.momentum > 0 && iter > 0 ? <> The ball also keeps β = {num(run.options.momentum, 2)} of its last move.</> : null;
  const lead = iter === 0 ? <>Start at {vec(st.w)}, loss {lossText(st.loss)}.</> : <>Step {iter}: at {vec(st.w)}, loss {lossText(st.loss)}.</>;
  return <>{lead} Here {grad} = {vec(st.grad)}, so the violet push is −η∇L = {vec(push)}.{momentum}</>;
}

/** The run's ending, from what actually happened: never from which preset was loaded. */
export function verdict(run: Run): ReactNode {
  const s = SURFACES[run.surface];
  const n = run.steps.length;
  const o = run.outcome;
  const zz = zigzagShare(run);
  const zigzag = zz > ZIGZAG ? <> It zig-zagged across the valley on {Math.round(zz * 100)}% of its steps.</> : null;
  switch (o.kind) {
    case 'minimum': {
      const lower = o.loss - s.floor > 1e-6;
      const where = s.convex
        ? <>On a convex surface like this one, that is <i>the</i> minimum.</>
        : lower
          ? <>It's only a <i>local</i> minimum: a lower one exists (loss {lossText(s.floor)}), but the gradient here can't see it.</>
          : <>This happens to be the lowest point, but on a non-convex surface gradient descent can't know that.</>;
      return <>Converged in {n} steps to <span className="hl ok">{vec(o.at)}</span>, loss {lossText(o.loss)}. {where}{zigzag}</>;
    }
    case 'saddle':
      return <>Stopped after {n} steps at {vec(o.at)}: the gradient is 0, but it's a <span className="hl">saddle</span>, not a minimum: the surface still curves down in one direction. A run only ends here if no push ever points off the ridge, which is what starting exactly on it does.</>;
    case 'diverged': {
      const last = run.losses[run.losses.length - 1];
      const why = Number.isFinite(last) && last <= DIVERGE_LOSS
        ? <>the ball got more than {DIVERGE_RADIUS.toLocaleString('en-US')} units from the origin</>
        : <>the loss passed {DIVERGE_LOSS.toLocaleString('en-US')}</>;
      return <>
        <span className="hl bad">Diverged</span> after {n} steps: {why}, so the run stopped. Each step overshot the valley instead of settling: a
        bigger learning rate is not a faster one.
      </>;
    }
    default: {
      const gap = o.loss - s.floor;
      if (run.options.batchSeed !== null && run.surface === 'regression') {
        return <>After {MAX_STEPS} steps it still jitters around the least-squares answer, {lossText(gap)} above the lowest loss. Each step only sees {BATCH_SIZE} of the {REGRESSION_DATA.length} points, so the noise never settles at a fixed η: cheap steps, noisy path.</>;
      }
      if (zz > 0.9) {
        return <>After {MAX_STEPS} steps it is still bouncing back and forth, {lossText(gap)} above the lowest loss: η is too big for the curvature it found, but not big enough to fly off.</>;
      }
      return <>Out of steps: after {MAX_STEPS} it is still crawling, {lossText(gap)} above the lowest loss. Each step is tiny, so it would get there, eventually.</>;
    }
  }
}
