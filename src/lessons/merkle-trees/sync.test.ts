import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { buildTree, flatten, rootHash } from './merkle';
import {
  REPLICA_LEAVES, SYNC_SEEDS, baseLeaves, comparisonBound, directDiff, expectedComparisons, findDiffs, lowestMiss, runSync, seededReplicas,
} from './sync';

describe('anti-entropy with a 256-bit hash', () => {
  it('finds exactly the leaves a direct diff finds, over 200 seeded edit sets, and ends with equal trees', () => {
    for (const seed of SYNC_SEEDS) {
      const { a, b } = seededReplicas(seed);
      const r = runSync('sha256', a, b);
      expect(r.found, `seed ${seed}`).toEqual(directDiff(a, b));
      expect(r.missed).toEqual([]);
      expect(r.after).toEqual(b);
      expect(rootHash('sha256', r.after)).toBe(rootHash('sha256', b));
    }
  });

  it('makes at most 1 + 2 k ceil(log2 n) comparisons, and exactly the number the tree shape predicts (counted without hashing)', () => {
    for (const seed of SYNC_SEEDS) {
      const { a, b, k } = seededReplicas(seed);
      const r = runSync('sha256', a, b);
      expect(r.comparisons, `seed ${seed}`).toBeLessThanOrEqual(comparisonBound(REPLICA_LEAVES, k));
      expect(r.comparisons).toBe(expectedComparisons(REPLICA_LEAVES, directDiff(a, b)));
    }
  });

  it('equal replicas cost one comparison, the roots, and one difference costs 1 + 2 per level', () => {
    const base = baseLeaves(REPLICA_LEAVES);
    expect(runSync('sha256', base, base)).toMatchObject({ comparisons: 1, found: [], rounds: 1 });
    const one = [...base];
    one[5] = 'changed';
    expect(runSync('sha256', base, one).comparisons).toBe(1 + 2 * 4);
    expect(runSync('sha256', base, one).rounds).toBe(5);
  });

  it('the message-passing run and the direct descent agree on the leaves and the count', () => {
    for (const seed of SYNC_SEEDS.slice(0, 60)) {
      const { a, b } = seededReplicas(seed);
      const msg = runSync('sha256', a, b);
      const direct = findDiffs('sha256', a, b);
      expect(direct.found).toEqual(msg.found);
      expect(direct.comparisons).toBe(msg.comparisons);
    }
  });

  it('on 1,000 leaves with k differences the comparisons grow with k log2 n, not with n (counted from the shape)', () => {
    const rnd = mulberry32(3);
    for (const n of [16, 256, 1024, 4096]) {
      for (const k of [1, 3, 6]) {
        const diffs = new Set<number>();
        while (diffs.size < k) diffs.add(Math.floor(rnd() * n));
        const c = expectedComparisons(n, diffs);
        expect(c).toBeLessThanOrEqual(comparisonBound(n, k));
        if (n >= 256) expect(c).toBeLessThan(n);
      }
    }
    expect(expectedComparisons(1024, [500])).toBe(1 + 2 * 10);
  });

  it('the quiz case: 1,024 blocks and one difference is 21 comparisons against 1,024 for the naive way', () => {
    expect(expectedComparisons(1024, [0])).toBe(21);
    expect(expectedComparisons(1024, [1023])).toBe(21);
  });
});

describe('the toy 8-bit hash misses a difference', () => {
  it('the lowest failing seed of 0..199 is pinned at 10, and the 256-bit hash misses none of the 200', () => {
    expect(lowestMiss('toy8')).toBe(10);
    expect(lowestMiss('sha256')).toBeUndefined();
  });

  it('for the stated reason: the node where the descent stopped had different full hashes and equal 8-bit ones (a real collision), and the 256-bit descent on the same edits finds every leaf', () => {
    const { a, b } = seededReplicas(10);
    const toy = runSync('toy8', a, b);
    expect(toy.missed.length).toBeGreaterThan(0);
    const hashes = (kind: 'sha256' | 'toy8', leaves: string[]) => Object.fromEntries(flatten(buildTree(kind, leaves)).map((n) => [n.id, n]));
    const [fullA, fullB, toyA, toyB] = [hashes('sha256', a), hashes('sha256', b), hashes('toy8', a), hashes('toy8', b)];
    for (const leaf of toy.missed) {
      const node = flatten(buildTree('sha256', a)).filter((n) => n.lo <= leaf && leaf < n.hi).map((n) => n.id).find((id) => toy.compared[id] === 'same')!;
      expect(node, `leaf ${leaf} sits under a node the toy called the same`).toBeDefined();
      expect(toyA[node].hash).toBe(toyB[node].hash);
      expect(fullA[node].hash).not.toBe(fullB[node].hash);
      expect(directDiff(a, b).some((i) => i >= fullA[node].lo && i < fullA[node].hi)).toBe(true);
    }
    expect(runSync('sha256', a, b).missed).toEqual([]);
    expect(toy.after).not.toEqual(b);
  });

  it('the 256-bit descent misses no difference over 10,000 seeded edit sets', () => {
    for (let seed = 0; seed < 10_000; seed++) {
      const { a, b } = seededReplicas(seed);
      const r = findDiffs('sha256', a, b);
      expect(r.found, `seed ${seed}`).toEqual(directDiff(a, b));
    }
  });
});
