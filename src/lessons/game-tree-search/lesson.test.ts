import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import { searchFrames } from './frames';
import lesson from './index';
import { BOARD_PRESETS, DEFAULT_LEAVES, LEAF_MAX, LEAF_MIN, OPENING, parseLeaves, SPEC, swappedBoundsCounterexample } from './presets';
import { knuthMooreMinimum, leafCount, nodeCount, nodeValues, orderingFor, search, subtreeOf, type Ordering } from './tree';
import { EMPTY_BOARD, moveScores, play, searchBoard, sideToMove } from './ttt';
import { pathName, viewAt } from './view';

const ORDERINGS: Ordering[] = ['given', 'best', 'worst', 'random'];

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('game-tree-search');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('game-tree-search')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state, and the preset boards have O to move', () => {
    expect(OPENING.minimax.leaves).toEqual(DEFAULT_LEAVES);
    expect(DEFAULT_LEAVES).toHaveLength(27);
    expect(DEFAULT_LEAVES.every((v) => v >= LEAF_MIN && v <= LEAF_MAX)).toBe(true);
    expect(OPENING.alphabeta).toEqual({ pruning: true, ordering: 'given' });
    expect(OPENING.game.first).toBe('you');
    expect(OPENING.depth).toEqual({ preset: 'corners', depth: 1 });
    expect(BOARD_PRESETS.map((p) => sideToMove(p.board))).toEqual(['O', 'O']);
    expect(parseLeaves(DEFAULT_LEAVES.join(', '))).toEqual({ ok: true, value: DEFAULT_LEAVES });
  });

  it('the default tree is built to teach: given order prunes some, best first reaches the Knuth-Moore minimum, worst first prunes nothing, the value never moves', () => {
    const plain = search(SPEC, DEFAULT_LEAVES, { prune: false });
    const given = search(SPEC, DEFAULT_LEAVES, { prune: true });
    const best = search(SPEC, DEFAULT_LEAVES, { prune: true, order: orderingFor(SPEC, DEFAULT_LEAVES, 'best') });
    const worst = search(SPEC, DEFAULT_LEAVES, { prune: true, order: orderingFor(SPEC, DEFAULT_LEAVES, 'worst') });
    expect(plain.value).toBe(4);
    expect(plain.bestChild).toBe(2);
    expect(given.leaves).toBeLessThan(leafCount(SPEC));
    expect(given.leaves).toBeGreaterThan(knuthMooreMinimum(SPEC));
    expect(best.leaves).toBe(knuthMooreMinimum(SPEC));
    expect(worst.leaves).toBe(leafCount(SPEC));
    expect([given.value, best.value, worst.value]).toEqual([4, 4, 4]);
    expect(nodeValues(SPEC, DEFAULT_LEAVES)[0]).toBe(4);
    expect(search(SPEC, DEFAULT_LEAVES, { prune: true, variant: 'gt' }).leaves).toBeGreaterThan(given.leaves);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the root is worth 4 and the best first move is B', () => {
    const plain = search(SPEC, DEFAULT_LEAVES, { prune: false });
    expect([plain.value, pathName(plain.bestChild, SPEC.b)]).toEqual([4, 'B']);
    expect([FACTS.rootValue, FACTS.bestMove]).toEqual([4, 'B']);
    expect(lesson.tryThis[0]).toContain('to 4 and move B');
  });

  it('try-this 2: alpha-beta looks at fewer than 27 leaves, best first at 11, worst first at 27, all with the same root value', () => {
    expect(FACTS.givenLeaves).toBeLessThan(27);
    expect([FACTS.bestLeaves, FACTS.worstLeaves, FACTS.minimum]).toEqual([11, 27, 11]);
    expect(FACTS.sameValue).toBe(true);
    expect(lesson.tryThis[1]).toContain(`${FACTS.givenLeaves} of 27 leaves`);
    expect(lesson.tryThis[1]).toContain('Worst first: 27 of 27');
  });

  it('try-this 3: clicking the centre, the machine replies and plain minimax searches more positions than alpha-beta, 8 plies deep', () => {
    const after = play(EMPTY_BOARD, 4, 'X');
    const plain = searchBoard(after, 'O', { prune: false });
    const fast = searchBoard(after, 'O', { prune: true });
    expect(plain.nodes).toBeGreaterThan(fast.nodes);
    expect(plain.move).toBe(fast.move);
    expect(plain.nodes.toLocaleString('en-US')).toBe(FACTS.centrePlain);
    expect(FACTS.fullTree).toBe('549,946');
    expect(lesson.tryThis[2]).toContain(`${FACTS.centrePlain} positions`);
    expect(lesson.tryThis[2]).toContain('549,946');
  });

  it('try-this 4: on two corners and the centre, depth 1 picks a losing cell 2 and depth 3 picks the drawing cell 1', () => {
    const scores = moveScores('X...O...X', 'O');
    expect(scores.find((s) => s.cell === 2)!.value).toBeLessThan(0);
    expect(scores.find((s) => s.cell === 1)!.value).toBe(0);
    expect([FACTS.shallowMove, FACTS.shallowOutcome, FACTS.deepMove, FACTS.deepOutcome]).toEqual([2, 'a loss', 1, 'a draw']);
    expect(OPENING.depth.depth).toBe(1);
    expect(lesson.tryThis[3]).toContain('picks cell 2, which is really a loss');
  });

  it('try-this 5: 35^8 = 2,251,875,390,625', () => {
    expect(35n ** 8n).toBe(2_251_875_390_625n);
    expect(FACTS.growth).toBe('2,251,875,390,625');
    expect(lesson.tryThis[4]).toContain('35^8 = 2,251,875,390,625');
  });
});

describe('every ordering, with and without pruning, replays cleanly', () => {
  it('walks the control cross product: captions read cleanly, k never runs backward, skipped nodes are never entered, counts add up', () => {
    let frames = 0;
    for (const prune of [true, false]) {
      for (const ordering of ORDERINGS) {
        const result = search(SPEC, DEFAULT_LEAVES, { prune, order: orderingFor(SPEC, DEFAULT_LEAVES, ordering, 7) });
        const list = searchFrames(SPEC, result, prune);
        let prev = -1;
        for (const f of list) {
          expect(expectCaption(f.say), `${ordering} ${prune}`).not.toMatch(/NaN|undefined|null|Infinity/);
          expect(f.k).toBeGreaterThanOrEqual(prev);
          prev = f.k;
          const view = viewAt(SPEC, result, f.k);
          for (const n of view.struck) expect(view.visited.has(n)).toBe(false);
          frames++;
        }
        const end = viewAt(SPEC, result, result.events.length);
        expect(end.visited.size).toBe(result.nodes);
        expect(end.struck.size + end.visited.size).toBe(nodeCount(SPEC));
        expect(end.values.get(0)).toBe(result.value);
        expect(expectCaption(list[list.length - 1].say)).toContain(`${result.nodes} of ${nodeCount(SPEC)} nodes`);
        if (!prune) expect(result.cutRoots).toEqual([]);
      }
    }
    expect(frames).toBeGreaterThan(300);
  });

  it('every skipped subtree of the default pruned run is a whole subtree, and its root is a child of a visited node', () => {
    const result = search(SPEC, DEFAULT_LEAVES, { prune: true });
    for (const root of result.cutRoots) {
      expect(subtreeOf(root, SPEC).length).toBeGreaterThan(0);
      expect(result.windows.has(Math.floor((root - 1) / SPEC.b))).toBe(true);
      expect(result.windows.has(root)).toBe(false);
    }
  });

  it('the swapped-bounds counterexample really is wrong: minimax and the bug disagree on it', () => {
    const ce = swappedBoundsCounterexample();
    expect(search(SPEC, ce.leaves, { prune: false }).value).toBe(ce.truth);
    expect(search(SPEC, ce.leaves, { prune: true, variant: 'swapped-bounds' }).value).toBe(ce.buggy);
    expect(ce.buggy).not.toBe(ce.truth);
  });
});

describe('hostile input', () => {
  it('leaf values must be exactly 27 whole numbers from -9 to 9; anything else is refused with the reason', () => {
    expect(parseLeaves('1, 2, 3')).toMatchObject({ ok: false, error: expect.stringContaining('27 leaves') });
    expect(parseLeaves(Array.from({ length: 28 }, () => 0).join(','))).toMatchObject({ ok: false });
    expect(parseLeaves(Array.from({ length: 27 }, () => 10).join(','))).toMatchObject({ ok: false, error: expect.stringContaining('outside -9 to 9') });
    expect(parseLeaves(Array.from({ length: 27 }, () => -10).join(','))).toMatchObject({ ok: false });
    expect(parseLeaves(Array.from({ length: 27 }, () => '1.5').join(','))).toMatchObject({ ok: false });
    expect(parseLeaves('')).toMatchObject({ ok: false });
    expect(parseLeaves(Array.from({ length: 27 }, () => -9).join(' '))).toMatchObject({ ok: true });
    expect(parseLeaves(Array.from({ length: 27 }, () => 9).join(','))).toMatchObject({ ok: true });
  });

  it('occupied cells are never offered: the legal moves of a position are exactly its empty cells', () => {
    const board = 'XO.X.O...';
    expect(searchBoard(board, 'X', { prune: true }).move).not.toBeNull();
    for (const s of moveScores(board, 'X')) expect(board[s.cell]).toBe('.');
    expect(moveScores(board, 'X')).toHaveLength(5);
  });
});
