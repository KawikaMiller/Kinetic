import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { availabilityCaption, latencyCaption } from './captions';
import { DEFAULT_N, N_RANGE, expectedKthFastest, failuresTolerated, simulateKthFastest, waitByQuorum, LATENCY_SEED } from './quorum';
import { HOMES, STORE_FIXED_LATENCY, opsOf, storeCluster } from './store';

const PLOT_W = { wide: 560, narrow: 356 } as const;
const KTH_TRIALS = 20_000;
const SIM_UNTIL_MS = 800;
const READ_AT_MS = 300;

export function AvailabilityScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(DEFAULT_N);
  const [w, setW] = useState(3);
  const [r, setR] = useState(3);
  const [crashed, setCrashed] = useState<readonly number[]>([]);
  const [cut, setCut] = useState(0);
  const [seed, setSeed] = useState(LATENCY_SEED);
  const narrow = useMediaQuery(PHONE_QUERY);

  const down = useMemo(() => [...new Set([...crashed.filter((i) => i < n), ...Array.from({ length: cut }, (_, i) => n - 1 - i)])].sort((a, b) => a - b), [crashed, cut, n]);
  const sim = useMemo(() => {
    const c = storeCluster({ seed: 0, config: { n, w, r, sloppy: false, repair: false }, writes: [0], reads: [{ at: READ_AT_MS }], latency: STORE_FIXED_LATENCY, down: down.map((i) => HOMES[i]) });
    c.run({ until: SIM_UNTIL_MS });
    const ops = opsOf(c.snapshot());
    return { write: ops[0], read: ops[1] };
  }, [n, w, r, down]);
  const rows = useMemo(() => waitByQuorum(n, seed), [n, seed]);
  const kth = useMemo(() => ({ formula: expectedKthFastest(n, w), sim: simulateKthFastest(n, w, KTH_TRIALS, seed).mean }), [n, w, seed]);
  const top = Math.max(...rows.map((x) => x.p99)) * 1.1;

  useIntroCaption(
    <>
      {availabilityCaption({ n, w, r, unreachable: down.length, write: sim.write, read: sim.read })} {latencyCaption({ n, w, rows, kth })}
    </>,
    [n, w, r, down, seed],
  );

  const setNn = (next: number) => {
    setN(next);
    setW((x) => Math.min(x, next));
    setR((x) => Math.min(x, next));
    setCut((c) => Math.min(c, next - 1));
  };
  const toggle = (i: number) => setCrashed((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="A write survives" value={`${failuresTolerated(n, w)} failures`} sub={`N − W = ${n} − ${w}`} />
          <Stat label="A read survives" value={`${failuresTolerated(n, r)} failures`} sub={`N − R = ${n} − ${r}`} />
          <Stat label="Write in the simulation" value={sim.write.outcome === 'ok' ? `acked in ${sim.write.response! - sim.write.invoke} ms` : `no quorum after ${sim.write.response! - sim.write.invoke} ms`} color={sim.write.outcome === 'ok' ? 'var(--ok)' : 'var(--bad)'} sub={`${down.length} of ${n} replicas unreachable`} />
          <Stat label="Read in the simulation" value={sim.read.outcome === 'ok' ? `returns in ${sim.read.response! - sim.read.invoke} ms` : `no quorum after ${sim.read.response! - sim.read.invoke} ms`} color={sim.read.outcome === 'ok' ? 'var(--ok)' : 'var(--bad)'} sub={`needs ${r} replies`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'p50 of the W-th reply', shape: 'line' },
            { color: 'var(--violet)', label: 'p99', shape: 'line' },
            { color: 'var(--hi)', label: 'your W', shape: 'dot' },
            { color: 'var(--cell-dead)', label: 'a crashed or cut-off replica' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Replicas N" value={n} min={N_RANGE.min} max={N_RANGE.max} onChange={setNn} />
          <Slider label="Write quorum W" value={w} min={1} max={n} onChange={setW} />
          <Slider label="Read quorum R" value={r} min={1} max={n} onChange={setR} />
        </>,
        <>
          <ControlGroup label="Crash" inline>
            {Array.from({ length: n }, (_, i) => (
              <ChipButton key={i} tone="bad" on={crashed.includes(i)} ariaLabel={`Crash replica ${HOMES[i]}`} onClick={() => toggle(i)}>{HOMES[i]}</ChipButton>
            ))}
          </ControlGroup>
          <Slider label="Cut off from the end" value={cut} min={0} max={n - 1} format={(v) => `${v} replicas`} onChange={setCut} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="qr-stage stage-pad">
        <div className="qr-replicas" aria-label="Replicas">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={`qr-replica qr-static ${down.includes(i) ? 'is-down' : ''}`} role="img" aria-label={`Replica ${HOMES[i]}, ${down.includes(i) ? 'unreachable' : 'reachable'}`}>
              <b>{HOMES[i]}</b>
              <span className="qr-member">{crashed.includes(i) ? 'crashed' : i >= n - cut ? 'cut off' : 'up'}</span>
            </div>
          ))}
        </div>
        <Plot2D
          width={narrow ? PLOT_W.narrow : PLOT_W.wide}
          x={{ domain: [0.5, n + 0.5], label: 'replies waited for (W or R)', ticks: n, format: (v) => String(Math.round(v)) }}
          y={{ domain: [0, top], label: 'wait (ms)', ticks: 4 }}
          ariaLabel="p50 and p99 of the wait for the W-th fastest reply, against W"
        >
          <Curve tone="info" points={rows.map((x) => [x.w, x.p50])} />
          <Curve tone="violet" points={rows.map((x) => [x.w, x.p99])} />
          <Points tone="info" r={3} data={rows.map((x) => ({ x: x.w, y: x.p50 }))} />
          <Points tone="violet" r={3} data={rows.map((x) => ({ x: x.w, y: x.p99 }))} />
          <VLine at={w} tone="hi" label={`W = ${w}`} />
        </Plot2D>
        <p className="qr-status">The simulation above the plot uses a fixed 5 ms on every link, so an operation takes 10 ms; the plot is a separate model with log-normal replies, a median near 20 ms.</p>
        <p className="qr-status">p50 {sig(rows[w - 1].p50, 3)} ms and p99 {sig(rows[w - 1].p99, 3)} ms at W = {w}; log-normal latencies, 5,000 seeded trials.</p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>the availability outcomes run on distSim with the chosen replicas crashed; the wait is seeded log-normal draws</Provenance>
          <Provenance kind="illustrative">a median reply of about 20 ms and the spread are made up, not measured</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
