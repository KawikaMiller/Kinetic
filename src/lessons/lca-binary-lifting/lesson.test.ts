import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import {
  MAX_NODES, T0_PARENTS, addLeaf, buildTable, decide, kthAncestor, lca, liftJump, naiveLca, pathStats, startLca, judgeGrandparent,
} from './model';

const table = buildTable(T0_PARENTS);

describe('scenes', () => {
  it('every scene component carries its own key, and no component is shared between scenes', () => {
    const els = sceneElements('lca-binary-lifting');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('lca-binary-lifting')).toEqual([]);
  });

  it('T0 is a tree of 12 nodes with 4 levels, and the tree cap is 16', () => {
    expect(T0_PARENTS).toHaveLength(12);
    expect(table.levels).toBe(4);
    expect(MAX_NODES).toBe(16);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: Fill the rest gives the level rows of the spec', () => {
    expect(FACTS.level1).toBe('0, 0, 0, 0, 0, 0, 1, 1, 1, 3, 6, 2');
    expect(FACTS.level2).toBe('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0');
    expect(FACTS.levels).toBe(4);
    for (let v = 0; v < T0_PARENTS.length; v += 1) expect(judgeGrandparent(T0_PARENTS, v, table.up[1][v]).ok).toBe(true);
    expect(lesson.tryThis[0]).toContain('level 1 is 0, 0, 0, 0, 0, 0, 1, 1, 1, 3, 6, 2');
  });

  it('try-this 2: the lift of 2^1 takes node 10 to node 6', () => {
    const game = startLca(table, 10, 8);
    expect([game.a, game.b, game.remaining]).toEqual([10, 8, 2]);
    expect(liftJump(game, 1).game.a).toBe(6);
    expect(FACTS.liftTo).toBe(6);
  });

  it('try-this 3: skip at k = 3 and k = 2, then Jump at k = 1 is refused with the landings 1 and 1', () => {
    let game = liftJump(startLca(table, 10, 8), 1).game;
    game = decide(game, 'skip').game;
    game = decide(game, 'skip').game;
    expect(game.level).toBe(1);
    expect(decide(game, 'jump').refusal).toBe('The landing nodes are equal (1 and 1): this jump reaches or passes the LCA, so skip it.');
  });

  it('try-this 4: skip at k = 1, then Jump at k = 0 lands on 3 and 4, the answer is node 1 after 2 jumps against 6 steps', () => {
    let game = liftJump(startLca(table, 10, 8), 1).game;
    for (const choice of ['skip', 'skip', 'skip', 'jump'] as const) game = decide(game, choice).game;
    expect([game.phase, game.answer, game.jumps]).toEqual(['done', 1, 2]);
    expect(naiveLca(T0_PARENTS, 10, 8).steps).toBe(6);
    expect([FACTS.answer108, FACTS.jumps108, FACTS.steps108]).toEqual([1, 2, 6]);
    expect(lesson.tryThis[3]).toContain('node 1 after 2 jumps, against 6 parent steps');
  });

  it('try-this 5: nodes 10 and 11 give node 0 with 2 jumps', () => {
    const run = lca(table, 10, 11);
    expect([run.answer, run.jumps]).toEqual([0, 2]);
    expect([FACTS.answer1011, FACTS.jumps1011]).toEqual([0, 2]);
    expect(lesson.tryThis[4]).toContain('node 0 with 2 jumps');
  });
});

describe('numbers the lesson text quotes', () => {
  it('the 5th ancestor of 10 is the root in 2 jumps, a million nodes need 20 levels, a path of 1,024 needs 10 jumps', () => {
    expect([kthAncestor(table, 10, 5)!.node, kthAncestor(table, 10, 5)!.jumps.length]).toEqual([0, 2]);
    expect(FACTS.millionLevels).toBe(20);
    expect([pathStats(1024).jumps, pathStats(1024).steps, pathStats(1024).entries]).toEqual([10, 1023, 10240]);
    expect(FACTS.path1024Entries).toBe(10240);
  });

  it('the broken-mode counts printed on screen come from brute force over all 720 trees', () => {
    expect([FACTS.trees, FACTS.shortFails, FACTS.noEqualiseFails]).toEqual([720, 6, 719]);
    expect(lesson.quiz[1].why).toContain('719 of the 720');
  });

  it('adding leaves keeps the jump table at 4 levels for 13 to 16 nodes', () => {
    let parents: number[] = [...T0_PARENTS];
    for (let i = 0; i < 4; i += 1) parents = (addLeaf(parents, String(parents.length - 1)) as { parents: number[] }).parents;
    expect(parents).toHaveLength(16);
    expect(buildTable(parents).levels).toBe(4);
    expect(lca(buildTable(parents), 15, 8).answer).toBe(naiveLca(parents, 15, 8).answer);
  });
});
