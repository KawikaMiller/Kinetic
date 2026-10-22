import { parseBoundedInt, type FieldParse } from '../../core/parse';

const group = (n: number) => n.toLocaleString('en-US');

/**
 * A typed whole number within [min, max]. Decimals, "1e3", negatives, empty text and anything outside the
 * bounds are refused with a sentence that states the bound.
 */
export function parseLength(text: string, label: string, min: number, max: number): FieldParse<number> {
  return parseBoundedInt(text, {
    min,
    max,
    thousands: true,
    messages: {
      empty: `Type a whole number of ${label}, from ${group(min)} to ${group(max)}.`,
      invalid: (t) => `"${t}" is not a whole number.`,
      tooSmall: () => `${label} start at ${group(min)}.`,
      tooBig: () => `${label} stop at ${group(max)} here.`,
    },
  });
}
