import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { opFrames } from './frames';
import { FACTS } from './facts';
import { avlBound, growthSeries } from './growth';
import lesson from './index';
import { KEY_MAX, KEY_MIN, NODE_LIMIT, parseKey, parseKeyList, refuseOp } from './keys';
import {
  applyChoice,
  balanceOf,
  buildAvl,
  buildBalanced,
  buildBst,
  checkAvl,
  fibonacciTree,
  heightOf,
  inOrder,
  insertKey,
  removeKey,
  sizeOf,
  stopAtImbalance,
  type Choice,
} from './model';
import { CASE_PRESETS, COMPARE_PRESETS, DEFAULT_SEED, FIB_HEIGHTS, SORTED_KEYS, caseBase, deleteBase, presetKeys, randomKeys } from './presets';
import { CASE_NAME, compareCaption, pickCaption, worstCaption } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const CHOICES: Choice[] = ['right', 'left', 'left-right', 'right-left'];

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: sorted 1 to 15 is a chain of 15 in a plain tree and 4 levels after 11 rotations in an AVL tree', () => {
    // independent: a chain has one level per key; a perfect tree has ceil(log2(n + 1)) levels; n - log2(n + 1) rotations
    expect(heightOf(buildBst(SORTED_KEYS))).toBe(15);
    const avl = buildAvl(SORTED_KEYS);
    expect(heightOf(avl.tree)).toBe(Math.ceil(Math.log2(16)));
    expect(avl.rotations).toBe(15 - Math.log2(16));
    const caption = compareCaption({ n: 15, plainHeight: 15, avlHeight: 4, best: 4, rotations: avl.rotations });
    expect(caption).toContain('plain tree is 15 levels tall');
    expect(caption).toContain('the AVL tree is 4');
    expect(caption).toContain('after 11 rotations');
    expect(lesson.tryThis[0]).toContain('15 levels tall');
    expect(lesson.tryThis[0]).toContain('4 levels after 11 rotations');
  });

  it('try-this 1 (second half): zig-zag 30, 10, 20 is 3 levels plain; AVL does one double rotation (2 rotations) and puts 20 on top, 2 levels', () => {
    expect(heightOf(buildBst([30, 10, 20]))).toBe(3);
    const avl = buildAvl([30, 10, 20]);
    expect(avl.rotations).toBe(2);
    expect(avl.fixes).toBe(1);
    expect(avl.tree.root).toBe(20);
    expect(heightOf(avl.tree)).toBe(2);
    expect(lesson.tryThis[0]).toContain('3 levels');
    expect(lesson.tryThis[0]).toContain('2 rotations (one double rotation)');
    expect(lesson.tryThis[0]).toContain('20 on top, 2 levels tall');
  });

  it('try-this 2: inserting 5 into the left-left tree puts 20 out of balance, one rotation fixes it, the checked nodes end up green', () => {
    const { frames, tree, result } = opFrames(caseBase('LL'), 'insert', 5);
    const unbalanced = result.steps.find((s) => s.kind === 'unbalanced');
    expect(unbalanced).toMatchObject({ at: 20, case: 'LL' });
    expect(result.rotations).toHaveLength(1);
    expect(result.rotations[0]).toEqual({ kind: 'right', down: 20, up: 10 });
    expect(checkAvl(tree)).toEqual([]);
    const last = frames[frames.length - 1];
    expect(last).toMatchObject({ rotations: 1, fixes: 1 });
    expect(last.checked.length).toBeGreaterThan(0);
    expect(text(last.say)).toContain('Done: 1 rotation in 1 fix');
    expect(lesson.tryThis[1]).toContain('20 goes out of balance');
    expect(lesson.tryThis[1]).toContain('1 rotation, 1 fix');
  });

  it('try-this 3: on puzzle 3 a single right rotation leaves 25 at +2, undo works, left-then-right is valid', () => {
    const state = stopAtImbalance(caseBase('LR'), 27)!;
    expect(state.at).toBe(50);
    expect(balanceOf(state.tree, 50)).toBe(-2);
    const wrong = applyChoice(state, 'right');
    expect(wrong.valid).toBe(false);
    expect(wrong.tree.root).toBe(25);
    expect(balanceOf(wrong.tree, 25)).toBe(2);
    expect(text(pickCaption(state, { choice: 'right', outcome: wrong }))).toContain('just swaps which side is heavy');
    const right = applyChoice(state, 'left-right');
    expect(right.valid).toBe(true);
    expect(text(pickCaption(state, { choice: 'left-right', outcome: right }))).toContain('repairs the left-right case');
    expect(lesson.tryThis[2]).toContain('25 now at +2');
    expect(text(pickCaption(state, null))).not.toContain('left-right');
  });

  it('try-this 4: deleting 20 from the thinnest tree of height 6 repairs 2 ancestors with 2 rotations; an insert repairs at most one', () => {
    const t = deleteBase();
    expect(sizeOf(t)).toBe(20);
    const r = removeKey(t, 20);
    expect(r.fixes).toBe(2);
    expect(r.rotations).toHaveLength(2);
    expect(checkAvl(r.tree)).toEqual([]);
    expect(inOrder(r.tree)).toEqual(inOrder(t).filter((k) => k !== 20));
    const frames = opFrames(t, 'delete', 20).frames;
    expect(frames[frames.length - 1]).toMatchObject({ rotations: 2, fixes: 2 });
    expect(frames[frames.length - 1].log).toHaveLength(2);
    expect(lesson.tryThis[3]).toContain('2 rotations across 2 ancestors');
    for (let k = 21; k <= 24; k++) expect(insertKey(t, k).fixes).toBeLessThanOrEqual(1);
  });

  it('try-this 5: at height 5 the thinnest AVL tree has 12 nodes and a packed tree of 12 is 4 levels tall', () => {
    const thin = fibonacciTree(5);
    expect(sizeOf(thin)).toBe(12);
    expect(heightOf(buildBalanced(inOrder(thin)))).toBe(Math.ceil(Math.log2(13)));
    expect(text(worstCaption({ height: 5, nodes: 12, shortest: 4 }))).toContain('has only 12 nodes');
    expect(lesson.tryThis[4]).toContain('12 nodes');
    expect(lesson.tryThis[4]).toContain('only 4 levels tall');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every case preset x insert and the delete presets: no NaN, the closing caption matches the counts', () => {
    let frames = 0;
    const runs = [
      ...CASE_PRESETS.map((p) => opFrames(caseBase(p.id), 'insert', p.key)),
      opFrames(deleteBase(), 'delete', 20),
      ...[1, 8, 15].map((k) => opFrames(buildAvl(SORTED_KEYS).tree, 'delete', k)),
    ];
    for (const run of runs) {
      for (const f of run.frames) {
        expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
        frames++;
      }
      const last = run.frames[run.frames.length - 1];
      expect(last.rotations).toBe(run.result.rotations.length);
      expect(last.fixes).toBe(run.result.fixes);
      expect(text(last.say)).toContain(`${last.rotations} ${last.rotations === 1 ? 'rotation' : 'rotations'}`);
      expect(checkAvl(run.tree)).toEqual([]);
    }
    expect(frames).toBeGreaterThan(40);
  });

  it('the pick caption for 4 puzzles x 4 buttons names only what happened: refused, repairs, or still out of balance', () => {
    for (const p of CASE_PRESETS) {
      const state = stopAtImbalance(caseBase(p.id), p.key)!;
      for (const choice of CHOICES) {
        const outcome = applyChoice(state, choice);
        const c = text(pickCaption(state, { choice, outcome }));
        expect(c, `${p.id} + ${choice}`).not.toMatch(/NaN|undefined|null/);
        if (!outcome.applied) expect(c).toContain('cannot be done');
        else if (outcome.valid) expect(c).toContain(`repairs the ${CASE_NAME[p.id]} case`);
        else expect(c).toContain('still out of balance');
      }
    }
  });

  it('the compare caption says the plain tree is not taller exactly when the heights match', () => {
    for (const preset of COMPARE_PRESETS) {
      const keys = presetKeys(preset.id, DEFAULT_SEED);
      const plainHeight = heightOf(buildBst(keys));
      const avl = buildAvl(keys);
      const caption = compareCaption({ n: keys.length, plainHeight, avlHeight: heightOf(avl.tree), best: Math.ceil(Math.log2(keys.length + 1)), rotations: avl.rotations });
      expect(caption.includes('did not hurt the plain tree'), preset.id).toBe(plainHeight === heightOf(avl.tree));
    }
  });
});

describe('hostile input', () => {
  it('a key list refuses empty, non-integers, huge numbers, duplicates and more than 31, and keeps nothing', () => {
    expect(parseKeyList('')).toMatchObject({ ok: false });
    expect(parseKeyList('  ,  ')).toMatchObject({ ok: false });
    expect(parseKeyList('1.5')).toMatchObject({ ok: false });
    expect(parseKeyList('1e3')).toMatchObject({ ok: false });
    expect(parseKeyList('abc 4')).toMatchObject({ ok: false });
    expect(parseKeyList('99999999999999999999999')).toMatchObject({ ok: false });
    expect(parseKeyList(`${KEY_MAX + 1}`)).toMatchObject({ ok: false });
    expect(parseKeyList(`${KEY_MIN - 1}`)).toMatchObject({ ok: false });
    const dup = parseKeyList('5 3 5');
    expect(dup).toMatchObject({ ok: false });
    expect(dup.ok ? '' : dup.error).toContain('already in the tree');
    const many = Array.from({ length: NODE_LIMIT + 1 }, (_, i) => i).join(' ');
    expect(parseKeyList(many)).toMatchObject({ ok: false });
    expect(parseKeyList(many.split(' ').slice(0, NODE_LIMIT).join(' '))).toMatchObject({ ok: true });
    expect(parseKeyList('30, 10 ,20')).toEqual({ ok: true, value: [30, 10, 20] });
    expect(parseKeyList(`${KEY_MIN} ${KEY_MAX} −7`)).toEqual({ ok: true, value: [KEY_MIN, KEY_MAX, -7] });
  });

  it('a single key is read exactly and refused outside the range', () => {
    expect(parseKey('42')).toEqual({ ok: true, value: 42 });
    expect(parseKey('')).toMatchObject({ ok: false });
    expect(parseKey('4 2')).toMatchObject({ ok: false });
    expect(parseKey('1000')).toMatchObject({ ok: false });
  });

  it('insert and delete refuse duplicates, a full tree, a missing key and an empty tree, each with its own words', () => {
    expect(refuseOp('insert', 5, 3, true)).toContain('already in the tree');
    expect(refuseOp('insert', 5, NODE_LIMIT, false)).toContain(`${NODE_LIMIT} nodes`);
    expect(refuseOp('insert', 5, 3, false)).toBeNull();
    expect(refuseOp('delete', 5, 0, false)).toContain('empty');
    expect(refuseOp('delete', 5, 3, false)).toContain('not in the tree');
    expect(refuseOp('delete', 5, 3, true)).toBeNull();
  });

  it('deleting everything one by one ends on an empty tree that refuses another delete', () => {
    let tree = buildAvl([4, 2, 6, 1, 3]).tree;
    for (const k of [4, 1, 6, 2, 3]) tree = removeKey(tree, k).tree;
    expect(sizeOf(tree)).toBe(0);
    expect(tree.root).toBeNull();
    expect(refuseOp('delete', 4, sizeOf(tree), false)).toContain('empty');
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the seed only changes the Random preset: sorted and zig-zag keys are the same at every seed', () => {
    for (const seed of [0, 1, 7, 99, 2 ** 31 - 1]) {
      expect(presetKeys('sorted', seed)).toEqual(SORTED_KEYS);
      expect(presetKeys('zigzag', seed)).toEqual([30, 10, 20]);
    }
    expect(randomKeys(1)).not.toEqual(randomKeys(2));
    expect(new Set(randomKeys(5)).size).toBe(15);
  });

  it('a random-order AVL tree is valid for 100 seeds and never taller than the bound', () => {
    for (let seed = 0; seed < 100; seed++) {
      const keys = randomKeys(seed);
      const avl = buildAvl(keys);
      expect(checkAvl(avl.tree)).toEqual([]);
      expect(heightOf(avl.tree)).toBeLessThanOrEqual(avlBound(keys.length));
    }
  });

  it('the height picker offers only trees the drawing holds', () => {
    for (const h of FIB_HEIGHTS) expect(sizeOf(fibonacciTree(h))).toBeLessThanOrEqual(NODE_LIMIT);
  });
});

describe('the growth plot is measured, not drawn', () => {
  it('plain-on-sorted height equals n, AVL-on-sorted equals ceil(log2(n + 1)), and every AVL point sits under the bound', () => {
    const s = growthSeries(255, 3);
    expect(s.plainSorted).toEqual(s.n);
    s.n.forEach((n, i) => {
      expect(s.avlSorted[i]).toBe(Math.ceil(Math.log2(n + 1)));
      expect(s.avlRandom[i]).toBeLessThanOrEqual(avlBound(n));
      expect(s.avlRandom[i]).toBeGreaterThanOrEqual(Math.ceil(Math.log2(n + 1)));
    });
  });

  it('the same seed gives the same random series and another seed a different one', () => {
    expect(growthSeries(127, 5).avlRandom).toEqual(growthSeries(127, 5).avlRandom);
    expect(growthSeries(255, 1).avlRandom).not.toEqual(growthSeries(255, 2).avlRandom);
  });
});

describe('quiz facts', () => {
  it('the quiz numbers match the model', () => {
    expect(FACTS.avlSortedHeight).toBe(4);
    expect(FACTS.plainSortedHeight).toBe(15);
    expect(FACTS.deleteFixes).toBe(2);
    expect(FACTS.pickInOrderSame).toBe(true);
    expect(FACTS.pickRightValid).toBe(true);
  });
});
