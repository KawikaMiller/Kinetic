import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  MAX_NODES, PATH_SIZES, SHORT_TABLE_WITNESS, T0_PARENTS, addLeaf, allTrees, brokenReport, buildTable, decide, depthsOf, isTree, judgeGrandparent,
  kthAncestor, kthJump, lca, lcaWithMode, levelsFor, liftJump, naiveKth, naiveLca, pathParents, pathStats, popcount, shortFailsOnPaths, shortestWitness, startKth, startLca,
} from './model';

const table = buildTable(T0_PARENTS);

/** Oracle: the k-th ancestor by walking parents, written separately from the lesson's naiveKth. */
const walk = (parents: readonly number[], v: number, k: number) => {
  let at = v;
  for (let i = 0; i < k; i += 1) at = parents[at];
  return at;
};

/** Oracle: the LCA as the deepest common member of the two root paths. */
const lcaByPaths = (parents: readonly number[], x: number, y: number) => {
  const path = (v: number) => {
    const out = [v];
    while (v !== 0) {
      v = parents[v];
      out.push(v);
    }
    return out;
  };
  const px = path(x);
  const py = new Set(path(y));
  return px.find((v) => py.has(v))!;
};

describe('T0 hand-worked vectors', () => {
  it('depths and the four levels', () => {
    expect(depthsOf(T0_PARENTS)).toEqual([0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 5, 3]);
    expect(table.levels).toBe(4);
    expect(table.up[0]).toEqual([0, 0, 0, 1, 1, 2, 3, 3, 4, 6, 9, 5]);
    expect(table.up[1]).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 3, 6, 2]);
    expect(table.up[2]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(table.up[3]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('the 4th ancestor of 10 and the grandparent of 6, checked by walking', () => {
    // ancestors of 10 are 9, 6, 3, 1, so the 4th is 1; the grandparent of 6 is 1 (6 to 3 to 1).
    expect(table.up[2][10]).toBe(1);
    expect(table.up[1][6]).toBe(1);
    expect(walk(T0_PARENTS, 10, 4)).toBe(1);
  });

  it('lca(10, 8) = 1 in 2 jumps against 6 parent steps (distance 5 + 3 - 2 x 1)', () => {
    const run = lca(table, 10, 8);
    expect(run.answer).toBe(1);
    expect(run.lift).toEqual([{ level: 1, from: 10, to: 6 }]);
    expect(run.climbSteps.map((s) => [s.level, ...s.landing, s.took])).toEqual([[3, 0, 0, false], [2, 0, 0, false], [1, 1, 1, false], [0, 3, 4, true]]);
    expect(run.jumps).toBe(2);
    expect(naiveLca(T0_PARENTS, 10, 8)).toEqual({ answer: 1, steps: 6 });
    expect(depthsOf(T0_PARENTS)[10] + depthsOf(T0_PARENTS)[8] - 2 * depthsOf(T0_PARENTS)[1]).toBe(6);
  });

  it('lca(10, 11) = 0 in 2 jumps, lca(9, 6) = 6 in 1, lca(7, 7) = 7 in 0', () => {
    expect([lca(table, 10, 11).answer, lca(table, 10, 11).jumps]).toEqual([0, 2]);
    expect(lca(table, 10, 11).climbSteps.map((s) => s.took)).toEqual([false, false, true, false]);
    expect([lca(table, 9, 6).answer, lca(table, 9, 6).jumps]).toEqual([6, 1]);
    expect([lca(table, 7, 7).answer, lca(table, 7, 7).jumps]).toEqual([7, 0]);
  });

  it('the 5th ancestor of 10 is the root, by two jumps (101b)', () => {
    const r = kthAncestor(table, 10, 5)!;
    expect(r.node).toBe(0);
    expect(r.jumps).toEqual([{ level: 2, from: 10, to: 1 }, { level: 0, from: 1, to: 0 }]);
    expect(kthAncestor(table, 10, 6)).toBeNull();
  });

  it('a path of n nodes takes popcount(n - 1) jumps for lca(deepest, root): 4, 6, 8, 10 against 15, 63, 255, 1,023', () => {
    const stats = PATH_SIZES.map((n) => pathStats(n));
    expect(stats.map((s) => s.jumps)).toEqual([4, 6, 8, 10]);
    expect(stats.map((s) => s.steps)).toEqual([15, 63, 255, 1023]);
    expect(stats.map((s) => s.levels)).toEqual([4, 6, 8, 10]);
    expect(stats.map((s) => popcount(s.n - 1))).toEqual([4, 6, 8, 10]);
    expect(pathStats(1024).entries).toBe(10240);
  });
});

describe('levels', () => {
  it('K = max(1, ceil(log2 n)): 12 nodes give 4 levels, 13 to 16 stay at 4, one node gives 1, and 20 levels cover a million', () => {
    expect([1, 2, 3, 12, 13, 16].map(levelsFor)).toEqual([1, 1, 2, 4, 4, 4]);
    expect(levelsFor(1_000_000)).toBe(20);
    expect(2 ** 20).toBe(1_048_576);
  });
});

describe('oracles: every tree of 5, 6 and 7 nodes, every pair', () => {
  it('has 24, 120 and 720 trees', () => {
    expect([5, 6, 7].map((n) => allTrees(n).length)).toEqual([24, 120, 720]);
    for (const t of allTrees(6)) expect(isTree(t)).toBe(true);
  });

  it('lca and the k-th ancestor match the naive walks and the root-path oracle', () => {
    for (const n of [5, 6, 7]) {
      for (const parents of allTrees(n)) {
        const t = buildTable(parents);
        const depth = depthsOf(parents);
        for (let x = 0; x < n; x += 1) {
          for (let y = 0; y < n; y += 1) {
            const run = lca(t, x, y);
            expect(run.answer, `${parents} (${x}, ${y})`).toBe(lcaByPaths(parents, x, y));
            expect(run.answer).toBe(naiveLca(parents, x, y).answer);
          }
          for (let k = 0; k <= depth[x]; k += 1) expect(kthAncestor(t, x, k)!.node).toBe(walk(parents, x, k));
        }
      }
    }
  });

  it('seeded random trees of 8 to 200 nodes, including a path, a star and a caterpillar', () => {
    const rnd = mulberry32(99);
    const shapes: number[][] = [
      pathParents(60),
      Array.from({ length: 40 }, () => 0),
      Array.from({ length: 50 }, (_, v) => (v === 0 ? 0 : v % 2 === 1 ? Math.max(0, v - 2) : v - 1)),
    ];
    for (let t = 0; t < 30; t += 1) {
      const n = 8 + Math.floor(rnd() * 193);
      shapes.push(Array.from({ length: n }, (_, v) => (v === 0 ? 0 : Math.floor(rnd() * v))));
    }
    for (const parents of shapes) {
      expect(isTree(parents)).toBe(true);
      const n = parents.length;
      const t = buildTable(parents);
      for (let q = 0; q < 2000; q += 1) {
        const x = Math.floor(rnd() * n);
        const y = Math.floor(rnd() * n);
        expect(lca(t, x, y).answer).toBe(lcaByPaths(parents, x, y));
        const k = Math.floor(rnd() * (t.depth[x] + 1));
        expect(kthAncestor(t, x, k)!.node).toBe(naiveKth(parents, x, k));
      }
    }
  });
});

describe('manipulation: wrong moves are refused with the computed reason', () => {
  it('manipulation 1: a wrong grandparent names parent(6) = 3 and parent(3) = 1', () => {
    expect(judgeGrandparent(T0_PARENTS, 6, 3)).toEqual({ ok: false, error: 'up[1][6] is the grandparent of 6: parent(6) = 3 and parent(3) = 1, so it is 1, not 3.' });
    expect(judgeGrandparent(T0_PARENTS, 6, 1)).toEqual({ ok: true });
    const clamp = judgeGrandparent(T0_PARENTS, 1, 5);
    expect(clamp.ok === false && clamp.error).toContain('the root is its own parent');
  });

  it('manipulation 2: jumping on equal landing nodes is refused, and skipping on differing nodes is refused', () => {
    let game = startLca(table, 10, 8);
    expect(game.phase).toBe('lift');
    game = liftJump(game, 1).game;
    expect([game.a, game.phase, game.level]).toEqual([6, 'climb', 3]);
    game = decide(game, 'skip').game;
    game = decide(game, 'skip').game;
    expect(game.level).toBe(1);
    const refused = decide(game, 'jump');
    expect(refused.refusal).toBe('The landing nodes are equal (1 and 1): this jump reaches or passes the LCA, so skip it.');
    expect(refused.game).toBe(game);
    game = decide(game, 'skip').game;
    const wrongSkip = decide(game, 'skip');
    expect(wrongSkip.refusal).toBe('The landing nodes differ (3 and 4), so this jump keeps both below the LCA: take it.');
    game = decide(game, 'jump').game;
    expect([game.phase, game.answer, game.jumps]).toEqual(['done', 1, 2]);
  });

  it('manipulation 3: a jump larger than the remainder is refused in both the k-th ancestor and the lift', () => {
    const kth = startKth(table, 10, 5);
    expect(kthJump(kth, 3).refusal).toBe('2^3 = 8 is more than the 5 steps still to climb.');
    expect(kthJump(kthJump(kth, 2).game, 2).refusal).toBe('2^2 = 4 is more than the 1 step still to climb.');
    const lift = startLca(table, 10, 8);
    expect(liftJump(lift, 2).refusal).toBe('2^2 = 4 is more than the 2 steps still to climb.');
  });

  it('any legal play of the lift and the climb ends on the right answer, on every pair of T0', () => {
    const n = T0_PARENTS.length;
    for (let x = 0; x < n; x += 1) {
      for (let y = 0; y < n; y += 1) {
        let game = startLca(table, x, y);
        while (game.phase === 'lift') {
          const level = [...Array(table.levels).keys()].reverse().find((l) => 2 ** l <= game.remaining)!;
          game = liftJump(game, level).game;
        }
        while (game.phase === 'climb') {
          const [ua, ub] = [table.up[game.level][game.a], table.up[game.level][game.b]];
          game = decide(game, ua === ub ? 'skip' : 'jump').game;
        }
        expect(game.answer, `${x},${y}`).toBe(lcaByPaths(T0_PARENTS, x, y));
      }
    }
  });
});

describe('adding a leaf', () => {
  it('needs an existing parent, and stops at 16 nodes', () => {
    expect(addLeaf(T0_PARENTS, '11')).toMatchObject({ ok: true });
    expect(addLeaf(T0_PARENTS, '12')).toEqual({ ok: false, error: 'A node needs an existing parent: type a number from 0 to 11.' });
    expect(addLeaf(T0_PARENTS, '-1').ok).toBe(false);
    expect(addLeaf(T0_PARENTS, '').ok).toBe(false);
    expect(addLeaf(T0_PARENTS, '1.5').ok).toBe(false);
    let parents: number[] = [...T0_PARENTS];
    while (parents.length < MAX_NODES) parents = (addLeaf(parents, '0') as { parents: number[] }).parents;
    expect(addLeaf(parents, '0').ok).toBe(false);
    expect(buildTable(parents).levels).toBe(4);
  });
});

describe('broken modes', () => {
  it('the witness: parents [0, 0, 0, 1, 3, 4, 5], query (2, 6): the short table answers 1 where the answer is 0', () => {
    const { parents, query } = SHORT_TABLE_WITNESS;
    expect(lcaByPaths(parents, query[0], query[1])).toBe(0);
    expect(lcaWithMode(parents, query[0], query[1], 'full').answer).toBe(0);
    expect(lcaWithMode(parents, query[0], query[1], 'short').answer).toBe(1);
    expect(depthsOf(parents)[6] - depthsOf(parents)[2]).toBe(4);
  });

  it('one level short fails on 6 of the 720 seven-node trees (0.8%), noEqualise on 719, the full table on none', () => {
    const report = brokenReport(7);
    expect(report.trees).toBe(720);
    // Counted here by brute force against the root-path oracle, not copied from the spec.
    const failing = allTrees(7).filter((parents) =>
      [...Array(7).keys()].some((x) => [...Array(7).keys()].some((y) => lcaWithMode(parents, x, y, 'short').answer !== lcaByPaths(parents, x, y))));
    expect(report.shortFails).toBe(failing.length);
    expect(report.shortFails).toBe(6);
    expect(report.shortFails / report.trees).toBeLessThanOrEqual(0.9);
    expect(failing.map((t) => t.join())).toContain(SHORT_TABLE_WITNESS.parents.join());
    for (const t of failing) expect(Math.max(...depthsOf(t)), `${t}`).toBeGreaterThanOrEqual(4);
    expect(report.noEqualiseFails).toBe(719);
    for (const parents of allTrees(7)) {
      for (let x = 0; x < 7; x += 1) for (let y = 0; y < 7; y += 1) expect(lcaWithMode(parents, x, y, 'full').answer).toBe(lcaByPaths(parents, x, y));
    }
  });
});

describe('shortest witnesses and the root clamp', () => {
  it('the shortest no-equalise witness fails and no smaller tree fails, by the root-path oracle', () => {
    const w = shortestWitness('noEqualise')!;
    expect(lcaWithMode(w.parents, w.query[0], w.query[1], 'noEqualise').answer).not.toBe(lcaByPaths(w.parents, w.query[0], w.query[1]));
    expect(lcaWithMode(w.parents, w.query[0], w.query[1], 'full').answer).toBe(lcaByPaths(w.parents, w.query[0], w.query[1]));
    for (let n = 1; n < w.parents.length; n += 1) {
      for (const parents of allTrees(n)) {
        for (let x = 0; x < n; x += 1) for (let y = 0; y < n; y += 1) expect(lcaWithMode(parents, x, y, 'noEqualise').answer, `${parents} (${x}, ${y})`).toBe(lcaByPaths(parents, x, y));
      }
    }
  });
  it('the short table is never wrong on a path of 2 to 16 nodes, and 146 of the 5,040 eight-node trees fail it', () => {
    expect(shortFailsOnPaths(16)).toEqual({ paths: 15, fails: 0 });
    expect(brokenReport(8).shortFails).toBe(146);
  });
});
