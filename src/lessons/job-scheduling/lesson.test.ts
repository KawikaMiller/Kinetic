import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { dayCounts, exprCaption, queueFrames, queueIntro, queueSummary, schedFrames, schedSummary, stormNote, wheelFrames } from './captions';
import { CRON_NOW_MS, DOM_DOW_PRESET, nextFires, parseCron } from './cron';
import lesson from './index';
import { addDelay, initialExpr, initialQueue, initialSched, initialWheel, parseDelay } from './init';
import { DEFAULT_QUEUE, FX, QUEUE_BROKEN_SEED, queueStatsAt, queueSweep, runQueue } from './queue';
import { DEFAULT_SCHED, HOUR_MS, MIN_MS, SCHED_BROKEN_SEED, SCHED_MODES, runSched, schedStatsAt, schedSweep, type SchedSetup } from './sched';
import { QUEUE_LANES, RUN_TONE, SCHED_LANES, clockLabel, queueBars, queueLog, schedBars, schedLog, stormPeak } from './view';
import { MAX_JOBS, inversions, place, runWheel } from './wheel';

const fakeCron = (t: string) => {
  const r = parseCron(t);
  if (!r.ok) throw new Error(r.error);
  return r.cron;
};

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the wheel defaults put jobs 3 and 2 in tick 5 with 2 fired first; one pair is out of order; "+ 20 s" lands in slot 4 with 2 laps', () => {
    const w = initialWheel();
    expect(inversions(w.jobs)).toEqual([[3, 2]]);
    const fired = runWheel(w.jobs).firings;
    expect(fired.filter((f) => f.tick === 5).map((f) => f.id)).toEqual([2, 3]);
    const added = addDelay(w, 20);
    const p = place(added.jobs).at(-1)!;
    expect([p.slot, p.rounds]).toEqual([4, 2]);
    expect(lesson.tryThis[0]).toContain('"Pairs out of due order" reads 1');
    const caption = text(wheelFrames(w.jobs).find((f) => f.tick === 5 && f.say)!.say, { strict: true });
    expect(caption).toContain('fired job 2 (due 5 s), then job 3 (due 4.5 s)');
    expect(caption).toContain('heap would have run job 3 first');
  });

  it('try-this 2: at the queue defaults job 2 runs twice and its effect applies twice; the key makes it a no-op; a 10 s window ends the repeat until job 2 outlasts it', () => {
    const s = initialQueue();
    expect([s.visibilityMs, s.longJobMs, s.idempotent, s.seed]).toEqual([4_000, 6_000, false, QUEUE_BROKEN_SEED]);
    const run = runQueue(s);
    expect(queueStatsAt(run, Infinity).doubleEffects).toBe(1);
    expect(run.events.find((e) => e.kind === 'visible')!.at).toBeGreaterThanOrEqual(4_000);
    expect(runQueue({ ...s, idempotent: true }).runs.filter((r) => r.job === 2).map((r) => r.outcome)).toEqual(['ok', 'noop']);
    expect(queueStatsAt(runQueue({ ...s, visibilityMs: 10_000 }), Infinity).doubleEffects).toBe(0);
    expect(queueStatsAt(runQueue({ ...s, visibilityMs: 10_000, longJobMs: 12_000 }), Infinity).doubleEffects).toBe(1);
    expect(text(queueSummary(run), { strict: true })).toContain('1 effect was applied twice');
  });

  it('try-this 3: with jitter off all 30 retries share a quarter second; full jitter names a smaller busiest quarter second', () => {
    const s = initialQueue();
    const lock = stormPeak({ ...s, jitter: false }).peak;
    const spread = stormPeak({ ...s, jitter: true }).peak;
    expect(lock).toBe(30);
    expect(spread).toBeLessThan(lock);
    expect(text(stormNote(lock, spread, 30, false), { strict: true })).toContain(`${lock} retries land without jitter and ${spread} with it`);
    expect(s.jitter).toBe(true);
  });

  it('try-this 4: the cron defaults run each fire three times; a paused leader at the default pause runs 03:00 twice, and fencing rejects r1\'s late run', () => {
    const s = initialSched();
    expect([s.mode, s.fault, s.seed]).toEqual(['every', 'none', SCHED_BROKEN_SEED]);
    expect(schedStatsAt(runSched(s, 4 * HOUR_MS), Infinity)).toMatchObject({ applied: 9, repeatedFires: 3 });
    const paused: SchedSetup = { ...s, mode: 'leader', fault: 'pause' };
    const run = runSched(paused, 4 * HOUR_MS);
    expect(run.pause).toEqual({ from: 2 * HOUR_MS + 55 * MIN_MS, to: 3 * HOUR_MS + 10 * MIN_MS });
    const twice = run.rows.find((r) => r.duplicate)!;
    expect([twice.by, twice.fire, clockLabel(twice.at)]).toEqual(['r1', 3, '03:10']);
    expect(run.grants[1].to).toBe('r2');
    const fenced = runSched({ ...paused, mode: 'leader-fenced' }, 4 * HOUR_MS);
    expect(fenced.rows.find((r) => r.by === 'r1' && r.reason === 'stale token')).toBeDefined();
    expect(fenced.rows.some((r) => r.duplicate)).toBe(false);
    expect(lesson.tryThis[3]).toContain('02:55');
    expect(lesson.tryThis[3]).toContain('03:10');
  });

  it('try-this 5: "15th or Friday" runs on 6, 13, 15, 20, 27 March, so the OR rule adds a day no Friday covers; "Odd days and Friday" leaves the 13th and 27th', () => {
    expect(initialExpr().text).toBe('0 * * * *');
    const c = fakeCron(DOM_DOW_PRESET);
    const march = dayCounts(c, 2026, 3);
    expect(march).toMatchObject({ byDom: 1, byDow: 4, both: 0, runs: 5 });
    expect(nextFires(c, CRON_NOW_MS, 5)[0]).toBe(Date.UTC(2026, 2, 6));
    const odd = fakeCron('0 0 */2 * 5');
    expect(dayCounts(odd, 2026, 3).runs).toBe(2);
    const t = text(exprCaption(c, nextFires(c, CRON_NOW_MS, 5), 'March 2026', march), { strict: true });
    expect(t).toContain('runs when either matches');
    expect(t).toContain('1 day by day-of-month and 4 by day-of-week, 5 in all (0 match both)');
  });
});

describe('every scene opens in a state of its own', () => {
  it('the four opening states are fresh objects and do not share a mutable field', () => {
    expect(initialWheel()).not.toBe(initialWheel());
    expect(initialWheel().jobs).not.toBe(initialWheel().jobs);
    const q = initialQueue();
    q.visibilityMs = 1_000;
    q.idempotent = true;
    expect(initialQueue()).toEqual(DEFAULT_QUEUE);
    const s = initialSched();
    s.mode = 'dedupe';
    expect(initialSched()).toEqual(DEFAULT_SCHED);
    const w = initialWheel();
    w.jobs.push({ id: 99, delay: 1 });
    expect(initialWheel().jobs).toHaveLength(4);
  });

  it('switching through the scenes in any order leaves each opening state as it was', () => {
    const before = [initialWheel(), initialQueue(), initialSched(), initialExpr()];
    for (const make of [initialExpr, initialSched, initialQueue, initialWheel, initialQueue, initialExpr]) make();
    expect([initialWheel(), initialQueue(), initialSched(), initialExpr()]).toEqual(before);
  });
});

describe('hostile input is refused with the reason', () => {
  it('the delay field', () => {
    const refused = (t: string) => {
      const r = parseDelay(t);
      return r.ok ? null : r.error;
    };
    expect(refused('')).toContain('Type a delay');
    expect(refused('0')).toContain('shortest delay is 0.5 s');
    expect(refused('61')).toContain('longest delay is 60 s');
    expect(refused('1e3')).toContain("isn't a plain number");
    expect(refused('2.25')).toContain('whole half-seconds');
    expect(parseDelay('12.5')).toEqual({ ok: true, value: 12.5 });
  });

  it('a 41st job is refused with a message and the queue is unchanged', () => {
    let state = initialWheel();
    state = { ...state, jobs: Array.from({ length: MAX_JOBS }, (_, i) => ({ id: i + 1, delay: 1 })) };
    const next = addDelay(state, 5);
    expect(next.jobs).toHaveLength(MAX_JOBS);
    expect(next.refusal).toContain('holds 40 jobs');
    expect(addDelay({ ...initialWheel(), text: 'abc' }).jobs).toHaveLength(4);
  });
});

describe('captions and drawings are computed from the runs', () => {
  it('every wheel caption reads cleanly and the closing one counts what happened, for random queues', () => {
    for (const jobs of [initialWheel().jobs, [{ id: 1, delay: 0.5 }], [{ id: 1, delay: 60 }, { id: 2, delay: 59.5 }]]) {
      const frames = wheelFrames(jobs);
      for (const f of frames) if (f.say) expect(text(f.say, { strict: true })).not.toMatch(/NaN|undefined/);
      const last = text(frames.at(-1)!.say!, { strict: true });
      expect(last).toContain(`All ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} fired`);
      expect(last.includes('the same order here')).toBe(inversions(jobs).length === 0);
    }
  });

  it('queue frames read cleanly in every combination of key, kill, poison and jitter on three seeds', () => {
    for (const idempotent of [false, true]) {
      for (const killW1 of [false, true]) {
        for (const poison of [false, true]) {
          for (const jitter of [false, true]) {
            for (const seed of [0, 1, 2]) {
              const run = runQueue({ ...DEFAULT_QUEUE, seed, idempotent, killW1, poison, jitter });
              for (const f of queueFrames(run, queueSummary(run), queueIntro(run))) {
                if (f.say) expect(text(f.say, { strict: true })).not.toMatch(/NaN|undefined|Infinity/);
              }
            }
          }
        }
      }
    }
  });

  it('the queue summary agrees with the stats it prints', () => {
    for (let seed = 0; seed < 30; seed++) {
      const run = runQueue(queueSweep(seed, seed % 2 === 0, true));
      const st = queueStatsAt(run, Infinity);
      const t = text(queueSummary(run), { strict: true });
      expect(t.includes('no effect was applied twice'), `seed ${seed}`).toBe(st.doubleEffects === 0);
      expect(t).toContain(`${st.done} ${st.done === 1 ? 'job' : 'jobs'} are done`);
    }
  });

  it('queue bars: unique ids, red only for an effect applied twice, and the log lists each event and effect once with a seed:position id', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = runQueue(queueSweep(seed, false, true));
      const bars = queueBars(run);
      expect(new Set(bars.map((b) => b.id)).size).toBe(bars.length);
      expect(bars.filter((b) => b.tone === 'bad').length).toBe(run.runs.filter((r) => r.outcome === 'dup').length);
      const rows = queueLog(run, Infinity);
      expect(rows).toHaveLength(run.events.length + run.effects.length);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      expect(rows.some((r) => r.source === FX)).toBe(run.effects.length > 0);
    }
    expect(RUN_TONE.dup).toBe('bad');
    expect(QUEUE_LANES.map((l) => l.id)).toEqual(['w1', 'w2', 'queue']);
  });

  it('cron frames read cleanly for every mode and fault on pinned and ordinary seeds', () => {
    for (const mode of SCHED_MODES) {
      for (const fault of ['none', 'kill', 'pause'] as const) {
        for (const seed of [0, 3]) {
          const run = runSched({ ...DEFAULT_SCHED, mode, fault, seed });
          for (const f of schedFrames(run, schedSummary(run))) if (f.say) expect(text(f.say, { strict: true }), `${mode} ${fault}`).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
    }
  });

  it('the cron summary agrees with the stats; bars have unique ids; a missed fire is hatched red; red marks only a repeat or a miss', () => {
    for (const mode of SCHED_MODES) {
      for (let seed = 0; seed < 25; seed++) {
        const run = runSched(schedSweep(seed, mode, { skew: true, duplicates: true }));
        const st = schedStatsAt(run, Infinity);
        const t = text(schedSummary(run), { strict: true });
        expect(t.includes('no fire took effect twice'), `${mode} ${seed}`).toBe(st.repeatedFires === 0);
        expect(t.includes('was missed') || t.includes('were missed')).toBe(st.missed > 0);
        const bars = schedBars(run);
        expect(new Set(bars.map((b) => b.id)).size).toBe(bars.length);
        const red = bars.filter((b) => b.tone === 'bad');
        expect(red.length).toBe(run.rows.filter((r) => r.duplicate).length * 2 + run.missed.length + 0);
        for (const m of bars.filter((b) => b.id.startsWith('miss-'))) expect([m.kind, m.tone]).toEqual(['wait', 'bad']);
        expect(schedLog(run, Infinity)).toHaveLength(run.rows.length);
      }
    }
    expect(SCHED_LANES.map((l) => l.id)).toEqual(['r1', 'r2', 'r3', 'job']);
  });

  it('clock labels are the cron time of a simulated time', () => {
    expect(clockLabel(178_000)).toBe('02:58');
    expect(clockLabel(3 * HOUR_MS)).toBe('03:00');
  });
});

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions with answers spread over the positions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(new Set(lesson.quiz.map((q) => q.answer)).size).toBeGreaterThan(2);
  });
});
