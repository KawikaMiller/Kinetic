import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  CAPACITY, DEFAULT_PLAN, HORIZONS, INITIAL_DEBT, PAYDOWN_MAX, RATE_MAX, RUSH_EXTRA, SHORTCUT_MAX, SHORTCUT_SAVING, SPRINTS, TARGET_VELOCITY,
  breakEvenSprint, outcome, simulate, type Plan,
} from './model';

const randomPlan = (rnd: () => number, rush = false): Plan => ({
  rate: Math.round(rnd() * RATE_MAX * 100) / 100,
  shortcuts: Math.floor(rnd() * (SHORTCUT_MAX + 1)),
  paydownShare: Math.round((rnd() * PAYDOWN_MAX) / 0.05) * 0.05,
  rush,
});
const plans = (n: number, rush = false) => {
  const rnd = mulberry32(2026);
  return Array.from({ length: n }, () => randomPlan(rnd, rush));
};

/** Independent reference: the same story told with arrays of per-sprint totals instead of the model's loop. */
function reference(plan: Plan, sprints: number) {
  const debt: number[] = [INITIAL_DEBT];
  const velocity: number[] = [];
  for (let t = 0; t < sprints; t++) {
    const pay = Math.min(debt[t], plan.paydownShare * CAPACITY);
    const base = CAPACITY - plan.rate * debt[t] - pay;
    const rush = plan.rush && base + SHORTCUT_SAVING * plan.shortcuts < TARGET_VELOCITY ? RUSH_EXTRA : 0;
    const s = plan.shortcuts + rush;
    velocity.push(Math.max(0, base + SHORTCUT_SAVING * s));
    debt.push(Math.max(0, debt[t] + s - pay));
  }
  const cumulative = velocity.map((_, t) => velocity.slice(0, t + 1).reduce((a, b) => a + b, 0));
  return { debt, velocity, cumulative };
}

/** Closed form for constant shortcuts, no paydown, no rush: v_t = a - b t, floored at 0, summed over t < T. */
function closedFormCumulative(plan: Plan, sprints: number): number {
  const a = CAPACITY + SHORTCUT_SAVING * plan.shortcuts - plan.rate * INITIAL_DEBT;
  const b = plan.rate * plan.shortcuts;
  if (a <= 0) return 0;
  const positive = b === 0 ? sprints : Math.min(sprints, Math.floor(a / b) + 1);
  return positive * a - (b * positive * (positive - 1)) / 2;
}

describe('the debt model against a closed form', () => {
  it('has debt D0 + s t and the closed-form cumulative features when s is constant and nothing is paid, for 1,000 seeded plans', () => {
    for (const p of plans(1000)) {
      const plan = { ...p, paydownShare: 0 };
      const run = simulate(plan);
      run.forEach((sprint) => expect(sprint.debt).toBeCloseTo(INITIAL_DEBT + plan.shortcuts * sprint.t, 9));
      expect(run[SPRINTS - 1].cumulative).toBeCloseTo(closedFormCumulative(plan, SPRINTS), 6);
    }
  });

  it('agrees with the independent array reference for 1,000 seeded plans, steady and rushing', () => {
    for (const rush of [false, true]) {
      for (const plan of plans(1000, rush)) {
        const run = simulate(plan);
        const ref = reference(plan, SPRINTS);
        run.forEach((s, t) => {
          expect(s.velocity).toBeCloseTo(ref.velocity[t], 9);
          expect(s.cumulative).toBeCloseTo(ref.cumulative[t], 7);
          expect(s.debtAfter).toBeCloseTo(ref.debt[t + 1], 9);
        });
      }
    }
  });

  it('holds debt and velocity at or above zero, and paydown within capacity and debt, on every sprint of 1,000 seeded plans', () => {
    for (const rush of [false, true]) {
      for (const plan of plans(1000, rush)) {
        for (const s of simulate(plan)) {
          expect(s.debt).toBeGreaterThanOrEqual(0);
          expect(s.debtAfter).toBeGreaterThanOrEqual(0);
          expect(s.velocity).toBeGreaterThanOrEqual(0);
          expect(s.paydown).toBeLessThanOrEqual(Math.min(s.debt, plan.paydownShare * CAPACITY) + 1e-12);
        }
      }
    }
  });

  it('never raises debt at any sprint when the plan pays down more, when the team is steady', () => {
    for (const plan of plans(1000)) {
      const more = { ...plan, paydownShare: plan.paydownShare + 0.05 };
      const a = simulate(plan);
      const b = simulate(more);
      a.forEach((s, t) => expect(b[t].debtAfter).toBeLessThanOrEqual(s.debtAfter + 1e-9));
    }
  });

  it('gives a constant velocity of capacity minus interest on the opening debt when nothing is added or paid', () => {
    for (const rate of [0, 0.01, 0.05, 0.1, RATE_MAX]) {
      const run = simulate({ rate, shortcuts: 0, paydownShare: 0, rush: false });
      const expected = Math.max(0, CAPACITY - rate * INITIAL_DEBT);
      run.forEach((s) => expect(s.velocity).toBeCloseTo(expected, 9));
    }
  });

  it('pays the whole debt off and stops paying once there is none left', () => {
    const run = simulate({ rate: 0.1, shortcuts: 0, paydownShare: PAYDOWN_MAX, rush: false });
    expect(run[2].paydown).toBeCloseTo(INITIAL_DEBT - 2 * PAYDOWN_MAX * CAPACITY, 9);
    expect(run[3].debt).toBe(0);
    expect(run[3].paydown).toBe(0);
    expect(run[3].velocity).toBe(CAPACITY);
  });
});

describe('break-even', () => {
  /** Independent scan: the first sprint count at which the plan's running total beats the no-paydown plan's. */
  function scan(plan: Plan, horizon: number): number | null {
    const withPay = reference(plan, horizon).cumulative;
    const without = reference({ ...plan, paydownShare: 0 }, horizon).cumulative;
    for (let n = 1; n <= horizon; n++) if (withPay[n - 1] > without[n - 1]) return n;
    return null;
  }

  it('equals a brute-force scan for 1,000 seeded plans at every horizon, steady and rushing', () => {
    for (const rush of [false, true]) {
      for (const plan of plans(1000, rush)) {
        for (const h of HORIZONS) expect(breakEvenSprint(plan, h)).toBe(scan(plan, h));
      }
    }
  });

  it('is null when nothing is paid down: the plan is the baseline', () => {
    expect(breakEvenSprint({ ...DEFAULT_PLAN, paydownShare: 0 })).toBeNull();
  });

  it('exists at the default plan and is the same whichever way you look for it', () => {
    const n = breakEvenSprint(DEFAULT_PLAN);
    expect(n).not.toBeNull();
    expect(n).toBe(scan(DEFAULT_PLAN, SPRINTS));
  });
});

describe('the try-this prompts', () => {
  it('try-this 1: at 1% interest the default plan never breaks even within 24 sprints, and at 10% it does', () => {
    expect(breakEvenSprint(DEFAULT_PLAN)).not.toBeNull();
    const o = outcome({ ...DEFAULT_PLAN, rate: 0.01 });
    expect(o.breakEven).toBeNull();
    expect(o.total).toBeLessThan(o.baselineTotal);
  });

  it('try-this 2: the 12-sprint horizon hides the default break-even, and 24 brings it back', () => {
    expect(breakEvenSprint(DEFAULT_PLAN, 12)).toBeNull();
    const full = breakEvenSprint(DEFAULT_PLAN, 24);
    expect(full).not.toBeNull();
    expect(full as number).toBeGreaterThan(12);
  });

  it('try-this 3: rushing at the default plan ends with more debt and no overtaking', () => {
    const steady = outcome(DEFAULT_PLAN);
    const rushing = outcome({ ...DEFAULT_PLAN, rush: true });
    expect(rushing.rushedSprints).toBeGreaterThan(0);
    expect(rushing.finalDebt).toBeGreaterThan(steady.finalDebt);
    expect(rushing.breakEven).toBeNull();
  });
});

describe('the toggle changes the trajectory', () => {
  it('rushing differs from steady at the default plan, in debt and in features', () => {
    const a = simulate(DEFAULT_PLAN);
    const b = simulate({ ...DEFAULT_PLAN, rush: true });
    expect(b[SPRINTS - 1].debtAfter).not.toBeCloseTo(a[SPRINTS - 1].debtAfter, 3);
    expect(b[SPRINTS - 1].cumulative).not.toBeCloseTo(a[SPRINTS - 1].cumulative, 3);
  });

  it('rushes only in sprints whose planned velocity is under the target', () => {
    for (const plan of plans(200, true)) {
      for (const s of simulate(plan)) {
        const planned = CAPACITY + SHORTCUT_SAVING * plan.shortcuts - plan.rate * s.debt - s.paydown;
        expect(s.rushed).toBe(planned < TARGET_VELOCITY);
      }
    }
  });
});
