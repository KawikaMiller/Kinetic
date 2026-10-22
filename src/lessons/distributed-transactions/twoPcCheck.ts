// The safety checks behind the 2PC scenes: seeded fault schedules, and a crash injected at every step.
import { checkInvariants, type TraceRow } from '../../core/distSim';
import { integer } from '../../core/format';
import {
  CHECK_DOWN_MS, CHECK_DUPLICATE, CHECK_HORIZON_MS, CHECK_LOSS, NODE_IDS, PARTICIPANTS, TWO_PC_SAFETY, twoPcCluster, type NodeId, type TwoPcMsg, type TwoPcOptions, type TwoPcVariant,
} from './twoPc';

export const CHECK_SEEDS = 200;
/** A crash lands this long after the event it follows, so it falls between that event and the next. */
const AFTER_EVENT_MS = 0.001;

/** Even seeds run with Inventory out of stock (it votes NO), odd ones with stock: both kinds of vote get checked. */
export const outOfStockOn = (seed: number) => seed % 2 === 0;

/** The pinned counterexample of the early-commit bug: the lowest of the checked seeds on which it breaks atomicity. */
export const EARLY_COMMIT_SEED = 2;

const base = (seed: number, variant: TwoPcVariant): TwoPcOptions => ({ seed, variant, outOfStock: outOfStockOn(seed), faults: true });

/** The times of the events (deliveries and timers) of a run without a crash: the steps a crash can follow. */
export function stepTimes(trace: readonly TraceRow<unknown>[]): number[] {
  return [...new Set(trace.filter((r) => r.kind === 'deliver' || r.kind === 'timer').map((r) => r.t))];
}

export interface Failure {
  seed: number;
  message: string;
  /** The crash that was injected, when there was one. */
  crash?: TwoPcOptions['crash'];
  trace: readonly TraceRow<TwoPcMsg>[];
}

export interface CheckSummary {
  variant: TwoPcVariant;
  seeds: number;
  runs: number;
  failedRuns: number;
  /** Seeds with at least one failing run. */
  failedSeeds: number;
  /** Events the invariant was asserted after. */
  events: number;
  /** Liveness, a separate claim: runs that ended with a participant still prepared, holding its lock with no decision applied. */
  blockedRuns: number;
  lowest: Failure | null;
}

interface Row {
  seed: number;
  events: number;
  failure: Failure | null;
  blocked: boolean;
}

/** True when some participant ended the run prepared: it voted YES, holds its lock and never heard the decision. */
function endsBlocked(cluster: ReturnType<typeof twoPcCluster>): boolean {
  const snap = cluster.snapshot();
  return PARTICIPANTS.some((p) => {
    const s = snap.nodes[p].state;
    return s?.role === 'participant' && s.phase === 'prepared';
  });
}

function runOnce(o: TwoPcOptions): Omit<Row, 'seed'> {
  const cluster = twoPcCluster(o);
  const verdict = checkInvariants(cluster, TWO_PC_SAFETY, { until: CHECK_HORIZON_MS });
  if (verdict.ok) return { events: verdict.steps, failure: null, blocked: endsBlocked(cluster) };
  return { events: verdict.step, failure: { seed: o.seed, message: verdict.message, crash: o.crash, trace: verdict.trace }, blocked: false };
}

function summarise(variant: TwoPcVariant, seeds: number, rows: Row[]): CheckSummary {
  const failing = rows.filter((r) => r.failure);
  return {
    variant,
    seeds,
    runs: rows.length,
    failedRuns: failing.length,
    failedSeeds: new Set(failing.map((r) => r.seed)).size,
    events: rows.reduce((n, r) => n + r.events, 0),
    blockedRuns: rows.filter((r) => r.blocked).length,
    lowest: failing.length ? failing.reduce((a, b) => (b.seed < a.seed ? b : a)).failure : null,
  };
}

/** The sentence under the 2PC check button: what ran, what broke, and the lowest failing seed. */
export function describeTwoPcCheck(seeds: CheckSummary, crashes: CheckSummary): string {
  const ran = `${integer(seeds.seeds)} seeds with ${CHECK_LOSS * 100}% loss and ${CHECK_DUPLICATE * 100}% duplication, and on each seed every node crashed after every step, restarting or staying down (${integer(crashes.runs)} runs, ${integer(seeds.events + crashes.events)} events checked)`;
  const liveness = `Liveness is a separate claim: ${integer(crashes.blockedRuns)} of ${integer(crashes.runs)} crash runs (${integer(seeds.blockedRuns)} of ${integer(seeds.runs)} without a crash) ended with a participant still prepared and holding its lock, waiting for a decision: that is the blocking cost of 2PC.`;
  if (!seeds.lowest && !crashes.lowest) return `Atomicity held after every event of ${ran}. That is a sample of fault schedules, not a proof for all of them. ${liveness}`;
  const first = seeds.lowest ?? crashes.lowest!;
  return `Atomicity broke on ${seeds.failedSeeds} of ${seeds.seeds} seeds, and in ${integer(crashes.failedRuns)} of ${integer(crashes.runs)} crash runs (${ran}). Lowest failing seed ${first.seed}: ${first.message}. ${liveness}`;
}

/** Seeds 1..count with loss, duplication and no crash. */
export function checkSeeds(variant: TwoPcVariant, count = CHECK_SEEDS): CheckSummary {
  const rows = Array.from({ length: count }, (_, i) => ({ seed: i + 1, ...runOnce(base(i + 1, variant)) }));
  return summarise(variant, count, rows);
}

/**
 * For each seed, every node crashed right after every step of the seed's own run, once restarting
 * after CHECK_DOWN_MS and once staying down; atomicity asserted after every event of each run.
 */
export function crashEveryStep(variant: TwoPcVariant, count = CHECK_SEEDS, nodes: readonly NodeId[] = NODE_IDS): CheckSummary {
  const rows: Row[] = [];
  for (let seed = 1; seed <= count; seed += 1) {
    const o = base(seed, variant);
    const clean = twoPcCluster(o);
    clean.run({ until: CHECK_HORIZON_MS });
    const points = [0, ...stepTimes(clean.trace).map((t) => t + AFTER_EVENT_MS)];
    for (const node of nodes) {
      for (const at of points) {
        for (const restartAt of [at + CHECK_DOWN_MS, null]) rows.push({ seed, ...runOnce({ ...o, crash: { node, at, restartAt } }) });
      }
    }
  }
  return summarise(variant, count, rows);
}
