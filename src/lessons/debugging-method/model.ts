// Pure logic for debugging-method: an order-pricing pipeline with one buggy component,
// probes that reveal a value between components, the bisection that finds the culprit
// in ceil(log2 N) probes, and git bisect over a commit history.

import { hash32 } from '../../core/hash';

// ── The pipeline ──────────────────────────────────────────────────────

export interface Order {
  /** Unit price: dollars until normalize, cents after. */
  unit: number;
  qty: number;
  /** Running total in cents, from price onwards. */
  total: number;
  /** The formatted result, set by the last component. */
  text: string;
}

type Step = (o: Order) => Order;

export const COMPONENTS = ['parse', 'validate', 'normalize', 'price', 'discount', 'tax', 'round', 'format'] as const;
export type Component = (typeof COMPONENTS)[number];

export const INPUT = '19.99 x 3';
export const OTHER_INPUT = '2.99 x 1';

const DISCOUNT = 0.9;
const TAX = 1.08;
const START: Order = { unit: 0, qty: 0, total: 0, text: '' };

function parseOrder(input: string, unitDigits = Infinity): Order {
  const [price, qty] = input.split(' x ');
  return { ...START, unit: Number(price.slice(0, unitDigits)), qty: Number(qty) };
}
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What each component is supposed to do. */
const CORRECT: Record<Component, Step> = {
  parse: (o) => o, // parse is applied to the input string, see runPipeline
  validate: (o) => o,
  normalize: (o) => ({ ...o, unit: Math.round(o.unit * 100) }),
  price: (o) => ({ ...o, total: o.unit * o.qty }),
  discount: (o) => ({ ...o, total: o.total * DISCOUNT }),
  tax: (o) => ({ ...o, total: o.total * TAX }),
  round: (o) => ({ ...o, total: Math.round(o.total) }),
  format: (o) => ({ ...o, text: dollars(o.total) }),
};

/** One plausible bug per component; exactly one is active at a time. */
export const BUGS: Record<Component, { what: string; step: Step }> = {
  parse: { what: 'parse drops the last digit of the price (19.99 → 19.9)', step: (o) => o },
  validate: { what: 'validate clamps every quantity to 1', step: (o) => ({ ...o, qty: 1 }) },
  normalize: { what: 'normalize multiplies by 10, not 100', step: (o) => ({ ...o, unit: o.unit * 10 }) },
  price: { what: 'price adds the quantity instead of multiplying', step: (o) => ({ ...o, total: o.unit + o.qty }) },
  discount: { what: 'discount applies the 10% twice', step: (o) => ({ ...o, total: o.total * DISCOUNT * DISCOUNT }) },
  tax: { what: 'tax adds 8 cents instead of 8%', step: (o) => ({ ...o, total: o.total + 8 }) },
  round: { what: 'round truncates to whole dollars', step: (o) => ({ ...o, total: Math.floor(o.total / 100) * 100 }) },
  format: { what: 'format forgets the decimal point', step: (o) => ({ ...o, text: `$${Math.round(o.total)}` }) },
};

/** Index of the buggy component, or null for a healthy pipeline. */
export type Fault = number | null;

/**
 * Run the pipeline on `input`, returning the value after every component.
 * `patch` swaps one component's implementation (used by the two-changes trap).
 */
export function runPipeline(fault: Fault, input = INPUT, patch: Partial<Record<Component, Step>> = {}): Order[] {
  const out: Order[] = [];
  let o = fault === 0 ? parseOrder(input, input.indexOf('.') + 2) : parseOrder(input);
  COMPONENTS.forEach((c, i) => {
    if (i > 0) o = (patch[c] ?? (i === fault ? BUGS[c].step : CORRECT[c]))(o);
    out.push(o);
  });
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
export const sameOrder = (a: Order, b: Order) => close(a.unit, b.unit) && a.qty === b.qty && close(a.total, b.total) && a.text === b.text;

/** How the value after component i looks on a probe. */
/** Two decimals at most, so float noise (199.89999999999998) never reads as a second bug. */
const cents = (v: number) => Math.round(v * 100) / 100;

export function showValue(o: Order, i: number): string {
  if (i === COMPONENTS.length - 1) return o.text;
  if (i < 2) return `${o.unit} × ${o.qty}`;
  if (i === 2) return `${cents(o.unit)}¢ × ${o.qty}`;
  return `${cents(o.total)}¢`;
}

/** A probe after component i: the value there, and whether it's what a healthy pipeline gives. */
export function probe(fault: Fault, i: number) {
  const value = runPipeline(fault)[i];
  return { value, ok: sameOrder(value, runPipeline(null)[i]) };
}

export const EXPECTED = runPipeline(null).at(-1)!.text;

// ── Bisection over the components ─────────────────────────────────────

/** Components that could still hold the bug: the input is fine and the output is wrong. */
export interface Suspects {
  lo: number;
  hi: number;
}

export const ALL_SUSPECTS: Suspects = { lo: 0, hi: COMPONENTS.length - 1 };

/** Narrow the suspects with a probe after component i. Probes outside the range teach nothing. */
export function narrow(s: Suspects, i: number, ok: boolean): Suspects {
  if (i < s.lo || i >= s.hi) return s;
  return ok ? { lo: i + 1, hi: s.hi } : { lo: s.lo, hi: i };
}

/** The probe that halves the suspects. */
export const midProbe = (s: Suspects) => Math.floor((s.lo + s.hi) / 2);

/** The most probes bisection ever needs for n suspects. */
export const optimalProbes = (n: number) => Math.ceil(Math.log2(n));

/** Bisect a range of n components with a hidden fault: the probes it takes and the culprit it names. */
export function bisectComponents(n: number, isOkAfter: (i: number) => boolean): { probes: number; culprit: number } {
  let s: Suspects = { lo: 0, hi: n - 1 };
  let probes = 0;
  while (s.lo < s.hi) {
    const m = midProbe(s);
    s = narrow(s, m, isOkAfter(m));
    probes++;
  }
  return { probes, culprit: s.lo };
}

// ── git bisect ────────────────────────────────────────────────────────

export const COMMIT_COUNT = 16;
/** A short, distinct-looking fake hash per commit (the mixed hash, so neighbours don't share a prefix). */
export const commitHash = (i: number) => hash32(`commit-${i}`).toString(16).padStart(8, '0').slice(0, 4);

/** Known-good and known-bad commits; the first bad commit is somewhere in (good, bad]. */
export interface BisectState {
  good: number;
  bad: number;
}

export const START_BISECT: BisectState = { good: 0, bad: COMMIT_COUNT - 1 };

/** The commit git checks out next: halfway between good and bad. */
export const nextCommit = (s: BisectState) => Math.floor((s.good + s.bad) / 2);
export const bisectDone = (s: BisectState) => s.bad - s.good === 1;

/** Mark the checked-out commit good or bad. */
export function markCommit(s: BisectState, mark: 'good' | 'bad'): BisectState {
  const c = nextCommit(s);
  return mark === 'good' ? { good: c, bad: s.bad } : { good: s.good, bad: c };
}

/** Run git bisect honestly over n commits whose first bad one is `firstBad`. */
export function runBisect(n: number, firstBad: number): { steps: number; blamed: number } {
  let s: BisectState = { good: 0, bad: n - 1 };
  let steps = 0;
  while (!bisectDone(s)) {
    s = markCommit(s, nextCommit(s) >= firstBad ? 'bad' : 'good');
    steps++;
  }
  return { steps, blamed: s.bad };
}
