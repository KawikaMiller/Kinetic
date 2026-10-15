/**
 * The interest model of scene 1: a toy, shown in full on screen. A team has a fixed capacity
 * each sprint. Debt is the points of principal it would cost to fix; every point of it taxes
 * the next sprint's velocity (the interest); shortcuts add principal and buy speed today;
 * paydown spends capacity to remove principal. Pure functions, no React.
 */

/** Points of work the team can do in a sprint with no debt and no paydown. */
export const CAPACITY = 100;
/** The longest horizon the lesson plots, in sprints. */
export const SPRINTS = 24;
/** The horizons the learner may pick. Never zero. */
export const HORIZONS = [6, 12, SPRINTS] as const;
/** Debt stock at the start, in points of principal. */
export const INITIAL_DEBT = 100;
/**
 * Points of work one point of shortcut skips this sprint. Without it a shortcut would be pure
 * cost and the model a straw man: a shortcut buys exactly the work it avoids, and leaves that
 * work behind as principal.
 */
export const SHORTCUT_SAVING = 1;
/** "Rush when behind": a sprint whose planned velocity is under this triggers extra shortcuts. */
export const TARGET_VELOCITY = 90;
/** The extra shortcut points a rushing team adds in such a sprint. */
export const RUSH_EXTRA = 10;

/** Slider ranges (named so the UI and the tests agree). */
export const RATE_MAX = 0.15;
export const SHORTCUT_MAX = 30;
export const PAYDOWN_MAX = 0.4;

export interface Plan {
  /** Interest per sprint: the share of capacity each point of debt costs. */
  rate: number;
  /** Shortcut points added each sprint. */
  shortcuts: number;
  /** Share of capacity spent on paying debt down. */
  paydownShare: number;
  /** Add RUSH_EXTRA shortcuts in any sprint whose planned velocity is under TARGET_VELOCITY. */
  rush: boolean;
}

/** What the lesson opens with: a modest interest rate, a few shortcuts, a steady paydown. */
export const DEFAULT_PLAN: Plan = { rate: 0.1, shortcuts: 5, paydownShare: 0.15, rush: false };

export interface Sprint {
  /** 0-based sprint number. */
  t: number;
  /** Debt at the start of the sprint. */
  debt: number;
  paydown: number;
  /** Shortcut points taken this sprint, rush included. */
  shortcuts: number;
  rushed: boolean;
  /** Features delivered this sprint. */
  velocity: number;
  /** Features delivered up to and including this sprint. */
  cumulative: number;
  /** Debt at the end of the sprint (the next one's start). */
  debtAfter: number;
}

/** Run a plan for `sprints` sprints from `INITIAL_DEBT`. */
export function simulate(plan: Plan, sprints: number = SPRINTS): Sprint[] {
  const out: Sprint[] = [];
  let debt = INITIAL_DEBT;
  let cumulative = 0;
  for (let t = 0; t < sprints; t++) {
    const paydown = Math.min(debt, plan.paydownShare * CAPACITY);
    const planned = CAPACITY + SHORTCUT_SAVING * plan.shortcuts - plan.rate * debt - paydown;
    const rushed = plan.rush && planned < TARGET_VELOCITY;
    const shortcuts = plan.shortcuts + (rushed ? RUSH_EXTRA : 0);
    const velocity = Math.max(0, CAPACITY + SHORTCUT_SAVING * shortcuts - plan.rate * debt - paydown);
    cumulative += velocity;
    const debtAfter = Math.max(0, debt + shortcuts - paydown);
    out.push({ t, debt, paydown, shortcuts, rushed, velocity, cumulative, debtAfter });
    debt = debtAfter;
  }
  return out;
}

/** The same team with the same habits and no paydown at all: the baseline the plan must beat. */
export const withoutPaydown = (plan: Plan): Plan => ({ ...plan, paydownShare: 0 });

/**
 * The first sprint count (1-based) at which the plan's cumulative features are strictly more
 * than the no-paydown baseline's, or null if that never happens within `horizon` sprints.
 */
export function breakEvenSprint(plan: Plan, horizon: number = SPRINTS): number | null {
  const paying = simulate(plan, horizon);
  const baseline = simulate(withoutPaydown(plan), horizon);
  const i = paying.findIndex((s, k) => s.cumulative > baseline[k].cumulative);
  return i < 0 ? null : i + 1;
}

export interface Outcome {
  paying: Sprint[];
  baseline: Sprint[];
  breakEven: number | null;
  /** Cumulative features at the horizon, with and without paydown. */
  total: number;
  baselineTotal: number;
  /** Debt after the last sprint, with and without paydown. */
  finalDebt: number;
  baselineFinalDebt: number;
  /** Sprints in which a rushing team took extra shortcuts. */
  rushedSprints: number;
}

/** Everything the scene shows, for one plan and horizon. */
export function outcome(plan: Plan, horizon: number = SPRINTS): Outcome {
  const paying = simulate(plan, horizon);
  const baseline = simulate(withoutPaydown(plan), horizon);
  const last = (xs: Sprint[]) => xs[xs.length - 1];
  return {
    paying,
    baseline,
    breakEven: breakEvenSprint(plan, horizon),
    total: last(paying).cumulative,
    baselineTotal: last(baseline).cumulative,
    finalDebt: last(paying).debtAfter,
    baselineFinalDebt: last(baseline).debtAfter,
    rushedSprints: paying.filter((s) => s.rushed).length,
  };
}
