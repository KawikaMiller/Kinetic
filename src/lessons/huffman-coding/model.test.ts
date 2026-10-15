import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { buildFrames, decodeFrames, framesFor, type Mode } from './frames';
import { decode, decodeSteps, depthOf, frequencies, type TieBreak } from '../../core/huffman';
import { buildHuffman, costs, DEFAULT_TEXT, encode, forcedOneBitCost, MAX_CHARS, parseMessage } from './model';
import lesson from './index';

const TIES: TieBreak[] = ['old', 'new'];
const MODES: Mode[] = ['build', 'decode'];

/** A seeded message over a small skewed alphabet, 1-40 characters. */
function randomText(rnd: Rnd): string {
  const alphabet = 'abcdefghij '.slice(0, randInt(1, 11, rnd));
  const len = randInt(1, MAX_CHARS, rnd);
  // Squaring the uniform draw skews counts towards the first letters.
  return Array.from({ length: len }, () => alphabet[Math.floor(rnd() ** 2 * alphabet.length)]).join('');
}

/** Reference Huffman cost, written independently: sort, add the two smallest, repeat. */
function referenceCost(counts: number[]): number {
  let xs = counts.slice();
  let total = 0;
  while (xs.length > 1) {
    xs.sort((a, b) => a - b);
    const s = xs[0] + xs[1];
    total += s;
    xs = [s, ...xs.slice(2)];
  }
  return xs.length === 1 && counts.length === 1 ? counts[0] : total;
}

/** Leaf depths of every full binary tree with k leaves (left to right). */
function allShapes(k: number): number[][] {
  if (k === 1) return [[0]];
  const out: number[][] = [];
  for (let i = 1; i < k; i++) {
    for (const l of allShapes(i)) for (const r of allShapes(k - i)) out.push([...l, ...r].map((d) => d + 1));
  }
  return out;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Brute-force optimum over every full binary tree and every assignment of symbols to leaves. */
function bruteForceCost(counts: number[]): number {
  if (counts.length === 1) return counts[0];
  let best = Infinity;
  for (const depths of allShapes(counts.length)) {
    for (const p of permutations(counts)) best = Math.min(best, p.reduce((s, c, i) => s + c * depths[i], 0));
  }
  return best;
}

/** Same brute force, with the heaviest symbol pinned to depth 1. */
function bruteForceOneBit(counts: number[]): number {
  const sorted = [...counts].sort((a, b) => b - a);
  if (sorted.length === 1) return sorted[0];
  let best = Infinity;
  for (const depths of allShapes(sorted.length)) {
    for (const p of permutations(sorted.slice(1))) {
      for (let slot = 0; slot < depths.length; slot++) {
        if (depths[slot] !== 1) continue;
        const rest = depths.filter((_, i) => i !== slot);
        best = Math.min(best, sorted[0] + p.reduce((s, c, i) => s + c * rest[i], 0));
      }
    }
  }
  return best;
}

const counts = (text: string) => frequencies(text).map((f) => f.count);

describe('huffman-coding model', () => {
  it('total bits = Σ count × depth and equal the reference cost on 200 seeded strings, both tie-breaks', () => {
    const rnd = mulberry32(1952);
    for (let t = 0; t < 200; t++) {
      const text = randomText(rnd);
      for (const tie of TIES) {
        const h = buildHuffman(text, tie);
        const total = encode(h).length;
        const byDepth = h.leaves.reduce((s, id) => s + h.nodes[id].weight * Math.max(1, depthOf(h, id)), 0);
        expect(total).toBe(byDepth);
        expect(total).toBe(referenceCost(counts(text)));
      }
    }
  });

  it('is optimal against brute force over every full binary tree, alphabets of 1-5 symbols', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 150; t++) {
      const k = randInt(1, 5, rnd);
      const text = Array.from({ length: k }, (_, i) => 'vwxyz'[i].repeat(randInt(1, 9, rnd))).join('');
      const best = bruteForceCost(counts(text));
      for (const tie of TIES) expect(encode(buildHuffman(text, tie)).length).toBe(best);
      expect(forcedOneBitCost(text)).toBe(bruteForceOneBit(counts(text)));
    }
  });

  it('every code set is prefix-free, and decode(encode(s)) = s, on 200 seeded strings', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 200; t++) {
      const text = randomText(rnd);
      for (const tie of TIES) {
        const h = buildHuffman(text, tie);
        const codes = [...h.codes.values()];
        codes.forEach((a, i) => codes.forEach((b, j) => i !== j && expect(b.startsWith(a)).toBe(false)));
        expect(decode(h, encode(h))).toBe(text);
      }
    }
  });

  it('bits per symbol sit in [entropy, entropy + 1) with 2+ symbols; heavier symbols never get longer codes', () => {
    const rnd = mulberry32(3);
    for (let t = 0; t < 200; t++) {
      const text = randomText(rnd);
      const h = buildHuffman(text, t % 2 ? 'old' : 'new');
      const c = costs(h);
      const perSymbol = c.huffman / c.n;
      expect(perSymbol).toBeGreaterThanOrEqual(c.entropy - 1e-9);
      if (c.distinct >= 2) expect(perSymbol).toBeLessThan(c.entropy + 1);
      const freq = frequencies(text);
      freq.forEach((a) => freq.forEach((b) => a.count > b.count && expect(h.codes.get(a.sym)!.length).toBeLessThanOrEqual(h.codes.get(b.sym)!.length)));
    }
  });

  it('both tie-breaks give the same total, and on the default text they build different codes', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const text = randomText(rnd);
      expect(encode(buildHuffman(text, 'old')).length).toBe(encode(buildHuffman(text, 'new')).length);
    }
    const a = buildHuffman(DEFAULT_TEXT, 'old');
    const b = buildHuffman(DEFAULT_TEXT, 'new');
    expect([...a.codes].some(([s, code]) => b.codes.get(s) !== code)).toBe(true);
  });

  it('a single distinct character gets a 1-bit code', () => {
    const h = buildHuffman('aaaa', 'old');
    expect(h.codes.get('a')).toBe('0');
    expect(encode(h)).toBe('0000');
    expect(decode(h, '0000')).toBe('aaaa');
    expect(decodeSteps(h, '00').every((s) => s.emitted === 'a')).toBe(true);
  });

  it('the numbers the quiz and tips quote', () => {
    const c = costs(buildHuffman(DEFAULT_TEXT, 'old'));
    expect([c.n, c.distinct, c.fixedWidth, c.fixedBits, c.huffman, c.ascii]).toEqual([17, 8, 3, 51, 46, 136]);
    for (const tie of TIES) expect(buildHuffman(DEFAULT_TEXT, tie).codes.get('i')!.length).toBe(2);
    expect(forcedOneBitCost(DEFAULT_TEXT)).toBeGreaterThan(46);
    const even = costs(buildHuffman('abcd', 'old'));
    expect(even.huffman).toBe(even.fixedBits);
    const skew = costs(buildHuffman('aaaaaaabcd', 'old'));
    expect(skew.huffman).toBeLessThan(skew.fixedBits);
    expect(costs(buildHuffman('aaaa', 'old'))).toMatchObject({ huffman: 4, ascii: 32 });
    const q = lesson.quiz[3];
    expect(q.options[q.answer]).toBe(String(c.fixedBits));
  });
});

describe('parseMessage (hostile input)', () => {
  it.each([
    ['', 'Type at least one character'],
    ['x'.repeat(MAX_CHARS + 1), 'Keep it to 40 characters (that\'s 41)'],
    ['hi 😀', 'plain ASCII'],
    ['tab\there', 'plain ASCII'],
    ['café', 'plain ASCII'],
  ])('refuses %j with a message', (raw, msg) => {
    const r = parseMessage(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it.each(['   ', '<b>bold</b>', '1e400', '-1', '12345678901234567890123', 'a,,b', 'x'.repeat(MAX_CHARS)])('accepts %j as plain characters', (raw) => {
    const r = parseMessage(raw);
    expect(r).toEqual({ ok: true, text: raw });
    if (r.ok) expect(decode(buildHuffman(r.text, 'old'), encode(buildHuffman(r.text, 'old')))).toBe(raw);
  });

  it('counts an emoji as one character for the length limit, so it is refused for being non-ASCII, not for length', () => {
    const r = parseMessage('😀'.repeat(MAX_CHARS));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('plain ASCII');
  });
});

describe('huffman-coding frames', () => {
  const texts = [DEFAULT_TEXT, 'aaaa', 'ab', 'abracadabra', 'she sells sea shells', '<b>'];

  it('every mode × tie-break × text ends on a caption computed from the model', () => {
    for (const text of texts) {
      for (const tie of TIES) {
        for (const mode of MODES) {
          const h = buildHuffman(text, tie);
          const frames = framesFor(mode, h, tie);
          const last = captionText(frames[frames.length - 1].say);
          const c = costs(h);
          if (mode === 'build') {
            expect(last).toContain(c.distinct === 1 ? `${c.huffman} bits in all` : `Total ${c.huffman} bits`);
            expect(last).toContain(String(c.ascii));
          } else {
            expect(last).toContain(`All ${c.huffman} bit`);
            expect(last).toContain('no separators');
          }
          expect(frames.every((f) => f.say !== undefined)).toBe(true);
        }
      }
    }
  });

  it('the single-character input gets its own caption', () => {
    const h = buildHuffman('aaaa', 'old');
    const last = captionText(buildFrames(h, 'old').at(-1)!.say);
    expect(last).toContain('Only one distinct character');
    expect(last).toContain('1-bit code');
    expect(captionText(decodeFrames(h)[0].say)).toContain('single leaf');
  });

  it('build frames merge exactly the two lightest trees, and say a tie was broken only when one was', () => {
    for (const text of texts) {
      for (const tie of TIES) {
        const h = buildHuffman(text, tie);
        const frames = buildFrames(h, tie);
        const picks = frames.filter((f) => f.merging.length === 2);
        expect(picks.length).toBe(h.merges.length);
        picks.forEach((f, i) => {
          const weights = f.roots.map((id) => h.nodes[id].weight);
          const [a, b] = f.merging.map((id) => h.nodes[id].weight);
          const others = weights.filter((_, k) => !f.merging.includes(f.roots[k]));
          expect(others.every((w) => w >= Math.max(a, b))).toBe(true);
          const tiedLeft = others.some((w) => w === b);
          expect(captionText(f.say).includes('ties go to')).toBe(tiedLeft);
          expect(f.merging).toEqual([h.merges[i].a, h.merges[i].b]);
        });
      }
    }
  });

  it('decode frames output the text one symbol at a time', () => {
    for (const text of texts) {
      const h = buildHuffman(text, 'old');
      const frames = decodeFrames(h);
      const out = frames.flatMap((f) => (f.emitted ? [f.emitted] : [])).join('');
      expect(out).toBe(text);
      expect(frames.at(-1)!.decoded).toBe(text);
    }
  });

  it('the default text explains why its commonest letter is not 1 bit, with a computed cost', () => {
    const h = buildHuffman(DEFAULT_TEXT, 'old');
    const last = captionText(buildFrames(h, 'old').at(-1)!.say);
    expect(last).toContain(`cost ${forcedOneBitCost(DEFAULT_TEXT)} bits in all, ${forcedOneBitCost(DEFAULT_TEXT) - 46} more`);
  });
});

describe('the closing caption names ties as ties', () => {
  const closing = (text: string, tie: TieBreak) => captionText(buildFrames(buildHuffman(text, tie), tie).at(-1)!.say);
  /** Counts per symbol, recounted here rather than taken from the model. */
  const countOf = (text: string) => {
    const m = new Map<string, number>();
    for (const ch of text) m.set(ch, (m.get(ch) ?? 0) + 1);
    return m;
  };
  const unshow = (s: string) => (s === '␣' ? ' ' : s);

  it('all-equal counts: no commonest or rarest is named', () => {
    for (const text of ['abcd', 'ab', 'aabb', 'abcabc']) {
      for (const tie of TIES) {
        const end = closing(text, tie);
        expect(end, text).toContain('characters appear ×');
        expect(end, text).not.toMatch(/the (commonest|rarest)/);
        expect(end, text).not.toContain('Forcing');
      }
    }
  });

  it('the reviewer repros: tied rarest in aaaaaaabcd, a 1-bit tied commonest in aabbc', () => {
    const rare = closing('aaaaaaabcd', 'old');
    expect(rare).toContain('tie as rarest (×1 each)');
    expect(rare).not.toContain('the rarest');
    const top = closing('aabbc', 'new');
    expect(top).toContain('tie as commonest (×2 each)');
    expect(top).not.toContain('Forcing');
  });

  it('on 200 seeded strings, a single named commonest or rarest really is unique, and the forcing note only appears when no commonest symbol has 1 bit', () => {
    const rnd = mulberry32(404);
    for (let t = 0; t < 200; t++) {
      const text = randomText(rnd);
      const counts = countOf(text);
      const max = Math.max(...counts.values());
      const min = Math.min(...counts.values());
      for (const tie of TIES) {
        const end = closing(text, tie);
        const h = buildHuffman(text, tie);
        const top = end.match(/the commonest, ‘(.)’ ×(\d+)/);
        if (top) {
          expect(counts.get(unshow(top[1]))).toBe(max);
          expect([...counts.values()].filter((c) => c === max)).toHaveLength(1);
        }
        const rare = end.match(/the rarest, ‘(.)’ ×(\d+)/);
        if (rare) {
          expect(counts.get(unshow(rare[1]))).toBe(min);
          expect([...counts.values()].filter((c) => c === min)).toHaveLength(1);
        }
        const topHasOneBit = [...counts].some(([s, c]) => c === max && h.codes.get(s)!.length === 1);
        if (end.includes('Forcing')) expect(topHasOneBit).toBe(false);
        if (counts.size > 1 && max !== min && !topHasOneBit) expect(end).toContain('Forcing');
      }
    }
  });
});
