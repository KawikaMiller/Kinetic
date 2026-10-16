import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { lintTier3Lesson } from '../../core/lessonContentT3';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements } from '../../core/testing/sceneKeys';
import { CAUSES, combinerCaption, counterCaption, failureCaption, flowCaption, stragglerCaption, type Cause } from './captions';
import { inputRecords, sideEffectCount, evenSpeeds } from './cluster';
import { BROKEN_SEED, COMBINER_WORDS, combinerFacts, counterFacts, counterRun, flowFacts, flowPlan, killDemo, stragglerFacts } from './facts';
import { initialCombinerScene, initialCounterScene, initialFailureScene, initialFlowScene, initialStragglerScene, switchJob } from './init';
import lesson from './index';
import { JOBS, plan, reference, sameResult, type CombinerId } from './job';
import { addKill, runningWorkerAt } from './kills';
import { EVEN_WORDS, PRESET_SHORT, SKEWED_WORDS, wordsOf } from './text';
import { backupOutcomes, jobEnd, rerunCount, runCluster } from './timeline';

const plain = (node: Parameters<typeof captionText>[0]) => captionText(node, { strict: true });

describe('each scene opens on the state its try-this assumes (a pure function, switched through all five scenes)', () => {
  it('flow: the short sentence on two splits and two reducers', () => {
    expect(initialFlowScene()).toEqual({ text: PRESET_SHORT, mappers: 2, reducers: 2 });
  });
  it('combiner: word count with no combiner, and switching job drops the combiner', () => {
    expect(initialCombinerScene()).toEqual({ job: 'wordcount', combiner: 'off' });
    expect(switchJob('avglen')).toEqual({ job: 'avglen', combiner: 'off' });
    expect(switchJob('wordcount')).toEqual({ job: 'wordcount', combiner: 'off' });
  });
  it('stragglers: skewed data, backups off, the cursor at the end', () => {
    expect(initialStragglerScene()).toEqual({ cause: 'data', speculate: false, at: null });
  });
  it('failure: no failures and the cursor at tick 0', () => {
    expect(initialFailureScene()).toEqual({ kills: [], at: 0 });
  });
  it('counter: the pinned seed, the counting map function, the cursor at the end', () => {
    expect(initialCounterScene()).toEqual({ seed: BROKEN_SEED, sideEffect: true, at: null });
  });
  it('every scene the Stage returns carries its own key', () => {
    const scenes = sceneElements('mapreduce-batch');
    expect(scenes).toHaveLength(5);
    expect(scenes.every((s) => s.keyed)).toBe(true);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: 8 words make 8 pairs, one reducer gets the most, the table starts with "the 3", and one reducer gets all 8 pairs with the same table', () => {
    const f = flowFacts();
    const s = initialFlowScene();
    const p = flowPlan(wordsOf(s.text), s.mappers, s.reducers);
    expect(f.words).toBe(8);
    expect(f.pairs).toBe(8);
    expect(f.top).toEqual(['the', 3]);
    expect(f.oneLoad).toBe(8);
    expect(f.sameTable).toBe(true);
    expect(p.parts.map((x) => x.length)).toEqual(f.loads);
    const heaviest = Math.max(...f.loads);
    expect(lesson.tryThis[0]).toContain(`the 8 words become 8 pairs and reducer ${f.loads.indexOf(heaviest) + 1} gets the most, ${heaviest} pairs`);
    expect(lesson.tryThis[0]).toContain('the table starts with the 3');
    expect(lesson.tryThis[0]).toContain('that one reducer gets all 8 pairs and the table is the same');
    expect(plain(flowCaption(p, 8, null))).toContain('8 pairs reach the shuffle');
    expect(plain(flowCaption(p, 8, null))).toContain('equals the plain single-process count');
  });

  it('try-this 2: 41 records cross with no combiner, fewer with a sum combiner, and the averaging combiner turns "a" into 2.5 instead of 2.556', () => {
    const f = combinerFacts();
    expect(f.off).toBe(COMBINER_WORDS.length);
    expect(f.off).toBe(41);
    expect(f.sum).toBeLessThan(f.off);
    expect(f.firstWrong).toBe('a');
    expect(f.naive).toBe(2.5);
    expect(f.truth).toBeCloseTo(23 / 9, 12);
    expect(lesson.tryThis[1]).toContain('41 records cross the shuffle with no combiner');
    expect(lesson.tryThis[1]).toContain(`Pick Add the counts: ${f.sum}`);
    expect(lesson.tryThis[1]).toContain('"a" comes out 2.5 instead of 2.556');
  });

  it('try-this 3: skewed data takes the same time with backups, a slow machine takes less with them than without', () => {
    const f = stragglerFacts();
    expect(f.skew.on).toBe(f.skew.off);
    expect(f.slow.on).toBeLessThan(f.slow.off);
    expect(lesson.tryThis[2]).toContain(`the job take ${f.skew.off} ticks`);
    expect(lesson.tryThis[2]).toContain(`Turn Backup tasks On: it takes ${f.skew.on}`);
    expect(lesson.tryThis[2]).toContain(`it takes ${f.slow.on} ticks with backups and ${f.slow.off} without`);
    const s = initialStragglerScene();
    const run = runCluster({ words: SKEWED_WORDS, speeds: evenSpeeds(), speculate: s.speculate });
    expect(jobEnd(run)).toBe(f.skew.off);
    expect(plain(stragglerCaption(run, s.cause, s.speculate))).toContain(`the job takes ${f.skew.off} ticks`);
  });

  it('try-this 4: killing worker 1 one tick before the last map finishes loses a finished map, so tasks run again and the job ends later with an equal table', () => {
    const d = killDemo();
    expect(d.kill).toEqual({ worker: 0, tick: d.barrier - 1 });
    expect(d.heldFinishedMaps).toBeGreaterThan(0);
    expect(d.correct).toBe(true);
    expect(lesson.tryThis[3]).toContain(`set Time to tick ${d.kill.tick}`);
    expect(lesson.tryThis[3]).toContain(`press Kill worker ${d.kill.worker + 1}`);
    expect(lesson.tryThis[3]).toContain(`the job ends at tick ${d.afterEnd} instead of ${d.cleanEnd}`);
    // the stage's own button logic, from the default state at that time
    const start = initialFailureScene();
    const r = addKill(d.clean, start.kills, d.kill.worker, d.kill.tick);
    expect(r.changed).toBe(true);
    expect(jobEnd(runCluster({ words: EVEN_WORDS, kills: r.kills }))).toBe(d.afterEnd);
    expect(plain(failureCaption(d.after, 1))).toContain(`the job finishes at tick ${d.afterEnd}`);
  });

  it('try-this 5: the pinned seed fails worker 1 at tick 17 and the counter ends above the records; seed 2 reaches a higher counter; pure mode shows none', () => {
    const b = counterFacts(BROKEN_SEED);
    const n = counterFacts(BROKEN_SEED + 1);
    expect(b.kills).toEqual([{ worker: 0, tick: 17 }]);
    expect(b.counter).toBeGreaterThan(b.records);
    expect(b.wordCountsRight).toBe(true);
    expect(n.counter).toBeGreaterThan(b.counter);
    expect(lesson.tryThis[4]).toContain(`seed ${BROKEN_SEED} fails worker 1 at tick 17: the counter ends at ${b.counter} for ${b.records} records`);
    expect(lesson.tryThis[4]).toContain(`the counter reaches ${n.counter}`);
    const s = initialCounterScene();
    expect(plain(counterCaption(counterRun(s.seed), s.sideEffect, s.seed))).toContain(`ends at ${b.counter} for ${b.records} records`);
    expect(plain(counterCaption(counterRun(s.seed), false, s.seed))).not.toContain('counter');
  });
});

describe('captions are computed from the model over the control cross product', () => {
  it('combiner: every job x combiner says the shuffle size the model has, and "wrong" exactly when the answer differs from the plain one', () => {
    for (const job of JOBS.map((j) => j.id)) {
      const options: CombinerId[] = job === 'wordcount' ? ['off', 'sum'] : ['off', 'naive', 'sum'];
      for (const combiner of options) {
        const off = plan({ words: COMBINER_WORDS, mappers: 2, reducers: 2, job, combiner: 'off' });
        const chosen = plan({ words: COMBINER_WORDS, mappers: 2, reducers: 2, job, combiner });
        const truth = reference(job, COMBINER_WORDS);
        const wrong = [...truth].filter(([k, v]) => Math.abs((chosen.result.get(k) ?? NaN) - v) > 1e-9).map(([k]) => k);
        const first = wrong.length ? { key: wrong[0], truth: truth.get(wrong[0])!, naive: chosen.result.get(wrong[0])! } : null;
        const text = plain(combinerCaption(job, combiner, off.shuffled, chosen.shuffled, wrong, first));
        const id = `${job} ${combiner}`;
        expect(text, id).toContain(`${chosen.shuffled} ${chosen.shuffled === 1 ? 'record crosses' : 'records cross'}`);
        expect(text.includes('come out wrong'), id).toBe(wrong.length > 0);
        expect(sameResult(chosen.result, truth), id).toBe(wrong.length === 0);
        expect(combiner === 'naive' ? wrong.length > 0 : wrong.length === 0, id).toBe(true);
      }
    }
  });

  it('stragglers: every cause x backups says the wall time, names the straggler only when one exists, and reports each backup\'s outcome', () => {
    for (const cause of Object.keys(CAUSES) as Cause[]) {
      for (const speculate of [false, true]) {
        const run = runCluster({ words: cause === 'data' ? SKEWED_WORDS : EVEN_WORDS, speeds: cause === 'machine' ? [100, 100, 25] : evenSpeeds(), speculate });
        const text = plain(stragglerCaption(run, cause, speculate));
        const id = `${cause} spec=${speculate}`;
        expect(text, id).toContain(`the job takes ${jobEnd(run)} ticks`);
        expect(text.includes('No task runs far longer'), id).toBe(run.straggler === null);
        const backups = backupOutcomes(run.world);
        expect(speculate ? text.includes('won the race') || text.includes('lost the race') : !text.includes('race'), id).toBe(speculate ? backups.length > 0 : true);
        expect(run.correct, id).toBe(true);
      }
    }
  });

  it('failure: for every single failure at every tick the caption says the re-runs and the end tick of that run, and the table is right', () => {
    const clean = runCluster({ words: EVEN_WORDS });
    for (let worker = 0; worker < 3; worker++) {
      for (let tick = 0; tick <= jobEnd(clean) + 2; tick++) {
        const run = runCluster({ words: EVEN_WORDS, kills: [{ worker, tick }] });
        const text = plain(failureCaption(run, 1));
        const reruns = rerunCount(run.world);
        expect(text.includes('no task had to run again'), `w${worker} t${tick}`).toBe(reruns === 0);
        expect(text).toContain(`the job finishes at tick ${jobEnd(run)}`);
        expect(run.correct).toBe(true);
      }
    }
  });

  it('counter: for 40 seeds the caption names the counter the model computed and says "stay right" because the table is right; pure mode never mentions a counter', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = counterRun(seed);
      const c = sideEffectCount(run.world);
      const text = plain(counterCaption(run, true, seed));
      expect(text, `seed ${seed}`).toContain(`${c} for ${inputRecords(run.plan)} records`);
      expect(text.includes('as it should'), `seed ${seed}`).toBe(c === inputRecords(run.plan));
      expect(text.includes('stay right')).toBe(true);
      expect(plain(counterCaption(run, false, seed)).includes('counter')).toBe(false);
    }
  });

  it('flow: the caption names the reducer with the most pairs for every M and R, and the empty input says so', () => {
    for (let m = 1; m <= 6; m++) {
      for (let r = 1; r <= 4; r++) {
        const p = flowPlan(wordsOf(PRESET_SHORT), m, r);
        const text = plain(flowCaption(p, p.words.length, null));
        const loads = p.parts.map((x) => x.length);
        expect(text, `${m}x${r}`).toContain(r === 1 ? 'The one reducer gets them all' : `Reducer ${loads.indexOf(Math.max(...loads)) + 1} gets the most, ${Math.max(...loads)} pair`);
      }
    }
    expect(plain(flowCaption(flowPlan([], 2, 2), 0, null))).toContain('No words');
    expect(plain(flowCaption(flowPlan(wordsOf('a b'), 2, 2), 2, 5))).toContain('Only the first 2 of the 5 words are used');
  });
});

describe('the kill button', () => {
  it('adds a failure, and refuses one that changes nothing, with the reason', () => {
    const run = runCluster({ words: EVEN_WORDS });
    const first = addKill(run, [], 1, 12);
    expect(first.changed).toBe(true);
    expect(first.kills).toEqual([{ worker: 1, tick: 12 }]);
    const afterFirst = runCluster({ words: EVEN_WORDS, kills: first.kills });
    const again = addKill(afterFirst, first.kills, 1, 20);
    expect(again.changed).toBe(false);
    expect(again.message).toContain('already down');
    const late = addKill(run, [], 0, jobEnd(run) + 3);
    expect(late.changed).toBe(false);
    expect(late.message).toContain('already finished');
  });

  it('killing the last worker says no worker is left, and the run stalls', () => {
    let kills = addKill(runCluster({ words: EVEN_WORDS }), [], 0, 3).kills;
    kills = addKill(runCluster({ words: EVEN_WORDS, kills }), kills, 1, 4).kills;
    const last = addKill(runCluster({ words: EVEN_WORDS, kills }), kills, 2, 5);
    expect(last.message).toContain('No worker is left');
    const run = runCluster({ words: EVEN_WORDS, kills: last.kills });
    expect(run.world.stalled).toBe(true);
    expect(run.correct).toBe(false);
    expect(plain(failureCaption(run, 3))).toContain('No worker left');
  });

  it('clicking a bar finds the worker only while that attempt is running', () => {
    const run = runCluster({ words: EVEN_WORDS });
    const a = run.world.attempts[0];
    expect(runningWorkerAt(run, `a${a.id}`, a.start)).toBe(a.worker);
    expect(runningWorkerAt(run, `a${a.id}`, a.end!)).toBeNull();
    expect(runningWorkerAt(run, 'a999', 0)).toBeNull();
    expect(runningWorkerAt(run, 'wait0', 0)).toBeNull();
  });
});

describe('no hidden control feeds a number', () => {
  it('the map-function toggle changes only what is shown: one run per seed, whatever the toggle says', () => {
    for (let seed = 0; seed < 10; seed++) {
      const a = counterRun(seed);
      const b = counterRun(seed);
      expect(a.world.attempts).toEqual(b.world.attempts);
      expect(a.correct).toBe(true);
    }
  });

  it('the combiner is not offered, or applied, in the straggler and failure scenes (they run with none)', () => {
    const run = runCluster({ words: EVEN_WORDS });
    expect(run.plan.combiner).toBe('off');
    expect(run.plan.shuffled).toBe(EVEN_WORDS.length);
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
