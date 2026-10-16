import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { loopCaption } from './captions';
import {
  ARRIVAL_SEED, LATENCY_BUDGET_MS, LOOP_HORIZON_MS, latencies, lateCount, makeArrivals, servingSim, servingStats, stateAtMs, type ServingParams,
} from './serving';
import { BATCH_SIZES, DEVICE_MACS_PER_SECOND, LOOP_STAGES, TRAIN_STEPS, forwardMacs, stepsDone, trainLoop } from './training';
import { loopOpening } from './openings';

const FRAME_MS = 100;
const STALL_WINDOW: readonly [number, number] = [1000, 2000];
const SHOWN_REQUESTS = 12;
const SERVE: Omit<ServingParams, 'stall'> = { lambda: 20, maxBatch: 1, maxWaitMs: 0 };

const frozenSeconds = (stall: boolean, nowMs: number) => (stall ? Math.max(0, Math.min(nowMs, STALL_WINDOW[1]) - STALL_WINDOW[0]) / 1000 : 0);

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [batch, setBatch] = useState<number>(loopOpening().batch);
  const [stall, setStall] = useState(loopOpening().stall);

  const run = useMemo(() => trainLoop(batch), [batch]);
  const arrivals = useMemo(() => makeArrivals(ARRIVAL_SEED, SERVE.lambda, LOOP_HORIZON_MS), []);
  const sims = useMemo(
    () => ({
      calm: servingSim(arrivals, { ...SERVE, stall: null }, LOOP_HORIZON_MS),
      frozen: servingSim(arrivals, { ...SERVE, stall: STALL_WINDOW }, LOOP_HORIZON_MS),
    }),
    [arrivals],
  );
  const sim = stall ? sims.frozen : sims.calm;

  const frames = useMemo(
    () =>
      Array.from({ length: LOOP_HORIZON_MS / FRAME_MS + 1 }, (_, i) => {
        const now = i * FRAME_MS;
        const state = stateAtMs(sim, now);
        const steps = stepsDone(now / 1000, frozenSeconds(stall, now), run.stepSeconds, TRAIN_STEPS);
        const frozen = stall && now > STALL_WINDOW[0] && now <= STALL_WINDOW[1];
        const stats = servingStats(state, arrivals);
        const late = lateCount(state, arrivals, LATENCY_BUDGET_MS);
        return { now, steps, state, say: loopCaption({ now, steps, loss: run.loss[steps], samplesPerSecond: run.samplesPerSecond, frozen, stats, late }) };
      }),
    [sim, stall, run, arrivals],
  );
  const player = usePlayer(frames, { interval: 250, autoplayOnChange: false });
  const { steps, state } = player.frame;
  const recent = latencies(state, arrivals).slice(-SHOWN_REQUESTS);
  const lateNow = lateCount(state, arrivals, LATENCY_BUDGET_MS);
  const lateEnd = lateCount(stateAtMs(sim, LOOP_HORIZON_MS), arrivals, LATENCY_BUDGET_MS);
  const calmEnd = lateCount(stateAtMs(sims.calm, LOOP_HORIZON_MS), arrivals, LATENCY_BUDGET_MS);
  const calmSteps = stepsDone(LOOP_HORIZON_MS / 1000, 0, run.stepSeconds, TRAIN_STEPS);
  const endSteps = stepsDone(LOOP_HORIZON_MS / 1000, frozenSeconds(stall, LOOP_HORIZON_MS), run.stepSeconds, TRAIN_STEPS);
  const curve = run.loss.slice(0, steps + 1).map((v, i) => [i, v] as [number, number]);

  return (
    <StageFrame
      height={540}
      player={player}
      stats={
        <Stats>
          <Stat label="Training" value={`${steps} of ${TRAIN_STEPS} steps`} sub={[`${sig(run.samplesPerSecond)} samples per second (model-based)`, `${run.stepsPerEpoch} steps make one epoch`]} />
          <Stat label="Serving" value={`${lateNow} late`} color={lateNow > 0 ? 'var(--bad)' : 'var(--ok)'} sub={[`over ${LATENCY_BUDGET_MS} ms so far`, `${SERVE.lambda} requests per second, one forward pass each`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'training steps and the loss curve', shape: 'line' },
            { color: 'var(--ok)', label: 'a request inside the latency budget', shape: 'square' },
            { color: 'var(--bad)', label: 'a request over it', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Minibatch" options={BATCH_SIZES.map((b) => ({ value: b, label: String(b) }))} value={batch} onChange={setBatch} />
          <Toggle label="The machine" value={stall} onChange={setStall} off="Runs steadily" on={`Freezes from ${STALL_WINDOW[0] / 1000} s to ${STALL_WINDOW[1] / 1000} s`} />
        </>,
      ]}
    >
      <div className="tv-stage stage-pad">
        <div className="tv-split">
          <section className="tv-panel" aria-label="Training">
            <h3 className="section-title">Training: a loop over a dataset</h3>
            <ol className="tv-loop" aria-label="One step of the loop">
              {LOOP_STAGES.map((s) => <li key={s} className="chip tone-info">{s}</li>)}
            </ol>
            <Plot2D
              x={{ domain: [0, TRAIN_STEPS], label: 'step', ticks: 4 }}
              y={{ domain: [0, Math.max(0.7, run.loss[0])], label: 'loss', ticks: 4 }}
              width={300}
              height={190}
              ariaLabel={`Training loss after ${steps} steps`}
            >
              <Curve points={curve} tone="info" />
            </Plot2D>
            <span className="tv-note">
              A stall delays the steps and changes nothing they compute: after {LOOP_HORIZON_MS / 1000} s training {stall ? `reached step ${endSteps} instead of ${calmSteps}, on the same loss curve` : `reaches step ${calmSteps}`}.
            </span>
          </section>
          <section className="tv-panel" aria-label="Serving">
            <h3 className="section-title">Serving: one request at a time, each with a deadline</h3>
            <div className="tv-requests" role="group" aria-label="Latency of the latest requests">
              {recent.length === 0 ? <span className="hint">No request has finished yet.</span> : null}
              {recent.map((l, i) => (
                <Bar key={i} value={Math.min(l, 4 * LATENCY_BUDGET_MS)} max={4 * LATENCY_BUDGET_MS} marker={LATENCY_BUDGET_MS / (4 * LATENCY_BUDGET_MS)} tone={l > LATENCY_BUDGET_MS ? 'bad' : 'ok'} height={8} animate={false} label={`request ${state.served - recent.length + i + 1}`} trailing={`${Math.round(l)} ms`} />
              ))}
            </div>
            <span className="tv-note">
              With the stall, {lateEnd} requests end up over {LATENCY_BUDGET_MS} ms by the end; without it, {calmEnd}. Serving cannot wait for a pause to pass.
            </span>
          </section>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={ARRIVAL_SEED}>Poisson arrivals, a seeded tick simulation; no real server was measured and no wall-clock latency is shown</Provenance>
          <Provenance kind="illustrative">device rate {DEVICE_MACS_PER_SECOND.toLocaleString('en-US')} multiply-adds per second ({forwardMacs(run.sizes)} per forward pass here), 20 ms + 2 ms per request, a {LATENCY_BUDGET_MS} ms budget: all made up</Provenance>
          <Provenance kind="toy">a 2-8-1 network trained here on 40 points; throughput is multiply-adds counted from its shapes</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
