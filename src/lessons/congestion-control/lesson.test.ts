import { describe, expect, it } from 'vitest';
import { pct } from '../../core/format';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ALGO_LABEL, algoSummaryLine, compareIntro, fairnessIntro, lossIntro, renoFrames, seg, type AlgoRun } from './captions';
import { RULES, readTrajectory, trajectory, type Rates } from './fairness';
import {
  COMPARE_ROUNDS, DEFAULT_LOSS, DEFAULT_START, LOSS_CURVE_POINTS, LOSS_ROUNDS, RENO_ROUNDS, initialCompare, initialFairness, initialLoss, initialReno, snapStart,
} from './init';
import lesson from './index';
import { DEFAULT_LINK, RANGES, bdpOf, mathisWindow, renoMeanWindow, simulate, summarise, thresholdOf, type Algo, type LinkSetup } from './model';

const clean = (node: unknown) => {
  const t = text(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const sliderValues = (r: { min: number; max: number; step: number }) => {
  const out: number[] = [];
  for (let v = r.min; v <= r.max + 1e-9; v += r.step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};
const extremes = (r: { min: number; max: number }) => [r.min, r.max];
const runs = (link: LinkSetup): AlgoRun[] =>
  (['reno', 'cubic', 'bbr'] as Algo[]).map((algo) => {
    const recs = simulate(algo, link, COMPARE_ROUNDS);
    return { algo, recs, summary: summarise(recs), dropped: recs.reduce((s, r) => s + r.overflow, 0) };
  });

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: Reno doubles 10, 20, 40, 80, 160, loses 70 at round 4 and halves to 80, then halves to 45.5 at round 16', () => {
    const link = initialReno();
    expect([link.mbps, link.rttMs, link.bufferBdp, link.loss, link.timeouts]).toEqual([12, 60, 0.5, 0, false]);
    const recs = simulate('reno', link, RENO_ROUNDS);
    expect(recs.slice(0, 5).map((r) => r.sent)).toEqual([10, 20, 40, 80, 160]);
    expect(recs[4].overflow).toBe(70);
    expect(recs[5].sent).toBe(80);
    expect(recs[17].sent).toBe(45.5);
    const t = lesson.tryThis[0];
    expect(t).toContain('BDP 60 and 30 segments of buffer');
    expect(t).toContain('doubles 10, 20, 40, 80, 160');
    expect(t).toContain('at round 4 it is above 90, 70 segments are lost and it halves to 80');
    expect(t).toContain('until round 16 and halves to 45.5');
  });

  it('try-this 2: a timeout drops the window to 1 after the first loss, and the link use falls', () => {
    const base = simulate('reno', initialReno(), RENO_ROUNDS);
    const to = simulate('reno', { ...initialReno(), timeouts: true }, RENO_ROUNDS);
    expect(to[5].sent).toBe(1);
    expect(summarise(to).meanUtil).toBeLessThan(summarise(base).meanUtil);
    const t = lesson.tryThis[1];
    expect(t).toContain('drops the window to 1 instead of 80');
    expect(t).toContain(`${pct(summarise(to).meanUtil)} of the link is used on average against ${pct(summarise(base).meanUtil)}`);
    expect(t).toContain('"timeout (whole window lost)"');
  });

  it('try-this 3: at 0.1 BDP Reno uses less of the link than BBR; at 2.0 BDP Reno\'s round trip is far above BBR\'s', () => {
    const at = (a: Algo, b: number) => summarise(simulate(a, { ...initialCompare(), bufferBdp: b }, COMPARE_ROUNDS));
    expect(at('reno', 0.1).meanUtil).toBeLessThan(at('bbr', 0.1).meanUtil);
    expect(at('reno', 2).meanRttMs).toBeGreaterThan(at('bbr', 2).meanRttMs);
    const t = lesson.tryThis[2];
    expect(t).toContain(`Reno uses ${pct(at('reno', 0.1).meanUtil)} of the link and BBR ${pct(at('bbr', 0.1).meanUtil)}`);
    expect(t).toContain(`Reno's round trip averages ${Math.round(at('reno', 2).meanRttMs)} ms and BBR's ${Math.round(at('bbr', 2).meanRttMs)} ms, from a 60 ms base`);
  });

  it('try-this 4: from (20, 60) AIMD narrows the gap from 40 to a fraction, AIAD keeps 40, MIAD widens it', () => {
    const s = initialFairness();
    expect(s).toEqual({ start: DEFAULT_START, rule: 'aimd' });
    const r = (rule: 'aimd' | 'aiad' | 'miad') => readTrajectory(trajectory(DEFAULT_START, rule));
    expect(r('aimd').endGap).toBeLessThan(1);
    expect(r('aiad').endGap).toBeCloseTo(40, 9);
    expect(r('miad').endGap).toBeGreaterThan(80);
    const t = lesson.tryThis[3];
    expect(t).toContain(`from ${seg(40)} to ${seg(r('aimd').endGap)}`);
    expect(t).toContain(`the gap stays ${seg(r('aiad').endGap)}`);
    expect(t).toContain(`it widens to ${seg(r('miad').endGap)}`);
  });

  it('try-this 5: at 1.00% loss Reno\'s mean window is about 12.7 against 12.2 from Mathis, and the link is mostly empty', () => {
    const link = initialLoss();
    expect(link.loss).toBe(DEFAULT_LOSS);
    const sim = renoMeanWindow(link.loss, LOSS_ROUNDS, link.seed, thresholdOf(link));
    const free = renoMeanWindow(0, LOSS_ROUNDS, link.seed, thresholdOf(link));
    expect(sim).toBeGreaterThan(11);
    expect(sim).toBeLessThan(14.5);
    expect(sim / bdpOf(link)).toBeLessThan(0.3);
    expect(free / bdpOf(link)).toBeGreaterThan(0.9);
    const t = lesson.tryThis[4];
    expect(t).toContain(`mean window is ${seg(sim)} segments, the Mathis relation says ${seg(mathisWindow(0.01))}`);
    expect(t).toContain(`${pct(Math.min(1, sim / 60))} used, against ${pct(Math.min(1, free / 60))} with no random loss`);
  });
});

describe('scene 1: the whole control cross product at the slider extremes', () => {
  it('builds clean frames that end on the last round, whatever the bandwidth, round trip, buffer, loss and loss reaction', () => {
    for (const mbps of extremes(RANGES.mbps)) {
      for (const rttMs of extremes(RANGES.rttMs)) {
        for (const bufferBdp of extremes(RANGES.bufferBdp)) {
          for (const loss of extremes(RANGES.loss)) {
            for (const timeouts of [false, true]) {
              const link = { ...DEFAULT_LINK, mbps, rttMs, bufferBdp, loss, timeouts };
              const recs = simulate('reno', link, RENO_ROUNDS);
              const frames = renoFrames(recs, link);
              frames.forEach((f) => clean(f.say ?? ''));
              expect(frames[frames.length - 1].now).toBe(RENO_ROUNDS - 1);
              const events = recs.filter((r) => r.event !== null);
              const milestones = frames.filter((f) => f.say !== undefined).map((f) => clean(f.say));
              expect(milestones.length).toBe(2 + Math.min(4, events.length));
              if (events[0]) expect(milestones.some((m) => m.startsWith(`Round ${events[0].round}:`))).toBe(true);
            }
          }
        }
      }
    }
  });

  it('a loss caption says overflow only when the buffer overflowed, chance only when it did not, and the timeout caption says restart at 1', () => {
    const link = { ...DEFAULT_LINK, loss: 0.02, seed: 2 };
    const recs = simulate('reno', link, RENO_ROUNDS);
    const frames = renoFrames(recs, link);
    const byRound = new Map(frames.filter((f) => f.say !== undefined).map((f) => [f.now, clean(f.say)]));
    for (const r of recs.filter((x) => x.event !== null).slice(0, 4)) {
      const t = byRound.get(r.round) as string;
      expect(t.includes('buffer overflows')).toBe(r.overflow > 0);
      expect(t.includes('lost by chance')).toBe(r.overflow === 0);
    }
    const to = renoFrames(simulate('reno', { ...DEFAULT_LINK, timeouts: true }, RENO_ROUNDS), { ...DEFAULT_LINK, timeouts: true });
    expect(to.some((f) => f.say !== undefined && clean(f.say).includes('restarts at 1'))).toBe(true);
  });
});

describe('scene 2: the comparison', () => {
  it('the caption reads its numbers from the same runs as the stats, at every buffer size, loss and bandwidth extreme', () => {
    for (const bufferBdp of sliderValues(RANGES.bufferBdp)) {
      for (const loss of extremes(RANGES.loss)) {
        for (const mbps of extremes(RANGES.mbps)) {
          const link = { ...initialCompare(), bufferBdp, loss, mbps };
          const rs = runs(link);
          const t = clean(compareIntro(link, rs));
          for (const r of rs) {
            expect(t).toContain(`${ALGO_LABEL[r.algo]} ${Math.round(r.summary.meanRttMs)} ms`);
            clean(algoSummaryLine(r));
          }
        }
      }
    }
  });
});

describe('scene 3: fairness', () => {
  it('every rule from every start and from the corners of the plane has a clean caption', () => {
    const starts: Rates[] = [DEFAULT_START, [1, 1], [120, 120], [1, 120], [60, 60], [10, 80]];
    for (const rule of RULES) for (const s of starts) clean(fairnessIntro(rule, readTrajectory(trajectory(s, rule))));
  });

  it('a dragged start is rounded to whole numbers and kept on the plane', () => {
    expect(snapStart([20.4, 59.6])).toEqual([20, 60]);
    expect(snapStart([-5, 999])).toEqual([1, 120]);
  });

  it('the AIMD caption says the flows converge and the MIAD caption says the gap widens', () => {
    expect(clean(fairnessIntro('aimd', readTrajectory(trajectory(DEFAULT_START, 'aimd'))))).toContain('converge on equal shares');
    expect(clean(fairnessIntro('miad', readTrajectory(trajectory(DEFAULT_START, 'miad'))))).toContain('gap widens');
    expect(clean(fairnessIntro('aiad', readTrajectory(trajectory(DEFAULT_START, 'aiad'))))).toContain('do not move toward equal shares');
  });
});

describe('scene 4: random loss', () => {
  it('every slider loss value has a clean caption, and 0 says the window is limited by the pipe', () => {
    for (const loss of sliderValues(RANGES.loss)) {
      const link = { ...initialLoss(), loss };
      const sim = renoMeanWindow(loss, 5000, link.seed, thresholdOf(link));
      const t = clean(lossIntro(link, sim, loss > 0 ? mathisWindow(loss) : null));
      expect(t.includes('limited by the pipe')).toBe(loss === 0);
    }
  });

  it('the curve points are increasing loss rates from 0.01% to 2%', () => {
    expect(LOSS_CURVE_POINTS[0]).toBeCloseTo(1e-4, 12);
    expect(LOSS_CURVE_POINTS[LOSS_CURVE_POINTS.length - 1]).toBeCloseTo(0.02, 12);
    for (let i = 1; i < LOSS_CURVE_POINTS.length; i++) expect(LOSS_CURVE_POINTS[i]).toBeGreaterThan(LOSS_CURVE_POINTS[i - 1]);
  });

  it('opening states differ where they should: only the loss scene opens with random loss, and none opens with timeouts but scene 1 can set it', () => {
    expect(initialReno().loss).toBe(0);
    expect(initialCompare().loss).toBe(0);
    expect(initialLoss().loss).toBe(0.01);
    expect(initialCompare().timeouts).toBe(false);
    expect(initialLoss().timeouts).toBe(false);
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
