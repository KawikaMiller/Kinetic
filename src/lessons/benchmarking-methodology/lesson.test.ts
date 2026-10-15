import { describe, expect, it } from 'vitest';
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { sig } from '../distributions/fmt';
import { generatorFrames, generatorIntro, generatorSummary, msText, noiseCaption, timelineEnd, timelineStart, us, warmupCaption } from './frames';
import lesson from './index';
import {
  DISCARD_RANGE, DISCARD_WINDOW, GENERATORS, GENERATOR_DEFAULT, GENERATOR_NAME, LOOP_OVERHEAD_US, NOISE_DEFAULT, RATE_RANGE, STALL_AT_RANGE, STALL_MS_RANGE, STEADY_WINDOW, WARMUP_DEFAULT,
  WINDOW_MODES, differenceInterval, discardCrossover, exactWindowMean, modelTime, hidesStall, readGenerator, readNoise, readWindow, timelineRange, warmupSeries, windowOf, type GeneratorParams, type Generator,
} from './model';

const text = expectCaption;
const series = warmupSeries(WARMUP_DEFAULT.seed, true);

describe('where the discard cut must fall', () => {
  it('discardCrossover is the first slider cut at which B reads faster, checked by summing the model per iteration', () => {
    const k = discardCrossover();
    expect(k).not.toBeNull();
    const sum = (id: 'A' | 'B', from: number) => Array.from({ length: DISCARD_WINDOW }, (_, i) => modelTime(id, from + i)).reduce((a, b) => a + b, 0);
    expect(sum('B', k!)).toBeLessThanOrEqual(sum('A', k!));
    expect(sum('B', k! - DISCARD_RANGE.step)).toBeGreaterThan(sum('A', k! - DISCARD_RANGE.step));
    expect(k!).toBeGreaterThan(WARMUP_DEFAULT.discard);
  });
});

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default window is the first 100 iterations, where A looks about 7.6× faster', () => {
    expect(WARMUP_DEFAULT).toMatchObject({ mode: 'first100', useResult: true });
    const r = readWindow(series, 'first100', WARMUP_DEFAULT.discard, true);
    expect(r.faster).toBe('A');
    expect(r.ratio).toBeGreaterThan(7);
    expect(r.ratio).toBeLessThan(8.2);
    expect(lesson.tryThis[0]).toContain(`${sig(r.ratio, 3)}× faster than B (A ${us(r.meanA)}, B ${us(r.meanB)})`);
    expect(text(warmupCaption(r, 'first100', true))).toContain(`A looks ${sig(r.ratio, 3)}× faster than B`);
  });

  it('try-this 2: a steady-state window says B is faster, 8 against 10 µs', () => {
    const r = readWindow(series, 'steady', 0, true);
    expect(r.faster).toBe('B');
    expect(exactWindowMean('B', STEADY_WINDOW)).toBeCloseTo(8, 3);
    expect(exactWindowMean('A', STEADY_WINDOW)).toBeCloseTo(10, 3);
    expect(lesson.tryThis[1]).toContain(`${us(exactWindowMean('B', STEADY_WINDOW))} against ${us(exactWindowMean('A', STEADY_WINDOW))}`);
    expect(text(warmupCaption(r, 'steady', true))).toContain('B looks');
  });

  it('try-this 3: with the result unused both read the empty loop and the verdict is gone', () => {
    const unused = warmupSeries(WARMUP_DEFAULT.seed, false);
    const r = readWindow(unused, 'first100', 0, false);
    expect(r.faster).toBeNull();
    const c = text(warmupCaption(r, 'first100', false));
    expect(c).toContain(us(LOOP_OVERHEAD_US));
    expect(c).toContain('the verdict is gone');
  });

  it('try-this 4: 30 runs cannot tell and 200 runs can, at the default seed', () => {
    const few = readNoise(NOISE_DEFAULT, NOISE_DEFAULT.seed);
    expect(few.verdict).toBe('cannot tell');
    expect(lesson.tryThis[3]).toContain('"cannot tell"');
    const many = readNoise({ ...NOISE_DEFAULT, runs: 200 }, NOISE_DEFAULT.seed);
    expect(many.verdict).toBe('distinguishable');
    expect(text(noiseCaption(many, { ...NOISE_DEFAULT, runs: 200 }))).toContain('distinguishable');
    expect(text(noiseCaption(few, NOISE_DEFAULT))).toContain('cannot tell');
  });

  it('try-this 5: the default closed-loop tool reports 1 ms against the 910 ms users saw, and the corrected one 900 ms', () => {
    expect(GENERATOR_DEFAULT).toMatchObject({ generator: 'closed', rate: 100, stallMs: 1000, stallAt: 1 });
    const closed = readGenerator('closed', GENERATOR_DEFAULT);
    const corrected = readGenerator('corrected', GENERATOR_DEFAULT);
    expect([closed.reportedP99, closed.trueP99, corrected.reportedP99]).toEqual([1, 910, 900]);
    expect(lesson.tryThis[4]).toContain('p99 of 1 ms while users saw 910 ms');
    expect(lesson.tryThis[4]).toContain('corrected for 900 ms');
  });
});

describe('captions are computed from the model', () => {
  it('the warm-up caption quotes the window means and the steady-state truth for every mode and discard value', () => {
    for (const mode of WINDOW_MODES) {
      for (const k of [DISCARD_RANGE.min, 1000, DISCARD_RANGE.max]) {
        const r = readWindow(series, mode, k, true);
        const c = text(warmupCaption(r, mode, true));
        expect(c, `${mode} ${k}`).toContain(`A takes ${us(r.meanA)} and B ${us(r.meanB)}`);
        expect(c).toContain(`${r.faster} looks ${sig(r.ratio, 3)}× faster`);
        if (mode === 'discard') expect(c).toContain(`iterations ${windowOf(mode, k)[0].toLocaleString('en-US')} to ${(windowOf(mode, k)[1] - 1).toLocaleString('en-US')}`);
        expect(c).toContain('B is the faster one');
      }
    }
  });

  it('the noise caption names the verdict from the interval and mentions the humps exactly when the runs are bimodal, across all toggles and run counts', () => {
    for (const runs of [5, 30, 200]) {
      for (const otherProcess of [false, true]) {
        for (const frequencyScaling of [false, true]) {
          const s = { runs, otherProcess, frequencyScaling };
          const r = readNoise(s, 1, 200);
          const c = text(noiseCaption(r, s));
          expect(c.includes('cannot tell'), JSON.stringify(s)).toBe(r.verdict === 'cannot tell');
          expect(c.includes('two humps'), JSON.stringify(s)).toBe(r.bimodal);
          expect(c).toContain(`${runs} runs each`);
          expect(c).toContain(`A's median is ${us(r.A.median)}`);
        }
      }
    }
  });

  it('the generator frames: intro, a caption at the stall, the first late request and the reply, and a summary quoting both p99s, for all generators and stall settings', () => {
    for (const kind of GENERATORS) {
      for (const [stallMs, stallAt, rate] of [[1000, 1, 100], [100, 0, 10], [10_000, 9, 500], [0, 1, 100]]) {
        const p: GeneratorParams = { rate, stallMs, stallAt };
        const r = readGenerator(kind, p);
        const frames = generatorFrames(r, p);
        expect(text(frames[0].say)).toBe(text(generatorIntro(kind, p)));
        expect(frames[frames.length - 1].now).toBe(timelineEnd(r));
        const last = text(frames[frames.length - 1].say);
        expect(last).toContain(`reports a p99 of ${msText(r.reportedP99)}`);
        expect(last).toContain(`users saw a p99 of ${msText(r.trueP99)}`);
        const said = frames.filter((f) => f.say !== undefined).map((f) => text(f.say));
        if (r.schedule.stalled === null) {
          expect(frames).toHaveLength(1 + 24 + 1);
          expect(text(generatorIntro(kind, p))).toContain('no stall this time');
        } else {
          const k = r.schedule.stalled;
          expect(said.some((s) => s.includes(`Request ${k} is due at`)), `${kind} ${stallMs}`).toBe(true);
          expect(said.some((s) => s.includes(`Request ${k} replies at`))).toBe(true);
          expect(said.some((s) => (kind === 'open' ? s.includes('sends it on schedule') : s.includes('does not send it')))).toBe(true);
        }
      }
    }
  });

  it('the generator summary says the tool hides the stall exactly when its p99 is under half of what users saw', () => {
    for (const kind of GENERATORS) {
      for (const stallMs of [0, 100, 1000, 10_000]) {
        const r = readGenerator(kind, { rate: 100, stallMs, stallAt: 1 });
        const c = text(generatorSummary(r));
        expect(c).toContain(msText(r.reportedP99));
        expect(hidesStall(r), `${kind} ${stallMs}`).toBe(r.reportedP99 < 0.5 * r.trueP99);
        if (kind === 'corrected' && stallMs > 1) expect(c).toContain('synthetic samples');
      }
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: a short window can name the wrong winner: A wins the first 100 iterations and B wins steady state', () => {
    expect(exactWindowMean('A', [0, 100])).toBeLessThan(exactWindowMean('B', [0, 100]));
    expect(exactWindowMean('B', STEADY_WINDOW)).toBeLessThan(exactWindowMean('A', STEADY_WINDOW));
    expect(exactWindowMean('B', [0, 100]) / exactWindowMean('A', [0, 100])).toBeGreaterThan(7);
  });

  it('Q2: at 100/s with a one second stall the closed-loop p99 is 1 ms and the per-intended-time p99 is 910 ms, not 1,000 or 500', () => {
    const r = readGenerator('closed', { rate: 100, stallMs: 1000, stallAt: 1 });
    expect(r.reportedP99).toBe(1);
    expect(r.trueP99).toBe(910);
    expect(Math.max(...r.recorded)).toBe(1000);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('About 1 ms');
  });

  it('Q3: with another process in 40% of runs, the mean falls where few runs lie and the histogram has two humps (both modes populated)', () => {
    const s = { runs: 200, otherProcess: true, frequencyScaling: false };
    const r = readNoise(s, 1, 200);
    const share = r.runsA.filter((x) => x.disturbed).length / 200;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
    const nearMean = r.runsA.filter((x) => Math.abs(x.us / r.A.mean - 1) < 0.04).length;
    const nearMedian = r.runsA.filter((x) => Math.abs(x.us / r.A.median - 1) < 0.04).length;
    expect(nearMean).toBeLessThan(nearMedian);
  });

  it('Q4: stopping at the first "distinguishable" over eight looks gives a false positive more often than one planned look, when A and B are the same source', () => {
    const lookSizes = [25, 50, 75, 100, 125, 150, 175, 200];
    const trials = 150;
    let single = 0;
    let peeking = 0;
    for (let t = 0; t < trials; t++) {
      const rnd = mulberry32(7000 + t);
      const a = Array.from({ length: 200 }, () => 10 + normal(rnd));
      const b = Array.from({ length: 200 }, () => 10 + normal(rnd));
      const flagged = lookSizes.map((n) => {
        const iv = differenceInterval(a.slice(0, n).sort((x, y) => x - y), b.slice(0, n).sort((x, y) => x - y), 200, rnd);
        return iv.lo > 0 || iv.hi < 0;
      });
      if (flagged[flagged.length - 1]) single++;
      if (flagged.some(Boolean)) peeking++;
    }
    expect(single / trials).toBeLessThan(0.12);
    expect(peeking / trials).toBeGreaterThan(single / trials + 0.05);
  });
});
describe('hidden controls do not feed numbers', () => {
  it('the discard slider is read only in the discard mode: the other windows ignore it', () => {
    for (const k of [0, 700, 3000]) {
      expect(windowOf('first100', k)).toEqual([0, 100]);
      expect(windowOf('steady', k)).toEqual(STEADY_WINDOW);
    }
    expect(windowOf('discard', 700)).not.toEqual(windowOf('discard', 800));
    expect(readWindow(series, 'first100', 0, true)).toEqual(readWindow(series, 'first100', 3000, true));
  });

  it('the warm-up seed is read by the series only; the generator scene has no randomness, so no seed', () => {
    const a = readGenerator('closed', GENERATOR_DEFAULT);
    const b = readGenerator('closed', { ...GENERATOR_DEFAULT, seed: 99 } as GeneratorParams);
    expect(a.recorded).toEqual(b.recorded);
  });

  it('the slider extremes give valid readings: rate 10 and 500, stall 0 and 10 s, stall at 0 and 9 s', () => {
    for (const kind of GENERATORS as readonly Generator[]) {
      for (const rate of [RATE_RANGE.min, RATE_RANGE.max]) {
        for (const stallMs of [STALL_MS_RANGE.min, STALL_MS_RANGE.max]) {
          for (const stallAt of [STALL_AT_RANGE.min, STALL_AT_RANGE.max]) {
            const r = readGenerator(kind, { rate, stallMs, stallAt });
            expect(Number.isFinite(r.reportedP99) && Number.isFinite(r.trueP99), `${GENERATOR_NAME[kind]} ${rate} ${stallMs} ${stallAt}`).toBe(true);
            const [first, last] = timelineRange(r.schedule);
            expect(first).toBeGreaterThanOrEqual(0);
            expect(last).toBeLessThan(r.schedule.intended.length);
            expect(timelineEnd(r)).toBeGreaterThan(0);
            expect(timelineStart(r)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});
