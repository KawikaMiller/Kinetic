import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { billCaption } from './captions';
import { AVG_DEPS, CURVE_SIZES, GRAPH_SEEDS, PACKAGE_CI_MINUTES, SIZE_MAX, SIZE_MIN, bill, minutesFor, nextSeed, randomDag } from './bill';

/** Independent oracle: reachability by Warshall's closure over an index matrix. */
function meanAffectedByClosure(size: number, seed: number): number {
  const g = randomDag(size, seed);
  const idx = new Map(g.nodes.map((n, i) => [n, i]));
  const reach = g.nodes.map((n, i) => g.nodes.map((_, j) => i === j || (g.deps[n] ?? []).some((d) => idx.get(d) === j)));
  for (let k = 0; k < size; k++) for (let i = 0; i < size; i++) if (reach[i][k]) for (let j = 0; j < size; j++) if (reach[k][j]) reach[i][j] = true;
  // affected(changed = j) = every i that reaches j
  let total = 0;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (reach[i][j]) total++;
  return total / size;
}

describe('the random graph', () => {
  it('is acyclic by construction, repeatable by seed, and about AVG_DEPS dependencies per package', () => {
    for (const seed of GRAPH_SEEDS) {
      const g = randomDag(300, seed);
      g.nodes.forEach((n, i) => {
        for (const d of g.deps[n]) expect(Number(d.slice(1))).toBeLessThan(i);
      });
      expect(randomDag(300, seed)).toEqual(g);
      const mean = g.nodes.reduce((s, n) => s + g.deps[n].length, 0) / g.nodes.length;
      expect(mean).toBeGreaterThan(AVG_DEPS * 0.7);
      expect(mean).toBeLessThan(AVG_DEPS * 1.3);
    }
    expect(randomDag(300, GRAPH_SEEDS[0])).not.toEqual(randomDag(300, GRAPH_SEEDS[1]));
  });
});

describe('the bill', () => {
  it('averages the affected set over every package being the one that changed, equal to a closure computed another way', () => {
    for (const seed of GRAPH_SEEDS) {
      for (const size of [5, 20, 60, 150]) expect(bill(size, seed).meanAffected, `${size} / ${seed}`).toBeCloseTo(meanAffectedByClosure(size, seed), 9);
    }
  });

  it('charges minutes per package: everything without detection, the average affected set with it, and never more with detection', () => {
    for (const seed of GRAPH_SEEDS) {
      for (const size of [...CURVE_SIZES]) {
        const b = bill(size, seed);
        expect(b.withoutDetection).toBe(size * PACKAGE_CI_MINUTES);
        expect(b.withDetection).toBeCloseTo(b.meanAffected * PACKAGE_CI_MINUTES, 9);
        expect(b.withDetection).toBeLessThanOrEqual(b.withoutDetection);
        expect(b.meanAffected).toBeGreaterThanOrEqual(1);
        expect(b.affectedFraction).toBeLessThanOrEqual(1);
        expect(minutesFor(b, true)).toBe(b.withDetection);
        expect(minutesFor(b, false)).toBe(b.withoutDetection);
      }
    }
  });

  it('try-this 3: at 100 packages detection costs far fewer minutes, and the gap in minutes widens at 500 packages on every pinned graph', () => {
    for (const seed of GRAPH_SEEDS) {
      const small = bill(100, seed);
      const large = bill(SIZE_MAX, seed);
      expect(small.withDetection).toBeLessThan(small.withoutDetection / 2);
      expect(large.withoutDetection - large.withDetection).toBeGreaterThan(small.withoutDetection - small.withDetection);
    }
  });

  it('covers the slider ends and steps the pinned graphs round', () => {
    expect(bill(SIZE_MIN, GRAPH_SEEDS[0]).size).toBe(SIZE_MIN);
    expect(bill(SIZE_MAX, GRAPH_SEEDS[0]).size).toBe(SIZE_MAX);
    expect(nextSeed(GRAPH_SEEDS[0])).toBe(GRAPH_SEEDS[1]);
    expect(nextSeed(GRAPH_SEEDS[GRAPH_SEEDS.length - 1])).toBe(GRAPH_SEEDS[0]);
  });

  it('writes a caption from the same bill the stats show, at both settings and both ends of the size slider', () => {
    for (const size of [SIZE_MIN, 100, SIZE_MAX]) {
      const b = bill(size, GRAPH_SEEDS[0]);
      for (const detection of [true, false]) {
        const text = expectCaption(billCaption(b, detection, GRAPH_SEEDS[0]));
        expect(text).toContain(`${size} package`);
        expect(text).toContain(`${(Math.round(minutesFor(b, detection) * 10) / 10).toFixed(1)} CI minutes`);
        expect(text).toContain(`detection ${detection ? 'on' : 'off'}`);
      }
    }
  });
});
