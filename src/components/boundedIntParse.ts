import { parseBoundedInt, type FieldParse, type IntFieldMessages } from '../core/parse';

/** 1,234 with the separators the field shows and accepts. */
export const groupInt = (n: number) => n.toLocaleString('en-US');

/** The refusal sentences for one field: given its label and bounds, the four `parseBoundedInt` messages. */
export type BoundedIntMessages = (label: string, min: number, max: number) => Pick<IntFieldMessages<number>, 'empty' | 'invalid' | 'tooSmall' | 'tooBig'>;

/** The tier-wide wording: every refusal names the field and states the bound it broke. */
export const standardIntMessages: BoundedIntMessages = (label, min, max) => ({
  empty: `${label}: type a whole number from ${groupInt(min)} to ${groupInt(max)}.`,
  invalid: (typed) => `"${typed}" is not a whole number.`,
  tooSmall: () => `${label}: the smallest allowed value is ${groupInt(min)}.`,
  tooBig: () => `${label}: the largest allowed value is ${groupInt(max)}.`,
});

/**
 * A typed whole number within [min, max] (thousands commas allowed). Decimals, "1e3", negatives, empty text and
 * anything outside the bounds are refused with a sentence from `messages`; nothing is clamped.
 */
export function parseBoundedIntField(
  text: string, label: string, min: number, max: number, messages: BoundedIntMessages = standardIntMessages,
): FieldParse<number> {
  return parseBoundedInt(text, { min, max, thousands: true, messages: messages(label, min, max) });
}
