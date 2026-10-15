/**
 * Scene 2: price your debt. A register of invented items, each with a fix cost and two
 * estimates the learner can move. Interest is only paid where the team works.
 */

/** Working days in a week, to turn engineer-days into weeks. */
export const WORKDAYS_PER_WEEK = 5;
/** Months in a quarter. */
export const MONTHS_PER_QUARTER = 3;

export interface Item {
  id: string;
  name: string;
  /** Days to fix it once. */
  fixDays: number;
  /** How often the team works in this code, per month (the learner's estimate). */
  touches: number;
  /** Extra days lost each time it does (the learner's estimate). */
  extraDays: number;
}

/** The six invented items and their opening estimates. */
export const ITEMS: readonly Item[] = [
  { id: 'validation', name: 'Validation copied into four services', fixDays: 8, touches: 4, extraDays: 1 },
  { id: 'billing', name: 'No integration tests around billing', fixDays: 15, touches: 6, extraDays: 0.5 },
  { id: 'deploy', name: 'Hand-run deploy script with manual steps', fixDays: 10, touches: 12, extraDays: 0.25 },
  { id: 'order', name: 'Order module: one 3,000-line class', fixDays: 40, touches: 3, extraDays: 3 },
  { id: 'build', name: 'Slow local build, 12 minutes', fixDays: 25, touches: 30, extraDays: 0.1 },
  { id: 'report', name: 'Report generator nobody has edited in years', fixDays: 12, touches: 0, extraDays: 4 },
];

/** Estimate ranges for the sliders. */
export const TOUCHES_MAX = 40;
export const EXTRA_DAYS_MAX = 5;
export const EXTRA_DAYS_STEP = 0.25;
/** Horizon slider, in months. */
export const HORIZON_MIN = 3;
export const HORIZON_MAX = 36;
export const DEFAULT_HORIZON = 12;

/** Days lost every month to this item: touches times extra days per touch. */
export const monthlyInterest = (i: Pick<Item, 'touches' | 'extraDays'>) => i.touches * i.extraDays;

/** Months until fixing it pays for itself, or Infinity when nobody pays the interest. */
export function paybackMonths(i: Item): number {
  const interest = monthlyInterest(i);
  return interest > 0 ? i.fixDays / interest : Infinity;
}

/** "never" for an item with no interest, else months to one decimal. */
export function paybackText(months: number): string {
  return Number.isFinite(months) ? `${(Math.round(months * 10) / 10).toFixed(1)} months` : 'never';
}

/** Items best first by the key (ties keep register order), as new objects with their index. */
function rank(items: readonly Item[], key: (i: Item) => number, ascending: boolean): Item[] {
  return items
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((a, b) => (a.k === b.k ? a.index - b.index : ascending ? a.k - b.k : b.k - a.k))
    .map((x) => x.item);
}

/** Best return first: the shortest payback leads, "never" is last. */
export const byPayback = (items: readonly Item[]) => rank(items, paybackMonths, true);
/** Biggest pain first: the most days lost a month leads. */
export const byInterest = (items: readonly Item[]) => rank(items, monthlyInterest, false);

/** An item whose payback is beyond the horizon (or never) is labelled "leave it". */
export const leaveIt = (i: Item, horizonMonths: number) => paybackMonths(i) > horizonMonths;

export interface BusinessTerms {
  /** Engineering weeks lost to interest in a quarter, across the whole register. */
  weeksLostPerQuarter: number;
  /** The items worth fixing within the horizon, best return first. */
  worth: Item[];
  fixDays: number;
  /** Days a month those items would stop costing. */
  savedPerMonth: number;
  /** Months for the worth-fixing set to pay for itself, or null when the set is empty. */
  paysBackMonths: number | null;
}

/** The learner's estimates, said the way a manager hears them. */
export function businessTerms(items: readonly Item[], horizonMonths: number): BusinessTerms {
  const lostPerMonth = items.reduce((sum, i) => sum + monthlyInterest(i), 0);
  const worth = byPayback(items).filter((i) => !leaveIt(i, horizonMonths));
  const fixDays = worth.reduce((sum, i) => sum + i.fixDays, 0);
  const savedPerMonth = worth.reduce((sum, i) => sum + monthlyInterest(i), 0);
  return {
    weeksLostPerQuarter: (lostPerMonth * MONTHS_PER_QUARTER) / WORKDAYS_PER_WEEK,
    worth,
    fixDays,
    savedPerMonth,
    paysBackMonths: savedPerMonth > 0 ? fixDays / savedPerMonth : null,
  };
}
