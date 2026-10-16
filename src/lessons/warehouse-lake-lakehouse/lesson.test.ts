import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { lintTier3Lesson } from '../../core/lessonContentT3';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements } from '../../core/testing/sceneKeys';
import { KINDS, capabilityTable } from './capabilities';
import { lakeCaption, nameCaption, pipelineCaption, starCaption, workloadCaption } from './captions';
import { DEFAULT_CONTENTION_SEED, runContention } from './contention';
import { BEST, costOf, lakeFacts, leaders, pipelineFacts, scores, starFacts, workloadFacts } from './facts';
import lesson from './index';
import { ALL_NEEDS, initialLakeScene, initialNameScene, initialPipelineScene, initialStarScene, initialWorkloadScene, type NeedId } from './init';
import { COUNTRIES, run } from './pipeline';
import { QUESTIONS, buildStar, joinCount, runStar } from './star';
import { append, cleanOrphans, crashWriter, deleteRows, directoryRows, initialLake, orphanFiles, race, readTable, readerVsWriter } from './tableformat';
import { MIX, PLACEMENTS, mixCost, samePlacement } from './workload';

const plain = (node: Parameters<typeof captionText>[0]) => captionText(node, { strict: true });
const n = (x: number) => x.toLocaleString('en-US');

describe('each scene opens on the state its try-this assumes (a pure function, switched through all five scenes)', () => {
  it('workloads: everything on the row store at the default seed', () => {
    expect(initialWorkloadScene()).toEqual({ placement: { points: 'row', scans: 'row' }, seed: DEFAULT_CONTENTION_SEED });
  });
  it('flow: ETL, before the rule has changed', () => {
    expect(initialPipelineScene()).toEqual({ mode: 'etl', rule: 'v1' });
  });
  it('star: revenue by region on a plain star', () => {
    expect(initialStarScene()).toMatchObject({ question: 'region-month', snowflake: false });
  });
  it('format: the starting lake with snapshots and a pointer, nothing time-travelled', () => {
    const s = initialLakeScene();
    expect(s.layer).toBe(true);
    expect(s.viewing).toBeNull();
    expect(s.lake.snapshots).toHaveLength(3);
  });
  it('names: every property counted', () => {
    expect(initialNameScene().needs).toEqual(ALL_NEEDS);
  });
  it('every scene the Stage returns carries its own key', () => {
    const scenes = sceneElements('warehouse-lake-lakehouse');
    expect(scenes).toHaveLength(5);
    expect(scenes.every((s) => s.keyed)).toBe(true);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: everything on the row store costs 12,058 with a long point wait; scans on the column store costs 4,074 and the wait is 0', () => {
    const f = workloadFacts();
    const start = initialWorkloadScene();
    expect(costOf(start.placement)).toBe(f.everyRow);
    expect(f.everyRow).toBe(12058);
    expect(f.split).toBe(4074);
    expect(f.sharedWait.maxPointWait).toBeGreaterThanOrEqual(10);
    expect(f.splitWait.maxPointWait).toBe(0);
    expect(lesson.tryThis[0]).toContain('the five-operation mix costs 12,058');
    expect(lesson.tryThis[0]).toContain(`up to ${f.sharedWait.maxPointWait} ticks behind a scan (seed ${DEFAULT_CONTENTION_SEED})`);
    expect(lesson.tryThis[0]).toContain('the mix drops to 4,074 and the wait is 0');
    const p = { points: 'row', scans: 'column' } as const;
    expect(plain(workloadCaption(p, mixCost(MIX, p), BEST, costOf(BEST), runContention(p, start.seed)))).toContain('the lowest of the four placements');
  });

  it('try-this 2: pressing Business rule changed makes ETL wrong in all 3 countries, and ELT right', () => {
    const f = pipelineFacts();
    expect(f.etlWrong).toBe(COUNTRIES.length);
    expect(f.eltEqual).toBe(true);
    expect(f.etlEqual).toBe(false);
    expect(lesson.tryThis[1]).toContain('3 country totals of 3 come out wrong');
    expect(initialPipelineScene().mode).toBe('etl');
    expect(plain(pipelineCaption('etl', 'v2', f.etl))).toContain('3 country totals differ from the truth: DE, FR, NL');
    expect(plain(pipelineCaption('elt', 'v2', f.elt))).toContain('equal what the new rule says');
  });

  it('try-this 3: revenue by region joins 2 dimensions, 3 in the snowflake, and the answer equals the flat table', () => {
    const f = starFacts();
    expect([f.joins, f.snowJoins]).toEqual([2, 3]);
    const start = initialStarScene();
    const star = buildStar(start.seed);
    expect(runStar(star, start.question, false).joins).toHaveLength(2);
    expect(runStar(star, start.question, true).joins).toHaveLength(3);
    expect(lesson.tryThis[2]).toContain('joins 2 dimensions');
    expect(lesson.tryThis[2]).toContain('it joins 3');
  });

  it('try-this 4: 0 of 15 tear with snapshots, 4 of 15 without, and after one orphan file a reader sees 6 rows through the pointer and 8 listing the directory', () => {
    const f = lakeFacts();
    expect([f.on.torn, f.on.total, f.off.torn, f.off.total]).toEqual([0, 15, 4, 15]);
    const lake = crashWriter(initialLake(), 1);
    expect([readTable(lake).length, directoryRows(lake).length]).toEqual([6, 8]);
    expect(lesson.tryThis[3]).toContain('0 of 15 writer and reader interleavings tear');
    expect(lesson.tryThis[3]).toContain('4 of 15 do');
    expect(lesson.tryThis[3]).toContain('a reader still sees 6 rows; switch to None and it sees 8');
    const s = initialLakeScene();
    expect(plain(lakeCaption(s.lake, s.layer, s.viewing, readerVsWriter(s.lake, true), race(s.lake)))).toContain('none tears');
  });

  it('try-this 5: all five properties counted give lakehouse 5, warehouse 3, lake 2; dropping open files and cost leaves warehouse and lakehouse tied', () => {
    const s = scores(ALL_NEEDS);
    expect(s).toEqual({ warehouse: 3, lake: 2, lakehouse: 5 });
    const rest = ALL_NEEDS.filter((x) => x !== 'open' && x !== 'cost');
    expect(leaders(rest)).toEqual(['warehouse', 'lakehouse']);
    expect(lesson.tryThis[4]).toContain('lakehouse has 5, warehouse 3 and lake 2');
    expect(lesson.tryThis[4]).toContain('warehouse and lakehouse tie');
  });
});

describe('captions are computed from the model over the control cross product', () => {
  it('workloads: every placement x 12 seeds quotes the mix cost, says "lowest" exactly for the best, and a wait only on a shared store', () => {
    for (const p of PLACEMENTS) {
      for (let seed = 0; seed < 12; seed++) {
        const q = runContention(p, seed);
        const text = plain(workloadCaption(p, mixCost(MIX, p), BEST, costOf(BEST), q));
        const id = `${p.points}/${p.scans} seed ${seed}`;
        expect(text, id).toContain(n(costOf(p)));
        expect(text.includes('the lowest of the four'), id).toBe(samePlacement(p, BEST));
        expect(text.includes('waited up to'), id).toBe(p.points === p.scans);
        expect(text.includes('no point operation waited'), id).toBe(p.points !== p.scans);
        if (p.points === p.scans) expect(text).toContain(`${q.maxPointWait} tick`);
      }
    }
  });

  it('pipeline: every mode x rule says what is kept, how many reads, and which totals are wrong', () => {
    for (const mode of ['etl', 'elt'] as const) {
      for (const rule of ['v1', 'v2'] as const) {
        const r = run(mode, rule);
        const text = plain(pipelineCaption(mode, rule, r));
        const id = `${mode} ${rule}`;
        expect(text.includes('not kept'), id).toBe(mode === 'etl' && rule === 'v1');
        if (rule === 'v2' && mode === 'etl') expect(text).toContain(`${r.wrong.length} country totals differ`);
        if (rule === 'v2' && mode === 'elt') expect(r.wrong).toEqual([]);
      }
    }
  });

  it('star: every question x snowflake x 20 seeds says the join count the run made, and "one more" only for the snowflaked region question', () => {
    for (const q of QUESTIONS) {
      for (const snow of [false, true]) {
        for (let seed = 0; seed < 20; seed++) {
          const run1 = runStar(buildStar(seed), q.id, snow);
          const text = plain(starCaption(q.id, snow, run1.joins, run1.answer.length, true));
          const id = `${q.id} ${snow} ${seed}`;
          expect(text, id).toContain(`${run1.joins.length} join`);
          expect(run1.joins).toHaveLength(joinCount(q.id, snow));
          expect(text.includes('one more because the snowflake'), id).toBe(snow && q.id === 'region-month');
        }
      }
    }
  });

  it('lake: after every action the caption says the orphans a reader sees (unseen through the pointer, read as table rows from the directory)', () => {
    let lake = initialLake();
    const steps = [lake, append(lake), deleteRows(append(lake), [1, 2]), crashWriter(lake, 1), crashWriter(lake, 2), cleanOrphans(crashWriter(lake, 2))];
    for (const l of steps) {
      for (const layer of [true, false]) {
        lake = l;
        const text = plain(lakeCaption(l, layer, null, readerVsWriter(cleanOrphans(l), layer), race(cleanOrphans(l))));
        const orphans = orphanFiles(l).length;
        const id = `${l.snapshots.length} snaps, ${orphans} orphans, layer ${layer}`;
        expect(text.includes('orphan file'), id).toBe(orphans > 0);
        expect(/sits? unseen/.test(text), id).toBe(orphans > 0 && layer);
        expect(/(is|are) read as part of the table/.test(text), id).toBe(orphans > 0 && !layer);
        expect(text).toContain(`${layer ? readTable(l).length : directoryRows(l).length} row`);
        expect(text.includes('none tears'), id).toBe(layer);
      }
    }
  });

  it('names: for each of the 31 non-empty subsets of properties the caption names the same leaders as the scores, and an empty one says to pick', () => {
    for (let mask = 0; mask < 32; mask++) {
      const needs = ALL_NEEDS.filter((_, i) => mask & (1 << i)) as NeedId[];
      const text = plain(nameCaption(leaders(needs), scores(needs), needs.length));
      if (needs.length === 0) expect(text).toContain('Pick at least one property');
      else {
        const top = leaders(needs);
        expect(text.includes(' tie'), String(mask)).toBe(top.length > 1);
        for (const k of top) expect(text).toContain(k);
        for (const k of KINDS) expect(text).toContain(`${k} ${scores(needs)[k]}`);
      }
    }
  });
});

describe('no hidden control feeds a number', () => {
  it('the snapshot being viewed (time travel) does not change what a reader sees or the interleaving counts', () => {
    const lake = initialLake();
    const a = readerVsWriter(lake, true);
    expect(readTable(lake)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(readerVsWriter(lake, true)).toEqual(a);
  });

  it('the table-format toggle changes only the reader: the lake, its files and the race are the same either way', () => {
    const lake = crashWriter(initialLake(), 2);
    expect(race(cleanOrphans(lake)).lostUpdates).toBe(0);
    expect(readerVsWriter(cleanOrphans(lake), true).before).toEqual(readerVsWriter(cleanOrphans(lake), false).before);
    expect(Object.keys(lake.files)).toHaveLength(Object.keys(initialLake().files).length + 2);
  });

  it('a crashed writer\'s orphans do not leak into the interleaving analysis, which always starts from a clean lake', () => {
    const lake = crashWriter(initialLake(), 2);
    expect(readerVsWriter(cleanOrphans(lake), false).torn).toBe(readerVsWriter(initialLake(), false).torn);
  });

  it('the property chips in the comparison change only the scores, never a cell of the table', () => {
    const before = JSON.stringify(capabilityTable());
    scores(['schema']);
    scores(ALL_NEEDS);
    expect(JSON.stringify(capabilityTable())).toBe(before);
  });

  it('the placement of one class does not change the cost of the other: each operation is priced on its own store', () => {
    const [a, b] = [mixCost(MIX, { points: 'row', scans: 'row' }), mixCost(MIX, { points: 'row', scans: 'column' })];
    const points = (m: typeof a) => m.perOp.filter((o) => o.op.kind !== 'scan').map((o) => o.cost.cost);
    expect(points(a)).toEqual(points(b));
  });
});

describe('lesson content', () => {
  it('passes the K-2 content lint and the Tier 3 lint (absolutes, chips, try-this tests)', () => {
    const own = Object.values(import.meta.glob<string>('./index.tsx', { query: '?raw', import: 'default', eager: true })).join('');
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(lintTier3Lesson(lesson, { domainReview: false, source: own, tryThisTests: lesson.tryThis.map((_, i) => i + 1) })).toEqual([]);
  });
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
