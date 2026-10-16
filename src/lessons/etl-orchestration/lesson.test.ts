import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { lintTier3Lesson } from '../../core/lessonContentT3';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements } from '../../core/testing/sceneKeys';
import { barTarget, barsOf, hourLabel } from './chart';
import { failureCaption, loadCaption, scheduleCaption, shapeCaption, weekCaption } from './captions';
import { CALENDAR_START, DAYS, HORIZON_HOURS, SOURCE_ROWS, TASKS, dayStatus, keyOf, runPipeline, type Config, type Mode } from './engine';
import { baseConfig, failureFacts, loadFacts, scheduleFacts, shapeFacts } from './facts';
import lesson from './index';
import { initialFailureScene, initialLoadScene, initialScheduleScene, initialShapeScene, initialWeekScene } from './init';
import { PAUSE_TO, SCHEDULE_START, createdBy } from './schedule';
import { rerunAfterRuleChange } from './shape';

const plain = (node: Parameters<typeof captionText>[0]) => captionText(node, { strict: true });

describe('each scene opens on the state its try-this assumes (a pure function, switched through all five scenes)', () => {
  it('week: the whole week drawn', () => expect(initialWeekScene()).toEqual({ at: HORIZON_HOURS }));
  it('failure: nothing injected, no retries, day 3 and clean selected, a permanent failure chosen', () => {
    const s = initialFailureScene();
    expect(s).toMatchObject({ failures: {}, ops: [], retries: 0, kind: 'permanent', day: 2, task: 'clean', flaky: false });
  });
  it('loads: appending, with the pinned seed\'s schedule', () => {
    const s = initialLoadScene();
    expect(s.mode).toBe('append');
    expect(s.ops.length).toBeGreaterThan(0);
  });
  it('shape: ETL before the rule change', () => expect(initialShapeScene()).toEqual({ style: 'etl', changed: false }));
  it('schedule: noon on 1 March, running, catch-up off', () => expect(initialScheduleScene()).toEqual({ now: 108, paused: false, catchup: false }));
  it('every scene the Stage returns carries its own key', () => {
    const scenes = sceneElements('etl-orchestration');
    expect(scenes).toHaveLength(5);
    expect(scenes.every((s) => s.keyed)).toBe(true);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: all 7 days have loaded at the end; four Back a day presses reach the stated hour with 5 days loaded', () => {
    const sim = runPipeline(baseConfig, 0);
    expect(sim.state.loads.filter((n) => n > 0)).toHaveLength(7);
    const back = HORIZON_HOURS - 24 * 4;
    const loaded = sim.history[back].loads.filter((n) => n > 0).length;
    expect(loaded).toBe(5);
    expect(lesson.tryThis[0]).toContain(`7 of 7 days have loaded`);
    expect(lesson.tryThis[0]).toContain(`${hourLabel(CALENDAR_START, back)} UTC and 5 of 7 have`);
    expect(plain(weekCaption(sim.history[back], back))).toContain('5 of 7 days');
  });

  it('try-this 2: failing day 3\'s clean blocks join and load_report with 0 rows; 3 retries still fail after 4 attempts; clearing loads the source rows', () => {
    const f = failureFacts();
    expect(f.blocked).toEqual(['upstream_failed', 'upstream_failed']);
    expect(f.stuckRows).toBe(0);
    expect(f.retriedAttempts).toBe(4);
    expect(f.clearedRows).toBe(SOURCE_ROWS[2]);
    expect(f.source).toBe(SOURCE_ROWS[2]);
    expect(lesson.tryThis[1]).toContain('join and load_report do not run (upstream failed and upstream failed) and the report holds 0 rows for 2026-03-03');
    expect(lesson.tryThis[1]).toContain('it still fails after 4 attempts');
    expect(lesson.tryThis[1]).toContain(`the report then holds ${f.clearedRows} rows, the ${f.source} in the source`);
    const s = initialFailureScene();
    const cfg: Config = { ...baseConfig, failures: { [keyOf(s.day, s.task)]: { kind: s.kind } } };
    const w = runPipeline(cfg, 0).state;
    expect(plain(failureCaption(w, s.day, s.task, 0))).toContain('join and load_report did not run: an upstream task failed');
  });

  it('try-this 3: the append schedule leaves duplicated dates; overwrite leaves none and the rows equal the source', () => {
    const f = loadFacts();
    expect(f.appendDuplicated).toBeGreaterThan(0);
    expect(f.overwriteDuplicated).toBe(0);
    expect(f.appendRows).toBeGreaterThan(f.sourceRows);
    expect(f.overwriteRows).toBeLessThanOrEqual(f.sourceRows);
    expect(lesson.tryThis[2]).toContain(`leave ${f.appendRows} rows for ${f.sourceRows} in the source, ${f.appendDuplicated} ${f.appendDuplicated === 1 ? 'date' : 'dates'} duplicated`);
    expect(lesson.tryThis[2]).toContain(`${f.overwriteDuplicated} duplicated, and the report holds ${f.overwriteRows}`);
  });

  it('try-this 4: after a rule change ETL runs 5 steps and reads the source 2 times, ELT 3 steps and 0 reads', () => {
    const f = shapeFacts();
    expect([f.etl.steps.length, f.etl.extractRuns, f.elt.steps.length, f.elt.extractRuns]).toEqual([5, 2, 3, 0]);
    expect(lesson.tryThis[3]).toContain('ETL runs 5 steps again and reads the source 2 times');
    expect(lesson.tryThis[3]).toContain('3 steps and 0 source reads');
    expect(plain(shapeCaption('etl', true))).toContain('5 steps');
    expect(plain(shapeCaption('elt', true))).toContain('0 times');
  });

  it('try-this 5: at 1 March 12:00 the run for 2026-03-01 does not exist and is created 2 March 00:00; a pause creates 1 run without catch-up and 4 with it', () => {
    const f = scheduleFacts();
    expect(f.date).toBe('2026-03-01');
    expect(f.runExistsAtOpening).toBe(false);
    expect(f.closesLabel).toBe('Mar 2 00:00');
    expect(f.runsOn).toBe(1);
    expect([f.offRuns, f.onRuns, f.missedDays]).toEqual([1, 4, 4]);
    expect(lesson.tryThis[4]).toContain('Mar 1 12:00');
    expect(lesson.tryThis[4]).toContain('its interval closes Mar 2 00:00');
    expect(lesson.tryThis[4]).toContain('drag Now past Mar 5 09:00');
    expect(lesson.tryThis[4]).toContain('1 run is created for 4 missed days');
    expect(lesson.tryThis[4]).toContain('and it is 4');
    const s = initialScheduleScene();
    expect(plain(scheduleCaption(s.now, s.paused, s.catchup))).toContain('Mar 1 12:00 UTC');
  });
});

describe('captions are computed from the model over the control cross product', () => {
  it('failure: every day x task x kind x retries says the attempts and the rows the model has', () => {
    for (let day = 0; day < DAYS; day += 3) {
      for (const task of TASKS) {
        for (const kind of ['transient', 'permanent'] as const) {
          for (let retries = 0; retries <= 3; retries++) {
            const w = runPipeline({ ...baseConfig, retries, failures: { [keyOf(day, task)]: { kind } } }, 0).state;
            const text = plain(failureCaption(w, day, task, retries));
            const id = `${day} ${task} ${kind} ${retries}`;
            expect(text, id).toContain(`${w.runs[day].tasks[task].spans.length} attempt`);
            expect(text, id).toContain(`${w.output[day]} row`);
            expect(text.includes('did not run'), id).toBe(TASKS.some((t) => w.runs[day].tasks[t].status === 'upstream_failed'));
          }
        }
      }
    }
  });

  it('loads: every mode over 30 schedules says the duplicated dates the model has, and "No date is duplicated" otherwise', () => {
    for (const mode of ['append', 'overwrite'] as Mode[]) {
      for (let seed = 0; seed < 30; seed++) {
        const s = initialLoadScene();
        const w = runPipeline({ ...baseConfig, mode, ops: seed === 0 ? s.ops : [] }, seed).state;
        const dup = Array.from({ length: DAYS }, (_, d) => d).filter((d) => dayStatus(w, d) === 'duplicated').length;
        const text = plain(loadCaption(mode, w));
        expect(text.includes('duplicated by a rerun'), `${mode} ${seed}`).toBe(dup > 0);
        expect(text.includes('No date is duplicated'), `${mode} ${seed}`).toBe(dup === 0);
      }
    }
  });

  it('schedule: every hour of the calendar x pause x catch-up quotes the run count createdBy gives', () => {
    for (const paused of [false, true]) {
      for (const catchup of [false, true]) {
        for (let now = 0; now <= 24 * 13; now += 6) {
          const text = plain(scheduleCaption(now, paused, catchup));
          const n = createdBy(now, paused, catchup).length;
          expect(text, `${paused} ${catchup} ${now}`).toContain(`${n} ${n === 1 ? 'run' : 'runs'} created`);
          expect(text.includes('The pause'), `${paused} ${catchup} ${now}`).toBe(paused && now >= PAUSE_TO);
        }
      }
    }
    expect(SCHEDULE_START).toBe('2026-02-25T00:00:00Z');
  });

  it('shape: the unchanged captions name each style, the changed ones the steps the model lists', () => {
    for (const style of ['etl', 'elt'] as const) {
      expect(plain(shapeCaption(style, false))).toContain(style.toUpperCase());
      expect(plain(shapeCaption(style, true))).toContain(rerunAfterRuleChange(style).steps.join(', '));
    }
  });
});

describe('what the chart draws', () => {
  it('has a bar for every attempt, and hatched orange ones only where a task did not run', () => {
    const w = runPipeline({ ...baseConfig, failures: { [keyOf(2, 'clean')]: { kind: 'permanent' } } }, 0).state;
    const bars = barsOf(w);
    const attempts = w.runs.reduce((n, r) => n + TASKS.reduce((m, t) => m + r.tasks[t].spans.length, 0), 0);
    expect(bars.filter((b) => b.id.startsWith('a'))).toHaveLength(attempts);
    expect(bars.filter((b) => b.tone === 'orange').map((b) => b.lane).sort()).toEqual(['join', 'load_report']);
    expect(bars.filter((b) => b.tone === 'bad')).toHaveLength(1);
  });
  it('a bar id names its day and task, and an unknown id names none', () => {
    expect(barTarget('a2:clean:0')).toEqual({ day: 2, task: 'clean' });
    expect(barTarget('u4:load_report')).toEqual({ day: 4, task: 'load_report' });
    expect(barTarget('nope')).toBeNull();
  });
});

describe('no hidden control feeds a number', () => {
  it('the seed changes nothing unless the workers are flaky: the same history for any seed', () => {
    const cfg: Config = { ...baseConfig, failures: { [keyOf(1, 'join')]: { kind: 'transient' } }, retries: 1 };
    expect(JSON.stringify(runPipeline(cfg, 1).history)).toBe(JSON.stringify(runPipeline(cfg, 99).history));
    expect(JSON.stringify(runPipeline({ ...cfg, flaky: true }, 1).history)).not.toBe(JSON.stringify(runPipeline({ ...cfg, flaky: true }, 99).history));
  });
  it('the retries slider changes nothing when no task fails', () => {
    for (let r = 0; r <= 3; r++) expect(runPipeline({ ...baseConfig, retries: r }, 0).state.output).toEqual([...SOURCE_ROWS]);
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
