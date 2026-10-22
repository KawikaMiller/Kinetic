/**
 * Chaos engineering as a model: a seven-service dependency graph (scene 1), a one-experiment card run on the tick simulator
 * (scene 2) and a seeded game day (scene 3). Pure logic, no React.
 *
 * Stated simplifications (also on screen): instances are interchangeable, there are no retries, no health-check ejection and no
 * queueing; the point is the experiment, not the mesh.
 */
import { createTickSim } from '../../core/simTick';
import { mulberry32, type Rnd } from '../../core/random';

export const SERVICES = ['web', 'api', 'auth', 'catalog', 'db', 'cache', 'recs'] as const;
export type Service = (typeof SERVICES)[number];
export const INSTANCES = 4;
export const REQUESTS_PER_TICK = 200;
export const RUN_TICKS = 100;
export const FAULT_FROM = 20;
export const FAULT_TO = 80;
export const FAULT_TICKS = FAULT_TO - FAULT_FROM;
export const SWEEP_SEEDS = 200;

export interface Edge {
  from: Service;
  to: Service;
  soft: boolean;
}
export const EDGES: readonly Edge[] = [
  { from: 'web', to: 'api', soft: false },
  { from: 'api', to: 'auth', soft: false },
  { from: 'api', to: 'catalog', soft: false },
  { from: 'catalog', to: 'db', soft: false },
  { from: 'api', to: 'recs', soft: true },
  { from: 'catalog', to: 'cache', soft: true },
];
/** The two soft edges, which each carry a "has a fallback" switch. */
export type SoftEdge = 'recs' | 'cache';
export type Fallbacks = Record<SoftEdge, boolean>;
/** The default map: the recommendations edge has no fallback (the latent flaw), the cache edge falls through to the database. */
export const DEFAULT_FALLBACKS: Fallbacks = { recs: false, cache: true };
export const withFallbacks = (recs: boolean, cache: boolean): Fallbacks => ({ recs, cache });
const hasFallback = (e: Edge, f: Fallbacks): boolean => e.soft && f[e.to as SoftEdge];

/** The services that are down: the faulted ones, plus any whose hard dependency is down, or whose soft dependency is down with no fallback. Computed to a fixed point. */
export function downSet(faulted: Iterable<Service>, fallbacks: Fallbacks): Set<Service> {
  const down = new Set<Service>(faulted);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of EDGES) {
      if (down.has(e.to) && !down.has(e.from) && !hasFallback(e, fallbacks)) {
        down.add(e.from);
        changed = true;
      }
    }
  }
  return down;
}

export const checkoutWorks = (down: ReadonlySet<Service>): boolean => !down.has('web');

/** Blast radius of killing one service: how many services end up down. */
export const radiusOf = (s: Service, fallbacks: Fallbacks): number => downSet([s], fallbacks).size;

/** BROKEN_SEED: the lowest seed (from 1) on which the game day breaks rule 0 with no abort condition; pinned by the test. */
export const BROKEN_SEED = 1;

/** Is the service on the journey: does losing it take checkout down? */
export const onJourney = (s: Service, fallbacks: Fallbacks): boolean => !checkoutWorks(downSet([s], fallbacks));

/** How many of the 2^7 fault sets leave checkout working. */
export function workingFaultSets(fallbacks: Fallbacks): number {
  let n = 0;
  for (let mask = 0; mask < 2 ** SERVICES.length; mask++) {
    const faulted = SERVICES.filter((_, i) => (mask >> i) & 1);
    if (checkoutWorks(downSet(faulted, fallbacks))) n += 1;
  }
  return n;
}

/* ---------- the experiment card ---------- */

export type FaultKind = 'kill' | 'errors';
export interface Fault {
  target: Service;
  kind: FaultKind;
  /** Instances killed, 1 to INSTANCES (kill only). */
  k: number;
  /** Error share, 0.2, 0.5 or 1 (errors only). */
  p: number;
}
export const EXPOSURES: readonly number[] = [0.01, 0.05, 0.25, 1];
export const ERROR_SHARES: readonly number[] = [0.2, 0.5, 1];

export interface Abort {
  /** Abort when success is below this for `w` consecutive ticks. */
  belowShare: number;
  w: number;
}

export interface Card {
  /** The hypothesis: checkout success stays at or above this share. */
  hypothesis: number;
  fault: Fault;
  exposure: number;
  /** null: no abort condition. */
  abort: Abort | null;
  fallbacks: Fallbacks;
  seed: number;
}

export const HYPOTHESIS = { min: 900, max: 999, default: 990 } as const; // permille
export const ABORT_SHARE = { min: 80, max: 99, default: 95 } as const; // percent
export const ABORT_W = { min: 1, max: 5, default: 2 } as const;
export const DEFAULT_EXPOSURE = 0.05;

export const defaultFault = (): Fault => ({ target: 'db', kind: 'kill', k: 1, p: 1 });
export const defaultCard = (): Card => ({
  hypothesis: HYPOTHESIS.default / 1000,
  fault: defaultFault(),
  exposure: DEFAULT_EXPOSURE,
  abort: { belowShare: ABORT_SHARE.default / 100, w: ABORT_W.default },
  fallbacks: { ...DEFAULT_FALLBACKS },
  seed: 1,
});

/** The share of the target's capacity the fault removes: k / 4 instances, or the error share. */
export const impactedShare = (f: Fault): number => Math.min(1, Math.max(0, f.kind === 'kill' ? f.k / INSTANCES : f.p));

/** The success probability of a request while the fault is on: 1 - exposure x impact, when the target is on the journey. */
export function successProbability(card: Pick<Card, 'fault' | 'exposure' | 'fallbacks'>): number {
  return onJourney(card.fault.target, card.fallbacks) ? 1 - Math.min(1, Math.max(0, card.exposure)) * impactedShare(card.fault) : 1;
}

export interface TickResult {
  /** Observed share of the tick's requests that succeeded. */
  success: number;
  failed: number;
  faultOn: boolean;
  /** Consecutive ticks so far with success below the abort share. */
  badStreak: number;
  /** The tick at which the abort fired (the fault is gone from the next tick), or null. */
  abortedAt: number | null;
}

const emptyTick = (): TickResult => ({ success: 1, failed: 0, faultOn: false, badStreak: 0, abortedAt: null });

/** One experiment, tick by tick on the tick simulator: 200 seeded Bernoulli draws a tick, the fault on from tick 20 to 80 unless the abort removes it. */
export function runExperiment(card: Card): TickResult[] {
  const a = successProbability(card);
  const sim = createTickSim<TickResult>({
    seed: card.seed,
    init: emptyTick,
    step: (prev, rnd: Rnd, tick) => {
      const aborted = prev.abortedAt !== null;
      const faultOn = tick >= FAULT_FROM && tick < FAULT_TO && !aborted;
      let failed = 0;
      for (let i = 0; i < REQUESTS_PER_TICK; i++) if (rnd() >= (faultOn ? a : 1)) failed += 1;
      const success = 1 - failed / REQUESTS_PER_TICK;
      const below = card.abort !== null && faultOn && success < card.abort.belowShare;
      const badStreak = below ? prev.badStreak + 1 : 0;
      const fires = card.abort !== null && !aborted && badStreak >= card.abort.w;
      return { success, failed, faultOn, badStreak, abortedAt: fires ? tick : prev.abortedAt };
    },
  });
  sim.run(RUN_TICKS);
  return sim.history.slice(1);
}

export type Outcome = { kind: 'held' } | { kind: 'refuted' } | { kind: 'aborted'; tick: number };

export interface Experiment {
  ticks: TickResult[];
  /** Mean success over the ticks the fault was on. */
  meanSuccess: number;
  failedTotal: number;
  outcome: Outcome;
}

export function evaluate(card: Card): Experiment {
  const ticks = runExperiment(card);
  const on = ticks.filter((t) => t.faultOn);
  const meanSuccess = on.length === 0 ? 1 : on.reduce((s, t) => s + t.success, 0) / on.length;
  const failedTotal = ticks.reduce((s, t) => s + t.failed, 0);
  const abortedAt = ticks.at(-1)?.abortedAt ?? null;
  const outcome: Outcome = abortedAt !== null ? { kind: 'aborted', tick: abortedAt } : meanSuccess >= card.hypothesis ? { kind: 'held' } : { kind: 'refuted' };
  return { ticks, meanSuccess, failedTotal, outcome };
}

/** Rule 0 (bounded experiment): success is never below the abort share for more than w + 1 consecutive ticks (w to decide, one to remove the fault). */
export function longestBadRun(ticks: readonly TickResult[], belowShare: number): number {
  let best = 0;
  let run = 0;
  for (const t of ticks) {
    run = t.success < belowShare ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export const violatesRule = (ticks: readonly TickResult[], abort: Abort): boolean => longestBadRun(ticks, abort.belowShare) > abort.w + 1;

/* ---------- scene 3: a seeded game day ---------- */

/** The experiment a seed draws: target, fault kind and size, and exposure, all from the seed. */
export function drawCard(seed: number, base: Card): Card {
  const rnd = mulberry32(seed ^ 0x7f4a7c15);
  const target = SERVICES[Math.floor(rnd() * SERVICES.length)];
  const kind: FaultKind = rnd() < 0.5 ? 'kill' : 'errors';
  const k = 1 + Math.floor(rnd() * INSTANCES);
  const p = ERROR_SHARES[Math.floor(rnd() * ERROR_SHARES.length)];
  const exposure = EXPOSURES[Math.floor(rnd() * EXPOSURES.length)];
  return { ...base, seed, fault: { target, kind, k, p }, exposure };
}

export interface GameDay {
  card: Card;
  withAbort: Experiment;
  withoutAbort: Experiment;
  brokenWithout: boolean;
  brokenWith: boolean;
}

export const GAME_ABORT: Abort = { belowShare: ABORT_SHARE.default / 100, w: ABORT_W.default };

export function gameDay(seed: number, fallbacks: Fallbacks, abort: Abort = GAME_ABORT): GameDay {
  const card = drawCard(seed, { ...defaultCard(), fallbacks, abort });
  const withAbort = evaluate({ ...card, abort });
  const withoutAbort = evaluate({ ...card, abort: null });
  return { card, withAbort, withoutAbort, brokenWithout: violatesRule(withoutAbort.ticks, abort), brokenWith: violatesRule(withAbort.ticks, abort) };
}

export interface GameSweep {
  withoutAbort: number[];
  withAbort: number[];
}

/** Seeds 1 to `seeds` on which rule 0 breaks, without and with the abort condition. */
export function sweepGameDays(fallbacks: Fallbacks, abort: Abort = GAME_ABORT, seeds = SWEEP_SEEDS): GameSweep {
  const sweep: GameSweep = { withoutAbort: [], withAbort: [] };
  for (let seed = 1; seed <= seeds; seed++) {
    const g = gameDay(seed, fallbacks, abort);
    if (g.brokenWithout) sweep.withoutAbort.push(seed);
    if (g.brokenWith) sweep.withAbort.push(seed);
  }
  return sweep;
}
