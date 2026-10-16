import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { COMPARE_SEED, compareRuns } from './compare';
import { FACTS } from './facts';
import { rbFrames } from './frames';
import lesson from './index';
import { KEY_MAX, KEY_MIN, TREE_NODE_LIMIT, parseKey, parseKeyList, refuseOp } from '../../core/keyInput';
import { buildRb, checkRb, checkRules, groupsOf, inOrder, insertKey, recolor, removeKey, sizeOf, type FixCase, type RbTree } from './model';
import { DELETE_PRESETS, GROUP_PRESETS, INSERT_PRESETS, RULES_KEYS, deleteBase, groupKeys, insertStart, randomKeys } from './presets';
import { caseList, compareCaption, groupsCaption, rulesCaption } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Independent check: black count on every root-to-nil path, brute force. */
function blackCounts(t: RbTree): Set<number> {
  const out = new Set<number>();
  const go = (k: number | null, blacks: number) => {
    if (k === null) {
      out.add(blacks + 1);
      return;
    }
    const b = blacks + (t.nodes[k].color === 'B' ? 1 : 0);
    go(t.nodes[k].left, b);
    go(t.nodes[k].right, b);
  };
  go(t.root, 0);
  return out;
}

describe('scene switches', () => {
  it('the component two scenes share is keyed per scene, so the second scene opens on its own default', () => {
    expect(sharedSceneComponents('red-black-trees')).toEqual(['StepScene']);
    expect(sceneElements('red-black-trees').filter((e) => e.component === 'StepScene').every((e) => e.keyed)).toBe(true);
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the opening tree is valid; flipping node 5 breaks rule 3 and rule 4 and names the nodes; flipping it back repairs it', () => {
    const tree = buildRb(RULES_KEYS).tree;
    expect(checkRb(tree)).toEqual([]);
    expect(blackCounts(tree).size).toBe(1);
    const flipped = recolor(tree, 5);
    expect(tree.nodes[5].color).toBe('B');
    expect(flipped.nodes[5].color).toBe('R');
    expect(flipped.nodes[1].color).toBe('R');
    expect(blackCounts(flipped).size).toBeGreaterThan(1);
    const rules = checkRules(flipped);
    expect(rules.map((r) => r.ok)).toEqual([true, true, false, false]);
    expect(rules[2].nodes).toEqual([5, 1]);
    expect(FACTS.flipDetail3).toBe('5 is red and its child 1 is red');
    expect(FACTS.flipDetail4).toBe('below 10 the paths differ: 1 black on the left side, 2 on the right');
    expect(text(rulesCaption(rules))).toContain('Rule 3 is broken: 5 is red and its child 1 is red (1 other rule is broken too)');
    expect(checkRb(recolor(flipped, 5))).toEqual([]);
    expect(lesson.tryThis[0]).toContain('5 is red and its child 1 is red');
    expect(lesson.tryThis[0]).toContain('below 10 the paths differ: 1 black on the left side, 2 on the right');
  });

  it('try-this 2: inserting 14 into sorted 1..13 is uncle red twice with no rotation; zig-zag is triangle then line with 2 rotations and 2 recolours', () => {
    expect(FACTS.uncleKey).toBe(14);
    expect(FACTS.uncleCases).toEqual(['uncle-red', 'uncle-red']);
    expect(FACTS.uncleRotations).toBe(0);
    const u = insertStart('uncle-red', 0);
    const run = rbFrames(u.base, 'insert', u.key);
    expect(run.frames[run.frames.length - 1].recolors).toBe(run.result.recolors);
    expect(checkRb(run.tree)).toEqual([]);
    expect(FACTS.zigCases).toEqual(['triangle', 'line']);
    expect(FACTS.zigRotations).toBe(2);
    expect(FACTS.zigRecolors).toBe(2);
    expect(caseList(FACTS.zigCases)).toBe('uncle black, triangle, then uncle black, line');
    expect(lesson.tryThis[1]).toContain('the cases are uncle red, then uncle red, with 0 rotations');
    expect(lesson.tryThis[1]).toContain('uncle black, triangle, then uncle black, line, 2 rotations and 2 recolours');
  });

  it('try-this 3: deleting 1 from sorted 1..15 runs sibling black-black, sibling red, sibling black-black with one rotation; deleting the red node 12 fixes nothing (its successor 13, a red leaf, is what leaves)', () => {
    expect(FACTS.deleteCases).toEqual(['sibling-black-black', 'sibling-red', 'sibling-black-black']);
    expect(FACTS.deleteRotations).toBe(1);
    const run = rbFrames(deleteBase(), 'delete', 1);
    expect(run.frames[run.frames.length - 1].recolors).toBe(run.result.recolors);
    expect(inOrder(run.tree)).toEqual(range(15).slice(1));
    expect(checkRb(run.tree)).toEqual([]);
    expect(deleteBase().nodes[12].color).toBe('R');
    const twelve = deleteBase().nodes[12];
    expect(twelve.left !== null && twelve.right !== null).toBe(true);
    const successor = deleteBase().nodes[13];
    expect(successor.color === 'R' && successor.left === null && successor.right === null).toBe(true);
    expect(FACTS.redLeafFixes).toBe(0);
    expect(FACTS.redLeafRecolors).toBe(0);
    expect(lesson.tryThis[2]).toContain('sibling black with two black children, then sibling red, then sibling black with two black children');
    expect(lesson.tryThis[2]).toContain('with 0 recolours and no fix-up');
  });

  it('delete recolour captions follow the case: root text only on the root, the absorb text elsewhere, no rotation promised after black-black', () => {
    const run = rbFrames(deleteBase(), 'delete', 1);
    const recolours = run.result.steps.filter((s) => s.kind === 'recolor');
    expect(recolours.length).toBeGreaterThan(0);
    const captions = run.frames.map((fr) => text(fr.say as Parameters<typeof text>[0]));
    for (const s of recolours) {
      if (s.reason === 'root') expect(s.nodes[0]).toBe(s.tree.root);
      if (s.reason === 'absorb') expect(s.nodes[0]).not.toBe(s.tree.root);
    }
    const absorb = recolours.find((s) => s.reason === 'absorb');
    expect(absorb).toBeDefined();
    expect(captions.some((c) => c.includes(`Blacken ${absorb?.nodes[0]}: this node is red`))).toBe(true);
    expect(captions.some((c) => c.includes('The root must be black') && absorb && c.includes(`${absorb.nodes[0]} is blackened`))).toBe(false);
    const bb = recolours.find((s) => s.reason === 'sibling-black-black');
    expect(bb).toBeDefined();
    expect(captions.some((c) => c.includes('the sibling turns red, so both sides lose one black'))).toBe(true);
    expect(captions.some((c) => c.includes('Recolour') && c.includes('the colours the rotation needs'))).toBe(false);
  });

  it('try-this 4: sorted 1..15 regroups into 8 2-nodes, 2 3-nodes and 1 4-node, leaf nodes 2 down; inserting 16 splits one 4-node with one rotation', () => {
    const tree = buildRb(range(15)).tree;
    const groups = groupsOf(tree);
    expect(FACTS).toMatchObject({ twos: 8, threes: 2, fours: 1, leafDepth: 2, splits16: 1, rotations16: 1 });
    expect(groups.flatMap((g) => g.keys).length).toBe(15);
    expect(text(groupsCaption({ twos: 8, threes: 2, fours: 1, leafDepth: 2, keys: 15 }))).toContain('15 keys regroup into 8 2-nodes, 2 3-nodes, 1 4-node');
    expect(groups.filter((g) => g.keys.length === 3)).toHaveLength(1);
    expect(groupsOf(insertKey(tree, 16).tree).flatMap((g) => g.keys).sort((x, y) => x - y)).toEqual(range(16));
    expect(lesson.tryThis[3]).toContain('8 2-nodes, 2 3-nodes and 1 4-node, all leaf nodes 2 levels down');
    expect(lesson.tryThis[3]).toContain('it splits 1 4-node');
  });

  it('try-this 5: at seed 5 both trees end 12 tall; red-black rotates less per insert and its worst delete is 3 against 7; sorted order is 18 against 10', () => {
    const r = compareRuns('random', COMPARE_SEED);
    expect(FACTS.randomRbHeight).toBe(12);
    expect(FACTS.randomAvlHeight).toBe(12);
    expect(r.rb.insert.meanRotations).toBeLessThan(r.avl.insert.meanRotations);
    expect(FACTS.rbDeleteMax).toBe(3);
    expect(FACTS.avlDeleteMax).toBe(7);
    expect(FACTS.sortedRbHeight).toBe(18);
    expect(FACTS.sortedAvlHeight).toBe(10);
    // independent: a perfect tree of 1,023 keys is 10 levels, which is what AVL reaches on sorted input
    expect(Math.log2(1024)).toBe(10);
    const c = text(compareCaption({ order: 'Random', rbHeight: 12, avlHeight: 12, rbDeleteMax: 3, avlDeleteMax: 7, rbInsertMean: 0.57, avlInsertMean: 0.67 }));
    expect(c).toContain('the same height as the AVL tree\'s 12');
    expect(c).toContain('fewer rotations on average (0.57 against 0.67)');
    expect(lesson.tryThis[4]).toContain('the red-black tree ends 12 levels tall and the AVL tree 12');
    expect(lesson.tryThis[4]).toContain('18 levels tall against 10');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every insert and delete preset: no NaN, the closing caption and counters agree with the result', () => {
    let frames = 0;
    const runs = [
      ...INSERT_PRESETS.map((p) => {
        const s = insertStart(p.id, 7);
        return rbFrames(s.base, 'insert', s.key);
      }),
      ...DELETE_PRESETS.map((p) => rbFrames(p.base(), 'delete', p.key)),
      ...[1, 6, 8, 15].map((k) => rbFrames(deleteBase(), 'delete', k)),
    ];
    for (const run of runs) {
      for (const f of run.frames) {
        expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
        frames++;
      }
      const last = run.frames[run.frames.length - 1];
      expect(last.rotations).toBe(run.result.rotations.length);
      expect(last.recolors).toBe(run.result.recolors);
      expect(checkRb(run.tree)).toEqual([]);
    }
    expect(frames).toBeGreaterThan(60);
  });

  it('each fix-up frame names the case the model reports, and a deleted black node rings the short spot', () => {
    const run = rbFrames(deleteBase(), 'delete', 1);
    const named = run.frames.filter((f) => f.fixCase !== null).map((f) => f.fixCase);
    expect(named).toEqual(FACTS.deleteCases);
    const removeFrame = run.frames.find((f) => f.short !== null);
    expect(removeFrame?.short).not.toBeNull();
    for (const f of run.frames) if (f.fixCase) expect(text(f.say)).toContain(f.fixCase.startsWith('uncle') || f.fixCase === 'triangle' || f.fixCase === 'line' ? 'uncle' : 'sibling');
  });

  it('flipping each node of the opening tree: the rule caption names a rule exactly when the independent check finds one broken', () => {
    const tree = buildRb(RULES_KEYS).tree;
    for (const k of inOrder(tree)) {
      const flipped = recolor(tree, k);
      const caption = text(rulesCaption(checkRules(flipped)));
      const problems = checkRb(flipped);
      expect(caption.startsWith('Rule'), `flip ${k}`).toBe(problems.length > 0);
      expect(caption.startsWith('All four rules hold'), `flip ${k}`).toBe(problems.length === 0);
      const rootRed = flipped.nodes[flipped.root as number].color === 'R';
      const redRed = Object.values(flipped.nodes).some((n) => n.color === 'R' && [n.left, n.right].some((c) => c !== null && flipped.nodes[c].color === 'R'));
      expect(checkRules(flipped)[1].ok).toBe(!rootRed);
      expect(checkRules(flipped)[2].ok).toBe(!redRed);
      expect(checkRules(flipped)[3].ok).toBe(blackCounts(flipped).size === 1);
    }
  });

  it('the comparison caption picks its words from the numbers: taller, shorter or the same; fewer, more or the same', () => {
    const base = { order: 'Sorted', rbHeight: 18, avlHeight: 10, rbDeleteMax: 3, avlDeleteMax: 4, rbInsertMean: 0.98, avlInsertMean: 0.99 };
    expect(text(compareCaption(base))).toContain('taller than the AVL tree\'s 10');
    expect(text(compareCaption({ ...base, rbHeight: 9 }))).toContain('shorter than');
    expect(text(compareCaption({ ...base, rbInsertMean: 1.2 }))).toContain('more rotations on average');
    expect(text(compareCaption({ ...base, rbInsertMean: 0.99 }))).toContain('the same rotations on average');
    expect(text(compareCaption({ ...base, rbDeleteMax: 5 }))).toContain('which is more in the worst case');
  });
});

describe('hostile input', () => {
  it('a key list refuses empty, non-integers, huge numbers, duplicates and more than 31', () => {
    expect(parseKeyList('')).toMatchObject({ ok: false });
    expect(parseKeyList('1.5')).toMatchObject({ ok: false });
    expect(parseKeyList('99999999999999999999')).toMatchObject({ ok: false });
    expect(parseKeyList(`${KEY_MAX + 1}`)).toMatchObject({ ok: false });
    expect(parseKeyList(`${KEY_MIN - 1}`)).toMatchObject({ ok: false });
    const dup = parseKeyList('5 3 5');
    expect(dup.ok ? '' : dup.error).toContain('already in the tree');
    expect(parseKeyList(Array.from({ length: TREE_NODE_LIMIT + 1 }, (_, i) => i).join(' '))).toMatchObject({ ok: false });
    expect(parseKeyList('30 10 20')).toEqual({ ok: true, value: [30, 10, 20] });
    expect(parseKey('42')).toEqual({ ok: true, value: 42 });
    expect(parseKey('x').ok).toBe(false);
  });

  it('insert and delete refuse duplicates, a full tree, a missing key and an empty tree', () => {
    expect(refuseOp('insert', 5, 3, true)).toContain('already in the tree');
    expect(refuseOp('insert', 5, TREE_NODE_LIMIT, false)).toContain(`${TREE_NODE_LIMIT} nodes`);
    expect(refuseOp('delete', 5, 0, false)).toContain('empty');
    expect(refuseOp('delete', 5, 3, false)).toContain('not in the tree');
  });

  it('emptying a tree key by key keeps every rule, ends empty, and the group view of an empty tree is empty', () => {
    let tree = buildRb([4, 2, 6, 1, 3, 5, 7]).tree;
    for (const k of [4, 1, 7, 2, 6, 3, 5]) {
      tree = removeKey(tree, k).tree;
      expect(checkRb(tree)).toEqual([]);
    }
    expect(sizeOf(tree)).toBe(0);
    expect(groupsOf(tree)).toEqual([]);
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the seed only changes the random presets: sorted, zig-zag and uncle-red starts are the same at every seed', () => {
    for (const seed of [0, 1, 7, 99]) {
      expect(inOrder(insertStart('sorted', seed).base)).toEqual(range(14));
      expect(insertStart('zigzag', seed).key).toBe(20);
      expect(insertStart('uncle-red', seed).key).toBe(14);
      expect(groupKeys('sorted', seed)).toEqual(range(15));
      expect(groupKeys('zigzag', seed)).toEqual([30, 10, 20]);
    }
    expect(randomKeys(1)).not.toEqual(randomKeys(2));
    for (const p of GROUP_PRESETS) expect(checkRb(buildRb(groupKeys(p.id, 3)).tree)).toEqual([]);
  });

  it('the comparison seed only matters for random order: sorted runs are identical at every seed', () => {
    const a = compareRuns('sorted', 1);
    const b = compareRuns('sorted', 2);
    expect(a.rbHeight).toEqual(b.rbHeight);
    expect(a.avlHeight).toEqual(b.avlHeight);
    expect(a.rb.insert).toEqual(b.rb.insert);
  });
});

describe('every fix-up case the captions name is reached', () => {
  it('the presets between them visit uncle red, triangle, line and the four delete cases', () => {
    const seen = new Set<FixCase>();
    for (const p of INSERT_PRESETS) {
      const s = insertStart(p.id, 7);
      for (const c of rbFrames(s.base, 'insert', s.key).frames) if (c.fixCase) seen.add(c.fixCase as FixCase);
    }
    for (const p of DELETE_PRESETS) for (const c of rbFrames(p.base(), 'delete', p.key).frames) if (c.fixCase) seen.add(c.fixCase as FixCase);
    expect([...seen].sort()).toEqual(['far-nephew-red', 'line', 'near-nephew-red', 'sibling-black-black', 'sibling-red', 'triangle', 'uncle-red']);
  });
});
