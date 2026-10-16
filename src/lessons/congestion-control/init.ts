/** The state each scene opens in (pure, so a test can switch through all of them and check none leaks into another). */
import { PLANE, type Rates, type Rule } from './fairness';
import { DEFAULT_LINK, RANGES, type LinkSetup } from './model';

/** Rounds shown by the Reno story and by the three-algorithm comparison. */
export const RENO_ROUNDS = 60;
export const COMPARE_ROUNDS = 120;
/** Rounds each point of the loss curve is averaged over. */
export const LOSS_ROUNDS = 50_000;

export const initialReno = (): LinkSetup => ({ ...DEFAULT_LINK });
export const initialCompare = (): LinkSetup => ({ ...DEFAULT_LINK, timeouts: false });

export interface FairnessState {
  start: Rates;
  rule: Rule;
}
export const DEFAULT_START: Rates = [20, 60];
export const initialFairness = (): FairnessState => ({ start: DEFAULT_START, rule: 'aimd' });

/** The 1.0% of random loss the loss scene opens on: a rate where Reno's collapse is plain. */
export const DEFAULT_LOSS = 0.01;
export const initialLoss = (): LinkSetup => ({ ...DEFAULT_LINK, loss: DEFAULT_LOSS, timeouts: false });

/** A dragged or nudged start point: whole numbers, kept on the plane's positive quadrant. */
export const snapStart = ([x, y]: readonly [number, number]): Rates => [Math.min(PLANE, Math.max(1, Math.round(x))), Math.min(PLANE, Math.max(1, Math.round(y)))];

/** Log-spaced loss rates for the curve of scene 4, from 0.01% to the top of the slider. */
export const LOSS_CURVE_POINTS: readonly number[] = Array.from({ length: 22 }, (_, i) => 1e-4 * (RANGES.loss.max / 1e-4) ** (i / 21));
