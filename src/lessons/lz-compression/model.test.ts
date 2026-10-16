import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { distanceCode, deflateTokens, encodeFixedBlock, fixedLiteralCode, inflateRaw, lengthCode, packBits, realCompressedSize, streamsAvailable } from './deflate';
import {
  DEFLATE_MIN_MATCH, MAX_MATCH, MAX_TEXT, MIN_MATCH_OPTIONS, WINDOW_BOUNDS, checkText, decodeAsBlock, decodeTokens, longestMatch, parseLz77, tokenLength, type Token,
} from './lz77';
import { LENGTH_PRESETS, RFC_LENGTHS, TEXT_PRESETS, assignCodes, bytesOf, compress, isPrefixFree, kraftOutOf256, kraftState, rawBits } from './model';
import { orderZeroBits, orderZeroBitsPerChar } from '../../core/entropy';

// Node's real inflate is the oracle. A variable specifier keeps TypeScript and Vite from resolving it at build time.
interface NodeZlib {
  inflateRawSync: (data: Uint8Array) => Uint8Array;
}
const NODE_ZLIB = 'node:zlib';
const zlib = (await import(/* @vite-ignore */ NODE_ZLIB)) as NodeZlib;
const realInflate = (bytes: Uint8Array): string => Array.from(zlib.inflateRawSync(bytes), (b) => String.fromCharCode(b)).join('');

/** A seeded text with repeats: chunks of a small alphabet, sometimes echoed, with bytes above 143 mixed in. */
function seededText(rnd: Rnd): string {
  const alphabetSize = randInt(1, 6, rnd);
  const alphabet = Array.from({ length: alphabetSize }, () => String.fromCharCode(rnd() < 0.15 ? randInt(144, 255, rnd) : randInt(97, 122, rnd)));
  const parts: string[] = [];
  const target = randInt(0, MAX_TEXT, rnd);
  while (parts.join('').length < target) {
    const prior = parts.join('');
    if (prior.length > 3 && rnd() < 0.4) {
      const start = randInt(0, prior.length - 2, rnd);
      parts.push(prior.slice(start, start + randInt(2, 30, rnd)));
    } else {
      parts.push(Array.from({ length: randInt(1, 8, rnd) }, () => alphabet[randInt(0, alphabetSize - 1, rnd)]).join(''));
    }
  }
  return parts.join('').slice(0, target);
}

const SETTINGS = MIN_MATCH_OPTIONS.flatMap((minMatch) => [WINDOW_BOUNDS.min, 7, 32, WINDOW_BOUNDS.max].map((window) => ({ window, minMatch })));

/** Longest match by plain loops, written independently of longestMatch: first start (nearest) wins ties. */
function bruteLongest(text: string, pos: number, window: number): { distance: number; length: number } {
  let best = { distance: 0, length: 0 };
  for (let start = pos - 1; start >= Math.max(0, pos - window); start--) {
    let l = 0;
    while (pos + l < text.length && l < MAX_MATCH && text[start + l] === text[pos + l]) l++;
    if (l > best.length) best = { distance: pos - start, length: l };
  }
  return best;
}

describe('the greedy LZ77 parser', () => {
  it('abracadabra abracadabra is a b r a c a d (7,4) space (12,11): 10 tokens for 23 characters', () => {
    const tokens = parseLz77('abracadabra abracadabra', { window: 32, minMatch: 3 });
    expect(tokens).toHaveLength(10);
    expect(tokens.slice(0, 7).map((t) => (t.kind === 'literal' ? t.char : '?')).join('')).toBe('abracad');
    expect(tokens[7]).toMatchObject({ kind: 'match', distance: 7, length: 4 });
    expect(tokens[8]).toMatchObject({ kind: 'literal', char: ' ' });
    expect(tokens[9]).toMatchObject({ kind: 'match', distance: 12, length: 11 });
  });

  it('aaaaaaaaaa is a then (1, 9): a match whose length exceeds its distance', () => {
    const tokens = parseLz77('aaaaaaaaaa', { window: 32, minMatch: 3 });
    expect(tokens).toMatchObject([{ kind: 'literal', char: 'a' }, { kind: 'match', distance: 1, length: 9 }]);
  });

  it('round-trips 1,000 seeded strings at every minimum match and four window sizes, and every match is valid', () => {
    const rnd = mulberry32(2025);
    for (let t = 0; t < 1000; t++) {
      const text = seededText(rnd);
      for (const { window, minMatch } of SETTINGS) {
        const tokens = parseLz77(text, { window, minMatch });
        expect(decodeTokens(tokens)).toBe(text);
        let pos = 0;
        for (const tok of tokens) {
          expect(tok.pos).toBe(pos);
          if (tok.kind === 'match') {
            expect(tok.distance).toBeGreaterThanOrEqual(1);
            expect(tok.distance).toBeLessThanOrEqual(Math.min(window, pos));
            expect(tok.length).toBeLessThanOrEqual(MAX_MATCH);
            expect(tok.length).toBeGreaterThanOrEqual(minMatch);
            for (let k = 0; k < tok.length; k++) expect(text[pos + k]).toBe(text[pos + k - tok.distance]);
          }
          pos += tokenLength(tok);
        }
        expect(pos).toBe(text.length);
      }
    }
  });

  it('each token is the greedy choice: the longest match in the window, nearest on ties, a literal when it is shorter than the minimum', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 300; t++) {
      const text = seededText(rnd);
      const window = randInt(WINDOW_BOUNDS.min, WINDOW_BOUNDS.max, rnd);
      const minMatch = MIN_MATCH_OPTIONS[randInt(0, 2, rnd)];
      for (const tok of parseLz77(text, { window, minMatch })) {
        const truth = bruteLongest(text, tok.pos, window);
        expect(longestMatch(text, tok.pos, window)).toEqual(truth);
        if (tok.kind === 'match') expect(tok).toMatchObject({ distance: truth.distance, length: truth.length });
        else {
          expect(truth.length).toBeLessThan(minMatch);
          expect(tok.best).toBe(truth.length);
        }
      }
    }
  });

  it('caps a match at 258 characters', () => {
    const tokens = parseLz77('a'.repeat(200), { window: 64, minMatch: 3 });
    expect(Math.max(...tokens.map(tokenLength))).toBeLessThanOrEqual(MAX_MATCH);
    const long = parseLz77('ab'.repeat(200), { window: 64, minMatch: 3 });
    expect(Math.max(...long.map(tokenLength))).toBeLessThanOrEqual(MAX_MATCH);
    expect(decodeTokens(long)).toBe('ab'.repeat(200));
  });
});

describe('the decoder', () => {
  it('the overlap case (1, 9) decodes to ten a, copying one character at a time', () => {
    const tokens: Token[] = [{ kind: 'literal', char: 'a', pos: 0, best: 0 }, { kind: 'match', distance: 1, length: 9, pos: 1 }];
    expect(decodeTokens(tokens)).toBe('aaaaaaaaaa');
  });

  it('a broken decoder that copies as a block fails the overlap case and passes when no match overlaps', () => {
    const tokens = parseLz77('aaaaaaaaaa', { window: 32, minMatch: 3 });
    expect(decodeAsBlock(tokens)).not.toBe('aaaaaaaaaa');
    expect(decodeAsBlock(tokens)).toBe('aa');
    const plain = parseLz77('abracadabra abracadabra', { window: 32, minMatch: 3 });
    expect(decodeAsBlock(plain)).toBe('abracadabra abracadabra');
  });

  it('the block decoder is wrong exactly when some match has length > distance (500 seeded strings)', () => {
    const rnd = mulberry32(4);
    let wrong = 0;
    for (let t = 0; t < 500; t++) {
      const text = seededText(rnd);
      const tokens = parseLz77(text, { window: 32, minMatch: 3 });
      const overlaps = tokens.some((tok) => tok.kind === 'match' && tok.length > tok.distance);
      expect(decodeAsBlock(tokens) === text).toBe(!overlaps);
      if (overlaps) wrong++;
    }
    expect(wrong).toBeGreaterThan(50);
  });
});

describe('the fixed-Huffman DEFLATE block, against real inflate', () => {
  it('Node zlib decodes our bytes back to the text for 1,000 seeded strings at every minimum match and four windows', () => {
    const rnd = mulberry32(777);
    for (let t = 0; t < 1000; t++) {
      const text = seededText(rnd);
      for (const { window, minMatch } of SETTINGS) {
        const { block } = compress(text, { window, minMatch });
        expect(realInflate(block.bytes)).toBe(text);
        expect(block.bytes.length).toBe(Math.ceil(block.totalBits / 8));
      }
    }
  });

  it('every length 3 to 258 round-trips as a match (pins the length table and extra bits, including 258)', () => {
    for (let length = DEFLATE_MIN_MATCH; length <= MAX_MATCH; length++) {
      const text = 'x'.repeat(length + 1);
      const tokens: Token[] = [{ kind: 'literal', char: 'x', pos: 0, best: 0 }, { kind: 'match', distance: 1, length, pos: 1 }];
      expect(realInflate(encodeFixedBlock(tokens).bytes)).toBe(text);
    }
  });

  it('distances across all thirty buckets round-trip (pins the distance table), up to 32768', () => {
    const bases = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 24, 25, 32, 33, 48, 49, 64, 65, 96, 97, 128, 129, 192, 193, 256, 257, 384, 385, 512, 513, 768, 769, 1024, 1025, 1536, 1537, 2048, 2049, 3072, 3073, 4096, 4097, 6144, 6145, 8192, 8193, 12288, 12289, 16384, 16385, 24576, 24577, 32768];
    const rnd = mulberry32(5);
    for (const distance of bases) {
      const prefix = Array.from({ length: distance }, () => String.fromCharCode(randInt(0, 255, rnd)));
      const tokens: Token[] = prefix.map((char, pos) => ({ kind: 'literal', char, pos, best: 0 }));
      tokens.push({ kind: 'match', distance, length: 5, pos: distance });
      // What the copy should produce, one character at a time (a short distance overlaps its own output).
      const out = [...prefix];
      for (let i = 0; i < 5; i++) out.push(out[out.length - distance]);
      expect(realInflate(encodeFixedBlock(tokens).bytes)).toBe(out.join(''));
    }
  });

  it('the pinned sizes: aaaaaaaaaa is 30 bits (4 bytes), abracadabra twice 102 bits (13 bytes), ab x 50 is 3 tokens and 42 bits (6 bytes) against 100 bits of order-0 entropy', () => {
    const opts = { window: 32, minMatch: 3 };
    const a = compress('aaaaaaaaaa', opts);
    expect([a.block.totalBits, a.block.bytes.length]).toEqual([30, 4]);
    const abra = compress('abracadabra abracadabra', opts);
    expect([abra.block.totalBits, abra.block.bytes.length]).toEqual([102, 13]);
    const ab = compress('ab'.repeat(50), opts);
    expect(ab.tokens).toHaveLength(3);
    expect([ab.block.totalBits, ab.block.bytes.length]).toEqual([42, 6]);
    expect(orderZeroBits('ab'.repeat(50))).toBeCloseTo(100, 9);
    expect(orderZeroBitsPerChar('ab'.repeat(50))).toBeCloseTo(1, 12);
    expect(rawBits('ab'.repeat(50))).toBe(800);
    expect(bytesOf(100)).toBe(13);
  });

  it('a 2-long match has no length code, so deflateTokens turns it into literals and the stream still inflates', () => {
    const text = 'abxabyab';
    const tokens = parseLz77(text, { window: 32, minMatch: 2 });
    expect(tokens.some((t) => t.kind === 'match' && t.length === 2)).toBe(true);
    const sent = deflateTokens(tokens, text);
    expect(sent.every((t) => t.kind === 'literal' || t.length >= DEFLATE_MIN_MATCH)).toBe(true);
    expect(sent.map(tokenLength).reduce((s, n) => s + n, 0)).toBe(text.length);
    expect(realInflate(encodeFixedBlock(sent).bytes)).toBe(text);
    expect(() => lengthCode(2)).toThrow();
    expect(() => distanceCode(0)).toThrow();
  });

  it('literal codes are 8 bits to 143, 9 bits from 144, and the end-of-block code is seven zeros', () => {
    expect(fixedLiteralCode(0)).toBe('00110000');
    expect(fixedLiteralCode(143)).toHaveLength(8);
    expect(fixedLiteralCode(144)).toBe('110010000');
    expect(fixedLiteralCode(255)).toHaveLength(9);
    expect(fixedLiteralCode(256)).toBe('0000000');
    expect(fixedLiteralCode(280)).toBe('11000000');
    expect(packBits('1')[0]).toBe(1);
    expect(packBits('0000000001')).toEqual(new Uint8Array([0, 2]));
  });

  it('the browser compression streams, run here by Node, inflate our bytes and report a real size', async () => {
    expect(streamsAvailable()).toBe(true);
    for (const p of TEXT_PRESETS) {
      const { block } = compress(p.text, { window: 32, minMatch: 3 });
      expect(await inflateRaw(block.bytes)).toBe(p.text);
      const size = await realCompressedSize(p.text);
      expect(size).not.toBeNull();
      expect(size!).toBeGreaterThan(0);
    }
    expect(await inflateRaw(new Uint8Array([0xff, 0xff, 0xff]))).toBeNull();
  });

  it('random letters come out larger than they went in: 8 bits a letter plus 10 bits of header and end', () => {
    const random = TEXT_PRESETS.find((p) => p.id === 'random')!.text;
    const { block } = compress(random, { window: 32, minMatch: 3 });
    expect(block.totalBits).toBeGreaterThan(rawBits(random));
    expect(block.totalBits - rawBits(random)).toBeLessThanOrEqual(10 + 2 * 8);
  });
});

describe('canonical codes and the Kraft sum', () => {
  it('the RFC example lengths 3,3,3,3,3,2,4,4 give F = 00, A = 010 ... H = 1111, and the sum is complete', () => {
    const codes = assignCodes(RFC_LENGTHS)!;
    expect(codes).toEqual(['010', '011', '100', '101', '110', '00', '1110', '1111']);
    expect(kraftState(RFC_LENGTHS)).toBe('complete');
    expect(kraftOutOf256(RFC_LENGTHS)).toBe(256);
    expect(isPrefixFree(codes)).toBe(true);
  });

  it('every seeded complete length set gets a prefix code, and the first code of each length counts up from the last', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 300; t++) {
      // Build a complete set by splitting leaves: start from one leaf of depth 0 and split random ones, up to 8 symbols.
      let depths = [0];
      const target = randInt(2, 8, rnd);
      while (depths.length < target) {
        const candidates = depths.map((d, i) => [d, i] as const).filter(([d]) => d < 8);
        const [d, i] = candidates[randInt(0, candidates.length - 1, rnd)];
        depths = [...depths.slice(0, i), d + 1, d + 1, ...depths.slice(i + 1)];
      }
      const lengths = depths.sort(() => rnd() - 0.5);
      expect(kraftState(lengths)).toBe('complete');
      const codes = assignCodes(lengths)!;
      expect(isPrefixFree(codes)).toBe(true);
      codes.forEach((c, i) => expect(c!.length).toBe(lengths[i]));
      // Same-length codes are consecutive in symbol order.
      for (let i = 0; i < lengths.length; i++) {
        for (let j = i + 1; j < lengths.length; j++) if (lengths[i] === lengths[j]) expect(parseInt(codes[i]!, 2)).toBeLessThan(parseInt(codes[j]!, 2));
      }
    }
  });

  it('an oversubscribed set is rejected, an incomplete one still gets a prefix code, and the presets classify as named', () => {
    const states = Object.fromEntries(LENGTH_PRESETS.map((p) => [p.id, kraftState(p.lengths)]));
    expect(states).toEqual({ rfc: 'complete', flat: 'complete', over: 'oversubscribed', under: 'incomplete' });
    expect(assignCodes(LENGTH_PRESETS.find((p) => p.id === 'over')!.lengths)).toBeNull();
    const under = assignCodes(LENGTH_PRESETS.find((p) => p.id === 'under')!.lengths)!;
    expect(isPrefixFree(under)).toBe(true);
    // A shared prefix is caught by the property check.
    expect(isPrefixFree(['0', '01'])).toBe(false);
  });
});

describe('hostile text', () => {
  it('refuses a character above 255 with its code point, and text over 200 characters, but accepts Latin-1 and exactly 200', () => {
    expect(checkText('é')).toEqual({ ok: true, value: 'é' });
    expect(checkText('a'.repeat(MAX_TEXT)).ok).toBe(true);
    const long = checkText('a'.repeat(MAX_TEXT + 1));
    expect(long).toMatchObject({ ok: false });
    if (!long.ok) expect(long.error).toContain('201');
    const emoji = checkText('ab😀');
    expect(emoji).toMatchObject({ ok: false });
    if (!emoji.ok) expect(emoji.error).toContain('U+1F600');
    expect(checkText('日本').ok).toBe(false);
  });

  it('an empty text parses to no tokens and still makes a valid 10-bit block', () => {
    expect(parseLz77('', { window: 32, minMatch: 3 })).toEqual([]);
    const { block } = compress('', { window: 32, minMatch: 3 });
    expect(block.totalBits).toBe(10);
    expect(realInflate(block.bytes)).toBe('');
  });
});
