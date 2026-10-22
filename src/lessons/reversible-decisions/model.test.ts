import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  COSTLY_UNDO_HOURS, DECISIONS, DEFAULT_TAU, DEFAULT_W, DOORS, REFERENCE, RIGOUR_BOUNDS, TECHNIQUES, UNSURE_P0, cellOf, crossoverCost, decisionOf, deliberateCount, doorClosing,
  optimalHours, optimalTotal, revealRows, rigourOf, techniqueOf, techniqueRow, techniqueRows, totalCost, undoAt, type Rigour,
} from './model';

const GRID_STEP = 0.001;
const GRID_END = 200;

/** Oracle: the minimum of total(r) found by walking r from 0 to 200 in steps of 0.001, written from the definition. */
function gridMinimum(m: Rigour): { hours: number; total: number } {
  let best = { hours: 0, total: m.p0 * m.undo };
  for (let i = 1; i * GRID_STEP <= GRID_END; i += 1) {
    const r = i * GRID_STEP;
    const t = m.w * r + m.p0 * m.undo * Math.exp(-r / m.tau);
    if (t < best.total) best = { hours: r, total: t };
  }
  return best;
}

const database = rigourOf(decisionOf('database'));
const rename = rigourOf(decisionOf('rename'));

describe('the rigour model against a grid search', () => {
  it('finds the same optimum as a walk over r in 0..200 step 0.001 (within 0.01 h) for 200 seeded (C, p0, tau, w)', () => {
    const rnd = mulberry32(2024);
    const pick = (lo: number, hi: number) => lo + rnd() * (hi - lo);
    for (let i = 0; i < 200; i += 1) {
      const m: Rigour = {
        undo: pick(RIGOUR_BOUNDS.undo.min, 2000),
        p0: pick(RIGOUR_BOUNDS.p0.min, RIGOUR_BOUNDS.p0.max),
        tau: pick(RIGOUR_BOUNDS.tau.min, 20),
        w: pick(RIGOUR_BOUNDS.w.min, RIGOUR_BOUNDS.w.max),
      };
      const oracle = gridMinimum(m);
      expect(Math.abs(optimalHours(m) - oracle.hours), JSON.stringify(m)).toBeLessThan(0.01);
      expect(optimalTotal(m)).toBeLessThanOrEqual(oracle.total + 1e-9);
      expect(optimalTotal(m)).toBeCloseTo(oracle.total, 3);
    }
  });

  it('the total at the optimum is w * (r* + tau) when deliberating, and p0 * C when deciding now (the identity holds at w other than 1)', () => {
    const m: Rigour = { undo: 500, p0: 0.4, tau: 10, w: 2 };
    const star = optimalHours(m);
    expect(star).toBeCloseTo(10 * Math.log((0.4 * 500) / (10 * 2)), 12);
    expect(optimalTotal(m)).toBeCloseTo(m.w * (star + m.tau), 9);
    expect(optimalTotal(m)).toBeCloseTo(m.w * star + m.p0 * m.undo * Math.exp(-star / m.tau), 9);
    expect(optimalTotal(rename)).toBe(0.3);
  });

  it('is decide-now exactly when C <= the crossover: zero at C = C*, zero just below, positive just above', () => {
    const base = { p0: 0.4, tau: 10, w: 1 };
    const cStar = crossoverCost(base.p0, base.tau, base.w);
    expect(cStar).toBe(25);
    expect(optimalHours({ ...base, undo: cStar })).toBe(0);
    expect(optimalHours({ ...base, undo: cStar - 1e-6 })).toBe(0);
    expect(optimalHours({ ...base, undo: cStar + 1e-6 })).toBeGreaterThan(0);
    expect(optimalHours({ ...base, undo: cStar + 1 })).toBeCloseTo(10 * Math.log(26 / 25), 12);
  });

  it('stays finite at every slider extreme and one step beyond (C 0 and 3000, p0, tau, w, r)', () => {
    for (const undo of [0, RIGOUR_BOUNDS.undo.max, RIGOUR_BOUNDS.undo.max + 1]) {
      for (const p0 of [RIGOUR_BOUNDS.p0.min, RIGOUR_BOUNDS.p0.max, RIGOUR_BOUNDS.p0.max + RIGOUR_BOUNDS.p0.step]) {
        for (const tau of [RIGOUR_BOUNDS.tau.min, RIGOUR_BOUNDS.tau.max]) {
          for (const w of [RIGOUR_BOUNDS.w.min, RIGOUR_BOUNDS.w.max]) {
            const m: Rigour = { undo, p0, tau, w };
            for (const r of [0, RIGOUR_BOUNDS.hours.max, RIGOUR_BOUNDS.hours.max + 1]) expect(Number.isFinite(totalCost(r, m))).toBe(true);
            expect(Number.isFinite(optimalHours(m))).toBe(true);
            expect(Number.isFinite(optimalTotal(m))).toBe(true);
            expect(optimalHours(m)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
    expect(optimalHours({ undo: 0, p0: 0.5, tau: 10, w: 1 })).toBe(0);
    expect(optimalTotal({ undo: 0, p0: 0.5, tau: 10, w: 1 })).toBe(0);
  });
});

describe('the hand-worked vectors (p0 = 0.4, tau = 10, w = 1)', () => {
  const at = (undo: number): Rigour => ({ undo, p0: 0.4, tau: 10, w: 1 });

  it('1. the crossover is tau * w / p0 = 10 / 0.4 = 25 hours', () => {
    expect(crossoverCost(0.4, 10, 1)).toBe(25);
    expect(COSTLY_UNDO_HOURS).toBe(crossoverCost(0.4, DEFAULT_TAU, DEFAULT_W));
  });

  it('2. C = 200: p0 C / (tau w) = 80 / 10 = 8, r* = 10 ln 8 = 20.794, total 30.794 (= 20.794 + 80 / 8), total(0) = 80, total(60) = 60.198', () => {
    const m = at(200);
    expect(optimalHours(m)).toBeCloseTo(20.7944, 4);
    expect(optimalTotal(m)).toBeCloseTo(30.7944, 4);
    expect(20.7944 + 80 * 0.125).toBeCloseTo(30.7944, 4);
    expect(totalCost(0, m)).toBe(80);
    expect(totalCost(60, m)).toBeCloseTo(60.198, 3);
  });

  it('3. C = 1000: r* = 10 ln 40 = 36.889 and the total is 46.889', () => {
    expect(optimalHours(at(1000))).toBeCloseTo(36.8888, 4);
    expect(optimalTotal(at(1000))).toBeCloseTo(46.8888, 4);
  });

  it('4. C = 20 is below the crossover: r* = 0, total(0) = 8 and total(5) = 5 + 8 exp(-0.5) = 9.85', () => {
    expect(optimalHours(at(20))).toBe(0);
    expect(totalCost(0, at(20))).toBe(8);
    expect(totalCost(5, at(20))).toBeCloseTo(5 + 8 * Math.exp(-0.5), 12);
    expect(totalCost(5, at(20))).toBeCloseTo(9.852, 3);
  });

  it('5. doors that close: C0 = 20, g = 10%, crossover 25 gives t* = ln 1.25 / ln 1.1 = 2.341 months, and C(3) = 26.62 > 25', () => {
    const closing = doorClosing(20, 10, 25);
    expect(closing.kind).toBe('month');
    if (closing.kind === 'month') expect(closing.month).toBeCloseTo(0.22314 / 0.09531, 3);
    expect(undoAt(20, 10, 3)).toBeCloseTo(26.62, 9);
    expect(undoAt(20, 10, 0)).toBe(20);
  });

  it('6. the database decision (C = 800, p0 = 0.35): r* = 10 ln 28 = 33.32 and total 43.32; the adapter layer (0.5, 12 h) saves 6.93 and does not pay; the pilot (0.35, 10 h) saves 10.50 and pays barely', () => {
    expect(optimalHours(database)).toBeCloseTo(10 * Math.log(28), 9);
    expect(optimalTotal(database)).toBeCloseTo(43.32, 2);
    const adapter = techniqueRow(database, techniqueOf('adapter'));
    expect(adapter.undoAfter).toBe(400);
    expect(adapter.hoursAfter).toBeCloseTo(10 * Math.log(14), 9);
    expect(adapter.totalAfter).toBeCloseTo(36.39, 2);
    expect(adapter.saving).toBeCloseTo(6.93, 2);
    expect(adapter.pays).toBe(false);
    const pilot = techniqueRow(database, techniqueOf('pilot'));
    expect(pilot.undoAfter).toBeCloseTo(280, 9);
    expect(pilot.hoursAfter).toBeCloseTo(10 * Math.log(9.8), 9);
    expect(pilot.totalAfter).toBeCloseTo(32.82, 2);
    expect(pilot.saving).toBeCloseTo(10.5, 2);
    expect(pilot.pays).toBe(true);
  });
});

describe('doors that close', () => {
  /** Oracle: step the month in 0.001 until C(t) reaches the crossover. */
  function firstMonth(c0: number, g: number, crossover: number): number {
    for (let i = 0; i < 400_000; i += 1) if (undoAt(c0, g, i * 0.001) >= crossover) return i * 0.001;
    return Infinity;
  }

  it('the closing month agrees with a stepped search (to 0.001 month) across the sliders', () => {
    for (const c0 of [1, 20, 24, 100]) for (const g of [1, 10, 30]) {
      const closing = doorClosing(c0, g, 25);
      if (c0 >= 25) { expect(closing).toEqual({ kind: 'already' }); continue; }
      if (closing.kind !== 'month') throw new Error('expected a month');
      expect(Math.abs(closing.month - firstMonth(c0, g, 25)), `${c0} ${g}`).toBeLessThan(0.0011);
    }
  });

  it('no growth is "never" (no division by zero), and a cost already at the crossover is "already"', () => {
    expect(doorClosing(20, DOORS.growth.min, 25)).toEqual({ kind: 'never' });
    expect(doorClosing(25, 10, 25)).toEqual({ kind: 'already' });
    expect(doorClosing(DOORS.c0.max, 0, 25)).toEqual({ kind: 'already' });
    expect(undoAt(DOORS.c0.max, DOORS.growth.max, DOORS.month.max)).toBeCloseTo(500 * 1.3 ** 12, 6);
  });
});

describe('techniques', () => {
  it('the saving is tau * w * ln(1 / factor) while both sides stay past the crossover: it does not depend on the size of the decision', () => {
    for (const id of ['fields', 'database', 'contract', 'deletion', 'schema']) {
      const m = rigourOf(decisionOf(id));
      for (const t of TECHNIQUES) {
        const row = techniqueRow(m, t);
        expect(row.hoursAfter, `${id} ${t.id}`).toBeGreaterThan(0);
        expect(row.saving, `${id} ${t.id}`).toBeCloseTo(DEFAULT_TAU * DEFAULT_W * Math.log(1 / t.factor), 9);
      }
    }
  });

  it('agrees with a grid search of both totals, and a technique pays exactly when saving > set-up hours', () => {
    for (const id of ['database', 'schema', 'rename']) {
      const m = rigourOf(decisionOf(id));
      for (const t of TECHNIQUES) {
        const saving = gridMinimum(m).total - gridMinimum({ ...m, undo: m.undo * t.factor }).total;
        const row = techniqueRow(m, t);
        expect(row.saving, `${id} ${t.id}`).toBeCloseTo(saving, 3);
        expect(row.pays).toBe(saving > t.setup);
      }
    }
  });

  it('on the database decision the adapter layer, expand then contract and the time-boxed contract do not pay at tau 10, and the feature flag and pilot do; tau 20 makes the adapter layer pay', () => {
    expect(techniqueRows(database).map((r) => [r.technique.id, r.pays])).toEqual([['flag', true], ['adapter', false], ['expand', false], ['pilot', true], ['timebox', false]]);
    expect(techniqueRow({ ...database, tau: 20 }, techniqueOf('adapter')).pays).toBe(true);
  });

  it('on a decision that is already decide-now no technique pays, the saving being p0 * C * (1 - factor)', () => {
    for (const t of TECHNIQUES) {
      const row = techniqueRow(rename, t);
      expect(row.pays).toBe(false);
      expect(row.saving).toBeCloseTo(0.3 * (1 - t.factor), 12);
    }
  });
});

describe('the ten decisions', () => {
  it('has the spec\'s (C, p0) pairs', () => {
    expect(DECISIONS.map((d) => [d.id, d.undo, d.p0])).toEqual([
      ['rename', 1, 0.3], ['css', 8, 0.4], ['flags', 20, 0.4], ['fields', 150, 0.3], ['database', 800, 0.35],
      ['contract', 1200, 0.4], ['deletion', 3000, 0.2], ['abtest', 2, 0.5], ['schema', 400, 0.35], ['oncall', 5, 0.4],
    ]);
  });

  it('the reference cells follow the two named cut-offs (25 hours, p0 of 0.35)', () => {
    expect(COSTLY_UNDO_HOURS).toBe(25);
    expect(UNSURE_P0).toBe(0.35);
    expect(REFERENCE).toEqual({
      rename: 'cheap-right', css: 'cheap-unsure', flags: 'cheap-unsure', fields: 'costly-right', database: 'costly-unsure',
      contract: 'costly-unsure', deletion: 'costly-right', abtest: 'cheap-unsure', schema: 'costly-unsure', oncall: 'cheap-unsure',
    });
    expect(cellOf({ id: 'x', short: 'x', label: 'x', undo: 25, p0: 0.34 })).toBe('costly-right');
  });

  it('rigour pays for exactly five of the ten, and the cheap/costly cut agrees with decide-now on these ten (the second axis changes the hours, not the side)', () => {
    const rows = revealRows();
    expect(rows.filter((r) => r.hours > 0).map((r) => r.id)).toEqual(['fields', 'database', 'contract', 'deletion', 'schema']);
    expect(deliberateCount()).toBe(5);
    for (const d of DECISIONS) expect(REFERENCE[d.id].startsWith('costly'), d.id).toBe(optimalHours(rigourOf(d)) > 0);
  });

  it('reveals the crossover, best hours and both totals per decision (hand-worked at tau 10, w 1)', () => {
    const byId = Object.fromEntries(revealRows().map((r) => [r.id, r]));
    expect(byId.database.crossover).toBeCloseTo(10 / 0.35, 12);
    expect(byId.database.hours).toBeCloseTo(33.32, 2);
    expect(byId.database.atOptimum).toBeCloseTo(43.32, 2);
    expect(byId.database.atZero).toBe(280);
    expect(byId.deletion.hours).toBeCloseTo(10 * Math.log(60), 9);
    expect(byId.abtest.crossover).toBeCloseTo(20, 12);
    expect(byId.abtest.atZero).toBe(1);
  });
});
