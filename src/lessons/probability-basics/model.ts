// Pure maths for probability-basics: the dice sample space and its events (exact counts,
// never floats), seeded rolls and their convergence, independent and correlated replica
// failures, and a flaky test suite.
import { power } from '../../core/format';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { logCheckpoints } from '../../core/stats';

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

/** The event's running frequency at each checkpoint: [rolls, frequency]. */
export function convergence(rolls: readonly number[], event: ReadonlySet<number>): [number, number][] {
  const marks = new Set(logCheckpoints(rolls.length));
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

/**
 * A replica's own failure rate outside rack outages, chosen so that each replica is still down
 * p of the time overall: p = R + (1 − R)·q. Below the rack's rate that's impossible (the rack
 * alone takes it down R of the time), so q is 0 and the replica is down R of the time.
 */
export const ownRate = (p: number) => Math.max(0, (p - RACK_DOWN) / (1 - RACK_DOWN));

/** How often one replica is down: p when independent; max(p, rack) when sharing the rack. */
export const replicaDown = (p: number, correlated: boolean) => (correlated ? RACK_DOWN + (1 - RACK_DOWN) * ownRate(p) : p);

/**
 * P(every replica down) and P(at least one down), each replica down p of the time. Correlated:
 * the rack is down R of the time (everything is down); otherwise replicas fail independently at
 * their own rate q, so each replica's overall rate is unchanged.
 */
export function replicaRisk(n: number, p: number, correlated: boolean): { allDown: number; anyDown: number } {
  if (!correlated) return { allDown: p ** n, anyDown: 1 - (1 - p) ** n };
  const q = ownRate(p);
  return {
    allDown: RACK_DOWN + (1 - RACK_DOWN) * q ** n,
    anyDown: RACK_DOWN + (1 - RACK_DOWN) * (1 - (1 - q) ** n),
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

/** Most significant figures `distinct` will use before giving up. */
const MAX_SIG = 8;
const SCI_BELOW = 1e-4;
const NINES_ABOVE = 0.99;

/**
 * A probability for people, to `sig` significant figures: "2.97%", "0.0125%", then
 * "1.0 × 10⁻⁶" below 0.01%. Near 1 it keeps enough nines never to show 100% for less than
 * certain: 1 − 10⁻⁶ is "99.9999%". Exactly 0 is "0%" and exactly 1 is "100%".
 */
export function chance(p: number, sig = 3): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < SCI_BELOW) {
    let e = Math.floor(Math.log10(p));
    let m = (p / 10 ** e).toFixed(Math.max(1, sig - 2));
    if (Number(m) >= 10) {
      e += 1;
      m = (p / 10 ** e).toFixed(Math.max(1, sig - 2));
    }
    return `${m} × ${power(e, 10)}`;
  }
  if (p > NINES_ABOVE) {
    // Digits enough to show the complement to `sig` - 1 figures, so it never rounds to 100.
    const gap = (1 - p) * 100;
    const dp = Math.max(1, Math.ceil(-Math.log10(gap)) + sig - 2);
    return `${trimZeros((100 - gap).toFixed(dp))}%`;
  }
  return `${trimZeros(Number((p * 100).toPrecision(sig)).toString())}%`;
}

/**
 * Two probabilities at the same precision, with as many figures as it takes for them to read
 * differently when they are different, so "0.1001% misses the target of 0.1%" never prints
 * as "0.1% misses 0.1%". Past MAX_SIG figures the first becomes "just over 0.1%".
 */
export function distinct(a: number, b: number): [string, string] {
  for (let sig = 3; sig <= MAX_SIG; sig++) {
    const pair: [string, string] = [chance(a, sig), chance(b, sig)];
    if (a === b || pair[0] !== pair[1]) return pair;
  }
  // Closer than MAX_SIG figures can show: say which side of it a is rather than print two equal numbers.
  const target = chance(b, 3);
  return [`${a > b ? 'just over' : 'just under'} ${target}`, target];
}

const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
