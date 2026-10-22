import { describe, expect, it } from 'vitest';
import { lognormal, lognormalCdf, lognormalPdf, normalCdf } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { choose } from '../../core/stats';
import {
  CONE_PHASES, MAX_TASKS, POINTS_PER_PHASE, QUANTITIES, RUNS, SUM_DEFAULT, TASK_MEDIANS, chanceBy, checkOrder, coneAt, fitLogNormal, independentSd, meanOf, modeOf,
  outcomePoints, outsideCone, parseDays, parseGuess, percentileOf, pert, readGuess, scoreCalibration, simulateTotal, sumFacts, sumSpec, taskRelativeSpread,
  threePointResult, lowScoreChance,
} from './model';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe('the cone', () => {
  it('has the five bands from the spec and coneAt hits them at each phase', () => {
    expect(CONE_PHASES.map((p) => [p.low, p.high])).toEqual([[0.25, 4], [0.5, 2], [0.67, 1.5], [0.8, 1.25], [0.9, 1.1]]);
    CONE_PHASES.forEach((p, i) => expect(coneAt(i)).toEqual({ low: p.low, high: p.high }));
    expect(coneAt(0.5).high).toBeCloseTo(3, 12);
    expect(coneAt(-3)).toEqual({ low: 0.25, high: 4 });
    expect(coneAt(99)).toEqual({ low: 0.9, high: 1.1 });
  });

  it('outcomes: the cone model sits inside by construction; the flat model leaves the share the log-uniform maths predicts', () => {
    expect(outsideCone(outcomePoints('cone'))).toBe(0);
    // A log-uniform draw on [0.25, 4] lands inside a band with probability ln(high / low) / ln(16): the expected count outside is the oracle.
    const inside = CONE_PHASES.reduce((acc, p) => acc + Math.log(p.high / p.low) / Math.log(16), 0) * POINTS_PER_PHASE;
    const total = CONE_PHASES.length * POINTS_PER_PHASE;
    const expectedOutside = total - inside;
    const sd = Math.sqrt(CONE_PHASES.reduce((acc, p) => {
      const q = Math.log(p.high / p.low) / Math.log(16);
      return acc + POINTS_PER_PHASE * q * (1 - q);
    }, 0));
    for (const seed of SEEDS) expect(Math.abs(outsideCone(outcomePoints('flat', seed)) - expectedOutside)).toBeLessThan(4 * sd);
    expect(outsideCone(outcomePoints('flat'))).toBeGreaterThan(0);
  });
});

describe('log-normal closed forms', () => {
  it('the mean is exp(mu + s^2/2) and the mode maximises the density', () => {
    const [m, s] = [5, 0.6];
    const rnd = mulberry32(1);
    const draws = Array.from({ length: 200_000 }, () => lognormal(rnd, Math.log(m), s));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(mean / meanOf(m, s)).toBeCloseTo(1, 1);
    let best = 0;
    let bestX = 0;
    for (let x = 0.05; x < 20; x += 0.001) {
      const y = lognormalPdf(x, Math.log(m), s);
      if (y > best) [best, bestX] = [y, x];
    }
    expect(modeOf(m, s)).toBeCloseTo(bestX, 2);
    const median = draws.sort((a, b) => a - b)[draws.length >> 1];
    expect(median / m).toBeCloseTo(1, 1);
  });
});

describe('the summed-task simulation', () => {
  it('its mean total matches the sum of task means within 3 standard errors on at least 47 of 50 seeds, and 5 on all', () => {
    const medians = TASK_MEDIANS.slice(0, SUM_DEFAULT.n);
    const expected = medians.reduce((acc, m) => acc + meanOf(m, SUM_DEFAULT.sigma), 0);
    let within3 = 0;
    for (const seed of SEEDS) {
      const run = simulateTotal(sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, 0, seed));
      const z = Math.abs(run.mean - expected) / (run.sd / Math.sqrt(RUNS));
      expect(z).toBeLessThan(5);
      if (z < 3) within3++;
    }
    expect(within3).toBeGreaterThanOrEqual(47);
  });

  it('the spread of independent totals falls as 1/sqrt(n): relative spread times sqrt(n) is one task\'s relative spread', () => {
    const sigma = SUM_DEFAULT.sigma;
    for (const n of [2, 4, 8, 12]) {
      const run = simulateTotal({ medians: new Array<number>(n).fill(5), sigma, rho: 0, seed: 5 });
      expect(Math.abs((run.sd / run.mean) * Math.sqrt(n) / taskRelativeSpread(sigma) - 1)).toBeLessThan(0.05);
    }
  });

  it('the independent closed form for the total sd matches the simulation within 3% for the default tasks', () => {
    const spec = sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, 0, SUM_DEFAULT.seed);
    expect(Math.abs(simulateTotal(spec).sd / independentSd(spec.medians, spec.sigma) - 1)).toBeLessThan(0.03);
  });

  it('P(total <= sum of medians) is 0.5 within 3 SE for one task, below 0.5 for 2 to 12 tasks, and lower at 8 than at 2', () => {
    const at = (n: number) => {
      const spec = sumSpec(n, SUM_DEFAULT.sigma, 0, SUM_DEFAULT.seed);
      return chanceBy(simulateTotal(spec), sumFacts(spec, simulateTotal(spec)).sumMedians);
    };
    expect(Math.abs(at(1) - 0.5)).toBeLessThan(3 * Math.sqrt(0.25 / RUNS));
    for (let n = 2; n <= MAX_TASKS; n++) expect(at(n), `n = ${n}`).toBeLessThan(0.5);
    expect(at(8)).toBeLessThan(at(2));
  });

  it('with rho = 0.8 the spread exceeds the independent case, while each task keeps its marginal mean', () => {
    const base = sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, 0, 3);
    const indep = simulateTotal(base);
    const corr = simulateTotal({ ...base, rho: 0.8 });
    expect(corr.sd).toBeGreaterThan(1.5 * indep.sd);
    expect(Math.abs(corr.mean / indep.mean - 1)).toBeLessThan(0.05);
  });

  it('the closed-form sum of medians is exact and a 1-task total has the task\'s own median', () => {
    expect(sumFacts(sumSpec(3, 0.6, 0, 1), simulateTotal(sumSpec(3, 0.6, 0, 1))).sumMedians).toBe(3 + 5 + 2);
    const one = simulateTotal(sumSpec(1, 0.6, 0, 9));
    expect(Math.abs(percentileOf(one, 0.5) / 3 - 1)).toBeLessThan(0.03);
  });

  it('chanceBy equals a direct count and is monotone', () => {
    const run = simulateTotal(sumSpec(5, 0.6, 0, 4));
    for (const days of [0, 10, 18, 30, 1000]) expect(chanceBy(run, days)).toBe(run.sorted.filter((t) => t <= days).length / RUNS);
    expect(chanceBy(run, 20)).toBeLessThanOrEqual(chanceBy(run, 25));
  });

  it('the deadline slider opens on the sum of the first eight medians', () => {
    expect(SUM_DEFAULT.deadline).toBe(3 + 5 + 2 + 8 + 4 + 6 + 3 + 5);
  });
});

describe('three-point estimates', () => {
  it('PERT matches the hand-worked 3, 5, 13 case', () => {
    const p = pert({ optimistic: 3, likely: 5, pessimistic: 13 });
    expect(p.mean).toBe(6);
    expect(p.sd).toBeCloseTo(10 / 6, 12);
  });

  it('the fit puts the optimistic value at the 5th percentile and the pessimistic at the 95th', () => {
    const t = { optimistic: 3, likely: 5, pessimistic: 13 };
    const { mu, sigma } = fitLogNormal(t);
    expect(lognormalCdf(3, mu, sigma)).toBeCloseTo(0.05, 6);
    expect(lognormalCdf(13, mu, sigma)).toBeCloseTo(0.95, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
  });

  it('fitting the empirical 5th and 95th percentiles of seeded log-normal data recovers mu and sigma', () => {
    const [mu0, s0] = [1.7, 0.5];
    const rnd = mulberry32(21);
    const xs = Array.from({ length: 50_000 }, () => lognormal(rnd, mu0, s0)).sort((a, b) => a - b);
    const fit = fitLogNormal({ optimistic: xs[Math.floor(0.05 * xs.length)], likely: 1, pessimistic: xs[Math.floor(0.95 * xs.length)] });
    expect(Math.abs(fit.mu - mu0)).toBeLessThan(0.02);
    expect(Math.abs(fit.sigma / s0 - 1)).toBeLessThan(0.03);
  });

  it('the seeded draws agree with the closed-form mean and 80th percentile', () => {
    const r = threePointResult({ optimistic: 3, likely: 5, pessimistic: 13 });
    expect(Math.abs(r.drawMean / r.fit.mean - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.drawP80 / r.fit.p80 - 1)).toBeLessThan(0.02);
    expect(r.draws).toHaveLength(RUNS);
  });

  it('refuses out-of-order values and names the one that is wrong, and refuses an empty range', () => {
    expect(checkOrder({ optimistic: 3, likely: 5, pessimistic: 13 })).toBeNull();
    expect(checkOrder({ optimistic: 6, likely: 5, pessimistic: 13 })).toContain('Optimistic (6) is larger than most likely (5)');
    expect(checkOrder({ optimistic: 3, likely: 5, pessimistic: 2 })).toContain('Most likely (5) is larger than pessimistic (2)');
    expect(checkOrder({ optimistic: 4, likely: 4, pessimistic: 4 })).toContain('no range to fit');
  });

  it('parses days as whole numbers from 1 to 60 and refuses everything else', () => {
    expect(parseDays('7', 'likely')).toEqual({ ok: true, value: 7 });
    for (const bad of ['', '0', '61', '2.5', '1e1', 'abc', '-3']) expect(parseDays(bad, 'optimistic').ok, bad).toBe(false);
  });
});

describe('calibration', () => {
  it('each quantity equals its plain JavaScript expression', () => {
    const byId = Object.fromEntries(QUANTITIES.map((q) => [q.id, q.value]));
    expect(byId.mib).toBe(1_048_576);
    expect(byId['day-ms']).toBe(86_400_000);
    expect(byId.hands).toBe(Number(choose(52, 5)));
    expect(byId.hands).toBe(2_598_960);
    expect(byId.u32).toBe(4_294_967_296);
    expect(byId.leap).toBe(31_622_400);
    expect(byId.orderings).toBe(40_320);
    expect(byId.primes).toBe(Array.from({ length: 999 }, (_, i) => i + 2).filter((n) => Array.from({ length: n - 2 }, (_, d) => d + 2).every((d) => n % d !== 0)).length);
    expect(byId.weeks).toBe(20_871);
    expect(QUANTITIES).toHaveLength(8);
  });

  it('a row is a hit exactly when low <= truth <= high, refused when half typed or reversed, blank when empty', () => {
    for (const [low, high] of [[1, 5], [5, 5], [6, 9], [0, 4], [3, 100]]) {
      const row = readGuess({ low: String(low), high: String(high) }, 5);
      expect(row).toMatchObject({ kind: 'answered', hit: low <= 5 && 5 <= high });
    }
    expect(readGuess({ low: '', high: '' }, 5)).toEqual({ kind: 'blank' });
    expect(readGuess({ low: '4', high: '' }, 5).kind).toBe('refused');
    expect(readGuess({ low: '9', high: '4' }, 5)).toMatchObject({ kind: 'refused', reason: expect.stringContaining('Low (9) is above high (4)') });
    expect(readGuess({ low: '1,000', high: '2,000' }, 1500)).toMatchObject({ hit: true });
    expect(parseGuess('1e3').ok).toBe(false);
  });

  it('the score counts answered rows and hits, and ignores blank rows', () => {
    const rows = [readGuess({ low: '1', high: '9' }, 5), readGuess({ low: '6', high: '9' }, 5), readGuess({ low: '', high: '' }, 5), readGuess({ low: 'x', high: '1' }, 5)];
    const s = scoreCalibration(rows);
    expect([s.answered, s.hits, s.refused]).toEqual([2, 1, 1]);
    expect(s.expected).toBeCloseTo(1.8, 12);
  });

describe('the chance of a low calibration score', () => {
  it('4 or fewer of 8 at p = 0.9 is 0.00502 (hand sum of the binomial terms), about 1 in 199', () => {
    // 8C0 .1^8 + 8C1 .9 .1^7 + 8C2 .9^2 .1^6 + 8C3 .9^3 .1^5 + 8C4 .9^4 .1^4, with the binomial coefficients 1, 8, 28, 56, 70
    const hand = 1e-8 + 8 * 0.9 * 1e-7 + 28 * 0.81 * 1e-6 + 56 * 0.729 * 1e-5 + 70 * 0.6561 * 1e-4;
    expect(lowScoreChance(8, 4, 0.9)).toBeCloseTo(hand, 12);
    expect(lowScoreChance(8, 4, 0.9)).toBeCloseTo(0.00502, 5);
    expect(lowScoreChance(8, 8, 0.9)).toBeCloseTo(1, 12);
  });
});
});
