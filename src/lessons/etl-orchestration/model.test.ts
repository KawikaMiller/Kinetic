import { describe, expect, it } from 'vitest';
import {
  DAYS, DURATION, HORIZON_HOURS, LATE_ROWS, SOURCE_ROWS, TASKS, UPSTREAM, createPipeline, dayStatus, keyOf, runPipeline, triggerHour, type Config, type Op, type World,
} from './engine';
import { BROKEN_SEED, chaos, opsForSeed } from './scenario';
import { BACKFILL_MAX_DAYS, PAUSE_FROM, PAUSE_TO, SCHEDULE_DAYS, backfillDates, createdBy, eligibleHour, logicalDate, triggers } from './schedule';
import { PIPELINES, dailyRun, rerunAfterRuleChange } from './shape';

const SEEDS = 200;
const seeds = Array.from({ length: SEEDS }, (_, i) => i);
const base: Config = { retries: 0, mode: 'overwrite', failures: {}, ops: [], flaky: false };
const last = (cfg: Config, seed = 0): World => runPipeline(cfg, seed).state;

describe('a clean week', () => {
  it('hand-worked: each day runs extract 1h, clean 2h, join 1h, load 1h after its interval closes, and loads exactly its source rows', () => {
    const w = last(base);
    expect(w.output).toEqual([...SOURCE_ROWS]);
    expect(w.loads).toEqual(Array(DAYS).fill(1));
    const day = w.runs[2].tasks;
    const t0 = triggerHour(2);
    expect(day.extract_orders.spans).toEqual([{ start: t0, end: t0 + 1, ok: true }]);
    expect(day.clean.spans).toEqual([{ start: t0 + 1, end: t0 + 3, ok: true }]);
    expect(day.join.spans).toEqual([{ start: t0 + 3, end: t0 + 4, ok: true }]);
    expect(day.load_report.spans).toEqual([{ start: t0 + 4, end: t0 + 5, ok: true }]);
  });

  it('the DAG order holds in every run, checked by a reference written from the spans: a task starts at or after every upstream end', () => {
    for (const seed of seeds) {
      const w = last(chaos(seed, 'overwrite'), seed);
      for (const run of w.runs) {
        for (const t of TASKS) {
          for (const span of run.tasks[t].spans.filter((s) => s.ok)) {
            for (const u of UPSTREAM[t]) expect(run.tasks[u].spans.some((s) => s.ok && s.end <= span.start), `seed ${seed} day ${run.day} ${t}`).toBe(true);
          }
        }
      }
    }
  });

  it('durations are the table\'s, for every attempt in every chaos run', () => {
    for (const seed of seeds.slice(0, 50)) {
      for (const run of last(chaos(seed, 'append'), seed).runs) for (const t of TASKS) for (const s of run.tasks[t].spans) expect(s.end - s.start).toBe(DURATION[t]);
    }
  });
});

describe('failure, retry and clear', () => {
  const failClean = (kind: 'transient' | 'permanent', retries: number): Config => ({ ...base, retries, failures: { [keyOf(2, 'clean')]: { kind } } });

  it('a permanent failure with no retries stops the downstream tasks, which do not run, and the others days are untouched', () => {
    const w = last(failClean('permanent', 0));
    const day = w.runs[2].tasks;
    expect(day.clean.status).toBe('failed');
    expect(day.join.status).toBe('upstream_failed');
    expect(day.load_report.status).toBe('upstream_failed');
    expect(day.join.spans).toEqual([]);
    expect(w.loads[2]).toBe(0);
    expect(dayStatus(w, 2)).toBe('missing');
    expect(w.loads.filter((_, d) => d !== 2)).toEqual(Array(DAYS - 1).fill(1));
  });

  it('a transient failure is cured by one retry and not by zero', () => {
    expect(last(failClean('transient', 0)).runs[2].tasks.clean.status).toBe('failed');
    const w = last(failClean('transient', 1));
    expect(w.runs[2].tasks.clean.status).toBe('success');
    expect(w.runs[2].tasks.clean.spans.map((s) => s.ok)).toEqual([false, true]);
    expect(w.loads[2]).toBe(1);
  });

  it('retries wait the backoff and a permanent failure uses them all and still fails', () => {
    const w = last(failClean('permanent', 3));
    const spans = w.runs[2].tasks.clean.spans;
    expect(spans).toHaveLength(4);
    for (let i = 1; i < spans.length; i++) expect(spans[i].start - spans[i - 1].end).toBe(1);
    expect(w.runs[2].tasks.clean.status).toBe('failed');
  });

  it('clearing a failed task runs it and the tasks it blocked, and the day completes', () => {
    const t = triggerHour(2) + 20;
    const w = last({ ...failClean('permanent', 0), ops: [{ at: t, kind: 'clear', day: 2, task: 'clean' }] });
    expect(w.runs[2].tasks.load_report.status).toBe('success');
    expect(w.output[2]).toBe(SOURCE_ROWS[2]);
    expect(w.runs[2].tasks.clean.spans.filter((s) => s.start >= t).every((s) => s.ok)).toBe(true);
  });
});

/** Source rows for `day` at hour `h`, from the operations list alone. */
const sourceAt = (day: number, h: number, ops: readonly Op[]) => SOURCE_ROWS[day] + LATE_ROWS * ops.filter((o) => o.kind === 'late' && o.day === day && o.at <= h).length;

describe('safety over seeded schedules (200 seeds, up to 12 operations, failures, retries, flaky workers)', () => {
  it('a task never runs while an upstream task of its run has not succeeded, at every step of every schedule', () => {
    for (const mode of ['overwrite', 'append'] as const) {
      for (const seed of seeds) {
        const sim = createPipeline(chaos(seed, mode), seed);
        sim.run(HORIZON_HOURS);
        expect(sim.violation, `${mode} seed ${seed}`).toBeNull();
      }
    }
  });

  it('with overwrite-by-date loads the output for each date equals the source rows its last load saw: no duplicates, none lost', () => {
    for (const seed of seeds) {
      const cfg = chaos(seed, 'overwrite');
      const w = last(cfg, seed);
      for (let d = 0; d < DAYS; d++) {
        const oks = w.runs[d].tasks.load_report.spans.filter((s) => s.ok);
        const expected = oks.length === 0 ? 0 : sourceAt(d, oks.at(-1)!.end - 1, cfg.ops);
        expect(w.output[d], `seed ${seed} day ${d}`).toBe(expected);
        expect(w.output[d]).toBeLessThanOrEqual(w.source[d]);
      }
    }
  });

  it('append loads leave the sum of every load\'s rows, so a rerun duplicates them', () => {
    for (const seed of seeds) {
      const cfg = chaos(seed, 'append');
      const w = last(cfg, seed);
      for (let d = 0; d < DAYS; d++) {
        const expected = w.runs[d].tasks.load_report.spans.filter((s) => s.ok).reduce((n, s) => n + sourceAt(d, s.end - 1, cfg.ops), 0);
        expect(w.output[d], `seed ${seed} day ${d}`).toBe(expected);
      }
    }
  });

  it('the pinned seed is the lowest whose schedule makes append duplicate rows, by a rerun of a day that had loaded; overwrite never duplicates on any of the 200', () => {
    let lowest: number | null = null;
    for (const seed of seeds) {
      const ops = opsForSeed(seed);
      const append = last({ ...base, mode: 'append', ops }, seed);
      const overwrite = last({ ...base, mode: 'overwrite', ops }, seed);
      const dup = Array.from({ length: DAYS }, (_, d) => dayStatus(append, d)).includes('duplicated');
      const reran = ops.some((o) => o.kind === 'rerun' && append.loads[o.day] >= 2);
      expect(dup, `seed ${seed}: duplicates exactly when a loaded day was rerun`).toBe(reran);
      expect(Array.from({ length: DAYS }, (_, d) => dayStatus(overwrite, d)).includes('duplicated'), `seed ${seed}`).toBe(false);
      if (dup && lowest === null) lowest = seed;
    }
    expect(lowest).toBe(BROKEN_SEED);
    const ops = opsForSeed(BROKEN_SEED);
    const noRerun = ops.filter((o) => o.kind !== 'rerun');
    expect(last({ ...base, mode: 'append', ops: noRerun }).output).toEqual(last({ ...base, ops: noRerun }).output);
  });

  it('late data is picked up only by a rerun of that day, and an append rerun then doubles the old rows too', () => {
    const t = triggerHour(1) + 10;
    const late: Op = { at: t, kind: 'late', day: 1 };
    const stale = last({ ...base, ops: [late] });
    expect(dayStatus(stale, 1)).toBe('stale');
    const fixed = last({ ...base, ops: [late, { at: t + 2, kind: 'rerun', day: 1 }] });
    expect(dayStatus(fixed, 1)).toBe('ok');
    const dup = last({ ...base, mode: 'append', ops: [late, { at: t + 2, kind: 'rerun', day: 1 }] });
    expect(dup.output[1]).toBe(SOURCE_ROWS[1] + SOURCE_ROWS[1] + LATE_ROWS);
    expect(dayStatus(dup, 1)).toBe('duplicated');
  });

  it('a backfill of every day gives exactly one more successful run per day, and under overwrite leaves the table equal to the source', () => {
    const at = HORIZON_HOURS - 30;
    const ops: Op[] = Array.from({ length: DAYS }, (_, day) => ({ at, kind: 'rerun' as const, day }));
    for (const mode of ['overwrite', 'append'] as const) {
      const w = last({ ...base, mode, ops });
      expect(w.loads).toEqual(Array(DAYS).fill(2));
      expect(w.output).toEqual(mode === 'overwrite' ? [...SOURCE_ROWS] : SOURCE_ROWS.map((r) => 2 * r));
    }
  });

  it('the same seed gives the same history', () => {
    const cfg = chaos(7, 'append');
    expect(JSON.stringify(runPipeline(cfg, 7).history)).toBe(JSON.stringify(runPipeline(cfg, 7).history));
  });
});

describe('backfill date ranges', () => {
  it('lists each date once, across a month boundary and a non-leap February, and refuses a backwards or oversized range', () => {
    expect(backfillDates('2026-02-26', '2026-03-02')).toEqual(['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(backfillDates('2026-03-05', '2026-03-05')).toEqual(['2026-03-05']);
    expect(backfillDates('2027-02-27', '2027-03-01')).toEqual(['2027-02-27', '2027-02-28', '2027-03-01']);
    expect(() => backfillDates('2026-03-02', '2026-03-01')).toThrow('after');
    expect(backfillDates('2026-01-01', '2026-01-14')).toHaveLength(BACKFILL_MAX_DAYS);
    expect(() => backfillDates('2026-01-01', '2026-01-15')).toThrow('at most');
    const all = backfillDates('2026-01-25', '2026-02-07');
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('schedule semantics', () => {
  it('the run for logical date D is eligible exactly when D\'s interval closes, a table over ten dates including the end of a non-leap February', () => {
    const table: [string, number][] = [
      ['2026-02-25', 24], ['2026-02-26', 48], ['2026-02-27', 72], ['2026-02-28', 96], ['2026-03-01', 120],
      ['2026-03-02', 144], ['2026-03-03', 168], ['2026-03-04', 192], ['2026-03-05', 216], ['2026-03-06', 240],
    ];
    for (const [date, hour] of table) expect(eligibleHour(date), date).toBe(hour);
    expect(logicalDate(3)).toBe('2026-02-28');
    expect(logicalDate(4)).toBe('2026-03-01');
    expect(logicalDate(SCHEDULE_DAYS - 1)).toBe('2026-03-08');
    // the day after Feb 28, 2026 is Mar 1: there is no Feb 29 in 2026
    expect(new Date(Date.UTC(2026, 1, 28 + 1)).toISOString().slice(0, 10)).toBe('2026-03-01');
  });

  it('catchup on creates one run per missed day when the pause ends; off creates one, the latest', () => {
    const missed = triggers(true, true).filter((t) => t.kind === 'caught-up');
    const k = Array.from({ length: SCHEDULE_DAYS }, (_, d) => 24 * (d + 1)).filter((e) => e >= PAUSE_FROM && e < PAUSE_TO).length;
    expect(missed).toHaveLength(k);
    expect(missed.every((t) => t.at === PAUSE_TO)).toBe(true);
    const off = triggers(true, false);
    expect(off.filter((t) => t.kind === 'caught-up')).toHaveLength(1);
    expect(off.filter((t) => t.kind === 'skipped')).toHaveLength(k - 1);
    expect(off.find((t) => t.kind === 'caught-up')!.day).toBe(Math.max(...missed.map((t) => t.day)));
    expect(triggers(false, false).every((t) => t.kind === 'on-time')).toBe(true);
  });

  it('every day has at most one run, and a run is never created before its interval closes', () => {
    for (const paused of [false, true]) {
      for (const catchup of [false, true]) {
        for (let now = 0; now <= 24 * SCHEDULE_DAYS + 24; now++) {
          const made = createdBy(now, paused, catchup);
          expect(new Set(made.map((t) => t.day)).size).toBe(made.length);
          for (const t of made) expect(t.at! >= 24 * (t.day + 1)).toBe(true);
        }
      }
    }
  });
});

describe('ETL and ELT as pipelines', () => {
  it('after a cleaning-rule change ELT reruns clean, join and the report (3 steps, no extracts); ETL reruns all 5 and extracts twice', () => {
    expect(rerunAfterRuleChange('elt')).toEqual({ steps: ['clean', 'join', 'build_report'], extractRuns: 0 });
    expect(rerunAfterRuleChange('etl')).toEqual({ steps: ['extract_orders', 'extract_users', 'clean', 'join', 'load_report'], extractRuns: 2 });
    expect(dailyRun('etl')).toEqual({ steps: 5, extractRuns: 2 });
    expect(dailyRun('elt')).toEqual({ steps: 5, extractRuns: 2 });
  });
  it('every step of both pipelines names only steps that exist, and the graphs have no cycle', () => {
    for (const steps of Object.values(PIPELINES)) {
      const ids = new Set(steps.map((s) => s.id));
      for (const s of steps) for (const a of s.after) expect(ids.has(a)).toBe(true);
      const seen = new Set<string>();
      for (const s of steps) {
        for (const a of s.after) expect(seen.has(a), `${s.id} listed before ${a}`).toBe(true);
        seen.add(s.id);
      }
    }
  });
});
