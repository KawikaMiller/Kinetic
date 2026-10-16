import { describe, expect, it } from 'vitest';
import { CLEAN_STREAMS, cleanReadings, ksFivePercent, streamSpread } from './falseAlarm';
import { falseFacts } from './facts';
import { CLEAN_DAYS, PINNED_ALERT_DAYS, PINNED_SEEDS, pinnedFalseRates } from './pinned';
import { DETECT_WITHIN_DAYS, SEED_STREAMS, measureSeeds } from './seedStats';
import { alarms, shiftDayOf, simulate } from './stream';
import { DAYS } from './world';

describe('pinned figures equal a fresh measurement (the lesson loads the pins, this recomputes them)', () => {
  it('the clean-day alert counts and the rates derived from them', () => {
    const c = cleanReadings();
    expect(c.readings).toHaveLength(CLEAN_DAYS);
    const count = (metric: 'ks' | 'psi', t: number) => c.readings.filter((r) => r[metric] > t).length;
    expect(count('ks', 0.08)).toBe(PINNED_ALERT_DAYS.ks008);
    expect(count('ks', 0.11)).toBe(PINNED_ALERT_DAYS.ks011);
    expect(count('psi', 0.1)).toBe(PINNED_ALERT_DAYS.psi010);
    expect(count('psi', 0.25)).toBe(PINNED_ALERT_DAYS.psi025);
    const f = falseFacts();
    const p = pinnedFalseRates();
    expect(p.start).toBe(f.start);
    expect(p.ksAt011).toBe(f.ksAt011);
    expect(p.psiWatch).toBe(f.psiWatch);
    expect(p.psiAlert).toBe(f.psiAlert);
    expect(p.days).toBeCloseTo(f.days, 12);
    expect(CLEAN_STREAMS * DAYS).toBe(CLEAN_DAYS);
  });

  it('the seed rates: covariate detection, concept-drift input alerts, and alerts before the shift', () => {
    expect(SEED_STREAMS).toBe(PINNED_SEEDS.streams);
    expect(measureSeeds()).toEqual(PINNED_SEEDS);
  });
});

describe('what the monitors can and cannot see, over 200 seeds', () => {
  it('concept drift leaves P(x) untouched: its monitor readings equal those of a stream with no shift, day by day', () => {
    for (let seed = 1; seed <= SEED_STREAMS; seed++) {
      const concept = simulate({ kind: 'concept', day: 20, sizePct: 60, seed, labelDelay: 0 });
      const clean = simulate({ kind: 'concept', day: 20, sizePct: 0, seed, labelDelay: 0 });
      expect(concept.days.map((d) => [d.psi, d.ks]), `seed ${seed}`).toEqual(clean.days.map((d) => [d.psi, d.ks]));
    }
  });

  it('an 80% covariate shift trips an input monitor within three days on at least 95% of seeds, and the first alert is not always day 20', () => {
    let within = 0;
    let onDayTwenty = 0;
    for (let seed = 1; seed <= SEED_STREAMS; seed++) {
      const setting = { kind: 'covariate' as const, day: 20, sizePct: 80, seed, labelDelay: 0 };
      const a = alarms(simulate(setting), 0, shiftDayOf(setting));
      if (a.input !== null && a.input <= 20 + DETECT_WITHIN_DAYS) within++;
      if (a.input === 20) onDayTwenty++;
    }
    expect(within / SEED_STREAMS).toBeGreaterThanOrEqual(0.95);
    expect(onDayTwenty).toBeLessThan(SEED_STREAMS);
  });

  it('under concept drift the share of streams with an input alert after the shift is far from zero, so "silent" is a property of one seed', () => {
    expect(PINNED_SEEDS.conceptInputAlert / PINNED_SEEDS.streams).toBeGreaterThan(0.25);
  });

  it('the per-stream spread (zero-alert streams, median, worst) equals a direct count over the readings', () => {
    const c = cleanReadings();
    const threshold = ksFivePercent(c.baselineSize);
    const direct: number[] = [];
    for (let s = 0; s < c.streams; s++) {
      let n = 0;
      for (let d = 0; d < DAYS; d++) if (c.readings[s * DAYS + d].ks > threshold) n++;
      direct.push(n);
    }
    const spread = streamSpread(c, 'ks', threshold);
    expect(spread.zero).toBe(direct.filter((n) => n === 0).length);
    expect(spread.max).toBe(Math.max(...direct));
    expect(spread.zero).toBeGreaterThan(c.streams * 0.1);
    expect(spread.max).toBeGreaterThan(3 * DAYS * 0.05);
  });
});
