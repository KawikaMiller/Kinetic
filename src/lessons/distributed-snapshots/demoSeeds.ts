/**
 * The seed each scene opens on, COMPUTED from the model so the first view shows what the lesson claims: the lowest
 * seed from SEED_RANGE.from that satisfies a predicate. A fixed seed 1 read 300 of 300 on the naive cut (its errors
 * cancel) and lost nothing inside the cut with the bug on, so both first views were blank.
 */
import { DEFAULT_OPTIONS, SEED_RANGE, runSeed, type Method, type Result, type SimOptions } from './sim';

export function lowestSeed(options: SimOptions, pred: (r: Result) => boolean): number {
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) if (pred(runSeed(options, seed).result)) return seed;
  return SEED_RANGE.from;
}

/** Scene 1, naive: the total is wrong and the closure check fails, so the first view shows both failures. */
export const NAIVE_SEED = lowestSeed({ ...DEFAULT_OPTIONS, method: 'naive' }, (r) => !r.conservation && !r.closure.closed);

/** Scene 3, markers with the bug: C dropped tokens inside the cut, so the shortfall on screen is real. */
export const BUG_MARKERS_SEED = lowestSeed({ ...DEFAULT_OPTIONS, bug: true }, (r) => r.lostInCut > 0 && r.difference < 0);

/** Scene 3, naive with the bug: a wrong total with something dropped inside the cut. */
export const BUG_NAIVE_SEED = lowestSeed({ ...DEFAULT_OPTIONS, method: 'naive', bug: true }, (r) => !r.conservation && r.lostInCut > 0);

export const photoSeedFor = (method: Method): number => (method === 'naive' ? NAIVE_SEED : SEED_RANGE.from);
export const bugSeedFor = (method: Method): number => (method === 'naive' ? BUG_NAIVE_SEED : BUG_MARKERS_SEED);

/** After a method change the seed follows to the new method's demo seed only if it still sat on the old method's own. */
export const followSeed = (seed: number, from: Method, to: Method, seedFor: (m: Method) => number): number => (seed === seedFor(from) ? seedFor(to) : seed);
