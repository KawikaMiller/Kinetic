import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { mean } from '../../core/sim';
import { coverageCaption, coverageVerdict, fleetCaption, intervalCaption, pLabel, ruleCaption } from './frames';
import lesson from './index';
import { FLEET_DEFAULT, INTERVAL_DEFAULT, RULES, RULE_DEFAULT, SAMPLE_N, SHOWN_INTERVALS, countAbove, coverageRun, drawSampleOf, experimentsFor, expectedAbove, fleetReport, intervalFor, presetHosts, presetValues, ruleValue, scene1Data, seededHosts, sortedAscending, sampleSeed, truth, type Rule } from './model';
import { mulberry32 } from '../../core/random';
import { pctText, sig } from '../../core/format';
import { nearestRank } from '../../core/stats';

const defaultN = Math.round(10 ** INTERVAL_DEFAULT.exponent);
const view = (sorted: number[], pct: number, rule: Rule) => ({ sorted, pct, rule });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: on 1…20 at p99 two rules say 20 and linear says 19.81', () => {
    expect(RULE_DEFAULT.pct).toBe(99);
    const twenty = scene1Data('twenty', RULE_DEFAULT.seed, RULE_DEFAULT.n);
    expect(twenty).toEqual(presetValues(20));
    expect(RULES.map((r) => ruleValue(r, twenty, RULE_DEFAULT.pct))).toEqual([20, 20, expect.closeTo(19.81, 10)]);
    expect(text(ruleCaption(view(twenty, RULE_DEFAULT.pct, RULE_DEFAULT.rule)))).toContain('19.81 (linear interpolation)');
  });

  it('try-this 2: on 1…100 at p50 nearest-rank says 50, the floor rule 51, linear 50.5', () => {
    const hundred = scene1Data('hundred', RULE_DEFAULT.seed, RULE_DEFAULT.n);
    expect(RULES.map((r) => ruleValue(r, hundred, 50))).toEqual([50, 51, 50.5]);
  });

  it('try-this 3: the loaded fleet is "Understates" (55 ms vs 100 ms over 200 requests) and "Overstates" is 505 vs 20', () => {
    expect(FLEET_DEFAULT.mode).toBe('understates');
    const under = fleetReport(presetHosts('understates'));
    expect([under.average, under.merged, under.total]).toEqual([55, 100, 200]);
    const over = fleetReport(presetHosts('overstates'));
    expect([over.average, over.merged]).toEqual([505, 20]);
    expect(text(fleetCaption(under))).toContain('The average understates the fleet p99 by 45 ms (45%).');
    expect(text(fleetCaption(over))).toContain('overstates');
  });

  it('try-this 4: at the default (normal source, mean, n = 100) the run is 1,000 experiments and about 95% contain the mean', () => {
    expect(INTERVAL_DEFAULT.source).toBe('normal');
    expect(INTERVAL_DEFAULT.stat).toBe('mean');
    expect(defaultN).toBe(100);
    expect(experimentsFor(defaultN)).toBe(1000);
    const run = coverageRun(INTERVAL_DEFAULT.source, INTERVAL_DEFAULT.stat, defaultN, INTERVAL_DEFAULT.seed);
    expect(run.experiments).toBe(1000);
    expect(Math.abs(run.coverage - 0.95)).toBeLessThan(3 * Math.sqrt((0.95 * 0.05) / 1000));
    expect(coverageVerdict(run.coverage, run.experiments)).toBe('near');
  });

  it('try-this 5: heavy-tailed source at n = 10 (the slider\'s left end) covers well under 95%', () => {
    expect(Math.round(10 ** Math.log10(SAMPLE_N.min))).toBe(10);
    const run = coverageRun('heavy', 'mean', SAMPLE_N.min, INTERVAL_DEFAULT.seed);
    expect(run.experiments).toBe(1000);
    expect(run.coverage).toBeLessThan(0.9);
    expect(coverageVerdict(run.coverage, run.experiments)).toBe('short');
    expect(text(coverageCaption(run, 'mean', SAMPLE_N.min))).toContain('short of the 95%');
  });
});

describe('captions are computed from the model', () => {
  it('the rule caption quotes its value, its detail, the count above and whether the other rules agree, for every rule and p', () => {
    const data = [presetValues(20), presetValues(100), scene1Data('stream', 3, 100), scene1Data('stream', 4, 5000)];
    for (const sorted of data) {
      for (const pct of [50, 90, 99, 99.9, 99.99]) {
        for (const rule of RULES) {
          const c = text(ruleCaption(view(sorted, pct, rule)));
          const v = ruleValue(rule, sorted, pct)!;
          expect(c).toContain(`${pLabel(pct)} of ${sorted.length.toLocaleString('en-US')} samples by ${rule === 'floor' ? 'floor(n·p) index' : rule === 'nearest' ? 'nearest-rank' : 'linear interpolation'} is ${sig(v, 5)}`);
          expect(c).toContain(`${countAbove(sorted, v)} of ${sorted.length.toLocaleString('en-US')} samples lie above it`);
          const same = RULES.every((r) => ruleValue(r, sorted, pct) === v);
          expect(c.includes('same value here')).toBe(same);
        }
      }
    }
    expect(text(ruleCaption(view([], 99, 'nearest')))).toContain('No samples yet');
  });

  it('the fleet caption says understates, overstates or matches from the sign and size of the gap, on 100 seeded fleets', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const shares = Array.from({ length: 2 + (seed % 5) }, (_, i) => 5 + ((seed * (i + 2)) % 45));
      const r = fleetReport(seededHosts(shares, seed));
      const c = text(fleetCaption(r));
      expect(c).toContain(`the true p99 of all ${r.total.toLocaleString('en-US')} requests is ${sig(r.merged!)} ms`);
      const word = Math.abs(r.gapPct!) <= 0.01 ? 'lands within 1%' : r.gap! < 0 ? 'understates' : 'overstates';
      expect(c).toContain(word);
      if (word !== 'lands within 1%') expect(c).toContain(`by ${sig(Math.abs(r.gap!))} ms (${pctText(Math.abs(r.gapPct!), 0)})`);
    }
    expect(text(fleetCaption(fleetReport(seededHosts([0, 0], 1))))).toContain('No host has any traffic');
  });

  it('the interval caption says contains or misses from the interval and the true value, at n = 10, 100 and 10,000 for both statistics and sources', () => {
    for (const source of ['normal', 'heavy'] as const) {
      for (const stat of ['mean', 'p99'] as const) {
        for (const n of [10, 100, 10_000]) {
          for (let index = 0; index < 3; index++) {
            const sample = drawSampleOf(source, 1, index, n);
            const interval = intervalFor(stat, sample, 300, mulberry32(sampleSeed(1, index) + 1));
            const exact = truth(source, stat);
            const c = text(intervalCaption({ stat, n, interval, truth: exact, expectedAbove: expectedAbove(n, 99) }));
            const covers = interval!.lo <= exact && exact <= interval!.hi;
            expect(c, `${source} ${stat} n=${n}`).toContain(`this interval ${covers ? 'contains' : 'misses'} it`);
            expect(c).toContain(`${sig(interval!.lo)} to ${sig(interval!.hi)}`);
            expect(c.includes('samples sit above p99')).toBe(stat === 'p99');
          }
        }
      }
    }
    expect(text(intervalCaption({ stat: 'mean', n: 1, interval: null, truth: 100, expectedAbove: 0.01 }))).toContain('undefined');
  });

  it('the coverage caption quotes the computed share and its verdict at n = 10, 100 and 10,000', () => {
    for (const n of [10, 100, 10_000]) {
      const run = coverageRun('normal', 'mean', n, 1);
      const c = text(coverageCaption(run, 'mean', n));
      expect(c).toContain(`Of ${run.experiments.toLocaleString('en-US')} experiments at n = ${n.toLocaleString('en-US')}, ${run.covered.toLocaleString('en-US')} intervals contained`);
      expect(c).toContain(pctText(run.coverage));
      expect(c.includes('about the 95%')).toBe(coverageVerdict(run.coverage, run.experiments) === 'near');
    }
  });

  it('the verdict thresholds are three standard errors around 95%', () => {
    expect(coverageVerdict(0.95, 1000)).toBe('near');
    expect(coverageVerdict(0.92, 1000)).toBe('short');
    expect(coverageVerdict(0.98, 1000)).toBe('over');
    expect(coverageVerdict(0.93, 200)).toBe('near');
    expect(coverageVerdict(0.935, 1000), 'the calibrated n = 10 mean interval, default seed').toBe('near');
  });

  it('a calibrated interval is almost never called short: normal source, mean, n = 10 over 20 seeds', () => {
    const verdicts = Array.from({ length: 20 }, (_, i) => {
      const run = coverageRun('normal', 'mean', 10, i + 1);
      return coverageVerdict(run.coverage, run.experiments);
    });
    expect(verdicts.filter((v) => v === 'short').length).toBeLessThanOrEqual(1);
    const first = coverageRun('normal', 'mean', 10, INTERVAL_DEFAULT.seed);
    expect(text(coverageCaption(first, 'mean', 10))).not.toContain('short of the 95%');
  });

  it('the p99 bootstrap cannot reach past the sample maximum, and the caption says why when p99 coverage falls short', () => {
    for (let i = 0; i < 50; i++) {
      const sample = drawSampleOf('normal', 1, i, 100);
      const interval = intervalFor('p99', sample, 200, mulberry32(i + 1))!;
      expect(interval.hi, 'a resample cannot contain a value the sample lacks').toBeLessThanOrEqual(Math.max(...sample));
    }
    const small = coverageRun('normal', 'p99', 10, INTERVAL_DEFAULT.seed);
    expect(coverageVerdict(small.coverage, small.experiments)).toBe('short');
    expect(small.coverage).toBeLessThan(0.3);
    expect(text(coverageCaption(small, 'p99', 10))).toContain('cannot see beyond the largest value in the sample');
    const mean = coverageRun('normal', 'mean', 10, INTERVAL_DEFAULT.seed);
    expect(text(coverageCaption(mean, 'mean', 10))).not.toContain('cannot see beyond');
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: the merged p99 is 100 ms, the host average 55 ms and the plain mean 14.5 ms, so only the first option is the p99', () => {
    const hosts = presetHosts('understates');
    const all = hosts.flatMap((h) => h.values);
    expect(nearestRank(sortedAscending(all), 99)).toBe(100);
    expect(mean(hosts.map((h) => nearestRank(sortedAscending(h.values), 99)!))).toBe(55);
    expect(mean(all)).toBe(14.5);
    expect(all.filter((v) => v === 10).length / all.length).toBe(0.95);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toContain('100 ms');
  });

  it('Q2: 200 × 0.01 = 2 samples sit above the nearest-rank p99, on every seeded sample', () => {
    expect(expectedAbove(200, 99)).toBe(2);
    for (let seed = 1; seed <= 50; seed++) {
      const sorted = scene1Data('stream', seed, 100).concat(scene1Data('stream', seed + 100, 100)).sort((a, b) => a - b);
      expect(countAbove(sorted, nearestRank(sorted, 99)!)).toBe(2);
    }
  });

  it('Q3: heavy-tailed n = 10 intervals fall short of 95% and a normal source does not', () => {
    expect(coverageRun('heavy', 'mean', 10, 2).coverage).toBeLessThan(0.95);
    expect(Math.abs(coverageRun('normal', 'mean', 10, 2).coverage - 0.95)).toBeLessThan(0.03);
  });

  it('Q4: nearest-rank p99 of 1…20 is 20 and linear is 19.81', () => {
    const twenty = presetValues(20);
    expect(nearestRank(twenty, 99)).toBe(20);
    expect(ruleValue('linear', twenty, 99)).toBeCloseTo(19.81, 10);
    expect(RULES.map((r) => ruleValue(r, twenty, 99)).includes(19)).toBe(false);
  });
});

describe('hidden controls do not feed other numbers', () => {
  it('the hand-made 1…100 and 1…20 data ignore the seed and the sample size', () => {
    expect(scene1Data('hundred', 1, 20)).toEqual(scene1Data('hundred', 999, 5000));
    expect(scene1Data('twenty', 1, 20)).toEqual(scene1Data('twenty', 999, 5000));
  });

  it('growing n keeps the first values of the stream, so sliding n never reshuffles the sample', () => {
    expect(drawSampleOf('normal', 1, 0, 100).slice(0, 10)).toEqual(drawSampleOf('normal', 1, 0, 10));
    expect(drawSampleOf('heavy', 7, 3, 1000).slice(0, 100)).toEqual(drawSampleOf('heavy', 7, 3, 100));
  });

  it('a fresh sample (next index) is a different sample from the same seed', () => {
    expect(drawSampleOf('normal', 1, 1, 50)).not.toEqual(drawSampleOf('normal', 1, 0, 50));
    expect(SHOWN_INTERVALS).toBe(40);
  });
});
