import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, shuffle, type Rnd } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { describe as describeRel, relFrames } from './frames';
import {
  classes, closureWaves, counterexample, fromPred, hasse, holds, incomparable, isEquivalence, isPartialOrder, linearExtension, PROPERTIES, respects, type Rel,
} from './model';
import { PRESETS } from './presets';

const N4 = 4;
const relFromBits = (bits: number, n = N4): Rel => fromPred(n, (a, b) => ((bits >> (a * n + b)) & 1) === 1);
const all = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Straight from the definitions. */
const brute = {
  reflexive: (r: Rel) => all(r.length).every((a) => r[a][a]),
  symmetric: (r: Rel) => all(r.length).every((a) => all(r.length).every((b) => !r[a][b] || r[b][a])),
  antisymmetric: (r: Rel) => all(r.length).every((a) => all(r.length).every((b) => !(r[a][b] && r[b][a]) || a === b)),
  transitive: (r: Rel) => all(r.length).every((a) => all(r.length).every((b) => all(r.length).every((c) => !(r[a][b] && r[b][c]) || r[a][c]))),
};

const randomRel = (rnd: Rnd, n: number, p: number): Rel => fromPred(n, () => rnd() < p);

/** Reference transitive closure: a R+ b when b is reachable from a by one or more arrows (BFS). */
function reachability(r: Rel): Rel {
  const n = r.length;
  return fromPred(n, (a, b) => {
    const seen = new Set<number>();
    const queue = all(n).filter((x) => r[a][x]);
    queue.forEach((x) => seen.add(x));
    while (queue.length) {
      const x = queue.shift()!;
      for (const y of all(n)) {
        if (!r[x][y] || seen.has(y)) continue;
        seen.add(y);
        queue.push(y);
      }
    }
    return seen.has(b);
  });
}

/** A random partial order: the reflexive-transitive closure of a random DAG. */
function randomPartialOrder(rnd: Rnd, n: number): Rel {
  const order = shuffle(all(n), rnd);
  const pos = new Map(order.map((x, i) => [x, i]));
  const dag = fromPred(n, (a, b) => pos.get(a)! < pos.get(b)! && rnd() < 0.3);
  const plus = reachability(dag);
  return fromPred(n, (a, b) => a === b || plus[a][b]);
}

describe('relation properties', () => {
  it('match the definitions on all 2^16 relations on 4 elements, and every counterexample really breaks the property', () => {
    // One assertion at the end: per-iteration expect() over 2^16 × 4 cases is what made this slow.
    const wrong: string[] = [];
    for (let bits = 0; bits < 1 << (N4 * N4); bits++) {
      const r = relFromBits(bits);
      for (const p of PROPERTIES) {
        if (holds(r, p) !== brute[p](r)) wrong.push(`${bits} ${p}: holds`);
        const cx = counterexample(r, p);
        if (!cx) continue;
        if (cx.present.some(([a, b]) => !r[a][b])) wrong.push(`${bits} ${p}: a present pair is missing`);
        if (cx.missing.some(([a, b]) => r[a][b])) wrong.push(`${bits} ${p}: a missing pair is present`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('closures', () => {
  it('transitive closure (Warshall waves) equals BFS reachability on 500 random relations', () => {
    const rnd = mulberry32(51);
    for (let t = 0; t < 500; t++) {
      const r = randomRel(rnd, randInt(1, 8, rnd), rnd() * 0.4);
      const { result, waves } = closureWaves(r, 'transitive');
      expect(result).toEqual(reachability(r));
      expect(brute.transitive(result)).toBe(true);
      // The waves add exactly the difference, each pair once.
      const added = waves.flatMap((w) => w.added.map(([a, b]) => `${a},${b}`));
      expect(new Set(added).size).toBe(added.length);
      expect(added.length).toBe(result.flat().filter(Boolean).length - r.flat().filter(Boolean).length);
    }
  });

  it('reflexive and symmetric closures add only what the property forces', () => {
    const rnd = mulberry32(52);
    for (let t = 0; t < 200; t++) {
      const r = randomRel(rnd, randInt(1, 8, rnd), 0.3);
      const refl = closureWaves(r, 'reflexive').result;
      expect(refl).toEqual(fromPred(r.length, (a, b) => r[a][b] || a === b));
      const sym = closureWaves(r, 'symmetric').result;
      expect(sym).toEqual(fromPred(r.length, (a, b) => r[a][b] || r[b][a]));
    }
  });
});

describe('equivalence classes', () => {
  it('partition the set: from 300 random partitions, the classes come back exactly', () => {
    const rnd = mulberry32(53);
    for (let t = 0; t < 300; t++) {
      const n = randInt(1, 8, rnd);
      const label = all(n).map(() => randInt(0, 3, rnd));
      const r = fromPred(n, (a, b) => label[a] === label[b]);
      expect(isEquivalence(r)).toBe(true);
      const cls = classes(r);
      expect(cls.flat().sort((a, b) => a - b)).toEqual(all(n));
      for (const c of cls) expect(new Set(c.map((x) => label[x])).size).toBe(1);
      expect(cls).toHaveLength(new Set(label).size);
    }
    expect(classes(PRESETS.find((p) => p.id === 'mod3')!.rel)).toEqual([[0, 3, 6], [1, 4, 7], [2, 5]]);
  });
});

describe('partial orders', () => {
  it('Hasse edges are exactly the covering pairs (divides, subsets)', () => {
    const div = [1, 2, 3, 4, 6, 12];
    const divCovers = (a: number, b: number) =>
      a !== b && div[b] % div[a] === 0 && !div.some((c) => c !== div[a] && c !== div[b] && c % div[a] === 0 && div[b] % c === 0);
    const d = PRESETS.find((p) => p.id === 'divides')!.rel;
    expect(hasse(d).map(([a, b]) => `${a},${b}`).sort()).toEqual(all(6).flatMap((a) => all(6).filter((b) => divCovers(a, b)).map((b) => `${a},${b}`)).sort());

    const sets = PRESETS.find((p) => p.id === 'subsets')!;
    const size = (s: string) => (s === '∅' ? 0 : s.length);
    const subsetCovers = (x: string, y: string) => size(y) === size(x) + 1 && (x === '∅' || [...x].every((ch) => y.includes(ch)));
    expect(hasse(sets.rel).map(([a, b]) => `${a},${b}`).sort()).toEqual(
      all(8).flatMap((a) => all(8).filter((b) => subsetCovers(sets.labels[a], sets.labels[b])).map((b) => `${a},${b}`)).sort(),
    );
    expect(hasse(sets.rel)).toHaveLength(12); // the edges of a cube
  });

  it('a linear extension respects every pair, on presets and 300 random partial orders', () => {
    for (const p of PRESETS.filter((x) => isPartialOrder(x.rel))) expect(respects(p.rel, linearExtension(p.rel))).toBe(true);
    const rnd = mulberry32(54);
    for (let t = 0; t < 300; t++) {
      const r = randomPartialOrder(rnd, randInt(1, 8, rnd));
      expect(isPartialOrder(r)).toBe(true);
      expect(respects(r, linearExtension(r))).toBe(true);
    }
  });

  it('the caption is computed: incomparable count, total orders, and failures with their counterexample', () => {
    const d = PRESETS.find((p) => p.id === 'divides')!;
    const text = captionText(describeRel(d.rel, d.labels));
    expect(text).toContain(`partial order, but ${incomparable(d.rel).length} pairs are incomparable`);
    expect(incomparable(d.rel).map(([a, b]) => `${d.labels[a]}∥${d.labels[b]}`)).toContain('4∥6');
    const line = fromPred(5, (a, b) => a <= b);
    expect(captionText(describeRel(line, ['1', '2', '3', '4', '5']))).toContain('total order');
    const near = PRESETS.find((p) => p.id === 'near')!;
    expect(captionText(describeRel(near.rel, near.labels))).toContain('antisymmetric fails (1 R 2 and 2 R 1, although 1 ≠ 2)');
    expect(captionText(describeRel(near.rel, near.labels))).toContain('transitive fails (1 R 2 and 2 R 3, but not 1 R 3)');
    const eq = fromPred(4, (a, b) => a === b);
    expect(captionText(describeRel(eq, ['a', 'b', 'c', 'd']))).toMatch(/Both an equivalence relation and a partial order/);
  });
});

describe('frames', () => {
  it('a closure animation grows wave by wave and ends on the closure', () => {
    for (const p of PRESETS) {
      for (const kind of ['reflexive', 'symmetric', 'transitive'] as const) {
        const frames = relFrames(p.rel, p.labels, { from: p.rel, kind });
        const { result } = closureWaves(p.rel, kind);
        expect(frames[0].rel).toEqual(p.rel);
        expect(frames.at(-1)!.rel).toEqual(result);
        for (let i = 1; i < frames.length; i++) {
          for (const [a, b] of frames[i].added) {
            expect(frames[i - 1].rel[a][b]).toBe(false);
            expect(frames[i].rel[a][b]).toBe(true);
            expect(captionText(frames[i].say)).toContain(`(${p.labels[a]}, ${p.labels[b]})`);
          }
        }
      }
    }
  });
});
