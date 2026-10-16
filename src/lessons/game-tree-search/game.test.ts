import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  childrenOf, depthOf, firstLeaf, isLeaf, isMax, knuthMooreMinimum, leafCount, nodeCount, nodeValues, orderingFor, scorePrediction, search, subtreeOf, type Spec, type Variant,
} from './tree';
import { EMPTY_BOARD, evaluate, FULL_DEPTH, isOver, machineMove, moveScores, movesOf, openLines, other, play, searchBoard, sideToMove, winnerOf, type Mark } from './ttt';

/** Minimax written recursively on explicit nested arrays: the oracle the heap-numbered search is checked against. */
const nested = (spec: Spec, leaves: readonly number[]): unknown => {
  const build = (depth: number, offset: number): unknown => {
    if (depth === spec.d) return leaves[offset];
    const size = spec.b ** (spec.d - depth - 1);
    return Array.from({ length: spec.b }, (_, k) => build(depth + 1, offset + k * size));
  };
  return build(0, 0);
};
const oracle = (node: unknown, max: boolean): number => (typeof node === 'number' ? node : (max ? Math.max : Math.min)(...(node as unknown[]).map((c) => oracle(c, !max))));

const randomLeaves = (rnd: () => number, n: number, ties: boolean): number[] => (ties ? Array.from({ length: n }, () => Math.floor(rnd() * 19) - 9) : shuffled(n, rnd));
const shuffled = (n: number, rnd: () => number): number[] => {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

describe('heap numbering', () => {
  it('counts, depths, children and leaves of the default 3 x 3 tree', () => {
    const spec = { b: 3, d: 3 };
    expect([nodeCount(spec), leafCount(spec), firstLeaf(spec)]).toEqual([40, 27, 13]);
    expect(childrenOf(0, 3)).toEqual([1, 2, 3]);
    expect(childrenOf(4, 3)).toEqual([13, 14, 15]);
    expect([0, 1, 3, 4, 12, 13, 39].map((i) => depthOf(i, 3))).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(isMax(0, 3)).toBe(true);
    expect(isMax(1, 3)).toBe(false);
    expect(isMax(4, 3)).toBe(true);
    expect(isLeaf(13, spec)).toBe(true);
    expect(isLeaf(12, spec)).toBe(false);
  });
});

describe('minimax and alpha-beta', () => {
  it('a hand-worked tree: leaves 3 5 6 9 1 2 0 -1 give root 5, alpha-beta looks at 5 of 8 leaves and 11 nodes, and cuts the leaf 9 and the last max node', () => {
    const spec = { b: 2, d: 3 };
    const leaves = [3, 5, 6, 9, 1, 2, 0, -1];
    const plain = search(spec, leaves, { prune: false });
    const fast = search(spec, leaves, { prune: true });
    expect(plain.value).toBe(5);
    expect([plain.nodes, plain.leaves]).toEqual([15, 8]);
    expect(fast.value).toBe(5);
    expect([fast.nodes, fast.leaves]).toEqual([11, 5]);
    expect(fast.bestChild).toBe(1);
    expect(fast.cutRoots.sort((a, b) => a - b)).toEqual([6, 10]);
    expect(oracle(nested(spec, leaves), true)).toBe(5);
  });

  it('on 2,000 seeded random trees (b 2 to 4, depth 1 to 6, many ties) alpha-beta returns the minimax value and never visits more than minimax does', () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < 2000; t++) {
      const spec = { b: 2 + Math.floor(rnd() * 3), d: 1 + Math.floor(rnd() * 6) };
      if (leafCount(spec) > 1500) continue;
      const leaves = randomLeaves(rnd, leafCount(spec), true);
      const plain = search(spec, leaves, { prune: false });
      const fast = search(spec, leaves, { prune: true });
      expect(plain.value, `tree ${t}`).toBe(oracle(nested(spec, leaves), true));
      expect(fast.value, `tree ${t}`).toBe(plain.value);
      expect(fast.nodes).toBeLessThanOrEqual(plain.nodes);
      expect(fast.leaves).toBeLessThanOrEqual(plain.leaves);
      expect(plain.nodes).toBe(nodeCount(spec));
      expect(plain.leaves).toBe(leafCount(spec));
      expect(nodeValues(spec, leaves)[0]).toBe(plain.value);
    }
  });

  it('the value never changes with the ordering: given, best first, worst first and seeded random orders all return the minimax value', () => {
    const rnd = mulberry32(2);
    for (let t = 0; t < 600; t++) {
      const spec = { b: 2 + Math.floor(rnd() * 3), d: 2 + Math.floor(rnd() * 4) };
      if (leafCount(spec) > 800) continue;
      const leaves = randomLeaves(rnd, leafCount(spec), t % 2 === 0);
      const truth = oracle(nested(spec, leaves), true);
      for (const kind of ['given', 'best', 'worst', 'random'] as const) {
        const r = search(spec, leaves, { prune: true, order: orderingFor(spec, leaves, kind, t) });
        expect(r.value, `${kind} tree ${t}`).toBe(truth);
      }
    }
  });

  it("a perfectly ordered tree looks at exactly Knuth and Moore's minimum, b^ceil(d/2) + b^floor(d/2) - 1 leaves, for b 2 to 4 and depth 1 to 6", () => {
    const rnd = mulberry32(3);
    for (let b = 2; b <= 4; b++) {
      for (let d = 1; d <= 6; d++) {
        const spec = { b, d };
        if (leafCount(spec) > 4096) continue;
        for (let t = 0; t < 3; t++) {
          const leaves = randomLeaves(rnd, leafCount(spec), false);
          const best = search(spec, leaves, { prune: true, order: orderingFor(spec, leaves, 'best') });
          expect(best.leaves, `b=${b} d=${d}`).toBe(knuthMooreMinimum(spec));
        }
      }
    }
    expect(knuthMooreMinimum({ b: 3, d: 3 })).toBe(9 + 3 - 1);
  });

  it('no ordering of distinct values beats the minimum, worst-first never beats best-first, and worst-first prunes nothing in two-level trees', () => {
    const rnd = mulberry32(4);
    for (const spec of [{ b: 2, d: 2 }, { b: 3, d: 2 }, { b: 4, d: 2 }, { b: 2, d: 4 }, { b: 3, d: 3 }, { b: 3, d: 4 }, { b: 4, d: 3 }]) {
      for (let t = 0; t < 30; t++) {
        const leaves = randomLeaves(rnd, leafCount(spec), false);
        const random = search(spec, leaves, { prune: true, order: orderingFor(spec, leaves, 'random', t) });
        expect(random.leaves).toBeGreaterThanOrEqual(knuthMooreMinimum(spec));
        const best = search(spec, leaves, { prune: true, order: orderingFor(spec, leaves, 'best') });
        const worst = search(spec, leaves, { prune: true, order: orderingFor(spec, leaves, 'worst') });
        expect(worst.leaves).toBeGreaterThanOrEqual(best.leaves);
        if (spec.d === 2) {
          expect(worst.leaves, `${spec.b}x${spec.d} #${t}`).toBe(leafCount(spec));
          expect(worst.cutRoots).toEqual([]);
        }
      }
    }
  });

  it('the strict test (alpha > beta) keeps the value but prunes less on ties; swapped bounds (a min node updating alpha) return a different root value on some tree', () => {
    const rnd = mulberry32(5);
    let strictCostsMore = 0;
    let wrong: { leaves: number[]; spec: Spec } | null = null;
    for (let t = 0; t < 3000; t++) {
      const spec = { b: 2 + Math.floor(rnd() * 2), d: 2 + Math.floor(rnd() * 3) };
      const leaves = randomLeaves(rnd, leafCount(spec), true);
      const truth = search(spec, leaves, { prune: false }).value;
      const ge = search(spec, leaves, { prune: true, variant: 'ge' as Variant });
      const gt = search(spec, leaves, { prune: true, variant: 'gt' as Variant });
      expect(gt.value).toBe(truth);
      expect(gt.nodes).toBeGreaterThanOrEqual(ge.nodes);
      if (gt.nodes > ge.nodes) strictCostsMore++;
      const bad = search(spec, leaves, { prune: true, variant: 'swapped-bounds' as Variant });
      if (bad.value !== truth && wrong === null) wrong = { leaves, spec };
    }
    expect(strictCostsMore).toBeGreaterThan(0);
    expect(wrong).not.toBeNull();
  });

  it('events replay the search: one enter per visited node, a leaf event per evaluated leaf, a return per node, a cut per pruned node', () => {
    const spec = { b: 3, d: 3 };
    const leaves = randomLeaves(mulberry32(6), 27, true);
    const r = search(spec, leaves, { prune: true });
    expect(r.events.filter((e) => e.type === 'enter')).toHaveLength(r.nodes);
    expect(r.events.filter((e) => e.type === 'leaf')).toHaveLength(r.leaves);
    expect(r.events.filter((e) => e.type === 'return')).toHaveLength(r.nodes - r.leaves);
    expect(r.windows.size).toBe(r.nodes);
    const skipped = r.events.flatMap((e) => (e.type === 'cut' ? e.skipped : []));
    expect(skipped.sort((a, b) => a - b)).toEqual(r.cutRoots.slice().sort((a, b) => a - b));
    const skippedNodes = new Set(skipped.flatMap((s) => subtreeOf(s, spec)));
    for (const n of skippedNodes) expect(r.values.has(n)).toBe(false);
    expect(r.nodes + skippedNodes.size).toBe(nodeCount(spec));
  });

  it('prediction scoring counts marked nodes inside skipped subtrees as hits, others as wrong, and untouched cuts as missed', () => {
    const spec = { b: 2, d: 3 };
    expect(scorePrediction([6, 9], [6, 11], spec)).toEqual({ hits: 1, wrong: 1, missed: 1 });
    expect(scorePrediction([13, 14], [6, 11], spec)).toEqual({ hits: 2, wrong: 0, missed: 1 });
    expect(scorePrediction([], [6], spec)).toEqual({ hits: 0, wrong: 0, missed: 1 });
  });
});

describe('tic-tac-toe', () => {
  /** An independent count of the whole game tree: every sequence of moves until a win or a full board. */
  const countTree = (board: string, mark: Mark): number => {
    if (isOver(board)) return 1;
    let n = 1;
    for (const c of movesOf(board)) n += countTree(play(board, c, mark), other(mark));
    return n;
  };

  it('plain minimax from the empty board visits every node of the game tree: 549,946, equal to an exhaustive count, and the value is a draw', () => {
    const plain = searchBoard(EMPTY_BOARD, 'X', { prune: false });
    expect(plain.nodes).toBe(countTree(EMPTY_BOARD, 'X'));
    expect(plain.nodes).toBe(549_946);
    expect(plain.value).toBe(0);
    const fast = searchBoard(EMPTY_BOARD, 'X', { prune: true });
    expect(fast.value).toBe(0);
    expect(fast.move).toBe(plain.move);
    expect(fast.nodes).toBeLessThan(plain.nodes / 10);
  });

  it('alpha-beta and plain minimax agree on the value and the first best move in every reachable position, and never search more', () => {
    const seen = new Set<string>();
    let positions = 0;
    const walk = (board: string, mark: Mark) => {
      if (seen.has(board) || isOver(board)) return;
      seen.add(board);
      if (movesOf(board).length >= 6 || positions % 17 === 0) {
        const plain = searchBoard(board, mark, { prune: false });
        const fast = searchBoard(board, mark, { prune: true });
        expect(fast.value, board).toBe(plain.value);
        expect(fast.move, board).toBe(plain.move);
        expect(fast.nodes, board).toBeLessThanOrEqual(plain.nodes);
      }
      positions++;
      for (const c of movesOf(board)) walk(play(board, c, mark), other(mark));
    };
    walk(EMPTY_BOARD, 'X');
    expect(positions).toBeGreaterThan(4000);
  });

  it('the machine never loses to any opponent strategy: exhaustive over every opponent move sequence, playing O after X and playing X first', () => {
    let games = 0;
    const exhaust = (board: string, mark: Mark, machine: Mark) => {
      if (isOver(board)) {
        games++;
        expect(winnerOf(board), board).not.toBe(other(machine));
        return;
      }
      if (mark === machine) exhaust(play(board, machineMove(board, mark)!, mark), other(mark), machine);
      else for (const c of movesOf(board)) exhaust(play(board, c, mark), other(mark), machine);
    };
    exhaust(EMPTY_BOARD, 'X', 'O');
    const asO = games;
    exhaust(EMPTY_BOARD, 'X', 'X');
    expect(asO).toBeGreaterThan(100);
    expect(games).toBeGreaterThan(asO);
  });

  it('the machine wins when the opponent blunders: it takes a win in one and blocks a loss in one', () => {
    expect(machineMove('XX.OO....', 'X')).toBe(2);
    expect(machineMove('XX.OO....', 'O')).toBe(5);
    expect(machineMove('XX.......', 'O')).toBe(2);
  });

  it('openLines and the heuristic follow the definition on hand-worked boards', () => {
    expect(openLines(EMPTY_BOARD, 'X')).toBe(8);
    expect(openLines('....X....', 'O')).toBe(4);
    expect(openLines('....X....', 'X')).toBe(8);
    expect(evaluate('....X....', 'O')).toBe(-4);
    expect(evaluate('....X....', 'X')).toBe(4);
    expect(sideToMove(EMPTY_BOARD)).toBe('X');
    expect(sideToMove('X........')).toBe('O');
  });

  it('a depth limit stops the search: depth 1 looks at the root and its children only, and a limited search never exceeds the full one', () => {
    const board = EMPTY_BOARD;
    const shallow = searchBoard(board, 'X', { prune: false, depth: 1 });
    expect(shallow.nodes).toBe(1 + 9);
    const full = searchBoard(board, 'X', { prune: false, depth: FULL_DEPTH });
    expect(shallow.nodes).toBeLessThan(full.nodes);
    expect(moveScores(EMPTY_BOARD, 'X')).toHaveLength(9);
    expect(moveScores(EMPTY_BOARD, 'X').every((s) => s.value <= 0)).toBe(true);
  });

  it('the horizon positions: depth 1 picks a worse move than depth 3 does, judged by the perfect value of the move', () => {
    for (const [board, shallowMove, deepMove] of [['X...O...X', 2, 1], ['.X.X..O..', 4, 8]] as const) {
      const mark = sideToMove(board);
      expect(mark).toBe('O');
      const perfect = moveScores(board, mark);
      const best = Math.max(...perfect.map((s) => s.value));
      const value = (cell: number) => perfect.find((s) => s.cell === cell)!.value;
      expect(searchBoard(board, mark, { prune: true, depth: 1 }).move).toBe(shallowMove);
      expect(searchBoard(board, mark, { prune: true, depth: 3 }).move).toBe(deepMove);
      expect(value(shallowMove)).toBeLessThan(best);
      expect(value(deepMove)).toBe(best);
      expect(searchBoard(board, mark, { prune: true }).value).toBe(best);
    }
  });
});
