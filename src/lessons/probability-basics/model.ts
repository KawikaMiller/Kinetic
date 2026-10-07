// Pure maths for probability-basics: the dice sample space and its events (exact counts,
// never floats), seeded rolls and their convergence, independent and correlated replica
// failures, and a flaky test suite.
import { power } from '../../core/format';
import { mulberry32, randInt, type Rnd } from '../../core/random';

// ── Sample space ─────────────────────────────────────────────────────

export type Dice = 1 | 2;
export const FACES = 6;

/** Every outcome, as faces. Two dice are row-major: outcome index = 6 × (first − 1) + (second − 1). */
export function outcomes(dice: Dice): number[][] {
  if (dice === 1) return Array.from({ length: FACES }, (_, i) => [i + 1]);
  return Array.from({ length: FACES * FACES }, (_, i) => [Math.floor(i / FACES) + 1, (i % FACES) + 1]);
}

export const spaceSize = (dice: Dice) => FACES ** dice;

/** Where an outcome sits in the sample-space grid: one row for one die, first die = row for two. */
export const outcomeCell = (dice: Dice, outcome: number) => ({ r: dice === 2 ? Math.floor(outcome / FACES) : 0, c: outcome % FACES });

export interface EventDef {
  id: string;
  label: string;
  test: (faces: readonly number[]) => boolean;
}

const sum = (f: readonly number[]) => f.reduce((a, b) => a + b, 0);

export const EVENTS: Record<Dice, readonly EventDef[]> = {
  1: [
    { id: 'even', label: 'even', test: ([a]) => a % 2 === 0 },
    { id: 'five-up', label: '5 or more', test: ([a]) => a >= 5 },
    { id: 'six', label: 'a 6', test: ([a]) => a === 6 },
    { id: 'low', label: '3 or less', test: ([a]) => a <= 3 },
  ],
  2: [
    { id: 'sum7', label: 'sum = 7', test: (f) => sum(f) === 7 },
    { id: 'double', label: 'a double', test: ([a, b]) => a === b },
    { id: 'any6', label: 'at least one 6', test: (f) => f.includes(6) },
    { id: 'sum10', label: 'sum ≥ 10', test: (f) => sum(f) >= 10 },
    { id: 'first-even', label: 'first die even', test: ([a]) => a % 2 === 0 },
  ],
};

export const eventDef = (dice: Dice, id: string) => EVENTS[dice].find((e) => e.id === id);

/** The outcome indices where the event happens. */
export function eventSet(dice: Dice, def: EventDef): Set<number> {
  const s = new Set<number>();
  outcomes(dice).forEach((f, i) => {
    if (def.test(f)) s.add(i);
  });
  return s;
}

export const intersect = (a: ReadonlySet<number>, b: ReadonlySet<number>) => new Set([...a].filter((x) => b.has(x)));
export const union = (a: ReadonlySet<number>, b: ReadonlySet<number>) => new Set([...a, ...b]);

/** A probability as favourable / total outcomes, kept as whole numbers. */
export interface Frac {
  num: number;
  den: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** "6/36 = 1/6", or just "0/36" / "36/36" when it doesn't reduce. */
export function fracText({ num, den }: Frac): string {
  const g = gcd(num, den);
  return g > 1 && num > 0 ? `${num}/${den} = ${num / g}/${den / g}` : `${num}/${den}`;
}

export interface Rules {
  a: number;
  b: number;
  both: number;
  either: number;
  total: number;
  /** P(A ∩ B) = P(A)·P(B), checked as |A∩B|·total = |A|·|B| on whole numbers. */
  independent: boolean;
}

/** The counts behind every rule on screen, straight from the sets. */
export function rules(a: ReadonlySet<number>, b: ReadonlySet<number>, total: number): Rules {
  const both = intersect(a, b).size;
  return { a: a.size, b: b.size, both, either: union(a, b).size, total, independent: both * total === a.size * b.size };
}

// ── Rolling ──────────────────────────────────────────────────────────

/** Outcome indices of `count` seeded rolls, continuing from `rnd`. */
export function roll(rnd: Rnd, dice: Dice, count: number): number[] {
  return Array.from({ length: count }, () => {
    const first = randInt(1, FACES, rnd);
    return dice === 1 ? first - 1 : (first - 1) * FACES + randInt(1, FACES, rnd) - 1;
  });
}

/** The first `count` rolls for a seed: the sequence is a pure function of (seed, how many). */
export function rollsFor(seed: number, dice: Dice, count: number): number[] {
  return roll(mulberry32(seed), dice, count);
}

const PER_DECADE = 40;

/** Roll counts where the convergence line gets a point: every roll to 10, then ~40 per decade. */
export function checkpoints(n: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= Math.min(n, 10); k++) out.push(k);
  for (let e = 1; ; e++) {
    const k = Math.round(10 ** (1 + e / PER_DECADE));
    if (k > n) break;
    if (k > out[out.length - 1]) out.push(k);
  }
  if (n > 0 && out[out.length - 1] !== n) out.push(n);
  return out;
}

/** The event's running frequency at each checkpoint: [rolls, frequency]. */
export function convergence(rolls: readonly number[], event: ReadonlySet<number>): [number, number][] {
  const marks = new Set(checkpoints(rolls.length));
  const out: [number, number][] = [];
  let hits = 0;
  rolls.forEach((o, i) => {
    if (event.has(o)) hits++;
    if (marks.has(i + 1)) out.push([i + 1, hits / (i + 1)]);
  });
  return out;
}

export const hitsOf = (rolls: readonly number[], event: ReadonlySet<number>) => rolls.reduce((n, o) => n + (event.has(o) ? 1 : 0), 0);

/** The value the bar chart counts: the face for one die, the sum for two. */
export const totalOf = (dice: Dice, outcome: number) => sum(outcomes(dice)[outcome]);

/** Possible totals and how many outcomes give each: the exact distribution. */
export function totals(dice: Dice): { value: number; ways: number }[] {
  const ways = new Map<number, number>();
  for (const f of outcomes(dice)) ways.set(sum(f), (ways.get(sum(f)) ?? 0) + 1);
  return [...ways].sort((x, y) => x[0] - y[0]).map(([value, w]) => ({ value, ways: w }));
}

// ── Replicas ─────────────────────────────────────────────────────────

/** Illustrative: the chance the shared rack (power, switch) is down, taking every replica with it. */
export const RACK_DOWN = 0.001;

/** P(every replica down) and P(at least one down), each replica down with probability p. */
export function replicaRisk(n: number, p: number, correlated: boolean): { allDown: number; anyDown: number } {
  const allIndependent = p ** n;
  const anyIndependent = 1 - (1 - p) ** n;
  if (!correlated) return { allDown: allIndependent, anyDown: anyIndependent };
  // The rack is down with probability RACK_DOWN (everything is down); otherwise replicas fail independently.
  return {
    allDown: RACK_DOWN + (1 - RACK_DOWN) * allIndependent,
    anyDown: RACK_DOWN + (1 - RACK_DOWN) * anyIndependent,
  };
}

/** Availability targets and the P(all down) each one allows. */
export const SLOS = [
  { id: '3', label: '99.9%', budget: 1e-3 },
  { id: '4', label: '99.99%', budget: 1e-4 },
  { id: '5', label: '99.999%', budget: 1e-5 },
] as const;

// ── Flaky suite ──────────────────────────────────────────────────────

/** P(at least one of n tests fails), each flaky with probability f, independently. */
export const suiteRed = (n: number, f: number) => 1 - (1 - f) ** n;

/** One seeded suite run: which tests failed. */
export const runSuite = (rnd: Rnd, n: number, f: number) => Array.from({ length: n }, () => rnd() < f);

// ── Formatting ───────────────────────────────────────────────────────

/** A probability for people: "2.97%" down to 0.01%, then "1.0 × 10⁻⁶"; exactly 0 is "0%". */
export function chance(p: number): string {
  if (p === 0) return '0%';
  if (p >= 1e-4) return `${trimZeros((p * 100).toFixed(p >= 0.1 ? 1 : 2))}%`;
  const e = Math.floor(Math.log10(p));
  const m = p / 10 ** e;
  return `${m.toFixed(1)} × ${power(e, 10)}`;
}

const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
