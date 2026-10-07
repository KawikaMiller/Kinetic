import { describe, expect, it } from 'vitest';
import { toBits, type Bit } from '../../core/bits';
import { captionText } from '../../core/testing/captions';
import { crcFrames, hammingCaption, parityCaption } from './frames';
import {
  POSITIONS, applyFlips, crc32, crc4, crc8, crcCodeword, crcVerdict, dataOf, divide, hammingDecode, hammingEncode, hammingVerdict,
  parityPasses, parityVerdict, syndrome, utf8, withParity, type HammingVerdict,
} from './model';

const DATA_WORDS = Array.from({ length: 16 }, (_, v) => toBits(v, 4));
const subsets = (items: readonly number[]) =>
  Array.from({ length: 2 ** items.length }, (_, mask) => new Set(items.filter((_, k) => (mask >> k) & 1)));
const pairs = (items: readonly number[]) => items.flatMap((a, i) => items.slice(i + 1).map((b) => new Set([a, b])));

describe('parity', () => {
  it('detects every odd-weight flip pattern and no even-weight one, over all 9 bits', () => {
    for (let w = 0; w < 256; w++) {
      const sent = withParity(toBits(w, 8));
      expect(parityPasses(sent)).toBe(true);
      for (const flips of subsets([0, 1, 2, 3, 4, 5, 6, 7, 8])) {
        const verdict = parityVerdict(sent, flips);
        if (flips.size === 0) expect(verdict).toBe('clean');
        else if (verdict !== (flips.size % 2 ? 'detected' : 'undetected')) throw new Error(`${w} ${[...flips]}`);
      }
    }
  });

  it('captions name the verdict the flips produce', () => {
    const sent = withParity(toBits(0b1011_0010, 8));
    const word = { clean: /No errors/, detected: /\bdetected/, undetected: /undetected/ };
    for (const flips of subsets([0, 1, 2, 3, 4, 5, 6, 7, 8])) {
      const text = captionText(parityCaption(sent, flips));
      expect(text).toMatch(word[parityVerdict(sent, flips)]);
    }
  });
});

describe('Hamming(7,4)', () => {
  it('puts parity at 1, 2, 4 and decodes back the data', () => {
    for (const d of DATA_WORDS) {
      const word = hammingEncode(d);
      expect(dataOf(word)).toEqual(d);
      expect(syndrome(word)).toBe(0);
    }
  });

  it('every single flip of every data word: the syndrome names the position and decoding recovers the data', () => {
    for (const d of DATA_WORDS) {
      for (const pos of POSITIONS) {
        const received = applyFlips(hammingEncode(d), new Set([pos]));
        expect(syndrome(received)).toBe(pos);
        for (const secded of [false, true]) {
          expect(dataOf(hammingDecode(received, secded).word)).toEqual(d);
          expect(hammingVerdict(d, new Set([pos]), secded)).toBe('corrected');
        }
      }
    }
  });

  it('every double flip: plain (7,4) miscorrects, SECDED reports it as uncorrectable', () => {
    const doubles = pairs([...POSITIONS]);
    expect(doubles).toHaveLength(21);
    for (const d of DATA_WORDS) {
      for (const flips of doubles) {
        expect(hammingVerdict(d, flips, false)).toBe('miscorrected');
        const out = hammingDecode(applyFlips(hammingEncode(d), flips), false);
        expect(flips.has(out.flipped!)).toBe(false);
        expect(hammingVerdict(d, flips, true)).toBe('uncorrectable');
      }
      // Doubles that include the overall parity bit too.
      for (const pos of POSITIONS) expect(hammingVerdict(d, new Set([0, pos]), true)).toBe('uncorrectable');
    }
  });

  it('SECDED corrects a flip of the overall parity bit alone', () => {
    for (const d of DATA_WORDS) expect(hammingVerdict(d, new Set([0]), true)).toBe('corrected');
  });

  it('captions name the verdict for every flip set, data word and mode', () => {
    const word: Record<HammingVerdict, RegExp> = {
      clean: /No errors/,
      corrected: /\bcorrected/,
      miscorrected: /miscorrected/,
      uncorrectable: /two errors, can't fix/,
      undetected: /undetected/,
    };
    for (const d of DATA_WORDS) {
      for (const secded of [false, true]) {
        for (const flips of subsets(secded ? [0, ...POSITIONS] : [...POSITIONS])) {
          const verdict = hammingVerdict(d, flips, secded);
          const text = captionText(hammingCaption(d, flips, secded));
          for (const [v, re] of Object.entries(word)) {
            if (re.test(text) !== (v === verdict)) throw new Error(`${d} ${[...flips]} ${secded}: ${verdict} vs "${text}"`);
          }
        }
      }
    }
  });
});

/** Reference CRC-4: a bit-serial shift register (x⁴ + x + 1, init 0), nothing shared with divide(). */
function crc4Reference(message: readonly Bit[]): number {
  let reg = 0;
  for (const bit of message) {
    const top = ((reg >> 3) & 1) ^ bit;
    reg = (reg << 1) & 0xf;
    if (top) reg ^= 0b0011;
  }
  return reg;
}

const value = (bits: readonly Bit[]) => bits.reduce<number>((a, b) => a * 2 + b, 0);

describe('CRC', () => {
  it('CRC-4 by long division matches a shift-register reference on all 8-bit messages', () => {
    for (let m = 0; m < 256; m++) {
      const msg = toBits(m, 8);
      expect(value(crc4(msg)), String(m)).toBe(crc4Reference(msg));
    }
  });

  it('the receiver gets remainder 0 for every clean codeword, and non-zero for every single flip', () => {
    for (let m = 0; m < 256; m++) {
      const msg = toBits(m, 8);
      expect(divide(crcCodeword(msg)).remainder).toEqual([0, 0, 0, 0]);
      for (let i = 0; i < 12; i++) expect(crcVerdict(msg, new Set([i]))).toBe('detected');
    }
  });

  it('misses an error pattern that is a multiple of the generator', () => {
    // Flipping bits in the shape of 10011 adds the generator itself: remainder stays 0.
    expect(crcVerdict(toBits(0b1101_0011, 8), new Set([0, 3, 4]))).toBe('undetected');
  });

  it('matches the standard check values for CRC-8/SMBUS and CRC-32/ISO-HDLC', () => {
    expect(crc8(utf8('123456789'))).toBe(0xf4);
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926);
    expect(crc8(utf8(''))).toBe(0);
    expect(crc32(utf8(''))).toBe(0);
  });

  it('frames: one per XOR, and the last caption states the remainder computed', () => {
    for (let m = 0; m < 256; m += 17) {
      const msg = toBits(m, 8);
      const send = crcFrames(msg, 'send', new Set());
      const steps = divide([...msg, 0, 0, 0, 0]).steps.length;
      expect(send).toHaveLength(steps + 2);
      expect(captionText(send.at(-1)!.say as never)).toContain(crc4(msg).join(''));
      const check = crcFrames(msg, 'check', new Set([2]));
      expect(captionText(check.at(-1)!.say as never)).toMatch(/\bdetected/);
    }
    expect(captionText(crcFrames(toBits(0b1101_0011, 8), 'check', new Set([0, 3, 4])).at(-1)!.say as never)).toMatch(/Undetected/);
  });
});
