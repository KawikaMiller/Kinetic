/**
 * A plain decimal integer as a learner types it: digits with an optional leading minus.
 * Number() also accepts "0x10", "1e1", "+5", "5." and so on, which nobody means as a whole number here.
 */
const DECIMAL_INT = /^-?\d+$/;

/** One integer typed by the learner, like " -7 ". Null when empty or not a plain decimal integer. */
export function parseInteger(text: string): number | null {
  const t = text.trim();
  return DECIMAL_INT.test(t) ? Number(t) : null;
}

/**
 * Parse a list typed by the learner, like "1, 3 ,4  8", into integers.
 * Commas and/or whitespace separate values. Null when empty or when any value isn't a plain decimal integer.
 */
export function parseIntegers(text: string): number[] | null {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  return tokens.length && tokens.every((t) => DECIMAL_INT.test(t)) ? tokens.map(Number) : null;
}
