import { mulberry32 } from '../../core/random';
import { kmpSearch, naiveSearch } from './kmp';

export const SWEEP_MIN_N = 2;
export const SWEEP_MAX_N = 40;
/** The worst-case pair: text a^n against this pattern, so every window matches four characters before failing. */
export const WORST_PATTERN = 'aaaab';
/** The random pair: a seeded two-letter text of each length against this pattern. */
export const RANDOM_PATTERN = 'aaab';
export const RANDOM_SEED = 7;

export interface SweepPoint {
  n: number;
  naiveWorst: number;
  kmpWorst: number;
  naiveRandom: number;
  kmpRandom: number;
}

/** Real runs of both algorithms at every text length: nothing here is a formula. */
export function sweep(): SweepPoint[] {
  const rnd = mulberry32(RANDOM_SEED);
  const letters = Array.from({ length: SWEEP_MAX_N }, () => (rnd() < 0.5 ? 'a' : 'b'));
  return Array.from({ length: SWEEP_MAX_N - SWEEP_MIN_N + 1 }, (_, i) => {
    const n = SWEEP_MIN_N + i;
    const worst = 'a'.repeat(n);
    const random = letters.slice(0, n).join('');
    return {
      n,
      naiveWorst: naiveSearch(worst, WORST_PATTERN).comparisons,
      kmpWorst: kmpSearch(worst, WORST_PATTERN).comparisons,
      naiveRandom: naiveSearch(random, RANDOM_PATTERN).comparisons,
      kmpRandom: kmpSearch(random, RANDOM_PATTERN).comparisons,
    };
  });
}
