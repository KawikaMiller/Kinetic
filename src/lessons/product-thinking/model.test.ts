import { describe, expect, it } from 'vitest';
import { ACTIVE, DESIGN_DEFAULT, SIGNUPS, checks, measured, population, type Design } from './folklore';
import { ALPHAS, LIFT, POWER_DEFAULT, POWERS, analyticPower, checkLift, daysToReach, parseTraffic, sampleSize, simulatedPower } from './power';
import {
  GUARDRAIL_DEFAULT, METRICS, RELEASE_WEEK, WEEKS, change, firstBreach, generateSeries,
} from './series';
import { BEHAVIOUR_NEEDS, NEEDS, SOLUTIONS, behaviourCoverage, cheapestFull, needShare, optionsAt, treeChildren } from './tree';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe('the outcomes tree', () => {
  it('coverage is a direct set computation: CSV covers 2 of 4 needs and 1 of the 3 behaviour needs, the other two cover all 3', () => {
    expect(SOLUTIONS.map((s) => [s.id, needShare(s), BEHAVIOUR_NEEDS.filter((n) => s.covers.includes(n)).length])).toEqual([['csv', 0.5, 1], ['email', 0.75, 3], ['link', 0.75, 3]]);
    expect(SOLUTIONS.map(behaviourCoverage)).toEqual(['part', 'full', 'full']);
    expect(NEEDS).toHaveLength(4);
  });

  it('a simpler option higher up can cover the behaviour at less effort than the request', () => {
    const csv = SOLUTIONS.find((s) => s.id === 'csv')!;
    const cheapest = cheapestFull();
    expect(cheapest.id).toBe('link');
    expect(cheapest.effort).toBeLessThan(csv.effort);
    expect(behaviourCoverage(csv)).not.toBe('full');
  });

  it('options at each level follow what that level says', () => {
    expect(optionsAt('solution').map((s) => s.id)).toEqual(['csv']);
    expect(optionsAt('need').map((s) => s.id)).toEqual(['email', 'link']);
    expect(optionsAt('behaviour').map((s) => s.id)).toEqual(['csv', 'email', 'link']);
    expect(optionsAt('metric')).toHaveLength(3);
    expect(treeChildren('need')).toEqual(['csv', 'email', 'link']);
    expect(treeChildren('goal')).toEqual(['metric']);
    expect(treeChildren('csv')).toEqual([]);
  });
});

describe('which number to watch', () => {
  it('the vanity metric rises while the outcome metrics stay flat, on 50 seeds when signups are pushed or not', () => {
    for (const seed of SEEDS) {
      for (const pushed of [false, true]) {
        const s = generateSeries(seed, pushed);
        expect(change(s.signups), `seed ${seed}`).toBeGreaterThan(0.15);
        expect(Math.abs(change(s.active))).toBeLessThan(0.05);
        expect(Math.abs(change(s.retention))).toBeLessThan(0.05);
      }
    }
  });

  it('pushing signups degrades both guardrails and breaches the defaults after the release; a calm release never does, on 50 seeds', () => {
    for (const seed of SEEDS) {
      const calm = generateSeries(seed, false);
      expect(firstBreach(calm, GUARDRAIL_DEFAULT), `calm seed ${seed}`).toBeNull();
      const pushed = generateSeries(seed, true);
      const breach = firstBreach(pushed, GUARDRAIL_DEFAULT);
      expect(breach).not.toBeNull();
      expect(breach!.week).toBeGreaterThanOrEqual(RELEASE_WEEK);
      expect(breach!.week).toBeLessThanOrEqual(WEEKS);
      expect(change(pushed.tickets)).toBeGreaterThan(0.3);
      expect(change(pushed.latency)).toBeGreaterThan(0.2);
    }
    expect(METRICS.map((m) => m.kind)).toEqual(['vanity', 'outcome', 'outcome', 'guardrail', 'guardrail']);
  });

  it('a breach is found only at or after the release week, and a looser guardrail finds it later or not at all', () => {
    const s = generateSeries(7, true);
    const tight = firstBreach(s, { tickets: 55, latency: 330 })!;
    const loose = firstBreach(s, { tickets: 120, latency: 700 });
    expect(tight.week).toBeGreaterThanOrEqual(RELEASE_WEEK);
    expect(loose === null || loose.week >= tight.week).toBe(true);
  });
});

describe('can we even measure this?', () => {
  it('p0 10%, lift 2 points, alpha 0.05, power 0.8 needs 3843 per arm (hand-worked from z = 1.959964 and 0.841621) and 3.84 days at 2,000 a day', () => {
    const z = 1.959964 + 0.841621;
    const hand = Math.ceil((2 * z * z * 0.11 * 0.89) / (0.02 * 0.02));
    expect(hand).toBe(3843);
    expect(sampleSize({ baseline: 10, lift: 2, alpha: 0.05, power: 0.8 })).toBe(3843);
    expect(daysToReach(3843, 2000)).toBeCloseTo(3.843, 12);
  });

  it('halving the lift needs about four times as many visitors', () => {
    const full = sampleSize({ baseline: 10, lift: 2, alpha: 0.05, power: 0.8 });
    const half = sampleSize({ baseline: 10, lift: 1, alpha: 0.05, power: 0.8 });
    expect(half / full).toBeGreaterThan(3.8);
    expect(half / full).toBeLessThan(4.2);
  });

  it('the smallest sample size any control combination can reach is 75 per arm (hand value 2 x 2.8016^2 x 0.95 x 0.05 / 0.01 = 74.6), so no exact small-n draw is ever needed', () => {
    let smallest = Infinity;
    for (let baseline = 1; baseline <= 90; baseline++) {
      for (let lift = LIFT.min; lift <= LIFT.max; lift += LIFT.step) {
        if (checkLift(baseline, lift) !== null) continue;
        for (const alpha of ALPHAS) for (const power of POWERS) smallest = Math.min(smallest, sampleSize({ baseline, lift, alpha, power }));
      }
    }
    expect(smallest).toBe(75);
  });

  it('a 5,000-run Monte Carlo at that size shows power within 0.03 of the target, for both powers', () => {
    for (const power of POWERS) {
      const spec = { baseline: 10, lift: 2, alpha: 0.05, power };
      expect(Math.abs(simulatedPower(spec, sampleSize(spec), 3) - power), `power ${power}`).toBeLessThan(0.03);
    }
    const strict = { baseline: 10, lift: 2, alpha: ALPHAS[1], power: 0.8 };
    expect(Math.abs(simulatedPower(strict, sampleSize(strict), 3) - 0.8)).toBeLessThan(0.03);
  });

  it('the analytic power curve reaches the target at the formula n and agrees with the simulation within 0.03', () => {
    for (const power of POWERS) {
      const spec = { baseline: 10, lift: 2, alpha: 0.05, power };
      const n = sampleSize(spec);
      expect(analyticPower(spec, n)).toBeGreaterThanOrEqual(power - 1e-4);
      expect(analyticPower(spec, n - 20)).toBeLessThan(power);
      expect(Math.abs(analyticPower(spec, n) - simulatedPower(spec, n, 8))).toBeLessThan(0.03);
    }
  });

  it('a lift that would pass 0 or 100 percent is refused with the reason; traffic is a bounded whole number', () => {
    expect(checkLift(10, 2)).toBeNull();
    expect(checkLift(99, 2)).toContain('pass 100%');
    expect(checkLift(1, 2)).toContain('below 0%');
    expect(LIFT.max).toBeGreaterThanOrEqual(2);
    expect(parseTraffic('2,000')).toEqual({ ok: true, value: 2000 });
    for (const bad of ['', '50', '2000000', 'abc', '2.5', '1e3']) expect(parseTraffic(bad).ok, bad).toBe(false);
    expect(POWER_DEFAULT.traffic).toBe('2,000');
  });
});

describe('the folklore check', () => {
  const people = population();

  it('the measured share equals a direct count for a hand-picked design', () => {
    const d: Design = { log: 'uses', window: 30, cohort: 'active' };
    const direct = people.filter((p) => p.active && p.usedOn !== null).length / ACTIVE;
    expect(measured(people, d)).toBe(direct);
    expect(people).toHaveLength(SIGNUPS);
  });

  it('the design decides the answer: the default design reads far lower than the same product measured over its cycle', () => {
    const bad = measured(people, DESIGN_DEFAULT);
    const good = measured(people, { log: 'uses', window: 30, cohort: 'active' });
    expect(good).toBeGreaterThan(0.4);
    expect(good).toBeLessThan(0.6);
    expect(bad).toBeLessThan(good / 2);
    // widening only the window, or only the cohort, moves the number up each time
    expect(measured(people, { ...DESIGN_DEFAULT, window: 30 })).toBeGreaterThan(bad);
    expect(measured(people, { ...DESIGN_DEFAULT, cohort: 'active' })).toBeGreaterThan(bad);
  });

  it('the checks flag exactly the three choices that differ from the fair design', () => {
    expect(checks(DESIGN_DEFAULT).map((c) => c.ok)).toEqual([false, false, false]);
    expect(checks({ log: 'uses', window: 90, cohort: 'active' }).map((c) => c.ok)).toEqual([true, true, true]);
    expect(checks({ log: 'uses', window: 7, cohort: 'active' })[1].text).toContain('23%');
  });
});
