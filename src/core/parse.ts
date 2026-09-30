/**
 * Parse a list typed by the learner, like "1, 3 ,4  8", into integers.
 * Commas and/or whitespace separate values. Null when empty or when any value isn't an integer.
 */
export function parseIntegers(text: string): number[] | null {
  const nums = text.split(/[\s,]+/).filter(Boolean).map(Number);
  return nums.length && nums.every(Number.isInteger) ? nums : null;
}
