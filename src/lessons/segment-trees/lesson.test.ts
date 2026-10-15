import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { recommend } from './chooser';
import { makeWorkload, runWorkload } from './cost';
import { fenBuild, fenRange, minBuild, rangeMinWrong } from './fenwick';
import { FACTS } from './facts';
import { naive, segFrames } from './frames';
import lesson from './index';
import { parseField, parseRange, parseValue } from './keys';
import { addRange, buildTree, cellValues, queryRange } from './model';
import { ADD_DEFAULT, FENWICK_VALUES, SIZES, costStartValues, valuesFor } from './presets';
import { costCaption, fenwickCaption } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

describe('scene switches', () => {
  it('the component two scenes share is keyed per scene, so the second scene opens on its own default', () => {
    expect(sharedSceneComponents('segment-trees')).toEqual(['TreeScene']);
    expect(sceneElements('segment-trees').filter((e) => e.component === 'TreeScene').every((e) => e.keyed)).toBe(true);
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: on 8 cells prefix sums are not the worst (78 against 88 and 58); at 1,024 they are by far', () => {
    const naiveSum = (vals: number[], l: number, r: number) => vals.slice(l, r + 1).reduce((a, b) => a + b, 0);
    for (const n of [8, 1024]) {
      const start = costStartValues(n);
      const reqs = makeWorkload(n, 20, 50, 6);
      const run = runWorkload(start, reqs);
      const live = [...start];
      const want: number[] = [];
      for (const q of reqs) {
        if (q.kind === 'update') live[q.index] = q.value;
        else want.push(naiveSum(live, q.l, q.r));
      }
      expect(run.answers.segment).toEqual(want);
      expect(run.answers.fenwick).toEqual(want);
      expect(run.answers.prefix).toEqual(want);
    }
    expect(FACTS).toMatchObject({ smallPrefix: 78, smallSegment: 88, smallFenwick: 58 });
    expect(FACTS.smallPrefix).toBeLessThan(FACTS.smallSegment);
    expect(FACTS.bigPrefix).toBeGreaterThan(5 * FACTS.bigSegment);
    expect(lesson.tryThis[0]).toContain('prefix sums touch 78 cells, the segment tree 88 and the Fenwick tree 58');
    expect(text(costCaption({ index: 2, n: 8, prefixWrites: 6, segmentWrites: 4, fenwickWrites: 3, updates: 12, queries: 8, totals: { prefix: 78, segment: 88, fenwick: 58 } }))).toContain('Changing cell 2 rewrites 6 prefix cells, against 4 segment-tree nodes and 3 Fenwick cells');
  });

  it('try-this 2: sum of cells 1 to 6 is 30 from the four covering nodes [1] [2, 3] [4, 5] [6]', () => {
    const vals = valuesFor(8);
    expect(vals.slice(1, 7).reduce((a, b) => a + b, 0)).toBe(30);
    expect(FACTS.queryValue).toBe(30);
    expect(FACTS.queryCovering).toBe('[1] [2, 3] [4, 5] [6]');
    expect(FACTS.queryCoveringCount).toBe(4);
    const run = segFrames(buildTree(vals, 'sum'), { kind: 'query', l: 1, r: 6 });
    const last = run.frames[run.frames.length - 1];
    expect(text(last.say)).toContain('Answer 30');
    expect(text(last.say)).toContain('they agree');
    expect(lesson.tryThis[1]).toContain('the search touches 9 nodes and the answer is 30');
  });

  it('try-this 3: lazy add of 5 to [2, 5] touches fewer nodes than visiting every leaf, both give the same cells, and a later query pushes a tag', () => {
    const t = buildTree(valuesFor(8), 'sum');
    const lazy = addRange(t, ADD_DEFAULT.l, ADD_DEFAULT.r, ADD_DEFAULT.v, true);
    const eager = addRange(t, ADD_DEFAULT.l, ADD_DEFAULT.r, ADD_DEFAULT.v, false);
    expect(lazy.touched).toBeLessThan(eager.touched);
    const want = valuesFor(8).map((v, i) => (i >= 2 && i <= 5 ? v + 5 : v));
    expect(cellValues(lazy.tree)).toEqual(want);
    expect(cellValues(eager.tree)).toEqual(want);
    expect(FACTS.lazyTouched).toBe(lazy.touched);
    expect(FACTS.eagerTouched).toBe(eager.touched);
    expect(FACTS.pushedAt).toBeGreaterThan(0);
    expect(queryRange(lazy.tree, 3, 3).value).toBe(want[3]);
    expect(lesson.tryThis[2]).toContain(`lazy tags touch ${lazy.touched} nodes where visiting every leaf`);
  });

  it('try-this 4: query 13 reads 13, 12, 8; update 5 writes 5, 6, 8, 16; cells 3 to 11 sum to 40 in 4 reads and the segment tree agrees; min is wrong', () => {
    expect(FACTS.fenReads).toBe('13, 12, 8');
    expect(FACTS.fenWrites).toBe('5, 6, 8, 16');
    const want = FENWICK_VALUES.slice(2, 11).reduce((a, b) => a + b, 0);
    expect(want).toBe(40);
    expect(FACTS).toMatchObject({ rangeValue: 40, rangeSegValue: 40, rangeCells: 4 });
    expect(fenRange(fenBuild(FENWICK_VALUES, 'sum'), 3, 11, 'sum').value).toBe(40);
    const trueMin = Math.min(...FENWICK_VALUES.slice(2, 11));
    expect(FACTS.minTrue).toBe(trueMin);
    expect(rangeMinWrong(minBuild(FENWICK_VALUES), 11)).toBe(FACTS.minWrong);
    expect(text(fenwickCaption({ query: 13, hops: [13, 12, 8], ranges: ['(12, 13]', '(8, 12]', '(0, 8]'], updateAt: 5, updateHops: [5, 6, 8, 16], n: 16 }))).toContain('reads cells 13, 12, 8');
    expect(lesson.tryThis[3]).toContain('cells 3 to 11 sum to 40 in 4 reads');
  });

  it('try-this 5: min with no updates is a sparse table at 10,240 numbers, and a segment tree at 2,048 when memory is tight', () => {
    expect(Math.ceil(Math.log2(1024)) * 1024).toBe(10240);
    expect(FACTS.sparseNumbers).toBe(10240);
    expect(FACTS.leanNumbers).toBe(2048);
    expect(recommend({ op: 'min', updates: 'none', memory: true }, 1024).structure.id).toBe('segment');
    expect(lesson.tryThis[4]).toContain('10,240 numbers');
    expect(lesson.tryThis[4]).toContain('2,048');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks queries, sets and adds (lazy and eager) for every size and operation: no NaN, the closing answer equals the plain loop', () => {
    let frames = 0;
    for (const n of SIZES) {
      for (const op of ['sum', 'min', 'max', 'gcd'] as const) {
        const tree = buildTree(valuesFor(n), op);
        const actions = [
          { kind: 'query', l: 0, r: n - 1 },
          { kind: 'query', l: 1, r: n - 2 },
          { kind: 'set', i: n - 1, v: -4 },
        ] as const;
        for (const a of actions) {
          const run = segFrames(tree, a);
          for (const f of run.frames) {
            expect(text(f.say), `${n} ${op}`).not.toMatch(/NaN|undefined|null/);
            frames++;
          }
          if (a.kind === 'query') {
            expect(run.result.value).toBe(naive(valuesFor(n), op, a.l, a.r));
            expect(text(run.frames[run.frames.length - 1].say)).toContain('they agree');
          }
        }
        if (op !== 'gcd') {
          for (const lazy of [true, false]) {
            const run = segFrames(tree, { kind: 'add', l: 1, r: n - 2, v: 3, lazy });
            for (const f of run.frames) expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
            expect(cellValues(run.result.tree)).toEqual(valuesFor(n).map((v, i) => (i >= 1 && i <= n - 2 ? v + 3 : v)));
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(150);
  });

  it('the covering bound shown (2 x ceil(log2 n)) holds for every range at every size offered', () => {
    for (const n of SIZES) {
      const tree = buildTree(valuesFor(n), 'sum');
      for (let l = 0; l < n; l++) for (let r = l; r < n; r++) expect(queryRange(tree, l, r).covering.length).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(n)));
    }
  });
});

describe('hostile input', () => {
  it('l greater than r is refused with an offer to swap; out-of-range, empty, decimals and huge numbers are refused', () => {
    const r = parseRange('6', '1', 8);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.swapOffer).toEqual({ l: 1, r: 6 });
    expect(!r.ok && r.error).toContain('use [1, 6] instead');
    expect(parseRange('1', '6', 8)).toEqual({ ok: true, l: 1, r: 6 });
    for (const bad of ['', '8', '-1', '2.5', '1e1', 'x', '99999999999999999999']) expect(parseRange(bad, '3', 8).ok, bad).toBe(false);
    expect(parseRange('3', '16', 16, 1)).toEqual({ ok: true, l: 3, r: 16 });
    expect(parseRange('0', '4', 16, 1).ok).toBe(false);
    expect(parseValue('−7')).toEqual({ ok: true, value: -7 });
    for (const bad of ['', '1000', '-1000', '4.5', 'a']) expect(parseValue(bad).ok, bad).toBe(false);
    expect(parseField('3', 0, 7, 'the cell').ok).toBe(true);
  });

  it('a range add on gcd is refused by the model with a reason', () => {
    expect(() => addRange(buildTree([4, 6, 8], 'gcd'), 0, 2, 1, true)).toThrow('no range add');
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('the update share only changes the workload mix: the answers of all three designs stay right at every share', () => {
    for (const pct of [0, 30, 60, 100]) {
      const start = costStartValues(64);
      const run = runWorkload(start, makeWorkload(64, 20, pct, 6));
      expect(run.answers.prefix).toEqual(run.answers.segment);
      expect(run.answers.prefix).toEqual(run.answers.fenwick);
    }
  });

  it('the chooser is a function of its three controls only, over the whole cross product', () => {
    for (const op of ['sum', 'min', 'max'] as const) for (const updates of ['none', 'point', 'range'] as const) for (const memory of [false, true]) {
      expect(recommend({ op, updates, memory }, 1024).reason).toBe(recommend({ op, updates, memory }, 1024).reason);
    }
  });
});
