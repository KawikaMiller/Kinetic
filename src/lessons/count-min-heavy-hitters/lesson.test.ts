import { describe, expect, it } from 'vitest';
import { pctText } from '../../core/format';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { breakCaption, gridCaption, heavyCaption, mergeCaption, sizeCaption } from './captions';
import { breakFacts, gridFacts, heavyFacts, mergeFacts, sizeFacts, SMALL_WIDTH } from './facts';
import { GRID_D, GRID_SEED, GRID_W, STREAM_BURST, MAX_ITEM_LENGTH, buildGrid, cleanItem, inspect, undercounted, wordStream } from './grid';
import { heavyRun, quality } from './heavy';
import lesson from './index';
import { MERGE_DEPTH, MERGE_N, MERGE_WIDTH, mergeRun } from './merge';
import { cellsOf, deltaOf, epsilonOf, estimate, itemKey, makeFamily, newSketch, update } from './sketch';
import { DEFAULT_DEPTH, DEFAULT_SEED, DEFAULT_SKEW, DEFAULT_STREAM, DEFAULT_WIDTH, GHOST_DELETES, PLAIN, UNIVERSE, errorRun, overCount, overLimit, underCount, zipfStream } from './stream';

const plain = (node: Parameters<typeof text>[0]) => text(node, { strict: true });
const stream = zipfStream(DEFAULT_STREAM, DEFAULT_SKEW, DEFAULT_SEED);

describe('the grid opens on a collision', () => {
  it('GRID_SEED is the lowest hash seed for which the first burst of 30 items overcounts at least two items', () => {
    const items = wordStream(STREAM_BURST, 7, 0);
    const overcounted = (seed: number) => {
      const s = newSketch(GRID_W, GRID_D, makeFamily(seed, GRID_D));
      const truth = new Map<string, number>();
      for (const i of items) {
        update(s, itemKey(i));
        truth.set(i, (truth.get(i) ?? 0) + 1);
      }
      return [...truth].filter(([i, t]) => estimate(s, itemKey(i)) > t).length;
    };
    expect(overcounted(GRID_SEED)).toBeGreaterThanOrEqual(2);
    for (let seed = 0; seed < GRID_SEED; seed++) expect(overcounted(seed), `seed ${seed}`).toBeLessThan(2);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: streaming 30 items, the item with the biggest error is overcounted by collisions only, and no item is below the truth', () => {
    const f = gridFacts();
    const items = wordStream(STREAM_BURST, 7, 0);
    const truth = items.filter((i) => i === f.word).length;
    expect(f.truth).toBe(truth);
    expect(f.estimate).toBeGreaterThan(f.truth);
    expect(f.below).toBe(0);
    expect(f.shared).toBeGreaterThan(0);
    expect(lesson.tryThis[0]).toContain(`its estimate is ${f.estimate} against a true ${f.truth}`);
    const model = buildGrid(items);
    const look = inspect(model, f.word);
    const c = plain(gridCaption({ items: items.length, model, look }));
    expect(c).toContain(`the estimate is their minimum, ${f.estimate}, against a true ${f.truth}`);
    expect(c).toContain(`The extra ${f.estimate - f.truth} come from other items`);
    expect(c).toContain('No item is estimated below its true count');
  });

  it('try-this 2: at the default size ε·N is about 200 with nothing over the line; the 0.05 chip gives width 55, depth 3', () => {
    const f = sizeFacts();
    expect([f.normal.w, f.normal.d, f.chip.w, f.chip.d]).toEqual([272, 5, 55, 3]);
    expect(f.normal.limit).toBeCloseTo((Math.E / 272) * DEFAULT_STREAM, 6);
    expect(f.chip.limit).toBeCloseTo((Math.E / 55) * DEFAULT_STREAM, 6);
    expect(f.chip.share).toBeLessThanOrEqual(f.chip.delta + 0.02);
    expect(lesson.tryThis[1]).toContain(`ε·N = ${Math.round(f.normal.limit)}`);
    expect(lesson.tryThis[1]).toContain(`${pctText(f.chip.share, 2)} of items are over it, against δ = 5.0%`);
    const run = errorRun(stream, 272, 5, DEFAULT_SEED);
    const c = plain(sizeCaption({ run, w: 272, d: 5 }));
    expect(c).toContain(`${pctText(overLimit(run, epsilonOf(272) * run.n) / UNIVERSE, 1)} of the 2,000 items went over the line, against δ = ${pctText(deltaOf(5), 1)}`);
  });

  it('try-this 3: all five true top items are candidates at the default width, and fewer at width 8', () => {
    const f = heavyFacts();
    expect(f.atDefault).toBe(1);
    expect(f.atSmall).toBeLessThan(1);
    expect(lesson.tryThis[2]).toContain(`recall falls to ${pctText(f.atSmall, 0)}`);
    const state = heavyRun(stream, SMALL_WIDTH, DEFAULT_DEPTH, DEFAULT_SEED, stream.length);
    const q = quality(stream, state);
    const c = plain(heavyCaption({ state, q, n: stream.length }));
    expect(c).toContain(`hold ${q.hits} of the ${q.top.length} true top items`);
    expect(c).toContain(`recall ${pctText(q.recall, 0)}`);
  });

  it('try-this 4: same seeds merge exactly in all 256 cells; different seeds differ in nearly all and undercount the biggest items', () => {
    const f = mergeFacts();
    expect(f).toMatchObject({ cells: MERGE_WIDTH * MERGE_DEPTH, sameEqual: true });
    expect(f.differing).toBeGreaterThan(f.cells / 2);
    expect(f.below).toBeGreaterThan(0);
    expect(lesson.tryThis[3]).toContain(`${f.differing} of ${f.cells} cells differ`);
    const items = zipfStream(MERGE_N, DEFAULT_SKEW, DEFAULT_SEED);
    const same = mergeRun(items, MERGE_WIDTH, MERGE_DEPTH, DEFAULT_SEED, true);
    const diff = mergeRun(items, MERGE_WIDTH, MERGE_DEPTH, DEFAULT_SEED, false);
    expect(plain(mergeCaption({ run: same, sameSeeds: true, items: items.length }))).toContain('exactly the sketch of the combined stream');
    expect(plain(mergeCaption({ run: diff, sameSeeds: false, items: items.length }))).toContain(`${diff.differingCells} of ${diff.merged.counts.length} cells`);
  });

  it('try-this 5: the mean estimator raises the worst overcount; deletes of never-added items undercount some items, none do before', () => {
    const f = breakFacts();
    expect(f.meanWorst).toBeGreaterThan(f.minWorst);
    expect(f.underAtStart).toBe(0);
    expect(f.under).toBeGreaterThan(0);
    expect(lesson.tryThis[4]).toContain(`${f.under} items are undercounted, up from 0`);
    const run = errorRun(stream, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_SEED, { how: 'min', ghostDeletes: GHOST_DELETES });
    const c = plain(breakCaption({ run, how: 'min', ghosts: GHOST_DELETES }));
    expect(c).toContain(`${underCount(run)} items undercounted`);
    expect(c).toContain(`${overCount(run)} items overcounted`);
  });
});

describe('captions agree with the model across the controls', () => {
  it('the break caption says "no item undercounted" exactly when none is, for every estimator, delete and width setting', () => {
    for (const how of ['min', 'mean'] as const) {
      for (const ghostDeletes of [0, GHOST_DELETES]) {
        for (const w of [4, 272]) {
          const run = errorRun(stream, w, 5, DEFAULT_SEED, { how, ghostDeletes });
          const c = plain(breakCaption({ run, how, ghosts: ghostDeletes }));
          expect(c.includes('no item undercounted'), `${how} ${ghostDeletes} ${w}`).toBe(underCount(run) === 0);
        }
      }
    }
  });

  it('the grid caption never claims an exact estimate unless estimate equals truth, and the empty grid is described as empty', () => {
    expect(plain(gridCaption({ items: 0, model: buildGrid([]), look: null }))).toContain('An empty 4 by 16 grid');
    for (let burst = 0; burst < 6; burst++) {
      const items = wordStream(STREAM_BURST, 7, burst);
      const model = buildGrid(items);
      for (const w of new Set(items)) {
        const look = inspect(model, w);
        const c = plain(gridCaption({ items: items.length, model, look }));
        expect(c.includes('the estimate is exact'), `${w} burst ${burst}`).toBe(look.estimate === look.truth);
      }
    }
  });
});

describe('hostile and hidden input', () => {
  it('an empty or over-long item is refused with a message, and surrounding spaces are trimmed', () => {
    expect(cleanItem('')).toMatchObject({ ok: false });
    expect(cleanItem('   ')).toMatchObject({ ok: false });
    expect(cleanItem('x'.repeat(MAX_ITEM_LENGTH + 1))).toMatchObject({ ok: false });
    expect(cleanItem('  apple ')).toEqual({ ok: true, item: 'apple' });
  });

  it('whatever is typed, an item touches exactly d cells inside the grid, and the grid never estimates below the count', () => {
    const typed = ['a', 'ünïcode ✓', '12345', 'with space', '<b>tag</b>', 'x'.repeat(MAX_ITEM_LENGTH)];
    const model = buildGrid([...typed, ...typed, 'a']);
    for (const t of typed) {
      const cells = cellsOf(model.sketch, itemKey(t));
      expect(cells).toHaveLength(GRID_D);
      cells.forEach((c) => { expect(c.col).toBeGreaterThanOrEqual(0); expect(c.col).toBeLessThan(GRID_W); });
    }
    expect(undercounted(model)).toBe(0);
  });

  it('the plain variant has no deletes and the minimum estimator: the model the scenes open on', () => {
    expect(PLAIN).toEqual({ how: 'min', ghostDeletes: 0 });
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
