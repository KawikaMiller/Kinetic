import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { STRUCTURES, recommend, supports, type Need, type Updates, type WantedOp } from './chooser';
import { makeWorkload, runWorkload } from './cost';
import { fenAdd, fenBuild, fenPrefix, fenRange, lowbit, minBuild, minPrefix, prefixHops, rangeMinWrong, updateHops } from './fenwick';
import { OPS, addRange, buildTree, cellValues, nodeCount, queryRange, setCell, type Op, type SegTree } from './model';

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};
/** The oracle: a plain loop over the cells. */
function naive(values: readonly number[], op: Op, l: number, r: number): number {
  const xs = values.slice(l, r + 1);
  if (op === 'sum') return xs.reduce((a, b) => a + b, 0);
  if (op === 'min') return Math.min(...xs);
  if (op === 'max') return Math.max(...xs);
  return xs.reduce(gcd, 0);
}
const seeded = (n: number, seed: number) => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => randInt(-20, 20, rnd));
};
const OP_LIST: Op[] = ['sum', 'min', 'max', 'gcd'];

describe('every (l, r) pair against a naive loop', () => {
  it.each([8, 13, 16])('n = %i, all four operations, seeded arrays with negatives and zeros', (n) => {
    for (const op of OP_LIST) {
      for (let seed = 1; seed <= 4; seed++) {
        const values = seeded(n, seed);
        values[seed] = 0;
        const tree = buildTree(values, op);
        expect(nodeCount(tree)).toBe(2 * n - 1);
        for (let l = 0; l < n; l++) for (let r = l; r < n; r++) expect(queryRange(tree, l, r).value, `${op} n${n} [${l},${r}]`).toBe(naive(values, op, l, r));
      }
    }
  });

  it('covering nodes number at most 2 * ceil(log2 n) for every range at n = 16 and 13, and [1, 6] on 8 cells is [1,1] [2,3] [4,5] [6,6]', () => {
    for (const n of [16, 13]) {
      const tree = buildTree(seeded(n, 3), 'sum');
      for (let l = 0; l < n; l++) for (let r = l; r < n; r++) expect(queryRange(tree, l, r).covering.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(n)));
    }
    const t = buildTree(seeded(8, 1), 'sum');
    const q = queryRange(t, 1, 6);
    expect(q.covering.map((id) => [t.nodes[id].l, t.nodes[id].r])).toEqual([[1, 1], [2, 3], [4, 5], [6, 6]]);
  });

  it('a point update rewrites ceil(log2 n) + 1 nodes on 8 and 16 cells, and every later query still matches', () => {
    for (const n of [8, 16]) {
      let tree = buildTree(seeded(n, 2), 'sum');
      const values = seeded(n, 2);
      const rnd = mulberry32(n);
      for (let k = 0; k < 50; k++) {
        const i = randInt(0, n - 1, rnd);
        const v = randInt(-20, 20, rnd);
        const r = setCell(tree, i, v);
        expect(r.touched).toBe(Math.log2(n) + 1);
        tree = r.tree;
        values[i] = v;
        const l = randInt(0, n - 1, rnd);
        const h = randInt(l, n - 1, rnd);
        expect(queryRange(tree, l, h).value).toBe(naive(values, 'sum', l, h));
      }
    }
  });
});

describe('lazy range add', () => {
  it.each(['sum', 'min', 'max'] as const)('%s: 200 seeds x 100 mixed adds, queries and sets equal the naive array, with laziness on', (op) => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const n = 13;
      const values = seeded(n, seed);
      let tree = buildTree(values, op);
      for (let k = 0; k < 100; k++) {
        const l = randInt(0, n - 1, rnd);
        const r = randInt(l, n - 1, rnd);
        const roll = rnd();
        if (roll < 0.4) {
          const v = randInt(-9, 9, rnd);
          tree = addRange(tree, l, r, v, true).tree;
          for (let i = l; i <= r; i++) values[i] += v;
        } else if (roll < 0.55) {
          const v = randInt(-20, 20, rnd);
          tree = setCell(tree, l, v).tree;
          values[l] = v;
        } else {
          const q = queryRange(tree, l, r);
          expect(q.value, `seed ${seed} step ${k}`).toBe(naive(values, op, l, r));
          tree = q.tree;
        }
      }
      expect(cellValues(tree)).toEqual(values);
    }
  });

  it('laziness off gives the same answers but touches more nodes on a long range; laziness on touches at most about 4 log n', () => {
    const values = seeded(16, 5);
    const lazy = addRange(buildTree(values, 'sum'), 0, 15, 3, true);
    const eager = addRange(buildTree(values, 'sum'), 0, 15, 3, false);
    expect(lazy.touched).toBe(1);
    expect(eager.touched).toBe(31);
    expect(cellValues(lazy.tree)).toEqual(cellValues(eager.tree));
    const mid = addRange(buildTree(values, 'sum'), 3, 12, 3, true);
    const midEager = addRange(buildTree(values, 'sum'), 3, 12, 3, false);
    expect(mid.touched).toBeLessThan(midEager.touched);
    expect(mid.touched).toBeLessThanOrEqual(4 * Math.log2(16));
    expect(queryRange(mid.tree, 0, 15).value).toBe(queryRange(midEager.tree, 0, 15).value);
  });

  it('a tag is pushed one level down when a query must look inside, and gcd refuses a range add', () => {
    const t0 = buildTree(seeded(8, 1), 'sum');
    const t1 = addRange(t0, 0, 3, 5, true).tree;
    expect(t1.nodes[2].tag).toBe(5);
    const q = queryRange(t1, 1, 1, { record: true });
    expect(q.events.some((e) => e.kind === 'push' && e.node === 2)).toBe(true);
    expect(q.tree.nodes[2].tag).toBe(0);
    expect(q.tree.nodes[5].tag).toBe(5);
    expect(q.tree.nodes[4].tag).toBe(0);
    expect(() => addRange(buildTree([4, 6], 'gcd'), 0, 1, 1, true)).toThrow('no range add');
    expect(OPS.gcd.shift).toBeNull();
  });

  it('broken: a tree that forgets to push a tag answers wrongly on some seed, and the oracle catches it', () => {
    let wrong = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed);
      const values = seeded(13, seed);
      let tree: SegTree = buildTree(values, 'sum');
      for (let k = 0; k < 20; k++) {
        const l = randInt(0, 12, rnd);
        const r = randInt(l, 12, rnd);
        if (rnd() < 0.5) {
          const v = randInt(1, 9, rnd);
          tree = addRange(tree, l, r, v, true, { noPush: true }).tree;
          for (let i = l; i <= r; i++) values[i] += v;
        } else {
          const q = queryRange(tree, l, r, { noPush: true });
          if (q.value !== naive(values, 'sum', l, r)) wrong++;
          tree = q.tree;
        }
      }
    }
    expect(wrong).toBeGreaterThan(0);
  });
});

describe('the Fenwick tree', () => {
  it('prefix(i) equals the naive prefix for every i, and range = prefix(r) - prefix(l - 1), for sum and xor', () => {
    for (const op of ['sum', 'xor'] as const) {
      for (const n of [8, 13, 16]) {
        const values = seeded(n, n).map((v) => Math.abs(v));
        const t = fenBuild(values, op);
        for (let i = 0; i <= n; i++) {
          const want = values.slice(0, i).reduce((a, b) => (op === 'sum' ? a + b : a ^ b), 0);
          expect(fenPrefix(t, i, op).value).toBe(want);
        }
        for (let l = 1; l <= n; l++) for (let r = l; r <= n; r++) {
          const want = values.slice(l - 1, r).reduce((a, b) => (op === 'sum' ? a + b : a ^ b), 0);
          expect(fenRange(t, l, r, op).value).toBe(want);
        }
      }
    }
  });

  it('hop lists: query 13 reads 13, 12, 8; update 5 touches 5, 6, 8, 16 for n = 16; lowbit(12) = 4', () => {
    expect(prefixHops(13)).toEqual([13, 12, 8]);
    expect(updateHops(5, 16)).toEqual([5, 6, 8, 16]);
    expect(lowbit(12)).toBe(4);
    expect(prefixHops(0)).toEqual([]);
  });

  it('updates keep every prefix right (200 seeded runs)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const values = seeded(16, seed);
      let t = fenBuild(values, 'sum');
      for (let k = 0; k < 20; k++) {
        const i = randInt(1, 16, rnd);
        const d = randInt(-9, 9, rnd);
        t = fenAdd(t, i, d, 'sum').tree;
        values[i - 1] += d;
        const j = randInt(1, 16, rnd);
        expect(fenPrefix(t, j, 'sum').value).toBe(values.slice(0, j).reduce((a, b) => a + b, 0));
      }
    }
  });

  it('broken: the sum recipe for min (hops to r, no inverse) disagrees with the naive minimum, while prefix min itself is right', () => {
    const values = [1, 5, 6, 7];
    const t = minBuild(values);
    for (let i = 1; i <= 4; i++) expect(minPrefix(t, i).value).toBe(Math.min(...values.slice(0, i)));
    expect(rangeMinWrong(t, 4)).toBe(1);
    expect(naive(values, 'min', 1, 3)).toBe(5);
    let disagree = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const v = seeded(16, seed);
      const mt = minBuild(v);
      for (let l = 1; l < 16; l++) if (rangeMinWrong(mt, 16) !== naive(v, 'min', l, 15)) disagree++;
    }
    expect(disagree).toBeGreaterThan(0);
  });
});

describe('the workload of scene 1', () => {
  it('all three designs answer every query like a naive loop, and the counts follow the closed forms', () => {
    for (const n of [8, 64, 1024]) {
      const values = seeded(n, 4);
      const requests = makeWorkload(n, 20, 50, 7);
      const run = runWorkload(values, requests);
      const live = [...values];
      const want: number[] = [];
      for (const q of requests) {
        if (q.kind === 'update') live[q.index] = q.value;
        else want.push(naive(live, 'sum', q.l, q.r));
      }
      expect(run.answers.prefix).toEqual(want);
      expect(run.answers.segment).toEqual(want);
      expect(run.answers.fenwick).toEqual(want);
      const updates = requests.filter((q) => q.kind === 'update');
      const queries = requests.length - updates.length;
      const prefixUpdateCells = updates.reduce((s, q) => s + (q.kind === 'update' ? n - q.index : 0), 0);
      expect(run.costs.prefix).toBe(prefixUpdateCells + 2 * queries);
    }
  });

  it('at n = 1,024 prefix sums cost far more than the other two on an update-heavy mix, and less on a query-only mix', () => {
    const values = seeded(1024, 9);
    const heavy = runWorkload(values, makeWorkload(1024, 20, 100, 3)).costs;
    expect(heavy.prefix).toBeGreaterThan(5 * heavy.segment);
    expect(heavy.fenwick).toBeLessThan(heavy.segment);
    const none = runWorkload(values, makeWorkload(1024, 20, 0, 3)).costs;
    expect(none.prefix).toBe(40);
    expect(none.prefix).toBeLessThan(none.segment);
  });
});

describe('the chooser', () => {
  const ops: WantedOp[] = ['sum', 'min', 'max'];
  const ups: Updates[] = ['none', 'point', 'range'];
  it('over the whole 3 x 3 x 2 cross product the pick supports the need and no earlier fitting structure was skipped without a reason', () => {
    let cells = 0;
    for (const op of ops) for (const updates of ups) for (const memory of [false, true]) {
      const need: Need = { op, updates, memory };
      const r = recommend(need, 1024);
      cells++;
      expect(supports(r.structure, need), JSON.stringify(need)).toBe(true);
      const fitting = STRUCTURES.filter((s) => supports(s, need));
      const lean = memory ? fitting.filter((s) => s.numbers(1024) <= 2048) : fitting;
      expect(r.structure).toBe((lean.length ? lean : fitting)[0]);
      expect(r.considered.filter((c) => c.fits).map((c) => c.structure.id)).toEqual(fitting.map((s) => s.id));
      expect(r.reason.length).toBeGreaterThan(10);
    }
    expect(cells).toBe(18);
  });

  it('named answers: sum without updates is prefix sums, sum with point updates a Fenwick tree, min without updates a sparse table unless memory is tight, range updates need lazy', () => {
    expect(recommend({ op: 'sum', updates: 'none', memory: false }, 1024).structure.id).toBe('prefix');
    expect(recommend({ op: 'sum', updates: 'point', memory: false }, 1024).structure.id).toBe('fenwick');
    expect(recommend({ op: 'min', updates: 'none', memory: false }, 1024).structure.id).toBe('sparse');
    expect(recommend({ op: 'min', updates: 'none', memory: true }, 1024).structure.id).toBe('segment');
    expect(recommend({ op: 'max', updates: 'point', memory: false }, 1024).structure.id).toBe('segment');
    expect(recommend({ op: 'sum', updates: 'range', memory: true }, 1024).structure.id).toBe('lazy');
    expect(recommend({ op: 'min', updates: 'none', memory: true }, 1024).reason).toContain('10,240');
  });
});
