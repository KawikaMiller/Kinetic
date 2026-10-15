import { power } from '../../core/format';
import { DEFAULT_MAX_LENGTH, SEED_MAX, type GenConfig, type RangeId } from './generator';
import type { BugId, PropId } from './sorts';

/** Everything scenes 1 and 2 share: which function, which properties, and how inputs are made. */
export interface Config {
  fn: BugId;
  props: PropId[];
  range: RangeId;
  maxLength: number;
  seed: number;
}

/** Opens on the classic bug, a wide range and the two properties that together pin a sort down. */
export const DEFAULT_CONFIG: Config = {
  fn: 'no-comparator',
  props: ['nondecreasing', 'permutation'],
  range: 'million',
  maxLength: DEFAULT_MAX_LENGTH,
  seed: 7,
};

export const genOf = (c: Config): GenConfig => ({ range: c.range, maxLength: c.maxLength, seed: c.seed });

/** A fresh seed for the "new seed" button. */
export const randomSeed = (): number => Math.floor(Math.random() * (SEED_MAX + 1));

/** A probability in the words the lesson uses: a percentage when it is not tiny, else a power of ten. */
export function formatProbability(p: number): string {
  if (p === 0) return '0';
  if (p >= 1) return '100%';
  if (p >= 0.001) return `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;
  let exponent = Math.floor(Math.log10(p));
  let mantissa = Math.round((p / 10 ** exponent) * 10) / 10;
  if (mantissa >= 10) {
    mantissa = 1;
    exponent += 1;
  }
  return `${mantissa.toFixed(1)} × ${power(exponent, 10)}`;
}
