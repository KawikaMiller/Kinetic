import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { codePoints, hasLoneSurrogate } from './structures';

export const MAX_TEXT = 60;
export const MAX_PASTE = 200;

/** Where each drawn scene opens (pure data: the try-this lines are written from these). */
export const OPEN = {
  array: { text: 'The quick brown fox jumps over the lazy dog', cursor: 10, insert: 'x' },
  gap: { text: 'The quick brown fox', capacity: 32, insert: 'x' },
  rope: { text: 'Ropes keep long texts in short pieces under a tree.', index: 20, insertAt: 10, insert: 'XY' },
} as const;

export type Typed = { ok: true; items: string[] } | { ok: false; error: string };

/** The typed insert: control characters are dropped, a lone surrogate is refused, and the text may not grow past the cap. */
export function checkInsert(currentLength: number, typed: string, cap = MAX_TEXT): Typed {
  if (hasLoneSurrogate(typed)) return { ok: false, error: 'That text holds half of a surrogate pair, which is not a character on its own: it is refused.' };
  const items = codePoints(typed).filter((c) => c.charCodeAt(0) >= 0x20 && c !== '\u007f');
  if (items.length === 0) return { ok: false, error: 'Type at least one printable character to insert.' };
  if (items.length > MAX_PASTE) return { ok: false, error: `A pasted block is limited to ${MAX_PASTE} characters in the drawn scenes.` };
  if (currentLength + items.length > cap) return { ok: false, error: `The drawn text keeps up to ${cap} characters (code points); this would make ${currentLength + items.length}.` };
  return { ok: true, items };
}

/** A position field: a whole number from 0 to the text length. */
export const parsePosition = (text: string, length: number, what = 'position'): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 0,
    max: length,
    messages: {
      empty: `Type a ${what}, a whole number from 0 to ${length}.`,
      invalid: (typed) => `"${typed}" is not a whole number: type the ${what} like 7.`,
      tooSmall: () => `A ${what} starts at 0.`,
      tooBig: () => `The text has ${length} characters, so the ${what} goes up to ${length}.`,
    },
  });

/** Where a cursor lands when it is moved by an arrow: clamped to 0..length, never wrapped. */
export const clampCursor = (cursor: number, length: number): number => Math.min(length, Math.max(0, cursor));
