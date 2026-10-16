import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { ADD, BETA, CAPACITY, MUL_UP, RULES, SUB, gapOf, overCapacity, readTrajectory, step, trajectory, type Rates, type Rule } from './fairness';
import {
  BBR_PROBE_GAINS, CUBIC_BETA, CWND_CAP, DEFAULT_LINK, INITIAL_WINDOW, RANGES, bdpOf, bufferOf, cubicK, cubicWindow, mathisWindow, renoMeanWindow, renoNext, sawtoothWindow, simulate,
  summarise, thresholdOf, type LinkSetup, type RoundRec,
} from './model';

const sliderValues = (r: { min: number; max: number; step: number }) => {
  const out: number[] = [];
  for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};
const randomLink = (rnd: () => number): LinkSetup => {
  const pick = (r: { min: number; max: number; step: number }) => {
    const v = sliderValues(r);
    return v[Math.floor(rnd() * v.length)];
  };
  return { mbps: pick(RANGES.mbps), rttMs: pick(RANGES.rttMs), bufferBdp: pick(RANGES.bufferBdp), loss: 0, timeouts: false, seed: Math.floor(rnd() * 1000) };
};

describe('the link', () => {
  it('BDP is bandwidth times delay in 1500-byte segments: 12 Mbit/s and 60 ms hold 60', () => {
    // 12e6 bit/s x 0.060 s = 720,000 bit = 90,000 bytes = 60 segments of 1500 bytes.
    expect(bdpOf(DEFAULT_LINK)).toBe(60);
    expect(bufferOf(DEFAULT_LINK)).toBe(30);
    expect(thresholdOf(DEFAULT_LINK)).toBe(90);
  });

  it('every slider setting gives a whole BDP, and the buffer is never below one segment', () => {
    for (const mbps of sliderValues(RANGES.mbps)) {
      for (const rttMs of sliderValues(RANGES.rttMs)) {
        const bdp = bdpOf({ mbps, rttMs });
        expect(Number.isInteger(bdp)).toBe(true);
        for (const bufferBdp of sliderValues(RANGES.bufferBdp)) expect(bufferOf({ mbps, rttMs, bufferBdp })).toBeGreaterThanOrEqual(1);
      }
    }
    expect(bufferOf({ mbps: 6, rttMs: 12, bufferBdp: 0.1 })).toBe(1);
  });
});

describe('Reno, hand-worked on the default link', () => {
  const recs = simulate('reno', DEFAULT_LINK, 40);

  it('slow start doubles 10, 20, 40, 80, then 160 overflows the 90-segment threshold: the first loss is at round 4, 70 segments are lost', () => {
    expect(recs.slice(0, 5).map((r) => r.sent)).toEqual([10, 20, 40, 80, 160]);
    expect(recs.slice(0, 5).map((r) => r.phase)).toEqual(Array(5).fill('slow-start'));
    expect(recs.findIndex((r) => r.event !== null)).toBe(4);
    expect(recs[4].overflow).toBe(70);
    expect(recs[3].queue).toBe(20);
    expect(recs[3].rttMs).toBeCloseTo(60 * (1 + 20 / 60), 9);
  });

  it('a duplicate-ACK loss halves to 80, congestion avoidance adds one a round to 91, which overflows again and halves to 45.5', () => {
    expect(recs[5].sent).toBe(80);
    expect(recs[5].phase).toBe('avoidance');
    expect(recs.slice(5, 17).map((r) => r.sent)).toEqual([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);
    expect(recs[16].event).toBe('loss');
    expect(recs[17].sent).toBe(45.5);
  });

  it('a timeout instead restarts the window at 1, in slow start up to the new threshold of 80', () => {
    const t = simulate('reno', { ...DEFAULT_LINK, timeouts: true }, 20);
    expect(t[4].event).toBe('timeout');
    expect(t.slice(5, 12).map((r) => r.sent)).toEqual([1, 2, 4, 8, 16, 32, 64]);
    expect(t[12].sent).toBe(80);
    expect(t[5].ssthresh).toBe(80);
  });

  it('renoNext: halves with a floor of 2, doubles below ssthresh, adds one above', () => {
    expect(renoNext(160, Infinity, 160, 'loss')).toEqual({ cwnd: 80, ssthresh: 80 });
    expect(renoNext(3, Infinity, 3, 'loss')).toEqual({ cwnd: 2, ssthresh: 2 });
    expect(renoNext(3, Infinity, 3, 'timeout')).toEqual({ cwnd: 1, ssthresh: 2 });
    expect(renoNext(10, 100, 10, null)).toEqual({ cwnd: 20, ssthresh: 100 });
    expect(renoNext(80, 100, 80, null)).toEqual({ cwnd: 100, ssthresh: 100 });
    expect(renoNext(100, 100, 100, null)).toEqual({ cwnd: 101, ssthresh: 100 });
  });
});

describe('Reno on 200 seeded links with a buffer and no random loss', () => {
  it('the window never goes beyond one round of growth past BDP + B, and the first loss is the first round the window is above it', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const link = randomLink(rnd);
      const thr = thresholdOf(link);
      const recs = simulate('reno', link, 100);
      let expectedFirst = 0;
      for (let w = INITIAL_WINDOW; w <= thr; w *= 2) expectedFirst++;
      expect(recs.findIndex((r) => r.event !== null), JSON.stringify(link)).toBe(expectedFirst);
      recs.forEach((r, k) => {
        if (k === 0) return;
        const prev = recs[k - 1];
        if (prev.event === null) {
          expect(prev.sent).toBeLessThanOrEqual(thr);
          expect(r.sent).toBeLessThanOrEqual(Math.max(2 * prev.sent, prev.sent + 1));
        }
        expect(r.event !== null).toBe(r.sent > thr);
      });
    }
  });

  it('a window beyond the cap is held at CWND_CAP and flagged as saturated', () => {
    const huge: LinkSetup = { ...DEFAULT_LINK, mbps: 120, rttMs: 240, bufferBdp: 10 };
    const recs = simulate('reno', huge, 40);
    expect(recs.every((r) => r.sent <= CWND_CAP)).toBe(true);
    const sat = recs.filter((r) => r.saturated);
    expect(sat.length).toBeGreaterThan(0);
    expect(sat.every((r) => r.sent === CWND_CAP)).toBe(true);
  });
});

describe('Reno under random loss', () => {
  it('mean window matches sqrt(3 / (2p)) within 15% for p = 1e-3 and 1e-4 over 200,000 rounds, and the Mathis 1.22 / sqrt(p) is within 1% of it', () => {
    for (const p of [1e-3, 1e-4]) {
      for (const seed of [3, 8]) {
        const mean = renoMeanWindow(p, 200_000, seed);
        expect(Math.abs(mean / sawtoothWindow(p) - 1), `p ${p} seed ${seed}`).toBeLessThan(0.15);
      }
      expect(Math.abs(mathisWindow(p) / sawtoothWindow(p) - 1)).toBeLessThan(0.01);
    }
  });

  it('the window falls as loss rises and the same seed gives the same mean', () => {
    const means = [0.0005, 0.001, 0.005, 0.02].map((p) => renoMeanWindow(p, 30_000, 5));
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeLessThan(means[i - 1]);
    expect(renoMeanWindow(0.005, 30_000, 5)).toBe(means[2]);
  });

  it('the simulate() trace under chance loss has the same mean as renoMeanWindow with no buffer limit', () => {
    const link: LinkSetup = { ...DEFAULT_LINK, bufferBdp: 1000, loss: 0.002, seed: 4 };
    const recs = simulate('reno', link, 20_000);
    const mean = recs.reduce((s, r) => s + r.sent, 0) / recs.length;
    expect(mean).toBeCloseTo(renoMeanWindow(0.002, 20_000, 4), 9);
  });
});

describe('CUBIC', () => {
  it('hand vector: for Wmax = 100, K is the cube root of 75, 4.217 s; W(0) = 70 and W(K) = 100', () => {
    expect(cubicK(100)).toBeCloseTo(Math.cbrt(75), 12);
    expect(cubicK(100)).toBeCloseTo(4.217, 3);
    expect(cubicWindow(0, 100)).toBeCloseTo(CUBIC_BETA * 100, 9);
    expect(cubicWindow(cubicK(100), 100)).toBeCloseTo(100, 9);
  });

  it('the curve rises fast, flattens at Wmax, then speeds up again (concave then convex)', () => {
    const w = (t: number) => cubicWindow(t, 100);
    const early = w(1) - w(0);
    const mid = w(cubicK(100) + 0.5) - w(cubicK(100) - 0.5);
    const late = w(cubicK(100) + 4) - w(cubicK(100) + 3);
    expect(mid).toBeLessThan(early);
    expect(mid).toBeLessThan(late);
  });

  it('after a loss the window drops to 0.7 of its peak and never falls again before the next loss', () => {
    const recs = simulate('cubic', { ...DEFAULT_LINK, bufferBdp: 2 }, 100);
    const lossAt = recs.findIndex((r) => r.event !== null);
    expect(recs[lossAt + 1].sent).toBeCloseTo(CUBIC_BETA * recs[lossAt].sent, 9);
    let prev = recs[lossAt + 1];
    for (const r of recs.slice(lossAt + 2)) {
      if (prev.event !== null) {
        prev = r;
        continue;
      }
      expect(r.sent).toBeGreaterThanOrEqual(prev.sent);
      prev = r;
    }
  });
});

describe('BBR', () => {
  it('on a steady link the bandwidth estimate converges to the capacity and the queue stays under 1 BDP after Drain', () => {
    const rnd = mulberry32(21);
    for (let i = 0; i < 200; i++) {
      const link = randomLink(rnd);
      const bdp = bdpOf(link);
      const recs = simulate('bbr', link, 120);
      const probe = recs.findIndex((r) => r.phase === 'probe-bw');
      expect(probe, JSON.stringify(link)).toBeGreaterThan(0);
      expect(recs[recs.length - 1].btlbw).toBeCloseTo(bdp, 9);
      for (const r of recs.slice(probe)) expect(r.queue).toBeLessThan(bdp);
      expect(recs.map((r) => r.phase).filter((p, k, a) => k === 0 || p !== a[k - 1])).toEqual(['startup', 'drain', 'probe-bw']);
    }
  });

  it('the default link: startup 20, 40, 80, ... drain, then the ProbeBW gains 1.25, 0.75 and six rounds of 1', () => {
    const recs = simulate('bbr', DEFAULT_LINK, 40);
    expect(recs.slice(0, 3).map((r) => r.sent)).toEqual([20, 40, 80]);
    const probe = recs.filter((r) => r.phase === 'probe-bw').slice(0, 8);
    expect(probe.map((r) => r.sent / 60)).toEqual([...BBR_PROBE_GAINS]);
    expect(BBR_PROBE_GAINS).toEqual([1.25, 0.75, 1, 1, 1, 1, 1, 1]);
  });

  it('never marks a loss event: it does not react to the segments the buffer drops', () => {
    const recs = simulate('bbr', { ...DEFAULT_LINK, bufferBdp: 0.1 }, 60);
    expect(recs.some((r) => r.overflow > 0)).toBe(true);
    expect(recs.every((r) => r.event === null)).toBe(true);
  });
});

describe('the comparison', () => {
  it('shallow buffer: Reno uses less of the link than BBR; deep buffer: Reno\'s round trip is far above BBR\'s and above the base', () => {
    const run = (a: 'reno' | 'bbr' | 'cubic', b: number) => summarise(simulate(a, { ...DEFAULT_LINK, bufferBdp: b }, 120));
    expect(run('reno', 0.1).meanUtil).toBeLessThan(run('bbr', 0.1).meanUtil);
    expect(run('reno', 0.1).meanUtil).toBeLessThan(0.9);
    expect(run('reno', 2).meanRttMs).toBeGreaterThan(1.5 * run('bbr', 2).meanRttMs);
    expect(run('bbr', 2).meanRttMs).toBeLessThan(1.1 * DEFAULT_LINK.rttMs);
  });

  it('timeouts and the seed are hidden controls for CUBIC and BBR: with no random loss they change nothing', () => {
    for (const a of ['cubic', 'bbr'] as const) {
      const base = simulate(a, DEFAULT_LINK, 100);
      expect(simulate(a, { ...DEFAULT_LINK, timeouts: true }, 100)).toEqual(base);
      expect(simulate(a, { ...DEFAULT_LINK, seed: 99 }, 100)).toEqual(base);
    }
  });

  it('summarise counts loss events and timeouts and averages by hand on a small run', () => {
    const recs: RoundRec[] = [
      { round: 0, sent: 10, ssthresh: Infinity, phase: 'slow-start', queue: 0, rttMs: 60, util: 0.5, event: null, overflow: 0, saturated: false },
      { round: 1, sent: 20, ssthresh: Infinity, phase: 'slow-start', queue: 10, rttMs: 80, util: 1, event: 'loss', overflow: 4, saturated: false },
      { round: 2, sent: 1, ssthresh: 10, phase: 'slow-start', queue: 0, rttMs: 40, util: 0.2, event: 'timeout', overflow: 0, saturated: false },
    ];
    const s = summarise(recs);
    expect(s.meanUtil).toBeCloseTo((0.5 + 1 + 0.2) / 3, 12);
    expect(s.meanRttMs).toBe(60);
    expect([s.lossEvents, s.timeouts, s.maxQueue]).toEqual([2, 1, 10]);
  });
});

describe('fairness (Chiu-Jain), 200 seeded starts', () => {
  const starts: Rates[] = (() => {
    const rnd = mulberry32(31);
    return Array.from({ length: 200 }, () => [20 + Math.floor(rnd() * 40), 20 + Math.floor(rnd() * 40)] as Rates);
  })();
  const stepsOf = (rule: Rule, start: Rates) => {
    const t = trajectory(start, rule);
    return t.slice(1).map((next, i) => ({ before: t[i], after: next }));
  };

  it('AIMD: every decrease multiplies the gap by exactly beta and every increase leaves it unchanged', () => {
    for (const s of starts) {
      for (const { before, after } of stepsOf('aimd', s)) {
        if (overCapacity(before)) expect(gapOf(after)).toBeCloseTo(BETA * gapOf(before), 9);
        else expect(gapOf(after)).toBeCloseTo(gapOf(before), 9);
      }
    }
  });

  it('AIAD keeps the gap constant and MIMD keeps the ratio', () => {
    for (const s of starts) {
      const aiad = trajectory(s, 'aiad');
      expect(gapOf(aiad[aiad.length - 1])).toBeCloseTo(gapOf(s), 9);
      const mimd = trajectory(s, 'mimd');
      const last = mimd[mimd.length - 1];
      expect(last[0] / last[1]).toBeCloseTo(s[0] / s[1], 9);
    }
  });

  it('MIAD widens the gap on every increase by 1.1 and keeps it on every decrease', () => {
    for (const s of starts.slice(0, 50)) {
      for (const { before, after } of stepsOf('miad', s)) {
        if (Math.min(...after) === 0 || Math.min(...before) === 0) continue;
        if (overCapacity(before)) expect(gapOf(after)).toBeCloseTo(gapOf(before), 9);
        else expect(gapOf(after)).toBeCloseTo(MUL_UP * gapOf(before), 9);
      }
    }
  });

  it('only AIMD narrows the gap toward zero while the pair stays near a full link', () => {
    let aimdChecked = 0;
    for (const s of starts) {
      for (const rule of RULES) {
        const read = readTrajectory(trajectory(s, rule));
        if (rule === 'aimd') {
          if (gapOf(s) >= 8) {
            aimdChecked++;
            expect(read.endGap).toBeLessThan(gapOf(s) / 4);
          }
          expect(read.highSum).toBeGreaterThan(CAPACITY * 0.9);
        } else if (gapOf(s) >= 8) {
          expect(read.endGap, `${rule} from ${s}`).toBeGreaterThan(gapOf(s) / 4);
        }
      }
    }
    expect(aimdChecked).toBeGreaterThan(100);
  });

  it('the constants are what the lesson says: add 2, subtract 5, multiply by 1.1, halve', () => {
    expect([ADD, SUB, MUL_UP, BETA]).toEqual([2, 5, 1.1, 0.5]);
    expect(step([10, 20], 'aimd')).toEqual([12, 22]);
    expect(step([60, 60], 'aimd')).toEqual([30, 30]);
    expect(step([60, 60], 'aiad')).toEqual([55, 55]);
    expect(step([3, 98], 'aiad')).toEqual([0, 93]);
  });
});
