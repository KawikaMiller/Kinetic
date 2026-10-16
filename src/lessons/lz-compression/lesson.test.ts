import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { deflateFrames, decodeFrames, parseFrames, type DecodeMode } from './frames';
import lesson from './index';
import { MIN_MATCH_OPTIONS, WINDOW_BOUNDS, decodeAsBlock, decodeTokens, parseLz77, tokenLength } from './lz77';
import { LENGTH_PRESETS, RFC_LENGTHS, TEXT_PRESETS, compress, huffmanOnlyBits, rawBits } from './model';
import { orderZeroBits } from '../../core/entropy';
import { canonicalCaption, comparisonCaption, inflateStateOf, inflateText, sizeVerdict, type Comparison } from './text';

const OPTS = { window: 32, minMatch: 3 };
const NO_JUNK = /NaN|undefined|null|\[object/;
const PRESET_TEXTS = [...TEXT_PRESETS.map((p) => p.text), '', 'a', 'é', '  ', 'abcabcabc'];

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default text parses to a b r a c a d (7, 4) ␣ (12, 11), 10 tokens for 23 characters, and the last step says so', () => {
    const text = 'abracadabra abracadabra';
    const tokens = parseLz77(text, OPTS);
    expect(tokens).toHaveLength(10);
    const frames = parseFrames(text, tokens, OPTS);
    expect(frames).toHaveLength(11);
    expect(frames[frames.length - 1].say).toContain('23 characters became 10 tokens, 2 matches and 8 literals');
    expect(lesson.tryThis[0]).toContain('a b r a c a d (7, 4) ␣ (12, 11), 10 tokens for 23 characters');
  });

  it('try-this 2: aaaaaaaaaa decodes to ten a one character at a time and to two characters as a block', () => {
    const text = 'aaaaaaaaaa';
    const tokens = parseLz77(text, OPTS);
    const byte = decodeFrames(tokens, text, 'byte');
    expect(byte[byte.length - 1].out).toBe(text);
    expect(byte[byte.length - 1].say).toContain('identical to the original');
    const block = decodeFrames(tokens, text, 'block');
    expect(block[block.length - 1].out).toBe('aa');
    expect(block[block.length - 1].say).toContain('2 characters where the original has 10');
    expect(lesson.tryThis[1]).toContain('a (1, 9)');
    expect(lesson.tryThis[1]).toContain('with 2 of 10 characters');
  });

  it('try-this 3: the RFC lengths give F = 00, A = 010, H = 1111; oversubscribed reads 416/256 and assigns nothing', () => {
    expect(canonicalCaption(RFC_LENGTHS)).toContain('F = 00');
    expect(canonicalCaption(RFC_LENGTHS)).toContain('A = 010');
    expect(canonicalCaption(RFC_LENGTHS)).toContain('H = 1111');
    const over = LENGTH_PRESETS.find((p) => p.id === 'over')!.lengths;
    const text = canonicalCaption(over);
    expect(text).toContain('Kraft sum 416/256 is above 1');
    expect(text).toContain('no prefix code');
    expect(lesson.tryThis[2]).toContain('F = 00, A = 010 and H = 1111');
    expect(lesson.tryThis[2]).toContain('416/256');
  });

  it('try-this 4: aaaaaaaaaa makes a 30-bit, 4-byte block', () => {
    const { block } = compress('aaaaaaaaaa', OPTS);
    expect([block.totalBits, block.bytes.length]).toEqual([30, 4]);
    const frames = deflateFrames(block, 'aaaaaaaaaa');
    expect(frames[frames.length - 1].say).toContain('The block is 30 bits, 4 bytes, for 10 characters');
    expect(lesson.tryThis[3]).toContain('30 bits (4 bytes)');
  });

  it('try-this 5: ab x 50 is 42 bits against an order-0 bound of 100.0', () => {
    const text = 'ab'.repeat(50);
    const { block } = compress(text, OPTS);
    expect(block.totalBits).toBe(42);
    expect(orderZeroBits(text).toFixed(1)).toBe('100.0');
    expect(lesson.tryThis[4]).toContain('42 bits');
    expect(lesson.tryThis[4]).toContain('100.0');
    const row: Comparison = { label: 'ab x 50', raw: rawBits(text), huffman: huffmanOnlyBits(text), entropy: orderZeroBits(text), deflate: block.totalBits, real: undefined };
    expect(comparisonCaption(row)).toContain('under the order-0 bound by 58.0 bits');
  });
});

describe('every caption reads cleanly across the control space', () => {
  it('walks every text x window x minimum match x copy style through the three player scenes: no junk, and the last frame agrees with the decoders', () => {
    let frames = 0;
    for (const text of PRESET_TEXTS) {
      for (const window of [WINDOW_BOUNDS.min, 12, WINDOW_BOUNDS.max]) {
        for (const minMatch of MIN_MATCH_OPTIONS) {
          const opts = { window, minMatch };
          const tokens = parseLz77(text, opts);
          const parse = parseFrames(text, tokens, opts);
          expect(parse[parse.length - 1].cursor).toBe(Array.from(text).length);
          parse.forEach((f, i) => {
            expect(String(f.say)).not.toMatch(NO_JUNK);
            expect(f.k).toBe(i);
            frames++;
          });
          for (const mode of ['byte', 'block'] as DecodeMode[]) {
            const decode = decodeFrames(tokens, text, mode);
            const last = decode[decode.length - 1];
            expect(last.out).toBe(mode === 'byte' ? decodeTokens(tokens) : decodeAsBlock(tokens));
            expect(last.done).toBe(true);
            expect(decode.slice(0, -1).every((f) => !f.done)).toBe(true);
            if (tokens.length > 0) expect(String(last.say).includes(last.out === text ? 'identical' : 'it is wrong')).toBe(true);
            decode.forEach((f) => {
              expect(String(f.say)).not.toMatch(NO_JUNK);
              // The output only ever grows by what was just written.
              expect(Array.from(f.out).length).toBeLessThanOrEqual(Array.from(text).length + 300);
              frames++;
            });
          }
          const c = compress(text, opts);
          deflateFrames(c.block, text).forEach((f, i, all) => {
            expect(String(f.say)).not.toMatch(NO_JUNK);
            expect(f.bitsSoFar).toBe(c.block.items.slice(0, i + 1).reduce((s, it) => s + it.bits.length, 0));
            if (i === all.length - 1) expect(f.bitsSoFar).toBe(c.block.totalBits);
            frames++;
          });
        }
      }
    }
    expect(frames).toBeGreaterThan(1000);
  });

  it('the block decoder is only wrong when a match is longer than its distance, and its caption says it is wrong exactly then', () => {
    const rnd = mulberry32(61);
    for (let t = 0; t < 200; t++) {
      const text = Array.from({ length: 5 + Math.floor(rnd() * 40) }, () => 'ab'[Math.floor(rnd() * 2)]).join('');
      const tokens = parseLz77(text, OPTS);
      const overlap = tokens.some((tok) => tok.kind === 'match' && tok.length > tok.distance);
      const last = decodeFrames(tokens, text, 'block').at(-1)!;
      expect(last.out !== text).toBe(overlap);
      expect(String(last.say).includes('it is wrong')).toBe(overlap);
    }
  });

  it('in byte mode a read of the copy\'s own output is flagged only when length exceeds distance', () => {
    const text = 'abababababab';
    const tokens = parseLz77(text, OPTS);
    const frames = decodeFrames(tokens, text, 'byte');
    const own = frames.filter((f) => f.readOwn);
    const overlapping = tokens.filter((t) => t.kind === 'match').reduce((s, t) => s + (t.kind === 'match' && t.length > t.distance ? t.length - t.distance : 0), 0);
    expect(own).toHaveLength(overlapping);
    expect(own.length).toBeGreaterThan(0);
    for (const f of own) expect(String(f.say)).toContain('this same copy wrote');
  });

  it('every token stands for the characters it says: token lengths add up to the text at every setting', () => {
    for (const text of PRESET_TEXTS) {
      for (const minMatch of MIN_MATCH_OPTIONS) {
        const tokens = parseLz77(text, { window: 16, minMatch });
        expect(tokens.reduce((s, t) => s + tokenLength(t), 0)).toBe(Array.from(text).length);
      }
    }
  });

  it('the canonical caption holds for every length set of 8 symbols between 1 and 3 (6,561 sets): it names the state the Kraft sum implies', () => {
    for (let code = 0; code < 3 ** 8; code++) {
      const lengths = Array.from({ length: 8 }, (_, i) => 1 + (Math.floor(code / 3 ** i) % 3));
      const sum = lengths.reduce((s, l) => s + 2 ** -l, 0);
      const text = canonicalCaption(lengths);
      expect(text).not.toMatch(NO_JUNK);
      if (sum > 1) expect(text).toContain('above 1');
      else if (sum === 1) expect(text).toContain('a complete code');
      else expect(text).toContain('unused');
    }
  });

  it('the inflate and size verdicts say what the state is, including the failure paths', () => {
    expect(inflateStateOf(false, undefined, 'x')).toBe('unavailable');
    expect(inflateStateOf(true, undefined, 'x')).toBe('checking');
    expect(inflateStateOf(true, 'x', 'x')).toBe('same');
    expect(inflateStateOf(true, 'y', 'x')).toBe('different');
    expect(inflateStateOf(true, null, 'x')).toBe('different');
    expect(inflateText('different')).toContain('wrong');
    expect(inflateText('unavailable')).toContain('skipped');
    const random = TEXT_PRESETS.find((p) => p.id === 'random')!.text;
    expect(sizeVerdict(random, compress(random, OPTS)).added).toBe(true);
    expect(sizeVerdict('ab'.repeat(50), compress('ab'.repeat(50), OPTS))).toEqual({ text: '758 bits saved against 800 for plain bytes', added: false });
  });
});

describe('hidden controls feed nothing', () => {
  it('the canonical caption depends only on the lengths: parse settings never reach it', () => {
    const before = canonicalCaption(RFC_LENGTHS);
    for (const text of PRESET_TEXTS) parseLz77(text, { window: 5, minMatch: 4 });
    expect(canonicalCaption(RFC_LENGTHS)).toBe(before);
  });

  it('window and minimum match change the where-scene row only through the compressor: the plain, Huffman and order-0 columns ignore them', () => {
    const text = 'abracadabra abracadabra';
    const base = [rawBits(text), huffmanOnlyBits(text), orderZeroBits(text)];
    for (const window of [4, 64]) for (const minMatch of MIN_MATCH_OPTIONS) {
      compress(text, { window, minMatch });
      expect([rawBits(text), huffmanOnlyBits(text), orderZeroBits(text)]).toEqual(base);
    }
  });

  it('comparison captions cover a text with no repeats, one with many, and an empty one', () => {
    const rows = ['abcdefghijklmnop', 'ab'.repeat(50), '', 'abababababababab'].map((text): Comparison => ({
      label: 'x', raw: rawBits(text), huffman: huffmanOnlyBits(text), entropy: orderZeroBits(text), deflate: compress(text, OPTS).block.totalBits, real: undefined,
    }));
    expect(comparisonCaption(rows[0])).toContain('larger than the plain bytes');
    expect(comparisonCaption(rows[1])).toContain('under the order-0 bound');
    expect(comparisonCaption(rows[2])).toContain('No characters yet');
    expect(comparisonCaption(rows[3])).toContain('23.0 bits above the order-0 bound');
    for (const r of rows) expect(comparisonCaption(r)).not.toMatch(NO_JUNK);
  });
});
