import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { catches, isGreen, LAYERS, pGreen, PRESETS, runSuite, shapeOf, SPEC, suiteSeconds, type Counts } from './model';

const counts = (id: string) => PRESETS.find((p) => p.id === id)!.counts;

describe('P(green)', () => {
  it('is the product of (1 − flake) over every test', () => {
    const c: Counts = { unit: 7, integration: 13, e2e: 4 };
    let direct = 1;
    for (const l of LAYERS) for (let i = 0; i < c[l]; i++) direct *= 1 - SPEC[l].flake;
    expect(pGreen(c)).toBeCloseTo(direct, 12);
  });

  it('falls as E2E tests pile up, and unit tests never make it flaky', () => {
    expect(pGreen({ unit: 400, integration: 0, e2e: 0 })).toBe(1);
    let prev = 1;
    for (let e = 1; e <= 50; e++) {
      const p = pGreen({ unit: 0, integration: 0, e2e: e });
      expect(p).toBeLessThan(prev);
      prev = p;
    }
    expect(pGreen(counts('cone'))).toBeLessThan(pGreen(counts('pyramid')));
  });

  it.each(['pyramid', 'cone'])('simulated runs converge to it (%s)', (id) => {
    const c = counts(id);
    const rnd = mulberry32(42);
    const RUNS = 4000;
    let green = 0;
    for (let i = 0; i < RUNS; i++) if (isGreen(runSuite(c, null, rnd))) green++;
    expect(Math.abs(green / RUNS - pGreen(c))).toBeLessThan(0.03);
  });
});

describe('suite time', () => {
  it('is the sum of every test\'s duration, and the last test finishes then', () => {
    const c = counts('pyramid');
    expect(suiteSeconds(c)).toBeCloseTo(300 * SPEC.unit.seconds + 60 * SPEC.integration.seconds + 10 * SPEC.e2e.seconds);
    const runs = runSuite(c, null, mulberry32(1));
    expect(runs).toHaveLength(370);
    expect(runs.at(-1)!.end).toBeCloseTo(suiteSeconds(c), 6);
  });

  it('runs layers in order, cheapest first', () => {
    const order = runSuite(counts('diamond'), null, mulberry32(3)).map((r) => LAYERS.indexOf(r.layer));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]);
  });

  it('an ice-cream cone is many times slower than a pyramid', () => {
    expect(suiteSeconds(counts('cone')) / suiteSeconds(counts('pyramid'))).toBeGreaterThan(4);
  });
});

describe('shape and bugs', () => {
  it('names the presets', () => {
    expect(shapeOf(counts('pyramid'))).toBe('pyramid');
    expect(shapeOf(counts('diamond'))).toBe('diamond');
    expect(shapeOf(counts('cone'))).toBe('ice-cream cone');
    expect(shapeOf({ unit: 50, integration: 5, e2e: 40 })).toBe('hourglass');
    expect(shapeOf({ unit: 0, integration: 0, e2e: 0 })).toBe('no tests');
  });

  it('a planted bug fails exactly one test in its layer, if the suite has tests there', () => {
    const c = counts('pyramid');
    for (const bug of ['logic', 'wiring', 'browser'] as const) {
      const runs = runSuite(c, bug, mulberry32(9));
      expect(runs.filter((r) => r.result === 'fail')).toHaveLength(1);
      expect(catches(c, bug)).toBe(true);
    }
    const noUnits: Counts = { unit: 0, integration: 20, e2e: 5 };
    expect(catches(noUnits, 'logic')).toBe(false);
    expect(runSuite(noUnits, 'logic', mulberry32(9)).some((r) => r.result === 'fail')).toBe(false);
  });
});
