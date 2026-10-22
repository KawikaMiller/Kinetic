import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { GanttLanes } from '../../components/GanttLanes';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { pctText } from '../../core/format';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import {
  AHEAD_SECONDS, BATCH_LIMITS, BATCH_OPENING, HAND_OUTPUTS, LANES_SHOWN, SCRUB_STEPS, WINDOW_SECONDS, batchCaption, cacheLine, ganttBars, handBatchUse, runBatching, tickAt,
} from './batching';
import { HORIZON_SECONDS, LARGEST_RESERVATION_BYTES, SMALLEST_BUDGET_BYTES, STATIC_WAIT_SECONDS, type Policy, type Reservation } from './sim';
import { StepPanel } from './StepPanel';
import { MAX_SEQ } from './cost';
import { decimalBytes, plainSeconds, share } from './text';

const HAND_USE = handBatchUse();

const POLICIES: { value: Policy; label: string }[] = [
  { value: 'static', label: 'static (batch, then wait)' },
  { value: 'continuous', label: 'continuous (refill every step)' },
];
const RESERVATIONS: { value: Reservation; label: string }[] = [
  { value: 'need', label: "the request's own length" },
  { value: 'max', label: `${MAX_SEQ.toLocaleString('en-US')} tokens for every request` },
];

/** Scene 3: static against continuous batching on one seeded workload. One tick of the simulator is one scheduler iteration. */
export function BatchScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(BATCH_OPENING.seed);
  const [rate, setRate] = useState<number>(BATCH_OPENING.rate);
  const [policy, setPolicy] = useState<Policy>(BATCH_OPENING.settings.policy);
  const [slots, setSlots] = useState<number>(BATCH_OPENING.settings.slots);
  const [deviceGb, setDeviceGb] = useState<number>(BATCH_OPENING.settings.deviceGb);
  const [reservation, setReservation] = useState<Reservation>(BATCH_OPENING.settings.reservation);
  const [position, setPosition] = useState<number>(BATCH_OPENING.position);

  const run = useMemo(() => runBatching(seed, rate, { policy, slots, deviceGb, reservation }), [seed, rate, policy, slots, deviceGb, reservation]);
  const tick = tickAt(run, position);
  const state = run.sim.tick.history[tick];
  const { stats } = run;
  const cache = cacheLine(run, state);
  const bars = useMemo(() => ganttBars(run, state.t), [run, state.t]);
  const lanes = Array.from({ length: Math.min(slots, LANES_SHOWN) }, (_, i) => ({ id: `slot${i}`, label: i === 0 ? 'slots' : '' }));
  const top = Math.max(1, ...run.trace.map((p) => p[1]));

  return (
    <StageFrame
      height={780}
      intro={batchCaption(run, state, tick, rate)}
      introKey={`batch|${seed}|${rate}|${policy}|${slots}|${deviceGb}|${reservation}|${position}`}
      stats={
        <Stats>
          <Stat label="Output tokens/s" value={Math.round(stats.tokensPerSecond).toLocaleString('en-US')} color="var(--ok)" sub="tokens over the time the last request finished" />
          <Stat label="TTFT p50 / p99" value={stats.ttftP50 === null || stats.ttftP99 === null ? 'none finished' : `${plainSeconds(stats.ttftP50)} / ${plainSeconds(stats.ttftP99)}`} sub="time to first token, nearest rank" />
          <Stat label="Slot use" value={stats.utilisation === null ? 'no traffic' : share(stats.utilisation)} sub="sequences emitting a token per decode step, of all slots" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'prefill', shape: 'square' },
            { color: 'var(--info)', label: 'decode', shape: 'square' },
            { color: 'var(--dim)', label: 'an idle slot, held until the batch ends (hatched)', shape: 'square' },
            { color: 'var(--bad)', label: 'a full cache or a growing queue', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Policy" value={policy} onChange={setPolicy} options={POLICIES} />
          <Segmented label="Reserve" value={reservation} onChange={setReservation} options={RESERVATIONS} />
        </>,
        <>
          <Slider label="Requests per second" value={rate} min={BATCH_LIMITS.rate[0]} max={BATCH_LIMITS.rate[1]} format={(v) => `${v}/s`} onChange={setRate} />
          <Slider label="Max sequences S" value={slots} min={BATCH_LIMITS.slots[0]} max={BATCH_LIMITS.slots[1]} onChange={setSlots} />
          <Slider label="Device memory" value={deviceGb} min={BATCH_LIMITS.memoryGb[0]} max={BATCH_LIMITS.memoryGb[1]} step={4} format={(v) => `${v} GB`} onChange={setDeviceGb} />
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Slider label="Scheduler iteration" value={position} min={0} max={SCRUB_STEPS} format={() => `${tick.toLocaleString('en-US')} of ${run.sim.tick.ticks.toLocaleString('en-US')}`} onChange={setPosition} />
        </>,
      ]}
    >
      <div className="llm-stage stage-pad">
        <WideRegion minWidth={480} label="Slots over time: scroll sideways to see all of the chart">
          <GanttLanes
            lanes={lanes}
            bars={bars}
            domain={[Math.max(0, state.t - WINDOW_SECONDS), Math.max(WINDOW_SECONDS, state.t) + AHEAD_SECONDS]}
            now={state.t}
            unit=" s"
            axis
            size="md"
            labelWidth={70}
            ariaLabel={`The first ${lanes.length} of ${slots} slots around simulated time ${state.t.toFixed(2)} seconds`}
          />
        </WideRegion>
        <div className="llm-wide">
          <div className="llm-bar-label"><span>Cache set aside at this iteration</span><b>{decimalBytes(cache.used)} of {decimalBytes(cache.budget)}</b></div>
          <Bar value={cache.used} max={Math.max(1, cache.budget)} tone={cache.used >= cache.budget * 0.9 ? 'bad' : 'muted'} height={12} ariaLabel={`Cache set aside: ${decimalBytes(cache.used)} of ${decimalBytes(cache.budget)}`} />
        </div>
        <div className="llm-row">
          <figure className="llm-figure">
            <figcaption>Requests waiting against simulated time{run.cacheBlocked > 0 ? `: the cache held the queue head back on ${run.cacheBlocked.toLocaleString('en-US')} of ${stats.iterations.toLocaleString('en-US')} iterations` : ''}</figcaption>
            <Plot2D
              x={{ domain: [0, Math.max(1, run.end.t)], label: 'simulated seconds', ticks: 4 }}
              y={{ domain: [0, top * 1.1], label: 'waiting', ticks: 3 }}
              width={320}
              height={170}
              ariaLabel={`Requests waiting against time; ${state.arrived - state.head} waiting at ${state.t.toFixed(2)} seconds`}
            >
              <Curve points={run.trace} tone="bad" />
              <VLine at={state.t} tone="hi" dashed />
            </Plot2D>
          </figure>
          <div className="llm-panel">
            <h3 className="section-title">What this run counted</h3>
            <table className="llm-table">
              <tbody>
                <tr><th scope="row">arrived in {HORIZON_SECONDS} s</th><td>{stats.arrivals.toLocaleString('en-US')}</td></tr>
                <tr><th scope="row">finished</th><td>{stats.finished.toLocaleString('en-US')}</td></tr>
                <tr><th scope="row">rejected: needs more than the whole budget</th><td className={stats.rejected > 0 ? 'llm-bad' : ''}>{stats.rejected}</td></tr>
                <tr><th scope="row">scheduler iterations</th><td>{stats.iterations.toLocaleString('en-US')}</td></tr>
              </tbody>
            </table>
            {stats.rejected === 0 && (
              <Hint tone="muted">
                The rejection guard never fires here: the most cache one request can be set aside is {decimalBytes(LARGEST_RESERVATION_BYTES)} and the smallest budget is {decimalBytes(SMALLEST_BUDGET_BYTES)}.
              </Hint>
            )}
          </div>
        </div>
        <StepPanel />
        <Hint tone="muted" className="llm-note">
          Static batching waits up to {STATIC_WAIT_SECONDS * 1000} ms to form a batch, then every sequence decodes in lockstep until the longest one ends, so a finished sequence keeps its slot. A batch whose outputs are {HAND_OUTPUTS.join(', ')} keeps {HAND_USE.tokenBusy} of {HAND_USE.tokenTotal} token-slots busy, {pctText(HAND_USE.tokenBusy / HAND_USE.tokenTotal, 2)}, counting the prefill token as a step; the Slot use meter counts decode steps only, {HAND_USE.decodeBusy} of {HAND_USE.decodeTotal}, {pctText(HAND_USE.decodeBusy / HAND_USE.decodeTotal, 2)}, and also counts slots no request ever held.
          Continuous batching refills a slot after any step. The same shape as the batch-or-wait model of the training-vs-inference lesson survives inside each step: one decode step for b sequences costs a + c b, now paid per token instead of per request.
          One tick here is one scheduler iteration, not a fixed time: the simulated clock advances by the cost model. Both policies set aside a request&apos;s whole final length when they admit it, so nothing is evicted; setting aside the request&apos;s own length assumes the server knows the output length in advance, which real servers do not.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded Poisson arrivals, prompt lengths 64 to 1,024 and output lengths with a mean near 150, over {HORIZON_SECONDS} s</Provenance>
          <Provenance kind="illustrative">continuous is not worse on these seeded workloads (the tests ran 200 seeded workloads at 5 and at 20 requests per second); the toy device&apos;s numbers show the shape of the effects, not any product&apos;s speed</Provenance>
          <Provenance kind="from-memory">iteration-level scheduling is a published idea (the Orca paper, 2022) and chunked prefill, speculative decoding, FlashAttention and splitting prefill from decode are named, not modelled; verify against the papers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
