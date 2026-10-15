import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { driftMsPerDay, worstDriftError } from './clocks';
import { driftCaption, exchangeCaption, intervalCaption, leaseCaption, logCaption, lwwCaption } from './captions';
import { BAD_CLOCKS, DEFAULT_DRIFT, GOOD_CLOCKS, NODE_NAMES, driftView, type DriftState } from './drift';
import lesson from './index';
import { believedUntil, runLease } from './lease';
import { BROKEN_SEED, runLww } from './lww';
import { runLog } from './orderLog';
import { decidableShare, sampleGaps } from './intervals';

const view = (patch: Partial<DriftState> = {}) => {
  const s = { ...DEFAULT_DRIFT, ...patch };
  return { s, v: driftView(s) };
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: with sync off, n4 (−200 ppm) drifts 17.28 s a day and is off by about 3.52 s after six hours', () => {
    expect(DEFAULT_DRIFT.mode).toBe('off');
    expect(NODE_NAMES[DEFAULT_DRIFT.node]).toBe('n4');
    const { s, v } = view();
    expect(v.clock.driftPpm).toBe(-200);
    expect(v.perDayMs).toBeCloseTo(-17_280, 6);
    expect(v.series[3].at(-1)!.skew).toBeCloseTo(800 - 200e-6 * 6 * 3_600_000, 6);
    expect(text(driftCaption(s, v))).toContain('after 6 hours its skew is');
    expect(lesson.tryThis[0]).toContain('17.28 s a day');
    expect(lesson.tryThis[0]).toContain('3.52 s off after six hours');
  });

  it('try-this 2: step with a 1,024 s poll peaks near 200 ppm × 1,024 s = 204.8 ms and the first step moves the wall clock backwards; slew has no backward move', () => {
    const { s, v } = view({ mode: 'step', pollExp: 10 });
    expect(v.driftTimesPollMs).toBeCloseTo(204.8, 6);
    expect(worstDriftError(-200, 1024)).toBeCloseTo(204.8, 9);
    const settled = v.series[3].filter((p) => p.t > 1024_000 * 2);
    expect(Math.max(...settled.map((p) => Math.abs(p.skew)))).toBeCloseTo(204.8, 0);
    expect(v.demo!.moved).toBeLessThan(0);
    expect(text(driftCaption(s, v))).toContain('204.8 ms');
    const slew = view({ mode: 'slew', pollExp: 10 }).v;
    expect(slew.demo!.moved).toBeGreaterThan(0);
    expect(lesson.tryThis[1]).toContain('204.8 ms');
  });

  it('try-this 3: forward 10 ms and return 50 ms read an estimate error of about −20 ms', () => {
    const { s, v } = view({ forwardMs: 10, returnMs: 50 });
    expect(v.asymmetryMs).toBe(-20);
    expect(v.exchangeError).toBeCloseTo(-20, 1);
    expect(text(exchangeCaption(v, s.forwardMs, s.returnMs))).toContain('(forward − return) / 2 = −20 ms');
  });

  it('try-this 4: A 5 s fast loses write 2 (x = 1 survives), A at 0 lets x = 2 win; the lease overlaps from 10.5 s and the margin removes it', () => {
    const lost = runLww({ seed: BROKEN_SEED, mode: 'raw', offsets: [5000, 0] });
    expect([lost.finals.A.value, lost.finals.B.value]).toEqual([1, 1]);
    const won = runLww({ seed: BROKEN_SEED, mode: 'raw', offsets: [0, 0] });
    expect([won.finals.A.value, won.finals.B.value]).toEqual([2, 2]);
    expect(text(lwwCaption({ stamp1: lost.stamps[1], stamp2: lost.stamps[2], winner: 1, offsetA: 5000, offsetB: 0, held: false }))).toContain('x = 1');
    const clock = { offsetMs: -3000, driftPpm: 0 };
    const overlap = runLease({ seed: BROKEN_SEED, holderClock: clock, marginMs: 0 });
    expect(believedUntil(clock, 0)).toBe(13_000);
    expect(overlap.overlap!.from).toBeGreaterThan(10_500);
    expect(overlap.overlap!.to).toBe(13_000);
    expect(text(leaseCaption(overlap, { offsetMs: -3000, marginMs: 0, believedEndMs: 13_000 }))).toContain('Two holders');
    const margin = runLease({ seed: BROKEN_SEED, holderClock: clock, marginMs: 3500 });
    expect(margin.overlap).toBeNull();
    expect(text(leaseCaption(margin, { offsetMs: -3000, marginMs: 3500, believedEndMs: believedUntil(clock, 3500) }))).toContain('No two holders');
  });

  it('try-this 5: with ε = 10 ms and A 8 ms off, write 2 wins; with A 60 ms off it loses', () => {
    const ok = runLww({ seed: BROKEN_SEED, mode: 'commit-wait', epsilonMs: 10, offsets: [8, 0] });
    expect([ok.finals.A.value, ok.finals.B.value]).toEqual([2, 2]);
    const bad = runLww({ seed: BROKEN_SEED, mode: 'commit-wait', epsilonMs: 10, offsets: [60, 0] });
    expect([bad.finals.A.value, bad.finals.B.value]).toEqual([1, 1]);
    expect(ok.commitWaitMs).toBe(20);
    const share = decidableShare(sampleGaps(), 10);
    expect(text(intervalCaption({ epsilonMs: 10, share, waitMs: 20, winner: 1, errorMs: 60, commitWait: true }))).toContain('write 1 wins');
  });
});

describe('captions are computed from the model', () => {
  it('the drift caption quotes the same per-day drift, peak and worst error as the stats, for every node, mode and slider extreme', () => {
    for (const node of [0, 1, 2, 3, 4]) {
      for (const mode of ['off', 'step', 'slew'] as const) {
        for (const pollExp of [0, 5, 10]) {
          for (const clocks of [GOOD_CLOCKS, BAD_CLOCKS]) {
            const { s, v } = view({ node, mode, pollExp, clocks });
            const c = text(driftCaption(s, v), { strict: true });
            expect(driftMsPerDay(v.clock.driftPpm)).toBeCloseTo(v.perDayMs, 9);
            if (mode === 'off') {
              expect(c, `${node} ${mode}`).toContain(`${NODE_NAMES[node]} drifts`);
              expect(c).toContain('after 6 hours');
            } else {
              expect(c, `${node} ${mode} ${pollExp}`).toContain(`${NODE_NAMES[node]} syncs every ${2 ** pollExp} s`);
            }
          }
        }
      }
    }
  });

  it('a control that is not shown cannot change a number: the poll interval does not touch anything while sync is off', () => {
    const a = view({ mode: 'off', pollExp: 0 }).v;
    const b = view({ mode: 'off', pollExp: 10 }).v;
    expect(a.series).toEqual(b.series);
    expect(a.worst).toBe(b.worst);
    expect(a.horizonMs).toBe(b.horizonMs);
  });

  it('the exchange caption quotes the exchange it drew, and the path sliders at their extremes stay finite', () => {
    for (const [f, r] of [[0, 0], [200, 0], [0, 200], [200, 200]]) {
      const { s, v } = view({ forwardMs: f, returnMs: r });
      const c = text(exchangeCaption(v, s.forwardMs, s.returnMs), { strict: true });
      expect(c).toContain(`forward delay of ${f} ms and a return delay of ${r} ms`);
      expect(Number.isFinite(v.exchangeError)).toBe(true);
    }
  });

  it('the log caption says "cause before effect" exactly when the merge keeps the order', () => {
    for (const offsetMs of [-3000, -100, -1, 0, 2, 100, 3000]) {
      const { merged } = runLog({ seed: 0, clockB: { offsetMs, driftPpm: 0 } });
      const c = text(logCaption(merged, offsetMs), { strict: true });
      const inOrder = merged.map((l) => l.text).join() === ['request sent', 'request handled', 'reply received'].join();
      expect(c.includes('Cause before effect.'), `offset ${offsetMs}`).toBe(inOrder);
    }
  });
});

describe('lesson content', () => {
  it('has five try-this entries', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
});
