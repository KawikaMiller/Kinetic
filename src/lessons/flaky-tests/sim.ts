import { expSample, mulberry32, randInt, shuffle, type Rnd } from '../../core/random';

/**
 * A simulated checkout test suite with five planted sources of intermittent failure. Four
 * are test bugs (the test is wrong), one is a real race in the code under test. Every
 * random draw a run needs is taken up front from the run's seed, in a fixed order, so
 * flipping a fix or a retry never shifts the stream: the same seed is the same run.
 */

export type SourceId = 'sleep' | 'order' | 'clock' | 'random' | 'race';
export const SOURCES: readonly SourceId[] = ['sleep', 'order', 'clock', 'random', 'race'];

export interface TestDef {
  id: string;
  /** The planted flakiness this test carries, if any. */
  source: SourceId | null;
}

/** The suite, in its written order. The runner shuffles it every run. */
export const TESTS: readonly TestDef[] = [
  { id: 'addsItem', source: null },
  { id: 'applyCoupon', source: null },
  { id: 'emptyCartTotal', source: 'order' },
  { id: 'sendsReceipt', source: 'sleep' },
  { id: 'tokenExpiresToday', source: 'clock' },
  { id: 'randomCartTotal', source: 'random' },
  { id: 'reserveStockTwice', source: 'race' },
  { id: 'removesItem', source: null },
  { id: 'formatsPrice', source: null },
  { id: 'rejectsBadCoupon', source: null },
];

export const TEST_OF: Record<SourceId, string> = {
  sleep: 'sendsReceipt',
  order: 'emptyCartTotal',
  clock: 'tokenExpiresToday',
  random: 'randomCartTotal',
  race: 'reserveStockTwice',
};
/** The test whose leftovers break emptyCartTotal when it runs first. */
export const POLLUTER = 'applyCoupon';

// Illustrative timings and windows (named so the stage can print them).
/** The test sleeps this long and hopes the receipt job is done. */
export const SLEEP_MS = 100;
/** The receipt job takes this long on an idle machine... */
export const JOB_BASE_MS = 70;
/** ...plus an exponential queueing delay with this mean on a busy CI runner. */
export const JOB_QUEUE_MEAN_MS = 15;
/** The test fails when run in the last hour before midnight. */
export const LATE_START_S = 23 * 3600;
export const DAY_S = 24 * 3600;
/** A retry starts this many seconds after the failed attempt. */
export const RETRY_GAP_S = 5;
/** Random quantity 0..9; a quantity of 0 makes "total > 0" fail. */
export const QTY_MAX = 9;
/** The seeded fixture's quantity (what the seed happens to give is pinned here instead). */
export const SEEDED_QTY = 3;
/** Two reservations start at uniform moments in this window... */
export const RACE_WINDOW_MS = 100;
/** ...and each read-modify-write takes this long, so starts closer than this collide. */
export const RACE_GAP_MS = 2.5;
/** "Retry until green" re-runs a failed test up to this many extra times. */
export const MAX_RETRIES = 2;
const ATTEMPTS = MAX_RETRIES + 1;

/** The exact chance one attempt of each source fails, from its closed form. */
export const FIRST_TRY_RATE: Record<SourceId, number> = {
  sleep: Math.exp(-(SLEEP_MS - JOB_BASE_MS) / JOB_QUEUE_MEAN_MS),
  order: 1 / 2,
  clock: (DAY_S - LATE_START_S) / DAY_S,
  random: 1 / (QTY_MAX + 1),
  race: 1 - (1 - RACE_GAP_MS / RACE_WINDOW_MS) ** 2,
};

/**
 * The chance a source still fails after `retries` re-runs. Fresh draws (sleep, random, race)
 * must fail every attempt; the polluted fixture stays polluted, so order fails every time;
 * the clock only escapes if a retry crosses midnight.
 */
export function finalRate(s: SourceId, retries: number): number {
  const p = FIRST_TRY_RATE[s];
  if (s === 'order') return p;
  if (s === 'clock') return (DAY_S - LATE_START_S - retries * RETRY_GAP_S) / DAY_S;
  return p ** (retries + 1);
}

export interface Config {
  fixed: ReadonlySet<SourceId>;
  retries: number;
  quarantined: ReadonlySet<string>;
}

export interface Draws {
  order: string[];
  jobMs: number[];
  startS: number;
  qty: number[];
  raceStarts: [number, number][];
}

/** Everything a run will ever need from its seed, drawn in a fixed order. */
export function drawsFor(seed: number): Draws {
  const rnd: Rnd = mulberry32(seed);
  const order = shuffle(TESTS.map((t) => t.id), rnd);
  const jobMs = Array.from({ length: ATTEMPTS }, () => JOB_BASE_MS + expSample(JOB_QUEUE_MEAN_MS, rnd));
  const startS = Math.floor(rnd() * DAY_S);
  const qty = Array.from({ length: ATTEMPTS }, () => randInt(0, QTY_MAX, rnd));
  const raceStarts = Array.from({ length: ATTEMPTS }, () => [rnd() * RACE_WINDOW_MS, rnd() * RACE_WINDOW_MS] as [number, number]);
  return { order, jobMs, startS, qty, raceStarts };
}

export interface Attempt {
  passed: boolean;
  /** Why it failed, in the words a test runner would print. Empty when it passed. */
  reason: string;
}

export type TestOutcome = 'passed' | 'retried' | 'failed';

export interface TestResult {
  id: string;
  source: SourceId | null;
  attempts: Attempt[];
  outcome: TestOutcome;
  quarantined: boolean;
}

export type RunStatus = 'pass' | 'retried' | 'fail';

export interface Run {
  seed: number;
  order: string[];
  startS: number;
  tests: TestResult[];
  status: RunStatus;
  /** The real race tripped, but the run doesn't show it as a failure (a retry or quarantine hid it). */
  realBugHidden: boolean;
  /** The real race tripped and the run is red because of it. */
  realBugCaught: boolean;
}

export const timeOfDay = (s: number) => {
  const t = ((s % DAY_S) + DAY_S) % DAY_S;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(t / 3600))}:${two(Math.floor((t % 3600) / 60))}:${two(t % 60)}`;
};

/** One attempt of one test, from the run's draws. */
function attempt(t: TestDef, k: number, d: Draws, fixed: ReadonlySet<SourceId>): Attempt {
  const ok = { passed: true, reason: '' };
  const s = t.source;
  if (!s || fixed.has(s)) return ok;
  switch (s) {
    case 'sleep': {
      const job = d.jobMs[k];
      return job > SLEEP_MS
        ? { passed: false, reason: `expected 1 email sent, got 0: the job took ${(Math.ceil(job * 10) / 10).toFixed(1)} ms but the test slept ${SLEEP_MS} ms` }
        : ok;
    }
    case 'order':
      return d.order.indexOf(POLLUTER) < d.order.indexOf(t.id)
        ? { passed: false, reason: `expected total 0.00, got 18.00: ${POLLUTER} ran first and left its item in the shared cart` }
        : ok;
    case 'clock': {
      const at = d.startS + k * RETRY_GAP_S;
      const late = at >= LATE_START_S && at < DAY_S;
      return late ? { passed: false, reason: `ran at ${timeOfDay(at)}: issued + 1 h lands tomorrow, so "expires today" is false` } : ok;
    }
    case 'random':
      return d.qty[k] === 0 ? { passed: false, reason: 'expected total > 0, got 0.00: the random quantity came out as 0' } : ok;
    case 'race': {
      const [a, b] = d.raceStarts[k];
      return Math.abs(a - b) < RACE_GAP_MS
        ? { passed: false, reason: `expected stock 8, got 9: both reservations read 10 within ${Math.abs(a - b).toFixed(1)} ms, one update was lost` }
        : ok;
    }
  }
}

/** Run the suite once for a seed under a config: pure, so the same inputs give the same run. */
export function runSuite(seed: number, cfg: Config, draws: Draws = drawsFor(seed)): Run {
  const tests = draws.order.map((id): TestResult => {
    const t = TESTS.find((x) => x.id === id)!;
    const attempts: Attempt[] = [];
    for (let k = 0; k <= cfg.retries; k++) {
      const a = attempt(t, k, draws, cfg.fixed);
      attempts.push(a);
      if (a.passed) break;
    }
    const last = attempts[attempts.length - 1];
    const outcome: TestOutcome = !last.passed ? 'failed' : attempts.length > 1 ? 'retried' : 'passed';
    return { id, source: t.source, attempts, outcome, quarantined: cfg.quarantined.has(id) };
  });
  const counted = tests.filter((t) => !t.quarantined);
  const status: RunStatus = counted.some((t) => t.outcome === 'failed') ? 'fail' : counted.some((t) => t.outcome === 'retried') ? 'retried' : 'pass';
  const race = tests.find((t) => t.source === 'race')!;
  const tripped = !race.attempts[0].passed;
  const shownAsFailure = race.outcome === 'failed' && !race.quarantined;
  return { seed, order: draws.order, startS: draws.startS, tests, status, realBugHidden: tripped && !shownAsFailure, realBugCaught: tripped && shownAsFailure };
}

/** The seed of run i in batch b, as printed on screen. */
export const runSeed = (batch: number, i: number) => batch * 1000 + i + 1;

export interface BatchSummary {
  runs: number;
  pass: number;
  retried: number;
  fail: number;
  realBugsHidden: number;
  realBugsCaught: number;
}

export function summarise(runs: readonly Run[]): BatchSummary {
  const count = (f: (r: Run) => boolean) => runs.filter(f).length;
  return {
    runs: runs.length,
    pass: count((r) => r.status === 'pass'),
    retried: count((r) => r.status === 'retried'),
    fail: count((r) => r.status === 'fail'),
    realBugsHidden: count((r) => r.realBugHidden),
    realBugsCaught: count((r) => r.realBugCaught),
  };
}

/** Sources that can still turn a run red: not fixed, and their test not quarantined. */
/** Flaky sources still in the suite but with their test quarantined: they still fail, the build ignores them. */
export const quarantinedFlakes = (cfg: Config) => SOURCES.filter((s) => !cfg.fixed.has(s) && cfg.quarantined.has(TEST_OF[s]));
/** Sources not fixed at all: live or quarantined, anything that can still flake. */
export const unfixedSources = (cfg: Config) => SOURCES.filter((s) => !cfg.fixed.has(s));

export const liveSources = (cfg: Config) => SOURCES.filter((s) => !cfg.fixed.has(s) && !cfg.quarantined.has(TEST_OF[s]));

/**
 * The exact chance a run is not red: the sources are independent, so it's the product of
 * each one's chance of passing, P(green) = Π(1 − pᵢ), the same rule as probability-basics.
 */
export const exactGreen = (cfg: Config) => liveSources(cfg).reduce((g, s) => g * (1 - finalRate(s, cfg.retries)), 1);
/** The exact chance a run passes with no retry needed. */
export const exactFirstTryGreen = (cfg: Config) => liveSources(cfg).reduce((g, s) => g * (1 - FIRST_TRY_RATE[s]), 1);
