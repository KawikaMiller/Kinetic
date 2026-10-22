/**
 * The "try this input" field of the last scene: bytes typed as hex pairs. Bounded (MAX_INPUT_BYTES) and refused
 * with the position that is wrong; the text is only ever read digit by digit, never evaluated.
 */
import type { FieldParse } from '../../core/parse';
import { MAX_INPUT_BYTES } from './target';

/** Longest text the field takes: two digits and a space per byte. */
export const MAX_HEX_CHARS = MAX_INPUT_BYTES * 3;

const HEX_PAIR = /^[0-9a-fA-F]{1,2}$/;

export function parseHexBytes(text: string): FieldParse<number[]> {
  if (text.length > MAX_HEX_CHARS) return { ok: false, error: `Too long: at most ${MAX_INPUT_BYTES} bytes (${MAX_HEX_CHARS} characters).` };
  const tokens = [...text.matchAll(/\S+/g)];
  if (tokens.length === 0) return { ok: false, error: 'Type some bytes as hex pairs, like 4b 4e.' };
  if (tokens.length > MAX_INPUT_BYTES) return { ok: false, error: `Too many bytes: at most ${MAX_INPUT_BYTES}, you typed ${tokens.length}.` };
  const bytes: number[] = [];
  for (const t of tokens) {
    if (!HEX_PAIR.test(t[0])) return { ok: false, error: `Position ${(t.index ?? 0) + 1}: "${t[0].slice(0, 8)}" is not a hex byte (one or two digits 0-9, a-f).` };
    bytes.push(parseInt(t[0], 16));
  }
  return { ok: true, value: bytes };
}

export const formatHex = (bytes: readonly number[]): string => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
