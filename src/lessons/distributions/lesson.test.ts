import { describe, expect, it } from 'vitest';
import { normalCdf } from '../../core/distributions';
import { stdDev } from '../../core/stats';
import { captionText as text } from '../../core/testing/captions';
import { cltCaption, dispersionVerdict, meanPosition, poissonCaption, revealCaption, shapeCaption } from './frames';
import { pctText, ratioText, sig } from './fmt';
import lesson from './index';
import {
  BOUNDS, DEFAULT_SHAPES, FAMILIES, MEAN_DEFAULT, MYSTERY_DEFAULT, POISSON_DEFAULT, SAMPLE_SIZES, SHAPE_DEFAULT, WINDOWS,
  arrivalSummary, cltDist, cltReport, countArrivals, dispersionIndex, distMean, drawSample, momentsOf, mysteryDatasets, replicateMeans,
  shapeView, summaryRows, tailSlope, type Dist, type Family,
} from './model';

const defaultView = () => shapeView(DEFAULT_SHAPES[SHAPE_DEFAULT.family], SHAPE_DEFAULT.seed, SHAPE_DEFAULT.mode);
const poissonRun = (bursty: boolean) => {
  const options = { ...POISSON_DEFAULT, windows: WINDOWS, window: POISSON_DEFAULT.window, bursty };
  return { options, run: countArrivals(options) };
};
const meanReport = (family: Family, n: number, alpha: number, seed = MEAN_DEFAULT.seed) => {
  const d = cltDist(family, alpha);
  return { d, means: replicateMeans(d, n, seed), report: cltReport(d, n, replicateMeans(d, n, seed)) };
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the log-normal as loaded has about two thirds of draws below its mean', () => {
    expect(lesson.tryThis[0]).toContain('two requests in three');
    const v = defaultView();
    expect(v.dist.family).toBe('lognormal');
    expect(v.belowMeanExact).toBeCloseTo(normalCdf((v.dist as Extract<Dist, { family: 'lognormal' }>).sigma / 2), 12);
    expect(Math.abs(v.belowMeanExact - 2 / 3)).toBeLessThan(0.02);
    expect(Math.abs(v.belowMeanSample - 2 / 3)).toBeLessThan(0.03);
    expect(v.mean).toBeGreaterThan(v.median);
  });

  it('try-this 2: the Pareto preset has a mean; dragging α below 1 turns the table\'s mean into "no finite mean"', () => {
    const preset = DEFAULT_SHAPES.pareto;
    expect(summaryRows(shapeView(preset, 1, 'linear')).find((r) => r.key === 'mean')?.exact).not.toBeNull();
    for (const alpha of [0.9, BOUNDS.paretoAlpha.min]) {
      const d: Dist = { ...preset, alpha };
      expect(summaryRows(shapeView(d, 1, 'linear')).find((r) => r.key === 'mean')?.exact).toBeNull();
      expect(text(shapeCaption(shapeView(d, 1, 'linear')))).toContain('no finite mean');
    }
  });

  it('try-this 3: Bursty moves the dispersion index from about 1 to around 7', () => {
    expect(lesson.tryThis[2]).toContain('around 7');
    const plain = dispersionIndex(poissonRun(false).run.counts);
    const bursty = dispersionIndex(poissonRun(true).run.counts);
    expect(Math.abs(plain - 1)).toBeLessThan(0.1);
    expect(bursty).toBeGreaterThan(6);
    expect(bursty).toBeLessThan(8);
  });

  it('try-this 4: n = 1,000 spreads the exponential means about ten times less than n = 10, with the ratio near 1', () => {
    expect(MEAN_DEFAULT.family).toBe('exponential');
    expect(MEAN_DEFAULT.n).toBe(10);
    const at10 = meanReport('exponential', 10, MEAN_DEFAULT.alpha);
    const at1000 = meanReport('exponential', 1000, MEAN_DEFAULT.alpha);
    expect(at10.report.spread / at1000.report.spread).toBeGreaterThan(8.5);
    expect(at10.report.spread / at1000.report.spread).toBeLessThan(11.5);
    expect(Math.abs((at1000.report.ratio ?? 0) - 1)).toBeLessThan(0.1);
    expect(Math.abs((at10.report.ratio ?? 0) - 1)).toBeLessThan(0.1);
  });

  it('try-this 5: Pareto at α = 1.5 and n = 1,000 reports an infinite σ instead of a ratio', () => {
    const { report } = meanReport('pareto', 1000, MEAN_DEFAULT.alpha);
    expect(report.moments).toBe('infinite-variance');
    expect(report.ratio).toBeNull();
    expect(text(cltCaption(report, 'pareto', 1000))).toContain('σ is infinite');
  });
});

describe('captions are computed from the model, at the slider extremes too', () => {
  const corners: Dist[] = [
    { family: 'normal', mu: BOUNDS.normalMu.min, sigma: BOUNDS.normalSigma.max },
    { family: 'normal', mu: BOUNDS.normalMu.max, sigma: BOUNDS.normalSigma.min },
    { family: 'exponential', mean: BOUNDS.expMean.min },
    { family: 'exponential', mean: BOUNDS.expMean.max },
    { family: 'lognormal', mu: BOUNDS.logMu.min, sigma: BOUNDS.logSigma.min },
    { family: 'lognormal', mu: BOUNDS.logMu.max, sigma: BOUNDS.logSigma.max },
    { family: 'pareto', xm: BOUNDS.paretoXm.min, alpha: BOUNDS.paretoAlpha.min },
    { family: 'pareto', xm: BOUNDS.paretoXm.max, alpha: 1.5 },
    { family: 'pareto', xm: BOUNDS.paretoXm.max, alpha: BOUNDS.paretoAlpha.max },
  ];

  it('the shape caption quotes the view\'s own median, p99, share below the mean and position of the mean', () => {
    for (const d of corners) {
      const v = shapeView(d, 7, 'linear');
      const c = text(shapeCaption(v));
      expect(c, JSON.stringify(d)).toContain(`median is ${sig(v.median)}`);
      expect(c).toContain(`p99 ${sig(v.p99)} (${sig(v.p99 / v.median)}× the median)`);
      if (Number.isFinite(distMean(d))) {
        expect(c).toContain(`${pctText(v.belowMeanSample)} of the draws fall below it (exact ${pctText(v.belowMeanExact)})`);
        const where = meanPosition(v.mean, v.median);
        expect(c.includes('about at the median')).toBe(where === 'at');
        expect(c.includes(`, above the median`)).toBe(where === 'above');
        expect(c.includes(`, below the median`)).toBe(where === 'below');
      } else {
        expect(c).toContain('no finite mean');
        expect(c).not.toContain('fall below it');
      }
    }
  });

  it('the normal reads "about at the median", the log-normal and the Pareto read "above"', () => {
    expect(text(shapeCaption(shapeView(DEFAULT_SHAPES.normal, 1, 'linear')))).toContain('about at the median');
    expect(text(shapeCaption(shapeView(DEFAULT_SHAPES.lognormal, 1, 'linear')))).toContain('above the median');
    expect(text(shapeCaption(shapeView(DEFAULT_SHAPES.pareto, 1, 'linear')))).toContain('above the median');
  });

  it('the Poisson caption names the index it computes and the verdict follows that index at every rate, window and mode', () => {
    for (const rate of [1, 4, 10]) {
      for (const window of [0.5, 1, 2]) {
        for (const bursty of [false, true]) {
          const options = { rate, window, windows: WINDOWS, seed: 2, bursty };
          const s = arrivalSummary(options, countArrivals(options).counts);
          const c = text(poissonCaption(s));
          expect(c).toContain(`dispersion index of ${sig(s.dispersion)}`);
          const verdict = dispersionVerdict(s.dispersion);
          expect(c.includes('variance matches the mean')).toBe(verdict === 'poisson');
          expect(c.includes('clumps')).toBe(verdict === 'clumped');
          expect(verdict === 'clumped', `rate ${rate} window ${window} bursty ${bursty}`).toBe(bursty);
        }
      }
    }
  });

  it('the CLT caption states a ratio only when σ is finite, and says "no finite mean" or "infinite" from α alone', () => {
    const cases: [Family, number][] = [
      ['normal', 1.5], ['exponential', 1.5], ['lognormal', 1.5], ['pareto', 0.8], ['pareto', 1], ['pareto', 1.5], ['pareto', 2], ['pareto', 2.5], ['pareto', 4],
    ];
    for (const [family, alpha] of cases) {
      for (const n of SAMPLE_SIZES) {
        const { report } = meanReport(family, n, alpha, 3);
        const c = text(cltCaption(report, family, n));
        const moments = momentsOf(cltDist(family, alpha));
        expect(c.includes('no finite mean'), `${family} ${alpha} n=${n}`).toBe(moments === 'infinite-mean');
        expect(c.includes('σ is infinite'), `${family} ${alpha} n=${n}`).toBe(moments === 'infinite-variance');
        if (moments === 'finite') expect(c).toContain(`is ${ratioText(report.ratio ?? NaN)}.`);
      }
    }
  });

  it('the reveal caption counts right answers from the guesses', () => {
    const sets = mysteryDatasets(MYSTERY_DEFAULT.seed);
    const all = Object.fromEntries(sets.map((s) => [s.label, s.truth]));
    expect(text(revealCaption(sets, all))).toContain('3 of 3');
    expect(text(revealCaption(sets, {}))).toContain('0 of 3');
    expect(text(revealCaption(sets, { A: sets[0].truth }))).toContain('1 of 3');
    expect(text(revealCaption(sets, {}))).toContain('(no guess)');
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: mean 120 ms and median 80 ms put about 67% of a log-normal below the mean', () => {
    const sigma = Math.sqrt(2 * Math.log(120 / 80));
    expect(sigma).toBeCloseTo(0.9, 1);
    expect(normalCdf(sigma / 2)).toBeCloseTo(0.67, 2);
    const xs = drawSample({ family: 'lognormal', mu: Math.log(80), sigma }, 12, 100_000);
    expect(xs.filter((x) => x < 120).length / xs.length).toBeCloseTo(0.67, 2);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toContain('two thirds');
  });

  it('Q2: variance 21 on mean 6 is an index of 3.5, and a bursty stream gives one that high while a plain one gives 1', () => {
    expect(21 / 6).toBe(3.5);
    expect(dispersionVerdict(3.5)).toBe('clumped');
    expect(dispersionVerdict(1)).toBe('poisson');
    expect(dispersionVerdict(0.5)).toBe('below');
  });

  it('Q3: a Pareto with α = 1.5 has a finite mean (3·xm) and infinite variance', () => {
    const d = cltDist('pareto', 1.5);
    expect(distMean(d)).toBe(30);
    expect(momentsOf(d)).toBe('infinite-variance');
    expect(Number.isFinite(stdDev(drawSample(d, 1, 1000)))).toBe(true);
  });

  it('Q4: a Pareto sample\'s log-log survival slope is about −1.6', () => {
    const sorted = drawSample({ family: 'pareto', xm: 10, alpha: 1.6 }, 77, 100_000).sort((a, b) => a - b);
    expect(Math.abs(tailSlope(sorted) + 1.6)).toBeLessThan(0.1);
  });
});

describe('hidden controls do not feed other scenes', () => {
  it('the CLT scene ignores the Pareto α unless the shape is Pareto', () => {
    for (const family of FAMILIES.filter((f) => f !== 'pareto')) {
      const lo = meanReport(family, 10, BOUNDS.paretoAlpha.min).report;
      const hi = meanReport(family, 10, BOUNDS.paretoAlpha.max).report;
      expect(lo).toEqual(hi);
    }
  });
});
