import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  BELIEF_PRESETS, BLOCK_LENGTHS, TRUE_DIST, binaryEntropy, blockBitsPerFlip, clampText, crossEntropy, entropy, excessBits, generatedBits,
  possibilities, setBelief, surprise, textEntropy, MAX_TEXT,
} from './model';
import {
  ITEMS, ITEM_ENTROPY, ITEM_PROBS, OPTIMAL_QUESTIONS, balancedYesSet, evenByCount, expectedQuestions, hintSplit, leaves, mass, openSets, optimalTree, rootNode, split,
  type QNode, type QPath,
} from './questions';

/** Independent Huffman cost: the sum of every merge's weight (equals the expected code length for probabilities). */
function mergeCostByHand(weights: number[]): number {
  const pool = [...weights];
  let cost = 0;
  while (pool.length > 1) {
    pool.sort((a, b) => a - b);
    const merged = pool[0] + pool[1];
    cost += merged;
    pool.splice(0, 2, merged);
  }
  return cost;
}

/** Broken Huffman: merges the two HEAVIEST each time. */
function brokenMergeCost(weights: number[]): number {
  const pool = [...weights];
  let cost = 0;
  while (pool.length > 1) {
    pool.sort((a, b) => b - a);
    const merged = pool[0] + pool[1];
    cost += merged;
    pool.splice(0, 2, merged);
  }
  return cost;
}

function randomProbs(rnd: () => number, n: number): number[] {
  const w = Array.from({ length: n }, () => 0.05 + rnd());
  const total = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / total);
}

describe('entropy of a coin', () => {
  it('matches the pinned values', () => {
    expect(binaryEntropy(0.5)).toBe(1);
    expect(binaryEntropy(0.25)).toBeCloseTo(0.8113, 4);
    expect(binaryEntropy(0.1)).toBeCloseTo(0.469, 4);
    expect(binaryEntropy(0.01)).toBeCloseTo(0.0808, 4);
  });

  it('is exactly 0 at p = 0 and p = 1 (0 log 0 = 0), and never negative zero', () => {
    expect(binaryEntropy(0)).toBe(0);
    expect(binaryEntropy(1)).toBe(0);
    expect(Object.is(binaryEntropy(1), 0)).toBe(true);
  });

  it('equals the closed form -p log2 p - (1-p) log2 (1-p) on a grid and is symmetric', () => {
    for (let i = 1; i < 100; i++) {
      const p = i / 100;
      expect(binaryEntropy(p)).toBeCloseTo(-p * Math.log2(p) - (1 - p) * Math.log2(1 - p), 12);
      expect(binaryEntropy(p)).toBeCloseTo(binaryEntropy(1 - p), 12);
    }
  });

  it('surprise is -log2 p, and unbounded for an impossible outcome', () => {
    expect(surprise(0.5)).toBe(1);
    expect(surprise(0.125)).toBe(3);
    expect(surprise(0)).toBe(Infinity);
  });
});

describe('block coding', () => {
  it('bits per flip at p = 0.1 for k = 1..4 are the pinned 1.0000, 0.6450, 0.5327, 0.4926, above the entropy 0.4690', () => {
    const pinned = [1.0, 0.645, 0.5327, 0.4926];
    BLOCK_LENGTHS.forEach((k, i) => expect(blockBitsPerFlip(0.1, k)).toBeCloseTo(pinned[i], 4));
    for (const k of BLOCK_LENGTHS) expect(blockBitsPerFlip(0.1, k)).toBeGreaterThan(binaryEntropy(0.1));
  });

  it('equals an independent merge-cost Huffman, stays in [H, H + 1/k), and does not rise with k at powers of two', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 300; t++) {
      const p = 0.01 + 0.98 * rnd();
      for (const k of BLOCK_LENGTHS) {
        const weights: number[] = [];
        for (let mask = 0; mask < 2 ** k; mask++) {
          const heads = [...mask.toString(2)].filter((b) => b === '1').length;
          weights.push(p ** heads * (1 - p) ** (k - heads));
        }
        const bits = blockBitsPerFlip(p, k);
        expect(bits).toBeCloseTo(mergeCostByHand(weights) / k, 9);
        expect(bits).toBeGreaterThanOrEqual(binaryEntropy(p) - 1e-12);
        expect(bits).toBeLessThan(binaryEntropy(p) + 1 / k + 1e-12);
      }
      expect(blockBitsPerFlip(p, 2)).toBeLessThanOrEqual(blockBitsPerFlip(p, 1) + 1e-12);
      expect(blockBitsPerFlip(p, 4)).toBeLessThanOrEqual(blockBitsPerFlip(p, 2) + 1e-12);
    }
  });

  it('a certain flip costs 1 / k bits per flip (a lone symbol still needs a 1-bit codeword) while its entropy is 0', () => {
    for (const k of BLOCK_LENGTHS) {
      expect(blockBitsPerFlip(0, k)).toBeCloseTo(1 / k, 12);
      expect(blockBitsPerFlip(1, k)).toBeCloseTo(1 / k, 12);
    }
  });
});

describe('order-0 entropy of text', () => {
  it('matches the pinned examples', () => {
    expect(textEntropy('aaaaaaaa')!.bitsPerChar).toBe(0);
    expect(textEntropy('abababab')!.bitsPerChar).toBe(1);
    expect(textEntropy('mississippi')!.bitsPerChar).toBeCloseTo(1.823, 3);
    const pw = textEntropy('password')!;
    expect(pw.bitsPerChar).toBe(2.75);
    expect(pw.totalBits).toBe(22);
  });

  it('equals the independent form log2 n - (1/n) sum c log2 c on 1,000 seeded strings', () => {
    const rnd = mulberry32(77);
    const alphabet = 'abcdefghij αβγ☃';
    const glyphs = Array.from(alphabet);
    for (let t = 0; t < 1000; t++) {
      const n = randInt(1, 60, rnd);
      const size = randInt(1, glyphs.length, rnd);
      const text = Array.from({ length: n }, () => glyphs[randInt(0, size - 1, rnd)]).join('');
      const counts = new Map<string, number>();
      for (const c of Array.from(text)) counts.set(c, (counts.get(c) ?? 0) + 1);
      let sum = 0;
      for (const c of counts.values()) sum += c * Math.log2(c);
      expect(textEntropy(text)!.bitsPerChar).toBeCloseTo(Math.log2(n) - sum / n, 10);
    }
  });

  it('an empty text has no symbols (null, never NaN), and text is cut at 500 code points', () => {
    expect(textEntropy('')).toBeNull();
    const long = '😀'.repeat(MAX_TEXT + 40);
    expect(Array.from(clampText(long))).toHaveLength(MAX_TEXT);
    expect(textEntropy(clampText(long))!.n).toBe(MAX_TEXT);
    expect(textEntropy('é')!.nonAscii).toBe(true);
    expect(textEntropy('e')!.nonAscii).toBe(false);
  });
});

describe('generated secrets', () => {
  it('L x log2 N gives the pinned values', () => {
    expect(generatedBits(12, 62)).toBeCloseTo(71.45, 2);
    expect(generatedBits(4, 7776)).toBeCloseTo(51.7, 2);
    expect(generatedBits(6, 10)).toBeCloseTo(19.93, 2);
    expect(7776).toBe(6 ** 5);
  });

  it('every allowed length and alphabet gives a finite power of two', () => {
    for (const [l, n] of [[1, 2], [64, 256], [64, 2], [1, 256]]) expect(Number.isFinite(2 ** generatedBits(l, n))).toBe(true);
    expect(possibilities(71.45)).toMatch(/^\d\.\de\d+$/);
  });
});

describe('twenty questions', () => {
  it('the distribution sums to 1 and has entropy 2.571 bits', () => {
    expect(ITEM_PROBS.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 12);
    expect(ITEM_ENTROPY).toBeCloseTo(2.571, 3);
  });

  it('even splits by count cost exactly 3.000 questions, the optimal tree 2.63', () => {
    expect(expectedQuestions(evenByCount(ITEMS.map((_, i) => i)))).toBeCloseTo(3, 12);
    expect(OPTIMAL_QUESTIONS).toBeCloseTo(2.63, 10);
    expect(OPTIMAL_QUESTIONS).toBeGreaterThanOrEqual(ITEM_ENTROPY);
  });

  /** opt(S) = w(S) + min over proper splits of opt(A) + opt(S \ A): the minimum expected questions over every question tree. */
  function dpOptimum(probs: number[]): number {
    const n = probs.length;
    const full = (1 << n) - 1;
    const w = new Array<number>(full + 1).fill(0);
    for (let m = 1; m <= full; m++) w[m] = w[m & (m - 1)] + probs[Math.log2(m & -m)];
    const opt = new Array<number>(full + 1).fill(0);
    for (let m = 1; m <= full; m++) {
      if ((m & (m - 1)) === 0) continue;
      let best = Infinity;
      for (let a = (m - 1) & m; a > 0; a = (a - 1) & m) best = Math.min(best, opt[a] + opt[m ^ a]);
      opt[m] = w[m] + best;
    }
    return opt[full];
  }

  it('the subset dynamic programme equals the Huffman average on 300 seeded distributions of up to 10 items, and the real distribution', () => {
    const rnd = mulberry32(2024);
    for (let t = 0; t < 300; t++) {
      const probs = randomProbs(rnd, randInt(2, 10, rnd));
      expect(expectedQuestions(optimalTree(probs), probs)).toBeCloseTo(dpOptimum(probs), 9);
    }
    expect(dpOptimum([...ITEM_PROBS])).toBeCloseTo(OPTIMAL_QUESTIONS, 12);
  });

  function randomTree(rnd: () => number, items: number[]): QNode {
    if (items.length === 1) return { items };
    let yes = items.filter(() => rnd() < 0.5);
    if (yes.length === 0 || yes.length === items.length) yes = [items[0]];
    const no = items.filter((i) => !yes.includes(i));
    return { items, yes: randomTree(rnd, yes), no: randomTree(rnd, no) };
  }

  it('every random question tree costs at least the entropy and at least the optimum (Gibbs and Kraft), over 2,000 trees', () => {
    const rnd = mulberry32(8);
    for (let t = 0; t < 2000; t++) {
      const probs = t % 2 === 0 ? [...ITEM_PROBS] : randomProbs(rnd, randInt(2, 9, rnd));
      const tree = randomTree(rnd, probs.map((_, i) => i));
      const cost = expectedQuestions(tree, probs)!;
      expect(cost).toBeGreaterThanOrEqual(entropy(probs) - 1e-12);
      expect(cost).toBeGreaterThanOrEqual(dpOptimum(probs) - 1e-12);
    }
  });

  it('a broken Huffman that merges the two heaviest exceeds the optimum on a seeded distribution', () => {
    const rnd = mulberry32(3);
    const probs = randomProbs(rnd, 8);
    expect(brokenMergeCost(probs)).toBeGreaterThan(mergeCostByHand(probs) + 1e-6);
    expect(brokenMergeCost([...ITEM_PROBS])).toBeGreaterThan(OPTIMAL_QUESTIONS + 1e-6);
    expect(mergeCostByHand([...ITEM_PROBS])).toBeCloseTo(OPTIMAL_QUESTIONS, 12);
  });

  it('split refuses an empty yes side, an all-yes side, an already split set and a missing path', () => {
    const root = rootNode(ITEMS.length);
    expect(split(root, [], [])).toMatchObject({ ok: false });
    expect(split(root, [], root.items)).toMatchObject({ ok: false });
    const once = split(root, [], [0, 1]);
    expect(once.ok).toBe(true);
    if (once.ok) {
      expect(split(once.value, [], [0])).toMatchObject({ ok: false, error: 'That set is already split.' });
      expect(split(once.value, [0, 0, 1] as QPath, [0])).toMatchObject({ ok: false });
      expect(once.value.yes!.items).toEqual([0, 1]);
      expect(once.value.no!.items).toEqual([2, 3, 4, 5, 6, 7]);
      expect(expectedQuestions(once.value)).toBeNull();
      expect(openSets(once.value)).toHaveLength(2);
    }
  });

  it('the hint splits by probability mass: its first split is the subset closest to half, and finishing it never beats the optimum', () => {
    const all = ITEMS.map((_, i) => i);
    const yes = balancedYesSet(all);
    // Brute force over every subset: no subset has mass closer to 1/2.
    const gap = Math.abs(mass(yes) - 0.5);
    for (let m = 1; m < 2 ** all.length - 1; m++) {
      expect(Math.abs(mass(all.filter((_, b) => (m >> b) & 1)) - 0.5)).toBeGreaterThanOrEqual(gap - 1e-12);
    }
    let tree = rootNode(ITEMS.length);
    for (let guard = 0; guard < 20 && openSets(tree).length > 0; guard++) {
      const next = hintSplit(tree);
      expect(next.ok).toBe(true);
      if (next.ok) tree = next.value;
    }
    expect(openSets(tree)).toHaveLength(0);
    expect(leaves(tree)).toHaveLength(ITEMS.length);
    expect(expectedQuestions(tree)!).toBeGreaterThanOrEqual(OPTIMAL_QUESTIONS - 1e-12);
    expect(hintSplit(tree)).toMatchObject({ ok: false });
  });
});

describe('the cost of a wrong belief', () => {
  it('q uniform costs 0.085 bits per outcome against p = 0.5, 0.25, 0.25, and q = p costs nothing', () => {
    expect(entropy(TRUE_DIST)).toBe(1.5);
    expect(excessBits(TRUE_DIST, [1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(0.085, 3);
    expect(excessBits(TRUE_DIST, TRUE_DIST)).toBeCloseTo(0, 12);
    expect(crossEntropy(TRUE_DIST, TRUE_DIST)).toBeCloseTo(entropy(TRUE_DIST), 12);
  });

  it('H(p, q) >= H(p) with equality only at q = p, on 1,000 seeded pairs', () => {
    const rnd = mulberry32(12);
    for (let t = 0; t < 1000; t++) {
      const n = randInt(2, 6, rnd);
      const p = randomProbs(rnd, n);
      const q = randomProbs(rnd, n);
      const excess = excessBits(p, q);
      expect(excess).toBeGreaterThanOrEqual(-1e-12);
      const equal = p.every((x, i) => Math.abs(x - q[i]) < 1e-12);
      if (!equal) expect(excess).toBeGreaterThan(0);
      expect(excessBits(p, p)).toBeCloseTo(0, 12);
    }
  });

  it('a zero where p is positive makes the cross-entropy infinite; a zero where p is zero does not', () => {
    expect(crossEntropy([0.5, 0.25, 0.25], [0.5, 0.5, 0])).toBe(Infinity);
    expect(excessBits([0.5, 0.25, 0.25], [0.5, 0.5, 0])).toBe(Infinity);
    expect(crossEntropy([0.5, 0.5, 0], [0.4, 0.6, 0])).toBeCloseTo(-0.5 * Math.log2(0.4) - 0.5 * Math.log2(0.6), 12);
    expect(BELIEF_PRESETS.find((b) => b.id === 'zero')!.q.some((x) => x === 0)).toBe(true);
  });

  it('moving one belief rescales the others and the belief still sums to 1, over a seeded walk', () => {
    const rnd = mulberry32(21);
    let q: number[] = [0.2, 0.3, 0.5];
    for (let t = 0; t < 500; t++) {
      const i = randInt(0, 2, rnd);
      const v = rnd();
      q = setBelief(q, i, v);
      expect(q[0] + q[1] + q[2]).toBeCloseTo(1, 12);
      expect(q[i]).toBeCloseTo(v, 12);
      expect(q.every((x) => x >= 0)).toBe(true);
    }
    expect(setBelief([1, 0, 0], 0, 0.4)).toEqual([0.4, 0.3, 0.3]);
    const kept = setBelief([0.5, 0.25, 0.25], 0, 0.2);
    expect(kept[1] / kept[2]).toBeCloseTo(1, 12);
  });
});
