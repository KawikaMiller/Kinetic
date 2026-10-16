/** How one cell of the ratings matrix looks. */
import type { GridCellSpec } from '../../components/CellGrid';
import { USERS } from './data';
import type { MfRun } from './mf';
import { cellKey, type Problem } from './problem';

/** A prediction within this many points of the truth reads as right, and this far or more as wrong. */
export const RIGHT = 0.5;
export const WRONG = 1.5;

const tint = (rating: number) => 0.08 + 0.17 * (rating - 1);

export type Mode = { kind: 'ratings' } | { kind: 'predictions'; run: MfRun };

/** Observed: blue by value. Hidden by the learner: dim outline. Otherwise blank, or a prediction (violet) once a model has run. */
export function cellSpec(p: Problem, mode: Mode, showTruth: boolean, u: number, i: number): GridCellSpec {
  const seen = p.seen(u, i);
  if (seen !== null) return { text: seen, tone: 'info', fill: 'tint', intensity: tint(seen) };
  const hidden = u < USERS && p.edits.hidden.includes(cellKey(u, i));
  const truth = u < USERS ? p.data.truth[u][i] : null;
  if (mode.kind === 'predictions') {
    const pred = mode.run.predict(u, i);
    const text = pred.toFixed(1);
    if (showTruth && truth !== null) {
      const err = Math.abs(pred - truth);
      return { text, tone: err <= RIGHT ? 'ok' : err >= WRONG ? 'bad' : 'orange', fill: 'tint', intensity: 0.35 };
    }
    return { text, tone: 'violet', fill: 'tint', intensity: 0.22 };
  }
  if (hidden) return { text: showTruth ? truth! : undefined, tone: 'dim', fill: 'outline' };
  if (showTruth && truth !== null) return { text: truth, tone: 'muted', fill: 'none' };
  return { fill: 'none' };
}
