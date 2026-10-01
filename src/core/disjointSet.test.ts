import { describe, expect, it } from 'vitest';
import { createDisjointSet } from './disjointSet';
import { mulberry32 } from './random';

/** Reference: component labels by repeated relabelling (slow and obviously right). */
function naiveLabels(n: number, unions: [number, number][]): number[] {
  const label = Array.from({ length: n }, (_, i) => i);
  for (const [a, b] of unions) {
    const from = label[b];
    const to = label[a];
    if (from === to) continue;
    for (let i = 0; i < n; i++) if (label[i] === from) label[i] = to;
  }
  return label;
}

function seededUnions(n: number, k: number, seed: number): [number, number][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: k }, () => [Math.floor(rnd() * n), Math.floor(rnd() * n)] as [number, number]);
}

const MODES = [
  { compress: true, byRank: true },
  { compress: true, byRank: false },
  { compress: false, byRank: true },
  { compress: false, byRank: false },
];

describe('createDisjointSet', () => {
  it('agrees with naive labelling on seeded union sequences, in every mode', () => {
    for (const mode of MODES)
      for (let seed = 1; seed <= 40; seed++) {
        const n = 5 + (seed % 30);
        const unions = seededUnions(n, n * 2, seed);
        const dsu = createDisjointSet(n, mode);
        let merges = 0;
        for (const [a, b] of unions) if (dsu.union(a, b)) merges++;
        const ref = naiveLabels(n, unions);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(dsu.connected(i, j)).toBe(ref[i] === ref[j]);
        expect(dsu.count).toBe(new Set(ref).size);
        expect(dsu.count).toBe(n - merges);
      }
  });

  it('union by rank keeps height ≤ log₂ n even without compression', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 64;
      const dsu = createDisjointSet(n, { compress: false, byRank: true });
      for (const [a, b] of seededUnions(n, 200, seed)) dsu.union(a, b);
      expect(dsu.height()).toBeLessThanOrEqual(Math.log2(n));
    }
  });

  it('without either optimisation a chain of unions makes a tall tree', () => {
    const n = 16;
    const dsu = createDisjointSet(n, { compress: false, byRank: false });
    for (let i = n - 1; i > 0; i--) dsu.union(i - 1, i); // hangs each root under the next one down
    expect(dsu.height()).toBe(n - 1);
  });

  it('path compression flattens the path it walks', () => {
    const dsu = createDisjointSet(6, { compress: false, byRank: false });
    for (let i = 5; i > 0; i--) dsu.union(i - 1, i);
    expect(dsu.height()).toBe(5);
    const flat = createDisjointSet(6, { compress: true, byRank: false, trace: true });
    for (let i = 5; i > 0; i--) flat.union(i - 1, i);
    flat.find(5);
    expect(flat.parents().every((p) => p === 0)).toBe(true);
  });

  it('union reports whether it merged', () => {
    const dsu = createDisjointSet(3);
    expect(dsu.union(0, 1)).toBe(true);
    expect(dsu.union(1, 0)).toBe(false);
    expect(dsu.count).toBe(2);
  });

  it('records a trace that replays the structure', () => {
    const dsu = createDisjointSet(4, { trace: true });
    dsu.union(0, 1);
    dsu.union(2, 3);
    dsu.union(1, 3);
    const unions = dsu.events.filter((e) => e.kind === 'union');
    expect(unions).toHaveLength(3);
    expect(unions.every((e) => e.kind === 'union' && e.merged)).toBe(true);
    expect(dsu.events.some((e) => e.kind === 'rank')).toBe(true);
    // Replaying the union events' (child → root) links reproduces the parent array.
    const replay = [0, 1, 2, 3];
    for (const e of dsu.events) {
      if (e.kind === 'union' && e.child !== null) replay[e.child] = e.root;
      if (e.kind === 'reparent') replay[e.node] = e.to;
    }
    expect(replay).toEqual(dsu.parents());
  });

  it('rejects elements outside the set', () => {
    expect(() => createDisjointSet(3).find(3)).toThrow(RangeError);
  });
});
