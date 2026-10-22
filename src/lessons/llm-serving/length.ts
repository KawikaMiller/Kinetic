import { parseBoundedInt, type FieldParse } from '../../core/parse';

const group = (n: number) => n.toLocaleString('en-US');

/**
 * A typed whole number within [min, max]. Decimals, "1e3", negatives, empty text and anything outside the
 * bounds are refused with a sentence that names the field and states the bound, whatever the label is.
 */
export function parseLength(text: string, label: string, min: number, max: number): FieldParse<number> {
  return parseBoundedInt(text, {
    min,
    max,
    thousands: true,
    messages: {
      empty: `${label}: type a whole number from ${group(min)} to ${group(max)}.`,
      invalid: (t) => `"${t}" is not a whole number.`,
      tooSmall: () => `${label}: the smallest allowed value is ${group(min)}.`,
      tooBig: () => `${label}: the largest allowed value is ${group(max)}.`,
    },
  });
}
