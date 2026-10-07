import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { captionText as text } from '../../core/testing/captions';
import { bayesCaption, filterCaption, gridRatio } from './frames';
import lesson from './index';
import {
  GROUP_ORDER, POPULATION, PRESETS, bayesTerms, expectedCounts, groupCounts, groupOf, largestRemainder, posterior, probText, toNumber,
  type Rates,
} from './model';

const headline: Rates = { prevalence: 10, sensitivity: 990, specificity: 990 };

/** Independent reference: Bayes in plain floats, written from the textbook formula. */
const reference = (prev: number, sens: number, spec: number) => (sens * prev) / (sens * prev + (1 - spec) * (1 - prev));

describe('posterior', () => {
  it('is exact: 0.5 for 1% / 99% / 99%, and 0.0099 / 0.0198 term by term', () => {
    const p = posterior(headline);
    expect(p.num * 2n).toBe(p.den);
    const t = bayesTerms(headline);
    expect(t.joint).toBeCloseTo(0.0099, 15);
    expect(t.positive).toBeCloseTo(0.0198, 15);
  });

  it('≈ 0.0902 at 0.1% prevalence (exactly 990/10980)', () => {
    const p = posterior({ ...headline, prevalence: 1 });
    expect(p.num * 10980n).toBe(p.den * 990n);
    expect(toNumber(p)).toBeCloseTo(0.0902, 4);
    expect(probText(toNumber(p))).toBe('9.02%');
  });

  it('a second independent positive takes the headline 50% to 99%, exactly', () => {
    const p = posterior(headline, 2);
    expect(p.num * 100n).toBe(p.den * 99n);
    // Sequential update by hand: prior 0.5, then Bayes again.
    expect(toNumber(p)).toBeCloseTo(reference(0.5, 0.99, 0.99), 15);
  });

  it('matches the float reference on 500 seeded slider settings, for 1-3 tests', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 500; i++) {
      const r: Rates = { prevalence: randInt(1, 500, rnd), sensitivity: randInt(500, 1000, rnd), specificity: randInt(500, 1000, rnd) };
      let prior = r.prevalence / 1000;
      for (let k = 1; k <= 3; k++) {
        const ref = reference(prior, r.sensitivity / 1000, r.specificity / 1000);
        expect(toNumber(posterior(r, k))).toBeCloseTo(ref, 12);
        expect(bayesTerms(r, k).posterior).toBeCloseTo(ref, 12);
        prior = ref;
      }
    }
  });
});

describe('the 1,000-person grid', () => {
  it('largest remainder: sums to the total, each count within 1 of its exact value', () => {
    expect(largestRemainder([99n, 1n, 99n, 9801n], 10n, 1000)).toEqual([10, 0, 10, 980]);
    expect(largestRemainder([5n, 5n], 10n, 1)).toEqual([1, 0]);
  });

  it('on 500 seeded settings and 1-3 tests: four groups sum to 1,000, each within 1 of the expected count, and match the cells', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const r: Rates = { prevalence: randInt(1, 500, rnd), sensitivity: randInt(500, 1000, rnd), specificity: randInt(500, 1000, rnd) };
      for (let k = 1; k <= 3; k++) {
        const c = groupCounts(r, k);
        const e = expectedCounts(r, k);
        expect(c.tp + c.fp + c.fn + c.tn).toBe(POPULATION);
        for (const g of GROUP_ORDER) {
          expect(Number.isInteger(c[g])).toBe(true);
          expect(Math.abs(c[g] - e[g])).toBeLessThan(1);
        }
        const tally = { tp: 0, fp: 0, fn: 0, tn: 0 };
        for (let p = 0; p < POPULATION; p++) tally[groupOf(c, p)]++;
        expect(tally).toEqual(c);
      }
    }
  });

  it('headline grid: 10 caught, 0 missed, 10 false alarms; 0.1% gives 1 and 10', () => {
    expect(groupCounts(headline)).toEqual({ tp: 10, fn: 0, fp: 10, tn: 980 });
    expect(groupCounts({ ...headline, prevalence: 1 })).toEqual({ tp: 1, fn: 0, fp: 10, tn: 989 });
  });
});

describe('captions and quiz numbers', () => {
  it('the grid ratio is labelled as rounded, beside the exact value', () => {
    expect(text(bayesCaption(headline, { positive: 'sick', negative: 'healthy' }))).toBe(
      'Of 1,000 people, 10 are sick (1%). 20 test positive and 10 of them are really sick: the grid gives 10/20 = 50%. Exact: P(sick | positive) = 50%. A positive is exactly a coin flip.',
    );
    const rare = text(bayesCaption({ ...headline, prevalence: 1 }, { positive: 'sick', negative: 'healthy' }));
    expect(rare).toContain('the grid gives 1/11 = 9.09%');
    expect(rare).toContain('Exact: P(sick | positive) = 9.02%');
    expect(rare).toContain('Most positives are false alarms');
    expect(text(filterCaption(headline, { positive: 'sick', negative: 'healthy' }))).toContain('50% in the rounded grid');
  });

  it('the verdict follows the exact posterior for every preset and test count', () => {
    for (const p of PRESETS) {
      for (let k = 1; k <= 3; k++) {
        const c = text(bayesCaption(p.rates, p.labels, k));
        const post = posterior(p.rates, k);
        expect(c.includes('Most positives are false alarms')).toBe(2n * post.num < post.den);
        expect(c.includes('exactly a coin flip')).toBe(2n * post.num === post.den);
        expect(c).toContain(`Exact: P(${p.labels.positive} | positive) = ${probText(toNumber(posterior(p.rates, k)))}`);
      }
    }
    expect(gridRatio({ prevalence: 1, sensitivity: 500, specificity: 1000 }).positives).toBe(1);
  });

  it('the fraud use case quotes the Fraud preset, and a positive there is mostly a false alarm', () => {
    const fraud = PRESETS.find((p) => p.id === 'fraud')!;
    expect(fraud.rates).toEqual({ prevalence: 2, sensitivity: 900, specificity: 980 });
    expect(lesson.summary.useCases.join(' ')).toContain('catches 90% of fraud and clears 98% of good orders, on 0.2% fraud');
    expect(toNumber(posterior(fraud.rates))).toBeLessThan(0.5);
  });

  it('quiz answers come from the model', () => {
    const [q1, q2, q3, q4] = lesson.quiz;
    expect(q1.options[q1.answer]).toBe(`About ${probText(toNumber(posterior(headline)))}`);
    expect(Math.round(toNumber(posterior({ ...headline, prevalence: 1 })) * 100)).toBe(9);
    expect(q2.options[q2.answer]).toBe('About 9%');
    expect(q3.options[q3.answer]).toBe(`About ${probText(toNumber(posterior(headline, 2)))}`);
    expect(q4.options[q4.answer]).toContain('specificity');
    const spec = toNumber(posterior({ ...headline, specificity: 999 }));
    const sens = toNumber(posterior({ ...headline, sensitivity: 999 }));
    expect(spec).toBeCloseTo(0.909, 3);
    expect(sens).toBeCloseTo(0.502, 3);
    expect(spec).toBeGreaterThan(sens);
  });
});
