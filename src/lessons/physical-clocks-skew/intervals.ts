/**
 * physical-clocks-skew, scene 3: timestamps as intervals. Each event's time is read as [t - epsilon, t + epsilon]; two events
 * are ordered only when their intervals are disjoint, which for two events `gap` apart means gap > 2 epsilon. The idea is
 * that of Google's TrueTime (a time API that returns an interval); the description is from memory, verify against the Spanner paper.
 */
import { exponential, exponentialCdf, exponentialPdf } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

export const EPSILON_MS = { min: 0, max: 20 } as const;
/** Mean gap between a pair of events the learner might want to order, ms (illustrative). */
export const MEAN_GAP_MS = 15;
export const PAIR_SAMPLES = 4000;
export const PAIRS_SEED = 17;

/** Two events `gapMs` apart have a decidable order when their intervals do not overlap. */
export const isDecidable = (gapMs: number, epsilonMs: number): boolean => gapMs > 2 * epsilonMs;

/** The gaps of a seeded set of event pairs, exponentially distributed with mean MEAN_GAP_MS. */
export function sampleGaps(seed = PAIRS_SEED, n = PAIR_SAMPLES): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => exponential(rnd, 1 / MEAN_GAP_MS));
}

/** The share of the sampled pairs whose order is decidable. */
export const decidableShare = (gaps: readonly number[], epsilonMs: number): number => gaps.filter((g) => isDecidable(g, epsilonMs)).length / gaps.length;

/** The same share in closed form: P(gap > 2 epsilon) for an exponential gap. */
export const decidableShareExact = (epsilonMs: number): number => 1 - exponentialCdf(2 * epsilonMs, 1 / MEAN_GAP_MS);

/** The gap density, for the plot. */
export const gapDensity = (g: number): number => exponentialPdf(g, 1 / MEAN_GAP_MS);

/** The commit wait a writer pays for epsilon: it acknowledges 2 epsilon after stamping. */
export const commitWaitMs = (epsilonMs: number): number => 2 * epsilonMs;
