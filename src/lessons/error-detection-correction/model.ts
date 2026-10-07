import type { Bit } from '../../core/bits';

const xorAll = (bits: readonly Bit[]) => bits.reduce<number>((a, b) => a ^ b, 0) as Bit;
const flip = (b: Bit) => (1 - b) as Bit;

/** A copy of `bits` with every index in `flips` inverted. */
export const applyFlips = (bits: readonly Bit[], flips: ReadonlySet<number>) => bits.map((b, i) => (flips.has(i) ? flip(b) : b));

/** Toggle one index in a flip set. */
export function toggleFlip(flips: ReadonlySet<number>, i: number): Set<number> {
  const next = new Set(flips);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
}

// ── Parity ───────────────────────────────────────────────────────────────

export const PARITY_DATA_BITS = 8;

/** Even parity: the extra bit that makes the total number of 1s even. */
export const evenParityBit = (word: readonly Bit[]) => xorAll(word);

/** The 9 bits sent: the word, then its parity bit. */
export const withParity = (word: readonly Bit[]): Bit[] => [...word, evenParityBit(word)];

/** The receiver's check: an even number of 1s passes. */
export const parityPasses = (received: readonly Bit[]) => xorAll(received) === 0;

export type ParityVerdict = 'clean' | 'detected' | 'undetected';

/** What happened, from the flips alone: parity catches an odd number of flips and misses an even number. */
export function parityVerdict(sent: readonly Bit[], flips: ReadonlySet<number>): ParityVerdict {
  if (flips.size === 0) return 'clean';
  return parityPasses(applyFlips(sent, flips)) ? 'undetected' : 'detected';
}

// ── Hamming(7,4), optionally with an overall parity bit (SECDED) ─────────

/**
 * Codeword layout: index 0 is the overall parity bit (used only with SECDED), indexes 1-7
 * are the positions. Parity bits sit at the powers of two (1, 2, 4), data at 3, 5, 6, 7.
 */
export const POSITIONS = [1, 2, 3, 4, 5, 6, 7] as const;
export const PARITY_POSITIONS = [1, 2, 4] as const;
export const DATA_POSITIONS = [3, 5, 6, 7] as const;
export type ParityPosition = (typeof PARITY_POSITIONS)[number];

/** Parity bit p covers every position whose binary number has p's bit set. */
export const coverage = (p: ParityPosition) => POSITIONS.filter((pos) => (pos & p) !== 0);

export const isParityPosition = (pos: number): pos is ParityPosition => (PARITY_POSITIONS as readonly number[]).includes(pos);

/** "p1", "d3": the role of a position (data bits numbered 1-4 in order). */
export const roleOf = (pos: number) => (isParityPosition(pos) ? `p${pos}` : `d${DATA_POSITIONS.indexOf(pos as 3) + 1}`);

/** Encode 4 data bits [d1, d2, d3, d4] into an 8-slot codeword [p0, 1..7]. */
export function hammingEncode(data: readonly Bit[]): Bit[] {
  const word: Bit[] = Array(8).fill(0);
  DATA_POSITIONS.forEach((pos, k) => (word[pos] = data[k]));
  for (const p of PARITY_POSITIONS) word[p] = xorAll(coverage(p).filter((pos) => pos !== p).map((pos) => word[pos]));
  word[0] = xorAll(word.slice(1));
  return word;
}

/** The 4 data bits read back out of a codeword. */
export const dataOf = (word: readonly Bit[]) => DATA_POSITIONS.map((pos) => word[pos]);

/** Whether parity group p fails (an odd number of 1s across its positions). */
export const checkFails = (word: readonly Bit[], p: ParityPosition) => xorAll(coverage(p).map((pos) => word[pos])) === 1;

/** The syndrome: the failing checks read as a binary number p4 p2 p1. Non-zero names a position. */
export const syndrome = (word: readonly Bit[]) => PARITY_POSITIONS.reduce((s, p) => s + (checkFails(word, p) ? p : 0), 0);

/** Overall parity across all 8 slots: 1 means an odd number of bits flipped. */
export const overallFails = (word: readonly Bit[]) => xorAll(word) === 1;

export interface Decoded {
  /** The word after correction (same as received when nothing was flipped). */
  word: Bit[];
  /** The slot the decoder flipped, or null. */
  flipped: number | null;
  /** SECDED saw two errors and refused to correct. */
  uncorrectable: boolean;
}

/**
 * Decode a received word. Plain (7,4): a non-zero syndrome is trusted and that position is
 * flipped. SECDED also checks overall parity: syndrome + odd parity is one error (fixed),
 * syndrome + even parity is two errors (reported, not fixed), and odd parity alone means the
 * overall parity bit itself flipped.
 */
export function hammingDecode(received: readonly Bit[], secded: boolean): Decoded {
  const s = syndrome(received);
  const odd = overallFails(received);
  const fixAt = (slot: number): Decoded => ({ word: applyFlips(received, new Set([slot])), flipped: slot, uncorrectable: false });
  if (!secded) return s === 0 ? { word: [...received], flipped: null, uncorrectable: false } : fixAt(s);
  if (s === 0) return odd ? fixAt(0) : { word: [...received], flipped: null, uncorrectable: false };
  return odd ? fixAt(s) : { word: [...received], flipped: null, uncorrectable: true };
}

export type HammingVerdict = 'clean' | 'corrected' | 'miscorrected' | 'uncorrectable' | 'undetected';

/** The outcome, judged by comparing what the decoder ends up with against what was sent. */
export function hammingVerdict(data: readonly Bit[], flips: ReadonlySet<number>, secded: boolean): HammingVerdict {
  if (flips.size === 0) return 'clean';
  const sent = hammingEncode(data);
  const out = hammingDecode(applyFlips(sent, flips), secded);
  if (out.uncorrectable) return 'uncorrectable';
  if (out.flipped === null) return 'undetected';
  // Plain (7,4) has no slot 0, so only positions 1-7 count there.
  const slots = secded ? [0, ...POSITIONS] : POSITIONS;
  return slots.every((i) => out.word[i] === sent[i]) ? 'corrected' : 'miscorrected';
}

// ── CRC: polynomial long division mod 2 ──────────────────────────────────

/** CRC-4 generator x⁴ + x + 1, as bits 10011. */
export const CRC4_GENERATOR: readonly Bit[] = [1, 0, 0, 1, 1];
export const CRC4_BITS = CRC4_GENERATOR.length - 1;
export const MESSAGE_BITS = 8;

export interface DivisionStep {
  /** Index where the generator is lined up (under a leading 1). */
  at: number;
  before: Bit[];
  after: Bit[];
}

/** Long division of `dividend` by `generator`, mod 2: XOR the generator under every leading 1, left to right. */
export function divide(dividend: readonly Bit[], generator: readonly Bit[] = CRC4_GENERATOR): { steps: DivisionStep[]; remainder: Bit[] } {
  let work = [...dividend];
  const steps: DivisionStep[] = [];
  for (let at = 0; at + generator.length <= work.length; at++) {
    if (work[at] === 0) continue;
    const after = work.map((b, i) => (i >= at && i < at + generator.length ? ((b ^ generator[i - at]) as Bit) : b));
    steps.push({ at, before: work, after });
    work = after;
  }
  return { steps, remainder: work.slice(work.length - (generator.length - 1)) };
}

/** The sender's dividend: the message followed by CRC4_BITS zeros. */
export const padded = (message: readonly Bit[]): Bit[] => [...message, ...Array<Bit>(CRC4_BITS).fill(0)];

/** CRC-4 of a message: the remainder of message·x⁴ divided by the generator. */
export const crc4 = (message: readonly Bit[]) => divide(padded(message)).remainder;

/** What's sent: the message with its CRC appended. The receiver divides this and expects 0. */
export const crcCodeword = (message: readonly Bit[]): Bit[] => [...message, ...crc4(message)];

// ── Real CRCs over bytes ─────────────────────────────────────────────────

/** CRC-8/SMBUS: polynomial 0x07, init 0, no reflection, no final XOR. */
export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** CRC-32/ISO-HDLC (Ethernet, ZIP, PNG): reflected polynomial 0xEDB88320, init and final XOR 0xFFFFFFFF. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Text as UTF-8 bytes, the way it would go over a wire. */
export const utf8 = (text: string) => new TextEncoder().encode(text);

export const MAX_TEXT = 120;

/** A 32-bit value's 4 bytes, most significant first. */
export const bytesOf32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];

export type CrcVerdict = 'clean' | 'detected' | 'undetected';

/** The receiver's outcome for a codeword with these flips: a non-zero remainder is caught; zero passes, flipped or not. */
export function crcVerdict(message: readonly Bit[], flips: ReadonlySet<number>): CrcVerdict {
  if (flips.size === 0) return 'clean';
  return divide(applyFlips(crcCodeword(message), flips)).remainder.some((b) => b === 1) ? 'detected' : 'undetected';
}
