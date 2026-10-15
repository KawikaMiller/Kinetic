import { describe, expect, it } from 'vitest';
import { averageLength, buildHuffman, canonicalCodes, codeLengths, decode, encode, kraftSum, mergeCost, textWeights, type TieBreak } from './huffman';
import { mulberry32 } from './random';

const TIES: TieBreak[] = ['old', 'new'];
const weighted = (ws: readonly number[]) => ws.map((weight, i) => ({ sym: String.fromCharCode(97 + i), weight }));

describe('buildHuffman over weights', () => {
  it('builds the textbook tree for weights 5, 9, 12, 13, 16, 45 (total cost 224 bits per 100 symbols)', () => {
    for (const tie of TIES) {
      const h = buildHuffman(weighted([5, 9, 12, 13, 16, 45]), tie);
      expect(averageLength(h) * 100).toBeCloseTo(224, 9);
      expect(h.codes.get('f')).toHaveLength(1);
      expect(h.merges.map((m) => h.nodes[m.parent].weight)).toEqual([14, 25, 30, 55, 100]);
    }
  });

  it('works with probabilities, and the cost is the sum of the merge weights', () => {
    const p = [0.35, 0.2, 0.15, 0.1, 0.08, 0.06, 0.04, 0.02];
    const h = buildHuffman(weighted(p), 'old');
    expect(averageLength(h)).toBeCloseTo(mergeCost(p), 12);
    expect(kraftSum([...codeLengths(h).values()])).toBeCloseTo(1, 12);
    const entropy = -p.reduce((s, x) => s + x * Math.log2(x), 0);
    expect(averageLength(h)).toBeGreaterThanOrEqual(entropy);
    expect(averageLength(h)).toBeLessThan(entropy + 1);
  });

  it('gives a lone symbol the code 0, and refuses no symbols or non-positive weights', () => {
    expect(buildHuffman(weighted([3]), 'old').codes.get('a')).toBe('0');
    expect(() => buildHuffman([], 'old')).toThrow(RangeError);
    expect(() => buildHuffman(weighted([1, 0]), 'old')).toThrow(RangeError);
  });

  it('round-trips seeded random texts with both tie-breaks, and the codes form a prefix code', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const text = Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => 'abcdefg'[Math.floor(rnd() * 7)]).join('');
      for (const tie of TIES) {
        const h = buildHuffman(textWeights(text), tie);
        expect(decode(h, encode(h, text))).toBe(text);
        const codes = [...h.codes.values()];
        for (const a of codes) for (const b of codes) if (a !== b) expect(b.startsWith(a)).toBe(false);
      }
    }
  });
});

describe('canonicalCodes', () => {
  it('assigns the RFC 1951 example (lengths 3,3,3,3,3,2,4,4 for A..H)', () => {
    expect(canonicalCodes([3, 3, 3, 3, 3, 2, 4, 4])).toEqual(['010', '011', '100', '101', '110', '00', '1110', '1111']);
  });

  it('leaves unused symbols (length 0) null and counts up in symbol order within a length', () => {
    expect(canonicalCodes([2, 0, 1, 2])).toEqual(['10', null, '0', '11']);
    expect(canonicalCodes([])).toEqual([]);
  });

  it('gives a prefix code with the right lengths on 300 seeded complete length sets (Kraft sum 1)', () => {
    const rnd = mulberry32(9);
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rnd() * 12);
      const weights = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 50));
      const h = buildHuffman(weighted(weights), t % 2 ? 'old' : 'new');
      const lengths = h.symbols.map((s) => h.codes.get(s)!.length);
      expect(kraftSum(lengths)).toBeCloseTo(1, 12);
      const codes = canonicalCodes(lengths) as string[];
      codes.forEach((c, i) => expect(c).toHaveLength(lengths[i]));
      codes.forEach((a, i) => codes.forEach((b, j) => i !== j && expect(b.startsWith(a)).toBe(false)));
      // Canonical: sorted by (length, symbol index), the codes are increasing as numbers once padded to the longest.
      const max = Math.max(...lengths);
      const order = lengths.map((_, i) => i).sort((x, y) => lengths[x] - lengths[y] || x - y);
      const padded = order.map((i) => parseInt(codes[i].padEnd(max, '0'), 2));
      padded.forEach((v, i) => i > 0 && expect(v).toBeGreaterThan(padded[i - 1]));
    }
  });

  it('rejects oversubscribed and malformed lengths, and reports incomplete sets by their Kraft sum', () => {
    expect(() => canonicalCodes([1, 1, 1])).toThrow(RangeError);
    expect(() => canonicalCodes([2, -1])).toThrow(RangeError);
    expect(() => canonicalCodes([1.5])).toThrow(RangeError);
    expect(kraftSum([1, 1, 1])).toBe(1.5);
    expect(kraftSum([2, 2, 2])).toBe(0.75);
    expect(canonicalCodes([2, 2, 2])).toEqual(['00', '01', '10']);
  });
});
