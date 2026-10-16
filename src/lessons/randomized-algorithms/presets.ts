import { parseBoundedBigInt } from '../../core/parse';
import { parseBoundedList } from '../../core/parseKit';
import type { Result } from '../../core/result';
import { adversaryFor, MAX_N, shapeArray } from './sorting';
import { N_MAX, N_MIN } from './primality';
import { PRESETS, type Graph } from './karger';

export type InputKind = 'sorted' | 'reverse' | 'organ' | 'random' | 'vs-first' | 'vs-median3' | 'custom';

export const SIZES = [8, 25, 100, 500, 2000] as const;
export const CUSTOM_MAX_VALUE = 9999;
export const SORT_SEED = 42;
export const PI_SEED = 7;
export const MR_SEED = 5;
export const KARGER_SEED = 11;

/** The opening state of each scene: pure, so the try-this entries start from something a test can pin. */
export const OPENING = {
  sort: { kind: 'sorted' as InputKind, n: 100, seed: SORT_SEED },
  pi: { exponent: 10, seed: PI_SEED },
  primality: { n: 561n, rounds: 3, seed: MR_SEED },
  convert: { n: 561n, budget: 1.5, seed: MR_SEED },
  karger: { preset: 'clusters', seed: KARGER_SEED },
} as const;

/** The array a scene sorts for the chosen input kind. `custom` is the learner's parsed array. */
export function inputFor(kind: InputKind, n: number, seed: number, custom: readonly number[]): number[] {
  switch (kind) {
    case 'custom':
      return custom.slice();
    case 'vs-first':
      return adversaryFor('first', n);
    case 'vs-median3':
      return adversaryFor('median3', n);
    default:
      return shapeArray(kind, n, seed);
  }
}

export const EMPTY_ARRAY_MESSAGE = 'Type two or more whole numbers separated by commas or spaces.';

/** An array typed by the learner: 2 to 2,000 whole numbers, each between -9,999 and 9,999. */
export const parseArray = (text: string): Result<number[]> =>
  parseBoundedList(text, {
    min: 2,
    max: MAX_N,
    lo: -CUSTOM_MAX_VALUE,
    hi: CUSTOM_MAX_VALUE,
    noun: 'values',
    messages: {
      notNumbers: EMPTY_ARRAY_MESSAGE,
      tooFew: (count) => `Two or more values, please: that is ${count}.`,
      tooMany: (count) => `Up to ${MAX_N.toLocaleString('en-US')} values: that is ${count}. Past that the quadratic count is shown from its formula, not run.`,
      outOfRange: (bad) => `${bad} is outside -${CUSTOM_MAX_VALUE} to ${CUSTOM_MAX_VALUE}.`,
    },
  });

/** The n of the primality scene: a whole number from 2 to 10^9, refused with the reason otherwise. */
export const parseN = (text: string) =>
  parseBoundedBigInt(text, {
    min: N_MIN,
    max: N_MAX,
    messages: {
      empty: 'Type a whole number from 2 to 1,000,000,000.',
      invalid: (typed) => `"${typed}" is not a whole number. Use plain digits, like 561.`,
      negative: 'A negative number is not prime: type 2 or more.',
      tooSmall: (v) => `${v} is below 2: 0 and 1 are neither prime nor composite, so there is nothing to test.`,
      tooBig: () => 'Up to 1,000,000,000 here, so the tests stay quick.',
    },
  });

export const N_PRESETS: { id: string; label: string; n: bigint }[] = [
  { id: 'carmichael', label: '561 (Carmichael)', n: 561n },
  { id: 'prime', label: '1009 (prime)', n: 1009n },
  { id: 'small', label: '221 = 13 x 17', n: 221n },
  { id: 'liars', label: '91 = 7 x 13', n: 91n },
];

export const graphOf = (id: string): Graph => PRESETS.find((p) => p.id === id)!.graph;
