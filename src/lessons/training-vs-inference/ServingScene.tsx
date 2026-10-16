import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { MetricMeter } from '../../components/MetricMeter';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import { sig } from '../../core/format';
import { servingCaption } from './captions';
import { servingOpening } from './openings';
import {
  ARRIVAL_SEED, FIXED_MS, HORIZON_MS, LATENCY_BUDGET_MS, MAX_BATCH_LIMIT, PER_ITEM_MS, TICK_MS, capacityPerSecond, finishedBatches, kneeBatch, makeArrivals, overloaded, queueingCheck, queuedCount, runServing, servingSim, servingStats,
  stateAtMs, type ServingState,
} from './serving';

const WINDOW_MS = 400;
const LOOKAHEAD_MS = 60;
const SHOWN_BATCHES = 10;
const QUEUE_LANES = ['q1', 'q2', 'q3'] as const;
const BACKLOG_EVERY_MS = 50;

function batchBars(state: ServingState, arrivals: readonly number[]): GanttBar[] {
  const batches = [...finishedBatches(state), ...(state.current ? [state.current] : [])].slice(-SHOWN_BATCHES);
  const firstIndex = state.batches + (state.current ? 1 : 0) - batches.length;
  return batches.flatMap((b, i) => [
    { id: `w${firstIndex + i}`, lane: QUEUE_LANES[(firstIndex + i) % QUEUE_LANES.length], start: arrivals[b.first], end: b.start, tone: 'violet' as const, kind: 'wait' as const },
    { id: `s${firstIndex + i}`, lane: 'server', start: b.start, end: b.end, tone: 'info' as const, label: `${b.count}` },
  ]);
}

export function ServingScene({ picker }: { picker: ReactNode }) {
  const open = servingOpening();
  const [lambda, setLambda] = useState(open.lambda);
  const [maxBatch, setMaxBatch] = useState(open.maxBatch);
  const [maxWait, setMaxWait] = useState(open.maxWaitMs);
  const [now, setNow] = useState(open.now);

  const arrivals = useMemo(() => makeArrivals(ARRIVAL_SEED, lambda, HORIZON_MS), [lambda]);
  const sim = useMemo(() => servingSim(arrivals, { lambda, maxBatch, maxWaitMs: maxWait }, HORIZON_MS), [arrivals, lambda, maxBatch, maxWait]);
  const state = stateAtMs(sim, now);
  const stats = servingStats(state, arrivals);
  const capacity = capacityPerSecond(maxBatch);
  const isOverloaded = overloaded(lambda, maxBatch);
  const knee = kneeBatch(lambda, MAX_BATCH_LIMIT);

  // The same arrivals through every batch size: a real run for each.
  const sweep = useMemo(
    () =>
      Array.from({ length: MAX_BATCH_LIMIT }, (_, i) => {
        const b = i + 1;
        const s = runServing(arrivals, { lambda, maxBatch: b, maxWaitMs: maxWait }, HORIZON_MS);
        const st = servingStats(s, arrivals);
        return { b, throughput: st.throughput, p99: st.p99, queued: st.queued };
      }),
    [arrivals, lambda, maxWait],
  );
  const check = useMemo(() => queueingCheck(arrivals, lambda, HORIZON_MS), [arrivals, lambda]);
  const arrivedPerSecond = state.t === 0 ? 0 : (state.arrived * 1000) / state.t;
  const backlog = useMemo(() => {
    const out: [number, number][] = [];
    for (let t = 0; t <= HORIZON_MS; t += BACKLOG_EVERY_MS) out.push([t, queuedCount(stateAtMs(sim, t))]);
    return out;
  }, [sim]);

  const bars = barsAt(batchBars(state, arrivals), now);
  const top = Math.max(1, ...backlog.map((p) => p[1]));

  return (
    <StageFrame
      height={560}
      intro={servingCaption({ lambda, maxBatch, maxWaitMs: maxWait, stats, arrivedPerSecond, capacity, overloaded: isOverloaded, knee })}
      introKey={[lambda, maxBatch, maxWait, now]}
      stats={
        <Stats>
          <Stat label="Throughput" value={`${sig(stats.throughput)}/s`} sub={`capacity at max batch ${maxBatch}: ${sig(capacity)}/s`} />
          <Stat label="p50 latency" value={`${sig(stats.p50)} ms`} sub={`${stats.served} requests finished`} />
          <Stat label="Mean batch" value={stats.meanBatch.toFixed(1)} sub={`server busy ${Math.round(stats.utilisation * 100)}% of the time`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'service: a batch on the server', shape: 'square' },
            { color: 'var(--violet)', label: 'waiting in the queue (hatched)', shape: 'square' },
            { color: 'var(--ok)', label: 'within the latency budget', shape: 'square' },
            { color: 'var(--bad)', label: 'over the budget, or a growing backlog', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Arrival rate" value={lambda} min={10} max={400} step={10} format={(v) => `${v}/s`} onChange={setLambda} />
          <Slider label="Max batch B" value={maxBatch} min={1} max={MAX_BATCH_LIMIT} format={String} onChange={setMaxBatch} />
          <Slider label="Max wait T" value={maxWait} min={0} max={50} step={1} format={(v) => `${v} ms`} onChange={setMaxWait} />
        </>,
        <>
          <Slider label="Time" value={now} min={0} max={HORIZON_MS} step={50} format={(v) => `${(v / 1000).toFixed(2)} s`} onChange={setNow} />
        </>,
      ]}
    >
      <div className="tv-stage stage-pad">
        <div className="tv-wide">
        <MetricMeter
          label="p99 latency"
          value={stats.served === 0 ? null : stats.p99}
          max={4 * LATENCY_BUDGET_MS}
          unit=" ms"
          bands={[
            { upTo: LATENCY_BUDGET_MS, tone: 'ok', label: 'within budget', tick: { label: `budget ${LATENCY_BUDGET_MS} ms`, tone: 'ok' } },
            { upTo: 4 * LATENCY_BUDGET_MS, tone: 'bad', label: 'over budget' },
          ]}
          format={(v) => `${Math.round(v)} ms`}
        />
        </div>
        <WideRegion minWidth={480} label="The last batches: scroll sideways to see all of the chart">
        <GanttLanes
          lanes={[...QUEUE_LANES.map((id, i) => ({ id, label: i === 0 ? 'waiting' : '' })), { id: 'server', label: 'server (batch size)' }]}
          bars={bars}
          domain={[Math.max(0, now - WINDOW_MS), Math.max(WINDOW_MS, now) + LOOKAHEAD_MS]}
          now={now}
          unit=" ms"
          axis
          size="md"
          labelWidth={110}
          ariaLabel="The last batches: waiting and service"
        />
        </WideRegion>
        {isOverloaded && (
          <div className="tv-backlog">
            <span className="hl bad wrap">Overloaded: the queue is growing</span>
            <Plot2D x={{ domain: [0, HORIZON_MS], label: 'ms', ticks: 4 }} y={{ domain: [0, top * 1.1], label: 'queued', ticks: 3 }} width={320} height={150} ariaLabel={`Backlog over time: ${stats.queued} queued at ${now} ms`}>
              <Curve points={backlog} tone="bad" />
              <VLine at={now} tone="hi" dashed />
            </Plot2D>
          </div>
        )}
        <div className="tv-row">
          <figure className="tv-figure">
            <figcaption>Throughput against max batch B (same arrivals, a run for each B): once B keeps up, throughput is just the arrival rate</figcaption>
            <Plot2D x={{ domain: [1, MAX_BATCH_LIMIT], label: 'B', ticks: 4 }} y={{ domain: [0, Math.max(lambda * 1.2, 60)], label: 'per second', ticks: 4 }} width={300} height={180} ariaLabel="Throughput against max batch size">
              <HLine at={lambda} tone="dim" label={`arriving ${lambda}/s`} />
              <Curve points={sweep.map((r) => [r.b, r.throughput] as [number, number])} tone="info" />
              <Points data={[{ x: maxBatch, y: sweep[maxBatch - 1].throughput, tone: 'hi' }]} r={5} />
              {knee !== null && <VLine at={knee} tone="ok" dashed label={`keeps up from B = ${knee}`} />}
            </Plot2D>
          </figure>
          <figure className="tv-figure">
            <figcaption>p99 latency against max batch B: it falls while B is below the knee, and rises with B only when the max wait T is long</figcaption>
            <Plot2D x={{ domain: [1, MAX_BATCH_LIMIT], label: 'B', ticks: 4 }} y={{ domain: [10, 10000], log: true, label: 'ms', ticks: 4 }} width={300} height={180} ariaLabel="p99 latency against max batch size">
              <HLine at={LATENCY_BUDGET_MS} tone="dim" label="budget" />
              <Curve points={sweep.map((r) => [r.b, Math.max(10, r.p99)] as [number, number])} tone="bad" />
              <Points data={[{ x: maxBatch, y: Math.max(10, sweep[maxBatch - 1].p99), tone: 'hi' }]} r={5} />
            </Plot2D>
          </figure>
        </div>
        <Hint tone="muted" className="tv-note">
          A batch goes when B requests are queued or T ms after the oldest arrived, whichever is first. A bigger B adds capacity, but a request waits longer only when the timer, not the arrivals, fills the batch.
          Queueing check at B = 1 and T = 0, an M/D/1 queue (random arrivals, fixed service time):{' '}
          {check.closedFormMs === null
            ? `${lambda}/s is past what one request at a time can drain (${sig(capacityPerSecond(1))}/s), so the formula has no steady state and the queue grows without bound`
            : `the closed form 1/μ + ρ / (2μ(1 − ρ)) gives a mean of ${sig(check.closedFormMs)} ms and this short seeded stream gives ${sig(check.simulatedMs)} ms`}
          . Why the queue explodes near capacity is the <Link to="/lesson/queueing-theory">queueing theory</Link> lesson; why the budget uses p99 and not the mean is <Link to="/lesson/percentiles-statistics">percentiles</Link>.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={ARRIVAL_SEED}>seeded Poisson arrivals through a {TICK_MS} ms tick simulation; service takes {FIXED_MS} ms + {PER_ITEM_MS} ms per request in the batch</Provenance>
          <Provenance kind="illustrative">the 20 ms, 2 ms and 100 ms budget are made up; no real server was measured and no wall-clock latency is shown</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
