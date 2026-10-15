import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { DRAWN_LIMIT } from './presets';

export const KEY_MIN = -999;
export const KEY_MAX = 999;

/** One key typed into a field, or the sentence that refuses it. */
export const parseKey = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: KEY_MIN,
    max: KEY_MAX,
    typographicMinus: true,
    messages: {
      empty: 'Type a whole number.',
      invalid: (typed) => `"${typed}" is not a whole number. Use plain digits, like 42.`,
      tooSmall: () => `Keys go from ${KEY_MIN} to ${KEY_MAX}.`,
      tooBig: () => `Keys go from ${KEY_MIN} to ${KEY_MAX}.`,
    },
  });

/** Why an operation on the drawn list is refused, or null: duplicates are refused (not replaced), and the drawing holds 64 keys. */
export function refuseOp(op: 'insert' | 'delete' | 'search', key: number, size: number, has: boolean): string | null {
  if (op === 'insert') {
    if (has) return `${key} is already in the list: a duplicate insert is refused, not replaced.`;
    if (size >= DRAWN_LIMIT) return `The list already has ${DRAWN_LIMIT} keys, the most the drawing holds.`;
    return null;
  }
  if (op === 'delete') {
    if (size === 0) return 'The list is empty: there is nothing to delete.';
    if (!has) return `${key} is not in the list.`;
  }
  return null;
}
