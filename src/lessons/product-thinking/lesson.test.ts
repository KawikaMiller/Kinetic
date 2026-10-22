import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { folkloreCaption, powerCaption, seriesCaption, treeCaption } from './captions';
import { FACTS } from './facts';
import { COHORTS, LOGS, WINDOWS, checks, measured, population } from './folklore';
import lesson from './index';
import { OPENING } from './opening';
import { LONG_WINDOW_DAYS, daysToReach, sampleSize, simulatedPower, type PowerSpec } from './power';
import { GUARDRAIL_DEFAULT, METRICS, change, firstBreach, generateSeries } from './series';
import { LEVELS, REQUEST_LEVEL, cheapestFull } from './tree';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('product-thinking');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('product-thinking')).toEqual([]);
  });

  it('every scene opens on its documented state', () => {
    expect(OPENING.scene).toBe('tree');
    expect(OPENING.tree.level).toBe(REQUEST_LEVEL);
    expect(LEVELS[OPENING.tree.level].id).toBe('solution');
    expect(OPENING.series).toMatchObject({ metric: 'signups', pushed: false, seed: 21 });
    expect(OPENING.power).toMatchObject({ baseline: 10, lift: 2, alpha: 0.05, power: 0.8, traffic: '2,000' });
    expect(OPENING.folklore.design).toEqual({ log: 'views', window: 7, cohort: 'signups' });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: one press up reaches the need; the link covers the behaviour in 2 days against the request\'s 3 days and 1 of 3 parts', () => {
    expect(LEVELS[OPENING.tree.level - 1].id).toBe('need');
    expect([cheapestFull().id, cheapestFull().effort, FACTS.requestEffort, FACTS.requestParts, FACTS.behaviourParts]).toEqual(['link', 2, 3, 1, 3]);
    expect(lesson.tryThis[0]).toContain('the shareable link at 2 days');
    expect(lesson.tryThis[0]).toContain('covers 1 of 3 parts');
  });

  it('try-this 2: signups +29%, active -1%, retention 0%; pushed gives +64% signups, +39% tickets and a flag in week 12', () => {
    const calm = generateSeries(OPENING.series.seed, false);
    expect([Math.round(change(calm.signups) * 100), Math.round(change(calm.active) * 100), Math.round(change(calm.retention) * 100) + 0]).toEqual([29, -1, 0]);
    const pushed = generateSeries(OPENING.series.seed, true);
    expect([Math.round(change(pushed.signups) * 100), Math.round(change(pushed.tickets) * 100)]).toEqual([64, 39]);
    expect(firstBreach(pushed, GUARDRAIL_DEFAULT)).toEqual({ metric: 'tickets', week: 12 });
    expect(firstBreach(calm, GUARDRAIL_DEFAULT)).toBeNull();
    expect(lesson.tryThis[1]).toContain('the release is flagged in week 12 when tickets cross 65');
  });

  it('try-this 3: 3,843 visitors per arm, 3.84 days, 80% power; a 0.5-point lift needs 57,764 and about 58 days', () => {
    const spec: PowerSpec = { baseline: 10, lift: 2, alpha: 0.05, power: 0.8 };
    expect([sampleSize(spec), daysToReach(sampleSize(spec), 2000).toFixed(2), Math.round(simulatedPower(spec, sampleSize(spec), 17) * 100)]).toEqual([3843, '3.84', 80]);
    const tiny = sampleSize({ ...spec, lift: 0.5 });
    expect([tiny, Math.round(daysToReach(tiny, 2000))]).toEqual([57764, 58]);
    expect(lesson.tryThis[2]).toContain('3,843 visitors per arm and 3.84 days');
    expect(lesson.tryThis[2]).toContain('57,764 per arm and about 58 days');
  });

  it('try-this 4: the default design reports 11%, the fair design 50% with no choice flagged', () => {
    const people = population();
    expect(Math.round(measured(people, OPENING.folklore.design) * 100)).toBe(11);
    const fair = { log: 'uses', window: 30, cohort: 'active' } as const;
    expect(Math.round(measured(people, fair) * 100)).toBe(50);
    expect(checks(fair).every((c) => c.ok)).toBe(true);
    expect(lesson.tryThis[3]).toContain('reports 11% of accounts');
    expect(lesson.tryThis[3]).toContain('it reports 50% and no choice is flagged');
  });
});

describe('captions across the control cross product', () => {
  it('the tree caption is clean at every level and names the cheapest full cover', () => {
    for (let level = 0; level <= REQUEST_LEVEL; level++) {
      const text = expectCaption(treeCaption(level));
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain('shareable link at 2 days');
    }
    expect(expectCaption(treeCaption(3))).toContain('Options that serve it: Scheduled email of the report (5 days) and Shareable link (2 days)');
    expect(expectCaption(treeCaption(1))).toContain('Every solution is a bet on this level');
  });

  it('the series caption is clean for every metric, push setting and guardrail extreme, and the verdict follows the breach', () => {
    for (const pushed of [false, true]) {
      const series = generateSeries(21, pushed);
      for (const g of [{ tickets: 55, latency: 320 }, GUARDRAIL_DEFAULT, { tickets: 120, latency: 700 }]) {
        const breach = firstBreach(series, g);
        for (const m of METRICS) {
          const text = expectCaption(seriesCaption(series, m.id, pushed, breach, g));
          expect(text).not.toMatch(NO_JUNK);
          expect(text.includes('Release flagged')).toBe(breach !== null);
        }
      }
    }
  });

  it('a calm release with no breach quotes the real moves of signups, active teams and retention (computed by hand from the series), not a typed claim', () => {
    const series = generateSeries(21, false);
    const pct = (xs: number[]) => {
      const before = xs.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
      const after = xs.slice(7).reduce((a, b) => a + b, 0) / (xs.length - 7);
      const v = Math.round((after / before - 1) * 100);
      return `${v >= 0 ? '+' : '-'}${Math.abs(v)}%`;
    };
    const g = { tickets: 120, latency: 700 };
    expect(firstBreach(series, g)).toBeNull();
    const text = expectCaption(seriesCaption(series, 'signups', false, null, g));
    expect(text).toContain(`signups ${pct(series.signups)} while weekly active teams moved ${pct(series.active)} and retention ${pct(series.retention)}`);
    expect(text).not.toContain('did not move');
  });

  it('the power caption is clean, long windows say small user bases cannot detect small lifts, and refusals say nothing is computed', () => {
    const spec: PowerSpec = { baseline: 10, lift: 0.5, alpha: 0.05, power: 0.8 };
    const n = sampleSize(spec);
    const short = expectCaption(powerCaption({ spec: { ...spec, lift: 2 }, n: 3843, days: 3.843, perDay: 2000, simulated: 0.8 }, null));
    expect(short).toContain('3,843 visitors in each arm');
    expect(short).toContain(`fits inside ${LONG_WINDOW_DAYS} days`);
    const long = expectCaption(powerCaption({ spec, n, days: daysToReach(n, 500), perDay: 500, simulated: 0.8 }, null));
    expect(daysToReach(n, 500)).toBeGreaterThan(LONG_WINDOW_DAYS);
    expect(long).toContain('small user bases cannot detect small lifts');
    expect(expectCaption(powerCaption(null, 'A refusal.'))).toContain('Nothing is computed');
  });

  it('the folklore caption is clean for all 12 designs and counts the flagged choices', () => {
    const people = population();
    for (const log of LOGS) for (const window of WINDOWS) for (const cohort of COHORTS) {
      const design = { log: log.value, window: window.value, cohort: cohort.value };
      const list = checks(design);
      const text = expectCaption(folkloreCaption(people, design, list));
      expect(text).not.toMatch(NO_JUNK);
      expect(text).toContain(`${Math.round(measured(people, design) * 100)}% of accounts`);
    }
  });
});
