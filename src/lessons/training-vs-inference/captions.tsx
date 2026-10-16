import type { ReactNode } from 'react';
import { bytes, pctText, sig } from '../../core/format';
import { LATENCY_BUDGET_MS, type ServingStats } from './serving';
import { STALE_SHIFT, STALE_SPREAD, type Preprocessing } from './training';
import type { Regime } from './memory';

/** Decimal gigabytes: 16e9 reads "16.0 GB". */
const gb = (n: number) => bytes(n, { base: 1000 });
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export interface LoopView {
  now: number;
  steps: number;
  loss: number;
  samplesPerSecond: number;
  frozen: boolean;
  stats: ServingStats;
  late: number;
}

export function loopCaption(v: LoopView): ReactNode {
  return (
    <>
      At t = {seconds(v.now)}: training has finished <b>{v.steps}</b> steps (loss {sig(v.loss)}) at {sig(v.samplesPerSecond, 3)} samples per second, a model-based number; serving has answered {v.stats.served}{' '}
      requests, <b>{v.late}</b> of them over {LATENCY_BUDGET_MS} ms already.
      {v.frozen && ' The machine is frozen right now: training just waits and carries on, while requests pile up behind the stall.'}
    </>
  );
}

export interface ServingView {
  lambda: number;
  maxBatch: number;
  maxWaitMs: number;
  stats: ServingStats;
  /** Requests that have actually arrived so far, per second: the seeded stream is random, so it differs a little from `lambda`. */
  arrivedPerSecond: number;
  capacity: number;
  overloaded: boolean;
  knee: number | null;
}

export function servingCaption(v: ServingView): ReactNode {
  const { stats } = v;
  if (v.overloaded) {
    return (
      <>
        <span className="hl bad">Overloaded: the queue is growing.</span> Requests arrive at {v.lambda}/s but batches of {v.maxBatch} can drain only {sig(v.capacity)}/s, so {stats.queued} are waiting and p99 is{' '}
        {sig(stats.p99)} ms.{v.knee !== null ? ` A max batch of ${v.knee} or more would keep up.` : ' No batch size up to 32 would keep up.'}
      </>
    );
  }
  return (
    <>
      Batches of up to {v.maxBatch} (waiting at most {v.maxWaitMs} ms) can drain {sig(v.capacity)}/s against {v.lambda}/s arriving (this seeded random stream has delivered {sig(v.arrivedPerSecond)}/s so far): throughput <b>{sig(stats.throughput)}/s</b>, p50 {sig(stats.p50)} ms, p99{' '}
      <b>{sig(stats.p99)} ms</b>, mean batch {stats.meanBatch.toFixed(1)}, server busy {pctText(stats.utilisation, 0)} of the time.
    </>
  );
}

export interface MemoryView {
  parameters: number;
  regime: Regime;
  total: number;
  bytesPerParameter: number;
  fits: boolean;
  device: number;
  ratio: number;
}

export function memoryCaption(v: MemoryView): ReactNode {
  return (
    <>
      {sig(v.parameters)} parameters at {v.bytesPerParameter} bytes each is <b>{gb(v.total)}</b> for {v.regime === 'training' ? 'training state' : 'half-precision weights'}, {v.fits ? 'which fits' : 'which does not fit'} an
      illustrative {gb(v.device)} device before activations. Training state is {v.ratio}x the inference weights for the same parameters.
    </>
  );
}

export interface SkewView {
  how: Preprocessing;
  drift: number;
  served: number;
  evaluation: number;
}

export function skewCaption(v: SkewView): ReactNode {
  const gap = v.evaluation - v.served;
  const lead = v.how === 'matching' ? 'Same preprocessing as training' : v.how === 'missing' ? 'Preprocessing missing at serving' : `Preprocessing from other statistics (mean off by ${STALE_SHIFT}, spread x${STALE_SPREAD})`;
  return (
    <>
      {lead}{v.drift !== 0 ? `, live data moved by ${sig(v.drift)}` : ''}: accuracy on fresh data is <b>{pctText(v.served, 1)}</b> against {pctText(v.evaluation, 1)} in the offline evaluation
      {Math.abs(gap) < 1e-12 ? ': identical, same weights and same pipeline.' : `, ${(Math.abs(gap) * 100).toFixed(1)} percentage points ${gap > 0 ? 'lower' : 'higher'} with the very same trained weights.`}
    </>
  );
}

export interface CheckpointView {
  mtbf: number;
  cost: number;
  interval: number;
  expected: number;
  best: number;
  bestSeconds: number;
  youngDaly: number;
  noProgress: boolean;
  ideal: number;
}

export function checkpointCaption(v: CheckpointView): ReactNode {
  if (v.noProgress) {
    return (
      <>
        <span className="hl bad">Most cycles are lost</span>: a failure comes every {v.mtbf.toLocaleString('en-US')} s on average, shorter than one cycle of {v.interval} steps plus a {v.cost} s checkpoint, so a cycle usually fails before it finishes and its steps are redone.
      </>
    );
  }
  return (
    <>
      Checkpointing every {v.interval} steps takes <b>{Math.round(v.expected).toLocaleString('en-US')} s</b> on average against {v.ideal.toLocaleString('en-US')} s with no failures. The simulated best interval is {v.best} steps
      ({Math.round(v.bestSeconds).toLocaleString('en-US')} s); the classical estimate √(2·C·M) is {Math.round(v.youngDaly)} steps.
    </>
  );
}
