import { parseBoundedBigInt, parseBoundedInt, type FieldParse } from '../../core/parse';

/** The largest magnitude of a base, exponent or modulus: 10^30, so every number is a toy and a bigint is plenty. */
export const LIMIT = 10n ** 30n;
export const FERMAT_MAX = 5000;
export const FERMAT_MIN = 5;

export interface Triple {
  base: bigint;
  exponent: bigint;
  modulus: bigint;
}

export const HEADLINE: Triple = { base: 7n, exponent: 1_000_000n, modulus: 1_000_003n };
export const PRESETS: { id: string; label: string; triple: Triple }[] = [
  { id: 'headline', label: '7^1000000', triple: HEADLINE },
  { id: 'textbook', label: '4^13 mod 497', triple: { base: 4n, exponent: 13n, modulus: 497n } },
  { id: 'huge', label: 'exponent 10^30', triple: { base: 3n, exponent: 10n ** 30n, modulus: 1_000_000_007n } },
];

/** The opening state of each scene (pure, so a test can pin what each try-this starts from). */
export const OPENING = {
  square: HEADLINE,
  reduce: HEADLINE,
  direction: { ...HEADLINE, direction: 'ltr' as const },
  fermat: { a: 7n, p: 101n, n: 561 },
  timing: { exponent: 1_000_000n },
} as const;

const plain = (typed: string) => `"${typed}" is not a whole number. Use plain digits, like 1000000: no 1e6, no hex, no decimals.`;

export const parseBase = (text: string): FieldParse<bigint> =>
  parseBoundedBigInt(text, {
    min: -LIMIT,
    max: LIMIT,
    messages: {
      empty: 'Type a base: any whole number up to 30 digits.',
      invalid: plain,
      tooSmall: () => 'A base can have at most 30 digits here.',
      tooBig: () => 'A base can have at most 30 digits here.',
    },
  });

export const parseExponent = (text: string): FieldParse<bigint> =>
  parseBoundedBigInt(text, {
    min: 0n,
    max: LIMIT,
    messages: {
      empty: 'Type an exponent: 0 or more, up to 10^30.',
      invalid: plain,
      negative: 'The exponent must be 0 or more: a negative power would need an inverse, which this lesson does not compute.',
      tooSmall: () => 'The exponent must be 0 or more.',
      tooBig: () => 'The exponent is limited to 10^30 here.',
    },
  });

export const parseModulus = (text: string): FieldParse<bigint> =>
  parseBoundedBigInt(text, {
    min: 1n,
    max: LIMIT,
    messages: {
      empty: 'Type a modulus: 1 or more, up to 10^30.',
      invalid: plain,
      negative: 'The modulus must be positive: a negative modulus is not used here.',
      tooSmall: (v) => `A modulus of ${v} is not allowed: use 1 or more (0 would mean dividing by zero).`,
      tooBig: () => 'The modulus is limited to 10^30 here.',
    },
  });

export const MODULUS_ONE_NOTE = 'Modulus 1: every integer is 0 mod 1, so the answer is always 0 and tells you nothing.';

/** A prime p for the Fermat inverse: 3 up to 10^30 (primality is checked and shown, not assumed). */
export const parseP = (text: string): FieldParse<bigint> =>
  parseBoundedBigInt(text, {
    min: 3n,
    max: LIMIT,
    messages: {
      empty: 'Type a modulus p: 3 or more.',
      invalid: plain,
      negative: 'p must be positive.',
      tooSmall: (v) => `${v} is below 3: the inverse a^(p-2) needs p of 3 or more.`,
      tooBig: () => 'p is limited to 10^30 here.',
    },
  });

export const parseN = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: FERMAT_MIN,
    max: FERMAT_MAX,
    messages: {
      empty: `Type n from ${FERMAT_MIN} to ${FERMAT_MAX}.`,
      invalid: plain,
      negative: 'n must be positive.',
      tooSmall: () => `n must be at least ${FERMAT_MIN}: every base from 2 to n - 2 is tried.`,
      tooBig: () => `n is limited to ${FERMAT_MAX.toLocaleString('en-US')}, so every base can be tried.`,
    },
  });

export const N_PRESETS = [561, 1105, 221, 1009];
export const TIMING_PRESETS: bigint[] = [32768n, 65535n, 43690n, 1_000_000n];
