// The safety checks behind the saga scenes, shaped like twoPcCheck.ts.
import { checkInvariants, type TraceRow } from '../../core/distSim';
import { integer } from '../../core/format';
import { CHECK_SEEDS, outOfStockOn, stepTimes } from './twoPcCheck';
import {
  CHECK_DOWN_MS, CHECK_DUPLICATE, CHECK_HORIZON_MS, CHECK_LOSS, SAGA_IDS, SAGA_SAFETY, sagaCluster, verdictOf, type SagaMsg, type SagaOptions, type SagaStyle, type SagaVariant,
} from './saga';

/** The pinned counterexample of the missing idempotency key: the lowest checked seed on which a customer is charged twice. */
export const NO_KEY_SEED: Record<SagaStyle, number> = { orch: 14, chor: 6 };

const AFTER_EVENT_MS = 0.001;

export interface SagaFailure {
  seed: number;
  message: string;
  rule: number;
  trace: readonly TraceRow<SagaMsg>[];
}

export interface SagaCheck {
  style: SagaStyle;
  variant: SagaVariant;
  seeds: number;
  runs: number;
  failedRuns: number;
  failedSeeds: number;
  events: number;
  lowest: SagaFailure | null;
  /** Liveness, a separate claim: runs whose services were all consistent when the horizon came. */
  settledRuns: number;
}

const base = (seed: number, style: SagaStyle, variant: SagaVariant): SagaOptions => ({ seed, style, variant, outOfStock: outOfStockOn(seed), faults: true });

interface Row {
  seed: number;
  events: number;
  failure: SagaFailure | null;
  settled: boolean;
}

function runOnce(o: SagaOptions): Row {
  const cluster = sagaCluster(o);
  const verdict = checkInvariants(cluster, SAGA_SAFETY, { until: CHECK_HORIZON_MS });
  if (!verdict.ok) return { seed: o.seed, events: verdict.step, settled: false, failure: { seed: o.seed, message: verdict.message, rule: verdict.rule, trace: verdict.trace } };
  return { seed: o.seed, events: verdict.steps, settled: verdictOf(cluster.snapshot()).consistent, failure: null };
}

function summarise(style: SagaStyle, variant: SagaVariant, seeds: number, rows: Row[]): SagaCheck {
  const failing = rows.filter((r) => r.failure);
  return {
    style,
    variant,
    seeds,
    runs: rows.length,
    failedRuns: failing.length,
    failedSeeds: new Set(failing.map((r) => r.seed)).size,
    events: rows.reduce((n, r) => n + r.events, 0),
    lowest: failing.length ? failing.reduce((a, b) => (b.seed < a.seed ? b : a)).failure : null,
    settledRuns: rows.filter((r) => r.settled).length,
  };
}

/** The sentence under the saga check button: safety first, then liveness as a separate claim. */
export function describeSagaCheck(seeds: SagaCheck, crashes: SagaCheck): string {
  const ran = `${integer(seeds.seeds)} seeds with ${CHECK_LOSS * 100}% loss and ${CHECK_DUPLICATE * 100}% duplication, and on each seed every node crashed after every step, restarting or staying down (${integer(crashes.runs)} runs, ${integer(seeds.events + crashes.events)} events checked)`;
  const liveness = `Liveness is a separate claim: ${integer(seeds.settledRuns)} of ${integer(seeds.runs)} runs without a crash ended with every service consistent by ${CHECK_HORIZON_MS / 1000} s.`;
  if (!seeds.lowest && !crashes.lowest) return `Safety held after every event of ${ran}: never charged twice, never confirmed while incomplete. A sample of schedules, not a proof. ${liveness}`;
  const first = seeds.lowest ?? crashes.lowest!;
  return `Safety broke on ${seeds.failedSeeds} of ${seeds.seeds} seeds, and in ${integer(crashes.failedRuns)} of ${integer(crashes.runs)} crash runs (${ran}). Lowest failing seed ${first.seed}: ${first.message}. ${liveness}`;
}

/** Seeds 1..count with loss, duplication and no crash. */
export function checkSagaSeeds(style: SagaStyle, variant: SagaVariant, count = CHECK_SEEDS): SagaCheck {
  return summarise(style, variant, count, Array.from({ length: count }, (_, i) => runOnce(base(i + 1, style, variant))));
}

/** Every node crashed after every step of the seed's own run, restarting or staying down. */
export function sagaCrashEveryStep(style: SagaStyle, variant: SagaVariant, count = CHECK_SEEDS): SagaCheck {
  const rows: Row[] = [];
  const nodes = SAGA_IDS.filter((id) => style === 'orch' || id !== 'coord');
  for (let seed = 1; seed <= count; seed += 1) {
    const o = base(seed, style, variant);
    const clean = sagaCluster(o);
    clean.run({ until: CHECK_HORIZON_MS });
    const points = [0, ...stepTimes(clean.trace).map((t) => t + AFTER_EVENT_MS)];
    for (const node of nodes) {
      for (const at of points) for (const restartAt of [at + CHECK_DOWN_MS, null]) rows.push(runOnce({ ...o, crash: { node, at, restartAt } }));
    }
  }
  return summarise(style, variant, count, rows);
}
