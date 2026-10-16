import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { clocksCaption, correctRun, deployStarts, lockCaption } from './clocks';
import { cleanAtOpen, clocksFacts, lockFacts, presetFacts } from './facts';
import lesson from './index';
import {
  BATCH_OVERHEAD_MS, BATCH_PAUSE_MS, CLIENT_TIMEOUT_S, DDL_AT_S, DDL_HOLD_S, DEFAULT_BATCH, MAX_BATCH, MAX_LOCK_TIMEOUT_S, MIN_LOCK_TIMEOUT_S, QUERY_BIG_S, QUERY_SMALL_S, REQUESTS_PER_S, ROW_MS, TABLE_ROWS, batchRun, lockRun,
} from './lock';
import { ALL_ORDERS, INSTANCES, PRESETS, STEP_IDS } from './model';
import { CLOCKS_OPEN, LOCKS_OPEN, MIGRATION_OPEN, codeState, eventsOf, fleetOf, frameCaption, lockBars, rowRail, runOf, tableCell, verdictText } from './view';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n);

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('zero-downtime-migrations')).toHaveLength(3);
    expect(sharedSceneComponents('zero-downtime-migrations')).toEqual([]);
    expect(sceneElements('zero-downtime-migrations').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(MIGRATION_OPEN).toMatchObject({ order: [], deploy: 60, seed: 7 });
    expect(CLOCKS_OPEN.deploy).toBe(60);
    expect(LOCKS_OPEN).toMatchObject({ big: true, timeout: false, batch: DEFAULT_BATCH });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: the correct order is clean at the default setting, and it is the only clean one of 720', () => {
    expect(presetFacts('correct')).toEqual({ errors: 0, stale: 0, lost: 0, clean: true });
    expect(cleanAtOpen()).toBe(1);
    expect(lesson.tryThis[0]).toContain('0 failed requests, 0 stale reads and 0 rows wrong');
    expect(lesson.tryThis[0]).toContain('Only 1 of the 720 orderings is clean');
  });

  it('try-this 2: skipping dual-write throws no error and loses data', () => {
    const f = presetFacts('skipDual');
    expect(f).toMatchObject({ errors: 0, clean: false });
    expect(f.stale).toBeGreaterThan(0);
    expect(f.lost).toBeGreaterThan(0);
    expect(lesson.tryThis[1]).toContain(`${f.errors} failed requests but ${f.stale} stale reads and ${f.lost} rows`);
  });

  it('try-this 3: contracting too early fails requests on a missing column', () => {
    const f = presetFacts('contractEarly');
    expect(f.errors).toBeGreaterThan(0);
    expect(lesson.tryThis[2]).toContain(`${f.errors} requests failed on a missing column`);
  });

  it('try-this 4: the textbook order is clean at 60% and not at 0%, with 1 and 0 of 720 clean', () => {
    const c = clocksFacts();
    expect(c.open).toEqual({ clean: 1, textbookClean: true });
    expect(c.none).toEqual({ clean: 0, textbookClean: false });
    expect(lesson.tryThis[3]).toContain('the textbook order is clean and 1 of 720 orderings run clean');
    expect(lesson.tryThis[3]).toContain('not clean and 0 of 720 are');
  });

  it('try-this 5: the lock numbers of the default state, with a timeout, and the batch totals', () => {
    const f = lockFacts();
    expect(f.wait.longestBlockS).toBeCloseTo(7.2, 9);
    expect(f.wait.peakQueue).toBe(288);
    expect(f.wait.timedOut).toBe(88);
    expect(f.short.longestBlockS).toBeCloseTo(1.2, 9);
    expect(f.short.attempts).toHaveLength(4);
    expect(lesson.tryThis[4]).toContain('blocks new requests for 7.2 s, 288 queue up and 88 wait past the client timeout');
    expect(lesson.tryThis[4]).toContain('drops to 1.2 s over 4 attempts');
    // 20,000 batches of 3.4 ms plus 19,999 pauses of 10 ms is 268 s, 4.5 minutes; 2,000 batches of 7 ms plus pauses is 34 s
    expect(lesson.tryThis[4]).toContain('takes 4.5 min in total and 1000 rows takes 34 s');
    expect(lesson.tryThis[4]).toContain('type 0 and it is refused');
  });
});

describe('lock queue and batches, hand-worked', () => {
  it('a big table with no timeout: the ALTER waits from 2 s to the end of the 9 s query, holds 0.2 s, and the queue behind it is the arrival rate times that window', () => {
    const r = lockRun({ big: true, lockTimeoutS: null });
    expect(r.attempts).toEqual([{ start: DDL_AT_S, end: QUERY_BIG_S, outcome: 'acquired' }]);
    expect(r.blocked).toEqual([{ start: DDL_AT_S, end: QUERY_BIG_S + DDL_HOLD_S }]);
    // 40 requests a second over a 7.2 s window is 288; 2.2 s past the 5 s timeout is 88
    expect(REQUESTS_PER_S).toBe(40);
    expect(r.peakQueue).toBe(288);
    expect(CLIENT_TIMEOUT_S).toBe(5);
    expect(r.timedOut).toBe(88);
  });

  it('a small table: the query is over before the ALTER starts, so it only holds for its own 0.2 s', () => {
    const r = lockRun({ big: false, lockTimeoutS: null });
    expect(QUERY_SMALL_S).toBeLessThan(DDL_AT_S);
    expect(r.attempts).toEqual([{ start: DDL_AT_S, end: DDL_AT_S, outcome: 'acquired' }]);
    expect(r.longestBlockS).toBeCloseTo(DDL_HOLD_S, 9);
    expect(r.timedOut).toBe(0);
  });

  it('a lock timeout gives up and retries until the long query ends, and never lengthens the longest block', () => {
    for (const big of [true, false]) {
      const base = lockRun({ big, lockTimeoutS: null });
      for (let t = MIN_LOCK_TIMEOUT_S; t <= MAX_LOCK_TIMEOUT_S; t += 0.5) {
        const r = lockRun({ big, lockTimeoutS: t });
        expect(r.longestBlockS, `big=${big} timeout=${t}`).toBeLessThanOrEqual(base.longestBlockS + 1e-9);
        expect(r.attempts.at(-1)!.outcome).toBe('acquired');
        expect(r.attempts.slice(0, -1).every((a) => a.outcome === 'gave-up')).toBe(true);
        expect(r.done).toBeGreaterThanOrEqual(QUERY_BIG_S * Number(big));
      }
    }
  });

  it('the gantt bars cover the blocked windows, and the part past the client timeout is red', () => {
    const run = lockRun({ big: true, lockTimeoutS: null });
    const { bars } = lockBars(run);
    const queue = bars.filter((b) => b.lane === 'queue');
    expect(queue.map((b) => b.tone)).toEqual(['hi', 'bad']);
    expect(queue[0].end - queue[0].start).toBe(CLIENT_TIMEOUT_S);
    expect(queue.at(-1)!.end).toBeCloseTo(run.blocked[0].end, 9);
  });

  it('batches: the count, the time of one batch and the total follow from the constants (worked by hand for 100 and 1000)', () => {
    const b100 = batchRun(100);
    expect(b100.batches).toBe(TABLE_ROWS / 100);
    expect(b100.batchMs).toBeCloseTo(BATCH_OVERHEAD_MS + 100 * ROW_MS, 9);
    expect(b100.totalS).toBeCloseTo((20000 * 3.4 + 19999 * BATCH_PAUSE_MS) / 1000, 6);
    expect(batchRun(1000).totalS).toBeCloseTo((2000 * 7 + 1999 * BATCH_PAUSE_MS) / 1000, 6);
    expect(batchRun(1).totalS).toBeGreaterThan(batchRun(MAX_BATCH).totalS * 100);
  });

  it('a larger batch finishes sooner and holds its lock longer, at every size', () => {
    let prev = batchRun(1);
    for (const n of [2, 5, 10, 50, 100, 500, 1000]) {
      const b = batchRun(n);
      expect(b.totalS).toBeLessThan(prev.totalS);
      expect(b.peakLockMs).toBeGreaterThan(prev.peakLockMs);
      prev = b;
    }
  });
});

describe('what the scenes draw', () => {
  const run = runOf([...STEP_IDS], 60, 7);

  it('code lines: the step applied at a frame is now, earlier ones done, later ones idle, a failing statement bad', () => {
    expect(STEP_IDS.map((s) => codeState(run, 2, s))).toEqual(['done', 'now', 'idle', 'idle', 'idle', 'idle']);
    const early = runOf(PRESETS.find((p) => p.id === 'backfillFirst')!.order, 60, 7);
    expect(codeState(early, 1, 'backfill')).toBe('bad');
  });

  it('table cells follow the schema: dim before expand, orange when the new column disagrees with the last write, dim after the drop', () => {
    const f0 = run.frames[0];
    expect(tableCell(f0, 0, 1)).toMatchObject({ tone: 'dim', fill: 'outline' });
    expect(tableCell(f0, 0, 0)).toMatchObject({ tone: 'info', text: String(100) });
    const skip = runOf(PRESETS.find((p) => p.id === 'skipDual')!.order, 60, 7);
    const last = skip.frames.at(-1)!;
    expect(skip.lostRows.length).toBeGreaterThan(0);
    expect(tableCell({ ...last, hasFull: true }, skip.lostRows[0], 1).tone).toBe('orange');
    expect(tableCell(last, 0, 0)).toMatchObject({ tone: 'dim' });
    expect(rowRail({ ...last, hasFull: true }, skip.lostRows[0])).toMatchObject({ tone: 'orange' });
  });

  it('the fleet draws v2 instances first, as many as the frame says', () => {
    for (const f of run.frames) {
      const fleet = fleetOf(f);
      expect(fleet).toHaveLength(INSTANCES);
      expect(fleet.filter((v) => v === 'v2')).toHaveLength(f.v2);
    }
  });
});

describe('captions are computed from the model', () => {
  it('each frame\'s caption names the step, the instances on v2 and the failed and stale request counts of that frame, for every preset and the slider extremes', () => {
    for (const p of PRESETS) {
      for (const deploy of [0, 60, 100]) {
        const r = runOf(p.order, deploy, 7);
        r.frames.forEach((f, i) => {
          const c = text(frameCaption(r, i));
          expect(c, `${p.id} ${deploy} ${i}`).toContain(`${f.v2} of ${INSTANCES} instances run v2`.slice(0, i === 0 ? 0 : undefined));
          if (i > 0) {
            const requests = eventsOf(r, i).filter((e) => e.op !== 'step');
            expect(c).toContain(`Of ${requests.length} requests around it, ${requests.filter((e) => !e.ok).length} failed and ${requests.filter((e) => e.stale).length} read an older value`);
          }
        });
      }
    }
  });

  it('the verdict says clean only when it is, and names each kind of trouble the run has', () => {
    for (const p of PRESETS) {
      const r = runOf(p.order, 60, 7);
      const v = text(verdictText(r));
      expect(v.startsWith('Clean')).toBe(r.clean);
      expect(v.includes('failed on a missing column')).toBe(r.errors > 0);
      expect(v.includes('older value')).toBe(r.staleReads > 0);
      expect(v.includes('without the last value written')).toBe(r.lostRows.length > 0);
    }
    expect(text(verdictText(runOf(['expand'], 60, 7)))).toContain('never ran');
  });

  it('the two-clocks caption quotes the clean count and names the first step followed by trouble, at every start', () => {
    for (const d of deployStarts()) {
      const r = correctRun(d);
      const c = text(clocksCaption(d, r, 3));
      expect(c).toContain(`${d}% of the fleet on v2`);
      expect(c.includes('not clean')).toBe(!r.clean);
      expect(c).toContain(`3 of ${ALL_ORDERS.length} orderings`);
    }
  });

  it('the lock caption quotes the model\'s block length, queue and timeouts, for every toggle combination', () => {
    for (const big of [true, false]) {
      for (const timeoutOn of [true, false]) {
        const r = lockRun({ big, lockTimeoutS: timeoutOn ? 1 : null });
        const c = text(lockCaption(r, big, timeoutOn));
        expect(c).toContain(`up to ${r.longestBlockS.toFixed(1)} s, with up to ${r.peakQueue} queued`);
        expect(c.includes('with a lock timeout')).toBe(timeoutOn);
        expect(c.includes(big ? 'a big table' : 'a small table')).toBe(true);
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
