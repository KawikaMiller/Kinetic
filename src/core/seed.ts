import { parseBoundedInt, type FieldParse } from './parse';

/** Largest seed a lesson accepts: 2³¹ − 1, so it stays a safe integer through mulberry32's `>>> 0`. */
export const SEED_MAX = 2 ** 31 - 1;

/** The standard seed field of the Tier 3 statistics lessons: a whole number in [0, SEED_MAX], or the reason it is refused. */
export const parseSeed = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 0,
    max: SEED_MAX,
    messages: {
      empty: 'Type a seed: a whole number from 0 up.',
      invalid: (typed) => `"${typed}" isn't a seed. Use plain digits, like 42.`,
      tooSmall: () => "A seed can't be negative.",
      tooBig: () => `A seed goes up to ${SEED_MAX.toLocaleString('en-US')}.`,
    },
  });

/** The seed after pressing "new seed": the next one, wrapping at SEED_MAX so it stays valid. */
export const nextSeed = (seed: number): number => (seed >= SEED_MAX ? 0 : seed + 1);
