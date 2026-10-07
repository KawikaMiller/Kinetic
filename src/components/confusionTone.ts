import type { Confusion } from '../core/stats';
import type { Tone } from '../core/tone';

export type ConfusionCell = keyof Confusion;

/**
 * The fixed colour of each outcome: right answers are --ok, a false alarm --bad, and a miss
 * --orange (the second kind of failure, so the two mistakes never look the same). Lessons
 * reuse it for legends and for dots coloured by outcome.
 */
export const CONFUSION_TONE: Record<ConfusionCell, Tone> = { tp: 'ok', tn: 'ok', fp: 'bad', fn: 'orange' };
