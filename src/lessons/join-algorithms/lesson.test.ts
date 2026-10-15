import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { costCaption } from './captions';
import { hashFrames, mergeFrames, nestedFrames, type JoinFrame } from './frames';
import { BUCKETS, SHORT_LABEL, bruteForce, cheapestAndDearest, costTable, hashJoin, hashPlan, mergeJoin, nestedLoop, withVerdicts, type Row, type Tables } from './join';
import { DEFAULT_SPEC, makeTables, type Shape, type TableSpec } from './tables';
import lesson from './index';

const caption = (f: JoinFrame) => text(f.say, { strict: true });
const T = makeTables(DEFAULT_SPEC);
const cost = (t: Tables, id: string) => costTable(t, 'eq').find((r) => r.id === id)!.cost!;

describe('try-this entries, from the default tables (8 customers, 12 orders), as written', () => {
  it('try-this 1: the plain nested loop makes 96 comparisons and the index makes 16 node visits for the same pairs', () => {
    const plain = nestedLoop(T, 'eq', false);
    const indexed = nestedLoop(T, 'eq', true);
    expect([T.a.length, T.b.length]).toEqual([8, 12]);
    expect([plain.work, indexed.work]).toEqual([96, 16]);
    expect(indexed.pairs.length).toBe(plain.pairs.length);
    expect(lesson.tryThis[0]).toContain('96 comparisons');
    expect(lesson.tryThis[0]).toContain(`${indexed.work} node visits`);
    const frames = nestedFrames(T, true);
    expect(caption(frames.at(-1)!)).toContain('Without the index the same join takes 96 comparisons');
    expect(caption(nestedFrames(T, false).at(-1)!)).toContain('Switch on the index and the same join takes 16 node visits');
  });

  it('try-this 2: the default memory fits and spills nothing; at 3 rows the build side splits into 3 batches and spills rows, the operations unchanged', () => {
    expect(hashPlan(T, 16).batches).toBe(1);
    expect(hashJoin(T, 16).rowsSpilled).toBe(0);
    const spill = hashJoin(T, 3);
    expect(spill.batches).toBe(3);
    expect(spill.rowsSpilled).toBeGreaterThan(0);
    expect(spill.work).toBe(hashJoin(T, 16).work);
    expect(lesson.tryThis[1]).toContain(`${spill.rowsSpilled} rows are spilled in 3 batches`);
    expect(lesson.tryThis[1]).toContain(`${spill.work}.`);
    expect(hashFrames(T, 8).every((f) => !(f.say && caption(f).includes('spilled so far')))).toBe(true);
    expect(hashFrames(T, 3).some((f) => caption(f).includes('spilled so far'))).toBe(true);
  });

  it('try-this 3: sorting is part of the merge join\'s count by default and free when the inputs are already sorted', () => {
    const sorting = mergeJoin(T, false);
    const presorted = mergeJoin(T, true);
    expect(sorting.sortComparisons).toBeGreaterThan(0);
    expect(presorted.sortComparisons).toBe(0);
    expect(lesson.tryThis[2]).toContain(`costs ${sorting.work} comparisons, ${sorting.sortComparisons} of them sorting`);
    expect(lesson.tryThis[2]).toContain(`it costs ${presorted.work}.`);
    expect(sorting.work - presorted.work).toBe(sorting.sortComparisons);
  });

  it('try-this 4: the nested loop is the dearest at 96; with a.key < b.key hash and merge are refused', () => {
    const rows = withVerdicts(costTable(T, 'eq'));
    expect(rows.find((r) => r.id === 'nested')).toMatchObject({ cost: 96, verdict: 'dearest' });
    const { cheapest } = cheapestAndDearest(rows);
    expect(lesson.tryThis[3]).toContain(`${cheapest.map((id) => SHORT_LABEL[id]).join(' and ')} at ${rows.find((r) => r.id === cheapest[0])!.cost} units`);
    const lt = withVerdicts(costTable(T, 'lt'));
    expect(lt.filter((r) => r.verdict === 'refused').map((r) => r.id)).toEqual(['indexNested', 'hash', 'merge', 'mergeSorted']);
    expect(text(costCaption(lt, T, 'lt'), { strict: true })).toContain('leaves only the nested loop: 96 comparisons');
  });

  it('try-this 5: with one customer the index nested loop costs less than the hash join', () => {
    const one = makeTables({ ...DEFAULT_SPEC, oneCustomer: true });
    expect(cost(one, 'indexNested')).toBeLessThan(cost(one, 'hash'));
    expect(lesson.tryThis[4]).toContain(`${cost(one, 'indexNested')} units and the hash join ${cost(one, 'hash')}`);
    expect(text(costCaption(withVerdicts(costTable(one, 'eq')), one, 'eq'), { strict: true })).toContain('the cheapest is Nested loop + index');
  });
});

describe('the frames tell the truth about the run (AC-0/T3 #14), over the shapes and sizes', () => {
  const SHAPES: Shape[] = ['default', 'manyToMany', 'nulls'];
  const SPECS: TableSpec[] = SHAPES.flatMap((shape) => [[4, 4], [8, 12], [16, 16], [16, 4]].flatMap(([sizeA, sizeB]) => [false, true].map((oneCustomer) => ({ shape, sizeA, sizeB, oneCustomer }))));

  it('every run ends on the model\'s total, with the pairs the model found and a counter that never goes down', () => {
    for (const spec of SPECS) {
      const t = makeTables(spec);
      const runs: [string, JoinFrame[], { work: number; pairs: unknown[] }][] = [
        ['nested', nestedFrames(t, false), nestedLoop(t, 'eq', false)],
        ['index', nestedFrames(t, true), nestedLoop(t, 'eq', true)],
        ['hash fits', hashFrames(t, 99), hashJoin(t, 99)],
        ['hash spills', hashFrames(t, 2), hashJoin(t, 2)],
        ['merge', mergeFrames(t, false), mergeJoin(t, false)],
        ['merge sorted', mergeFrames(t, true), mergeJoin(t, true)],
      ];
      for (const [name, frames, run] of runs) {
        const label = `${name} ${JSON.stringify(spec)}`;
        const last = frames.at(-1)!;
        expect(last.work, label).toBe(run.work);
        expect(last.out, label).toBe(run.pairs.length);
        frames.forEach((f, i) => {
          if (i > 0) expect(f.work, label).toBeGreaterThanOrEqual(frames[i - 1].work);
          expect(f.aMark).toHaveLength(t.a.length);
          expect(f.bMark).toHaveLength(t.b.length);
          expect(caption(f).length).toBeGreaterThan(10);
        });
      }
    }
  });

  it('the nested loop\'s caption quotes the running count of the frame it is on', () => {
    const frames = nestedFrames(T, false);
    frames.slice(1, -1).forEach((f) => expect(caption(f)).toContain(`${f.work} ${f.work === 1 ? 'comparison' : 'comparisons'} so far`));
  });

  it('at the end of a plain nested loop every customer is green when it has a match and grey when it has none, counted independently', () => {
    for (const spec of SPECS) {
      const t = makeTables(spec);
      const last = nestedFrames(t, false).at(-1)!;
      const pairs = bruteForce(t, 'eq');
      t.a.forEach((r, i) => {
        const matches = pairs.filter(([a]) => a === r.id).length;
        expect(last.aMark[i]?.tone, JSON.stringify(spec) + ` customer ${r.id}`).toBe(matches > 0 ? 'ok' : 'dim');
        if (matches > 0) expect(last.aMark[i]?.label).toBe(`${matches} ${matches === 1 ? 'match' : 'matches'}`);
      });
    }
  });

  it('a hash join without a spill ends with every non-NULL build key in the bucket key mod 8, grouped independently', () => {
    for (const spec of SPECS) {
      const t = makeTables(spec);
      const plan = hashPlan(t, 99);
      const build: readonly Row[] = plan.buildSide === 'a' ? t.a : t.b;
      const want = Array.from({ length: BUCKETS }, (_, b) => build.filter((r) => r.key !== null && (((r.key % BUCKETS) + BUCKETS) % BUCKETS) === b).map((r) => r.key));
      const frames = hashFrames(t, 99);
      const lastBuild = frames.findLast((f) => f.buckets?.some((b) => b.length) && f.hot !== null && f.say && !caption(f).startsWith('Probe'))!;
      if (build.some((r) => r.key !== null)) expect(lastBuild.buckets!.map((b) => [...b])).toEqual(want);
    }
  });

  it('a merge run\'s pointers stay inside the sorted sides and the rewind caption appears exactly when the model rewound', () => {
    for (const spec of SPECS) {
      const t = makeTables(spec);
      const run = mergeJoin(t, false);
      const frames = mergeFrames(t, false);
      for (const f of frames) {
        expect(f.strip!.i).toBeGreaterThanOrEqual(0);
        expect(f.strip!.i).toBeLessThanOrEqual(run.sortedA.length);
        expect(f.strip!.j).toBeLessThanOrEqual(run.sortedB.length);
      }
      expect(frames.filter((f) => f.say && caption(f).includes('rewinds')).length, JSON.stringify(spec)).toBe(run.rewinds);
    }
  });

  it('a NULL outer key skips the index probe and says so', () => {
    const t = makeTables({ ...DEFAULT_SPEC, shape: 'nulls' });
    const skips = nestedFrames(t, true).filter((f) => f.say && caption(f).includes('skips the probe'));
    expect(skips).toHaveLength(t.a.filter((r) => r.key === null).length);
  });
});

describe('hidden controls (AC-0/T3 #17)', () => {
  it('the cost table is the same whatever the hash scene\'s memory, the merge scene\'s sorted toggle or the nested scene\'s index toggle were set to', () => {
    const before = JSON.stringify(costTable(T, 'eq'));
    for (const memory of [2, 3, 8, 16]) hashJoin(T, memory);
    for (const sorted of [false, true]) mergeJoin(T, sorted);
    for (const indexed of [false, true]) nestedLoop(T, 'eq', indexed);
    expect(JSON.stringify(costTable(T, 'eq'))).toBe(before);
    const rows = costTable(T, 'eq');
    expect(rows.find((r) => r.id === 'hash')!.cost).toBe(hashJoin(T, Number.MAX_SAFE_INTEGER).work);
    expect(rows.find((r) => r.id === 'indexNested')!.cost).toBe(nestedLoop(T, 'eq', true).work);
    expect(rows.find((r) => r.id === 'mergeSorted')!.cost).toBe(mergeJoin(T, true).work);
    expect(rows.find((r) => r.id === 'merge')!.cost).toBe(mergeJoin(T, false).work);
  });

  it('the cost caption names exactly the cheapest and dearest rows of the table, for every shape, size and condition', () => {
    for (const shape of ['default', 'manyToMany', 'nulls'] as Shape[]) {
      for (const [sizeA, sizeB] of [[4, 4], [8, 12], [16, 16]]) {
        for (const oneCustomer of [false, true]) {
          const t = makeTables({ shape, sizeA, sizeB, oneCustomer });
          for (const cond of ['eq', 'lt'] as const) {
            const rows = withVerdicts(costTable(t, cond));
            const c = text(costCaption(rows, t, cond), { strict: true });
            const best = rows.find((r) => r.verdict === 'cheapest')!;
            expect(c).toContain(`${best.cost}`);
            if (cond === 'eq') for (const r of rows.filter((x) => x.verdict === 'cheapest')) expect(c).toContain(SHORT_LABEL[r.id]);
            if (cond === 'lt') expect(c).toContain('only the nested loop');
          }
        }
      }
    }
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
