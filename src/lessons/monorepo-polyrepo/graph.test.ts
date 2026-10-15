import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { affectedSet, cascade, cascadeDays, dependants, type Graph } from './graph';

/** A random acyclic graph with the nodes in a shuffled order, so tests never rely on index order. */
function randomGraph(seed: number): Graph {
  const rnd = mulberry32(seed);
  const n = 2 + Math.floor(rnd() * 11);
  const names = Array.from({ length: n }, (_, i) => `n${i}`);
  const deps: Record<string, string[]> = {};
  names.forEach((name, i) => {
    deps[name] = names.slice(0, i).filter(() => rnd() < 0.35);
  });
  const order = [...names].sort(() => rnd() - 0.5);
  return { nodes: order, deps };
}

/** Independent oracle: the transitive closure by repeated relaxation (Floyd-Warshall style), not by graph search. */
function reaches(g: Graph): Record<string, Set<string>> {
  const r: Record<string, Set<string>> = Object.fromEntries(g.nodes.map((a) => [a, new Set([a, ...(g.deps[a] ?? [])])]));
  for (const k of g.nodes) for (const i of g.nodes) if (r[i].has(k)) for (const j of r[k]) r[i].add(j);
  return r;
}

describe('the affected set', () => {
  it('is every package that can reach the changed one, against a brute-force closure, on 200 seeded graphs and every package changed in turn', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = randomGraph(seed);
      const closure = reaches(g);
      for (const changed of g.nodes) {
        const expected = g.nodes.filter((p) => closure[p].has(changed));
        expect([...affectedSet(g, changed)].sort(), `seed ${seed} change ${changed}`).toEqual(expected.sort());
      }
    }
  });

  it('always includes the changed package, and a package with no dependants affects only itself', () => {
    const g: Graph = { nodes: ['a', 'b', 'c'], deps: { a: [], b: ['a'], c: [] } };
    expect([...affectedSet(g, 'a')].sort()).toEqual(['a', 'b']);
    expect([...affectedSet(g, 'c')]).toEqual(['c']);
    expect([...affectedSet(g, 'b')]).toEqual(['b']);
  });

  it('lists direct dependants once each', () => {
    const g: Graph = { nodes: ['lib', 'x', 'y'], deps: { lib: [], x: ['lib'], y: ['lib', 'x'] } };
    expect(dependants(g)).toEqual({ lib: ['x', 'y'], x: ['y'], y: [] });
  });
});

describe('the cascade', () => {
  /** Independent oracle: the longest chain of waiting, found by trying every path from a direct dependant down through dependants. */
  function longestPath(g: Graph, lib: string, days: Record<string, number>): number {
    const rev = dependants(g);
    const walk = (p: string): number => days[p] + Math.max(0, ...rev[p].map(walk));
    return Math.max(0, ...rev[lib].map(walk));
  }

  it('lasts as long as the longest path (brute-force DFS) on 200 seeded graphs, with every package as the library in turn', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = randomGraph(seed);
      const rnd = mulberry32(seed + 1000);
      const days = Object.fromEntries(g.nodes.map((n) => [n, 1 + Math.floor(rnd() * 6)]));
      for (const lib of g.nodes) expect(cascadeDays(cascade(g, lib, days)), `seed ${seed} lib ${lib}`).toBe(longestPath(g, lib, days));
    }
  });

  it('starts each package only after every affected package it depends on has finished, and the library never gets a slot', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = randomGraph(seed);
      const days = Object.fromEntries(g.nodes.map((n) => [n, 2]));
      const lib = g.nodes[seed % g.nodes.length];
      const slots = cascade(g, lib, days);
      expect(slots[lib]).toBeUndefined();
      for (const [p, slot] of Object.entries(slots)) {
        expect(slot.finish - slot.start).toBe(2);
        for (const d of g.deps[p] ?? []) if (slots[d]) expect(slot.start).toBeGreaterThanOrEqual(slots[d].finish);
      }
    }
  });

  it('has no slots, and zero days, when nothing depends on the library', () => {
    const g: Graph = { nodes: ['a', 'b'], deps: { a: [], b: [] } };
    expect(cascade(g, 'a', { a: 1, b: 1 })).toEqual({});
    expect(cascadeDays({})).toBe(0);
  });
});
