// Pure pieces of the block-modes lesson: the picture, block bookkeeping, the sample
// messages, and the comparisons the captions are computed from.
import { BLOCK } from './ciphers';

export const SIDE = 48;
export const BLOCKS_PER_ROW = SIDE / BLOCK;
/** The picture's two byte values: background and figure. */
export const BG = 0x2e;
export const FG = 0xd1;

/**
 * A lesson-drawn 48×48 two-tone mascot (a round robot head with an antenna, two square
 * eyes and a mouth), one byte per pixel, rows top to bottom. Big flat areas on purpose.
 */
export function mascotPixel(x: number, y: number): number {
  const cx = 23.5;
  const cy = 27;
  const inHead = (x - cx) ** 2 / 19 ** 2 + (y - cy) ** 2 / 16 ** 2 <= 1;
  const antenna = (x >= 22 && x <= 25 && y >= 5 && y <= 11) || ((x - 23.5) ** 2 + (y - 5) ** 2 <= 9);
  const eye = y >= 20 && y <= 26 && ((x >= 13 && x <= 19) || (x >= 28 && x <= 34));
  const mouth = y >= 33 && y <= 35 && x >= 16 && x <= 31;
  return (inHead && !eye && !mouth) || antenna ? FG : BG;
}

export function mascot(): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) out[y * SIDE + x] = mascotPixel(x, y);
  return out;
}

/** The data split into 16-byte blocks, each as a comparable string. */
export const blockIds = (data: Uint8Array) => {
  const ids: string[] = [];
  for (let i = 0; i < data.length; i += BLOCK) ids.push(Array.from(data.subarray(i, i + BLOCK)).join(','));
  return ids;
};

/** For each block, how many blocks (itself included) share its exact bytes. */
export function blockMultiplicity(data: Uint8Array): number[] {
  const ids = blockIds(data);
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return ids.map((id) => counts.get(id)!);
}

/** How many blocks repeat another block somewhere in the data. */
export const repeatedBlocks = (data: Uint8Array) => blockMultiplicity(data).filter((c) => c > 1).length;

/** Indexes of every block equal to block `i`. */
export function sameAs(data: Uint8Array, i: number): number[] {
  const ids = blockIds(data);
  return ids.flatMap((id, j) => (id === ids[i] ? [j] : []));
}

/** Byte indexes where two arrays differ. */
export const changedBytes = (a: Uint8Array, b: Uint8Array) => Array.from(a).flatMap((v, i) => (v !== b[i] ? [i] : []));

/** Block indexes that contain at least one changed byte. */
export const changedBlocks = (a: Uint8Array, b: Uint8Array) => [...new Set(changedBytes(a, b).map((i) => Math.floor(i / BLOCK)))];

export const ascii = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** Text from bytes, with anything unprintable shown as '·' (garbled decrypts are mostly that). */
export const readable = (b: Uint8Array) => Array.from(b, (v) => (v >= 0x20 && v < 0x7f ? String.fromCharCode(v) : '·')).join('');

// ── Sample messages (ASCII, whole blocks) ──────────────────────────

/** Four blocks for the chaining lane; the first two are equal on purpose. */
export const CHAIN_TEXT = 'Pay Alice $100. ' + 'Pay Alice $100. ' + 'Memo: rent, Oct.' + 'Thanks, Bob!    ';
/** Two messages sharing their first block, for the IV-reuse lane. */
export const REUSE_TEXTS = [
  'To: payroll     Amount: $1,000  Approved: yes   ',
  'To: payroll     Amount: $9,000  Approved: no    ',
] as const;
/** Three blocks for the tamper lane; the flip defaults to the last digit of the amount, in block 2. */
export const TAMPER_TEXT = '{"to":"alice",  ' + '"amount":100,   ' + '"memo":"rent"}  ';
export const TAMPER_DEFAULT_BYTE = TAMPER_TEXT.indexOf('100') + 2;

export type Mode = 'ECB' | 'CBC' | 'CTR' | 'GCM';
export type ChainMode = Exclude<Mode, 'GCM'>;
