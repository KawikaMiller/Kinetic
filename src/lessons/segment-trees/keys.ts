import { parseBoundedInt, type FieldParse } from '../../core/parse';

export const VALUE_MIN = -999;
export const VALUE_MAX = 999;

/** A whole number within bounds, or the sentence that refuses it (`what` names the field). */
export const parseField = (text: string, min: number, max: number, what: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min,
    max,
    typographicMinus: true,
    messages: {
      empty: `Type ${what}.`,
      invalid: (typed) => `"${typed}" is not a whole number. Use plain digits, like 3.`,
      tooSmall: () => `${what[0].toUpperCase()}${what.slice(1)} goes from ${min} to ${max}.`,
      tooBig: () => `${what[0].toUpperCase()}${what.slice(1)} goes from ${min} to ${max}.`,
    },
  });

export const parseValue = (text: string): FieldParse<number> => parseField(text, VALUE_MIN, VALUE_MAX, 'a value');

export type RangeParse = { ok: true; l: number; r: number } | { ok: false; error: string; swapOffer?: { l: number; r: number } };

/** Two cell indices in 0..n-1 (shifted by `base` for the Fenwick scene): l must not pass r, and a reversed pair comes with an offer to swap. */
export function parseRange(lText: string, rText: string, n: number, base = 0): RangeParse {
  const lo = base;
  const hi = n - 1 + base;
  const l = parseField(lText, lo, hi, 'the left cell');
  if (!l.ok) return l;
  const r = parseField(rText, lo, hi, 'the right cell');
  if (!r.ok) return r;
  if (l.value > r.value) return { ok: false, error: `l = ${l.value} is bigger than r = ${r.value}: use [${r.value}, ${l.value}] instead?`, swapOffer: { l: r.value, r: l.value } };
  return { ok: true, l: l.value, r: r.value };
}
