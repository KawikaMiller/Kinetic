import { toBits, type Bit } from '../../core/bits';
import { enc } from '../../core/crypto';

// Real encoders only: bytes from TextEncoder, graphemes from Intl.Segmenter, mojibake
// from a real Windows-1252 TextDecoder.

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const windows1252 = new TextDecoder('windows-1252');
const utf8Decoder = new TextDecoder('utf-8');

/** User-perceived characters (what the cursor steps over): 👍🏽 is one, even though it's two code points. */
export const graphemes = (s: string) => [...segmenter.segment(s)].map((g) => g.segment);

/** Unicode code points: what [...s] iterates. */
export const codePoints = (s: string) => [...s].map((c) => c.codePointAt(0)!);

/** Does the text contain a flag: a pair of regional-indicator letters (U+1F1E6..U+1F1FF)? */
export const hasFlagLetters = (s: string) => /\p{Regional_Indicator}{2}/u.test(s);

const REGIONAL_A = 0x1f1e6;
/** The plain letters of the first flag in the text: "JP" for 🇯🇵. */
export function flagLetters(s: string): string {
  const pair = /\p{Regional_Indicator}{2}/u.exec(s)?.[0] ?? '';
  return [...pair].map((c) => String.fromCharCode(c.codePointAt(0)! - REGIONAL_A + 65)).join('');
}

export const utf8 = (s: string) => enc.encode(s);

export const formatCodePoint = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

export const hexByte = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');

export interface Counts {
  graphemes: number;
  codePoints: number;
  /** JavaScript's .length */
  utf16: number;
  utf8Bytes: number;
}

export function counts(s: string): Counts {
  return { graphemes: graphemes(s).length, codePoints: codePoints(s).length, utf16: s.length, utf8Bytes: utf8(s).length };
}

/**
 * How many leading bits of a UTF-8 byte are structure, not payload:
 * 0xxxxxxx (1), 10xxxxxx continuation (2), 110xxxxx (3), 1110xxxx (4), 11110xxx (5).
 */
export function prefixLength(byte: number): number {
  if (byte < 0x80) return 1;
  if ((byte & 0xc0) === 0x80) return 2;
  if ((byte & 0xe0) === 0xc0) return 3;
  if ((byte & 0xf0) === 0xe0) return 4;
  return 5;
}

export interface EncodedByte {
  byte: number;
  bits: Bit[];
  prefix: number;
}

export interface EncodedCodePoint {
  cp: number;
  char: string;
  bytes: EncodedByte[];
  /** The payload bits of every byte, in order: exactly the code point's binary. */
  payload: Bit[];
  /** [from, to] ranges in `payload` that each byte carries. */
  payloadRuns: [number, number][];
}

export function encodeCodePoint(cp: number): EncodedCodePoint {
  const char = String.fromCodePoint(cp);
  const bytes = [...utf8(char)].map((byte) => ({ byte, bits: toBits(byte, 8), prefix: prefixLength(byte) }));
  const payload: Bit[] = [];
  const payloadRuns: [number, number][] = [];
  for (const b of bytes) {
    const run = b.bits.slice(b.prefix);
    payloadRuns.push([payload.length, payload.length + run.length - 1]);
    payload.push(...run);
  }
  return { cp, char, bytes, payload, payloadRuns };
}

/** The UTF-8 bytes read as Windows-1252, one character per byte: how "é" becomes "Ã©". */
export function decodeAs(bytes: Uint8Array, encoding: 'utf-8' | 'windows-1252'): { text: string; garbled: boolean[] } {
  if (encoding === 'utf-8') {
    const text = utf8Decoder.decode(bytes);
    return { text, garbled: [...text].map(() => false) };
  }
  const text = windows1252.decode(bytes);
  // Windows-1252 is one character per byte, so character i came from byte i.
  return { text, garbled: [...text].map((_, i) => bytes[i] >= 0x80) };
}

export interface Preset {
  id: string;
  label: string;
  text: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'cafe', label: 'café', text: 'café' },
  { id: 'cafe-nfd', label: 'café (combining)', text: 'café' },
  { id: 'thumb', label: '👍🏽', text: '\u{1F44D}\u{1F3FD}' },
  { id: 'flag', label: '🇯🇵 flag', text: '\u{1F1EF}\u{1F1F5}' },
  { id: 'nihon', label: '日本', text: '日本' },
  { id: 'ascii', label: 'Hi!', text: 'Hi!' },
];

/** Whether a string changes under NFC normalisation (it looks the same but isn't the same string). */
export function normalisation(s: string) {
  const nfc = s.normalize('NFC');
  const nfd = s.normalize('NFD');
  return { nfc, nfd, isNfc: nfc === s, nfcLength: nfc.length, nfdLength: nfd.length };
}
