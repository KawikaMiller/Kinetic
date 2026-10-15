import { useMemo, useState } from 'react';
import { GanttLanes, type GanttBar } from '../components/GanttLanes';
import { SectionTitle } from '../components/Panel';
import { Area, Band, Bars, Curve, HLine, Plot2D, Steps, VLine } from '../components/Plot2D';
import { SequenceDiagram } from '../components/SequenceDiagram';
import { Button, Segmented, Slider, Stat, Stats } from '../components/ui';
import { lognormal, normalCdf, normalPdf, quantile, zipfPmf, zipfSampler } from '../core/distributions';
import { atMostOneLeader, electionScenario, type ElectionKind } from '../core/distSim/electionExample';
import { checkInvariants, forSeeds } from '../core/distSim/invariants';
import { toSequence } from '../core/distSim/trace';
import { barsAt } from '../core/gantt';
import { barsFromHistogram } from '../core/plot';
import { mulberry32 } from '../core/random';
import { createTickSim } from '../core/simTick';
import { ecdf, logHistogram } from '../core/stats';
import { useTickSim } from '../core/useTickSim';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 3 kit round, agent C: distributions, tick sim, Stat sub, barAt, distSim (#/dev/kit). */
export function DevKitTier3c() {
  return (
    <>
      <SectionTitle>Tier 3 kit · distributions, tick sim, barAt, distSim</SectionTitle>
      <Section title="Distributions · seeded log-normal latencies on a log histogram (bars past p95 in --bad), ECDF Steps against the exact CDF">
        <LatencyDemo />
      </Section>
      <Section title="Distributions · Area shades a tail under the normal pdf, Band marks mean ± 1 SD, VLine the cut-off; Zipf rank frequencies">
        <NormalDemo />
      </Section>
      <Section title="createTickSim + useTickSim · a seeded queue stepped in fixed ticks; scrub back to any tick; Stat with a multi-line sub">
        <TickDemo />
      </Section>
      <Section title="core/gantt barAt / barsAt · drag the clock: bars appear, grow with progress, and stay whole once done">
        <BarAtDemo />
      </Section>
      <Section title="distSim · a three-node election, broken vs fixed, over seeded faults: step through the trace; find the lowest failing seed">
        <DistSimDemo />
      </Section>
    </>
  );
}

const LATENCY_N = 400;
const LATENCY_MIN = 10;
const LATENCY_MAX = 10000;

function LatencyDemo() {
  const [seed, setSeed] = useState(7);
  const { hist, sorted, points } = useMemo(() => {
    const rnd = mulberry32(seed);
    const xs = Array.from({ length: LATENCY_N }, () => 60 * lognormal(rnd, 0, 0.9));
    return {
      hist: logHistogram(xs, { bins: 24, min: LATENCY_MIN, max: LATENCY_MAX }),
      sorted: [...xs].sort((a, b) => a - b),
      points: ecdf(xs),
    };
  }, [seed]);
  const p95 = quantile(sorted, 0.95);
  const bars = barsFromHistogram(hist, (bin) => (bin.x0 >= p95 ? 'bad' : 'info'));
  const top = Math.max(...hist.counts) + 4;
  return (
    <div className="devkit-row">
      <Plot2D x={{ domain: [LATENCY_MIN, LATENCY_MAX], log: true, label: 'latency (ms)' }} y={{ domain: [0, top], label: 'requests' }} ariaLabel="Log-spaced histogram of latencies">
        <Bars bars={bars} />
        <VLine at={p95} label="p95" tone="bad" />
      </Plot2D>
      <Plot2D x={{ domain: [LATENCY_MIN, LATENCY_MAX], log: true, label: 'latency (ms)' }} y={{ domain: [0, 1], label: 'share ≤ x' }} ariaLabel="ECDF of latencies against the true CDF">
        <Curve fn={lognormalShare} tone="dim" dashed />
        <Steps data={points} startY={0} tone="info" />
        <HLine at={0.95} label="95%" tone="muted" />
        <VLine at={p95} tone="bad" />
      </Plot2D>
      <div className="devkit-controls">
        <Slider label="Seed" value={seed} min={1} max={30} onChange={setSeed} />
      </div>
    </div>
  );
}

/** The log-normal(ln 60, 0.9) cdf the samples above come from. */
const lognormalShare = (x: number) => normalCdf(Math.log(x / 60), 0, 0.9);

const SD = 1;
const ZIPF_RANKS = 12;
const ZIPF_DRAWS = 5000;

function NormalDemo() {
  const [z, setZ] = useState(1.64);
  const [seed, setSeed] = useState(3);
  const rankFreq = useMemo(() => {
    const draw = zipfSampler(ZIPF_RANKS, 1.1);
    const rnd = mulberry32(seed);
    const counts = new Array<number>(ZIPF_RANKS).fill(0);
    for (let i = 0; i < ZIPF_DRAWS; i++) counts[draw(rnd) - 1]++;
    return counts.map((c) => c / ZIPF_DRAWS);
  }, [seed]);
  const zipfBars = rankFreq.map((y, i) => ({ x0: i + 0.5, x1: i + 1.5, y, tone: i === 0 ? ('hi' as const) : undefined }));
  const tail = 1 - normalCdf(z);
  return (
    <div className="devkit-row">
      <Plot2D x={{ domain: [-4, 4], label: 'z' }} y={{ domain: [0, 0.45], label: 'density' }} ariaLabel="Standard normal with its upper tail shaded">
        <Band lo={0} hi={normalPdf(0)} from={-SD} to={SD} tone="info" />
        <Area fn={(x) => normalPdf(x)} from={z} to={4} tone="bad" />
        <Curve fn={(x) => normalPdf(x)} tone="info" />
        <VLine at={z} label={`tail ${(tail * 100).toFixed(1)}%`} tone="bad" onDrag={setZ} ariaLabel="Cut-off z" valueText={`z ${z.toFixed(2)}`} />
      </Plot2D>
      <Plot2D x={{ domain: [0.5, ZIPF_RANKS + 0.5], label: 'rank', ticks: 6 }} y={{ domain: [0, 0.4], label: 'share of requests' }} ariaLabel="Zipf rank frequencies against the pmf">
        <Bars bars={zipfBars} tone="violet" />
        <Curve points={rankFreq.map((_, i): [number, number] => [i + 1, zipfPmf(i + 1, ZIPF_RANKS, 1.1)])} tone="hi" />
      </Plot2D>
      <div className="devkit-controls">
        <Slider label="Cut-off z" value={z} min={-3} max={3} step={0.01} onChange={setZ} format={(v) => v.toFixed(2)} />
        <Slider label="Zipf seed" value={seed} min={1} max={30} onChange={setSeed} />
      </div>
    </div>
  );
}

const TICK_SERIES_CAP = 150;
const ARRIVE = 0.55;
const SERVE = 0.5;
const OVERLOAD = 14;

function makeQueueSim(seed: number) {
  return createTickSim<number>({
    seed,
    init: () => 0,
    step: (q, rnd) => Math.max(0, q + (rnd() < ARRIVE ? 1 : 0) - (rnd() < SERVE ? 1 : 0)),
    check: (q) => (q >= OVERLOAD ? `queue reached ${q}` : null),
  });
}

function TickDemo() {
  const [seed, setSeed] = useState(4);
  const [at, setAt] = useState<number | null>(null);
  const sim = useTickSim({
    make: () => makeQueueSim(seed),
    dt: 1 / 10,
    snapshot: (s) => ({ ticks: s.ticks, queue: s.state, violation: s.violation, series: s.history.slice(-TICK_SERIES_CAP) }),
    snapshotEvery: 0.1,
  });
  const snap = sim.snap;
  if (!snap) return null;
  const shown = at === null ? snap.series.length - 1 : Math.min(at, snap.series.length - 1);
  return (
    <div className="devkit-row">
      <Stats>
        <Stat
          label="Queue at tick"
          value={snap.series[shown]}
          sub={[`tick ${snap.ticks - (snap.series.length - 1 - shown)} of ${snap.ticks}`, snap.violation ? snap.violation.message : `trips at ${OVERLOAD}`]}
          color={snap.violation ? 'var(--bad)' : undefined}
        />
      </Stats>
      <Plot2D x={{ domain: [0, TICK_SERIES_CAP], label: 'tick (latest 150)' }} y={{ domain: [0, OVERLOAD + 2], label: 'queue length' }} ariaLabel="Queue length per tick">
        <HLine at={OVERLOAD} label="limit" tone="bad" />
        <Curve points={snap.series.map((q, i): [number, number] => [i, q])} tone="info" />
        <VLine at={shown} tone="hi" />
      </Plot2D>
      <div className="devkit-controls">
        <Slider label="Scrub" value={shown} min={0} max={Math.max(1, snap.series.length - 1)} onChange={(v) => { sim.setPaused(true); setAt(v); }} />
        <Button onClick={() => { setAt(null); sim.setPaused(false); }}>Live</Button>
        <Button onClick={() => { setSeed((s) => s + 1); setAt(null); }}>New seed</Button>
        <Button onClick={sim.reset}>Restart seed {seed}</Button>
      </div>
    </div>
  );
}

const JOB_BARS: GanttBar[] = [
  { id: 'extract', lane: 'etl', start: 0, end: 6, tone: 'info', label: 'extract' },
  { id: 'transform', lane: 'etl', start: 6, end: 14, tone: 'violet', label: 'transform' },
  { id: 'load', lane: 'etl', start: 14, end: 18, tone: 'ok', label: 'load' },
  { id: 'index', lane: 'idx', start: 9, end: 17, tone: 'hi', label: 'index' },
];
const JOB_LANES = [{ id: 'etl', label: 'ETL' }, { id: 'idx', label: 'Index' }];

function BarAtDemo() {
  const [now, setNow] = useState(10);
  const bars = barsAt(JOB_BARS, now);
  return (
    <div className="devkit-row">
      <div className="devkit-gantt">
        <GanttLanes lanes={JOB_LANES} bars={bars} domain={[0, 20]} now={now} unit=" s" axis size="md" ariaLabel="Jobs replayed up to the clock" />
      </div>
      <div className="devkit-controls">
        <Slider label="Clock" value={now} min={0} max={20} step={0.5} onChange={setNow} format={(v) => `${v} s`} />
        <span className="hint is-muted">{bars.length} of {JOB_BARS.length} bars started</span>
      </div>
    </div>
  );
}

const SEED_SCAN = 200;

function DistSimDemo() {
  const [kind, setKind] = useState<ElectionKind>('broken');
  const [seed, setSeed] = useState(0);
  const [step, setStep] = useState<number | null>(null);
  const run = useMemo(() => {
    const cluster = electionScenario(kind, true)(seed);
    const result = checkInvariants(cluster, [atMostOneLeader]);
    if (!result.ok) return { trace: result.trace, message: result.message, step: result.step };
    cluster.run();
    return { trace: cluster.trace, message: null, step: null };
  }, [kind, seed]);
  const diagram = useMemo(() => toSequence(run.trace, { timers: false }), [run.trace]);
  const lowest = useMemo(() => forSeeds(SEED_SCAN, electionScenario(kind, true), [atMostOneLeader]), [kind]);
  const last = diagram.messages.length - 1;
  return (
    <div className="devkit-row">
      <SequenceDiagram actors={diagram.actors} messages={diagram.messages} step={step ?? last} fit="shown" ariaLabel="Election message trace" />
      <div className="devkit-controls">
        <Segmented
          label="Protocol"
          value={kind}
          onChange={(k) => { setKind(k); setStep(null); }}
          options={[{ value: 'broken', label: 'Broken' }, { value: 'fixed', label: 'Fixed' }]}
        />
        <Slider label="Seed" value={seed} min={0} max={SEED_SCAN - 1} onChange={(s) => { setSeed(s); setStep(null); }} />
        <Slider label="Message" value={Math.min(step ?? last, Math.max(0, last))} min={0} max={Math.max(0, last)} onChange={setStep} />
        <span className="hint is-muted">{run.message ? `Violation after event ${run.step}: ${run.message}` : 'Safety held on this seed'}</span>
        <span className="hint is-muted">
          {lowest.ok ? `No violation in seeds 0 to ${SEED_SCAN - 1}` : `Lowest failing seed: ${lowest.seed} (${lowest.message})`}
        </span>
        {!lowest.ok && <Button onClick={() => { setSeed(lowest.seed); setStep(null); }}>Jump to seed {lowest.seed}</Button>}
      </div>
    </div>
  );
}

