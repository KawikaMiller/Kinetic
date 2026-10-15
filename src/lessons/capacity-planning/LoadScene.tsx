import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import { Curve, HLine, Plot2D, Points, VLine, Band } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useTickSim } from '../../core/useTickSim';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { loadCaption, msText, rps } from './frames';
import {
  LEVEL_DEFAULT, LEVEL_RANGE, RAMP_LEVELS, SERVICE_DEFAULT, SERVICE_MS_RANGE, SLO_MS, TEST_JOBS, TIMEOUT_MS, WORKERS_RANGE, achievedLoad, capacity, createRamp, errorRate,
  kneeLoad, latencyQuantileMs, serviceOnlyP99Ms, simulateLoad, type RampState, type Service,
} from './model';

const LATENCY_MAX = SLO_MS * 4;
const RAMP_TICK_SECONDS = 0.35;
const KEY_STEP_LEVELS = 1;
const SNAPSHOT_SECONDS = 0.1;

export function LoadScene({ picker }: { picker: ReactNode }) {
  const [service, setService] = useState<Service>(SERVICE_DEFAULT);
  const [level, setLevel] = useState(LEVEL_DEFAULT);
  const [seed, setSeed] = useState(1);
  const cap = capacity(service);
  const offered = level * cap;
  const knee = kneeLoad(service, SLO_MS);
  const exactP99 = latencyQuantileMs(service, offered, 0.99);
  const exactErrors = errorRate(service, offered, TIMEOUT_MS);
  const run = useMemo(() => simulateLoad(service, offered, TIMEOUT_MS, TEST_JOBS, seed), [service, offered, seed]);

  const ramp = useTickSim<RampState, RampState['points']>({
    make: () => createRamp(service, TIMEOUT_MS, seed),
    dt: RAMP_TICK_SECONDS,
    maxTicksPerFrame: 1,
    snapshotEvery: SNAPSHOT_SECONDS,
    snapshot: (sim) => sim.state.points,
    initiallyPaused: true,
  });
  const { reset: resetRamp, setPaused } = ramp;
  useEffect(() => {
    resetRamp();
    setPaused(true);
  }, [service, seed, resetRamp, setPaused]);
  const points = ramp.snap ?? [];
  const rampDone = points.length === RAMP_LEVELS.length;

  useIntroCaption(loadCaption(service, level), [service, level]);

  const xDomain: [number, number] = [0, LEVEL_RANGE.max * cap];
  const snapLevel = (v: number) => Math.min(LEVEL_RANGE.max, Math.max(LEVEL_RANGE.min, Math.round(v * 20) / 20));
  const kneeUtil = knee === null ? null : knee / cap;
  const xFormat = (v: number) => sig(v, 3);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Capacity c / S" value={rps(cap)} sub={[`${service.workers} workers × ${sig(1000 / service.serviceMs)}/s each`]} />
          <Stat
            label="Knee"
            value={knee === null ? 'none' : rps(knee)}
            color="var(--hi)"
            sub={[knee === null ? `the service alone has p99 ${msText(serviceOnlyP99Ms(service))}` : `${pctText(kneeUtil!, 0)} of capacity`, `p99 within ${SLO_MS} ms`]}
          />
          <Stat
            label={`p99 at ${rps(offered)}`}
            value={exactP99 === null ? 'no steady state' : msText(exactP99)}
            color={exactP99 !== null && exactP99 <= SLO_MS ? 'var(--ok)' : 'var(--bad)'}
            sub={['exact', `the run reads ${msText(run.p99Ms)}`]}
          />
          <Stat
            label="Errors (waited past the timeout)"
            value={exactErrors === null ? '–' : pctText(exactErrors, 1)}
            color="var(--bad)"
            sub={[`timeout ${TIMEOUT_MS} ms, exact`, `the run reads ${pctText(run.errors, 1)}`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'offered load', shape: 'line' },
            { color: 'var(--ok)', label: 'achieved throughput', shape: 'line' },
            { color: 'var(--bad)', label: 'gap past capacity' },
            { color: 'var(--orange)', label: 'p99', shape: 'line' },
            { color: 'var(--hi)', label: 'knee', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Workers c" value={service.workers} {...WORKERS_RANGE} onChange={(workers) => setService((s) => ({ ...s, workers }))} />
          <Slider label="Service time S" value={service.serviceMs} {...SERVICE_MS_RANGE} format={(v) => `${v} ms`} onChange={(serviceMs) => setService((s) => ({ ...s, serviceMs }))} />
        </>,
        <>
          <Slider label="Offered load" value={level} {...LEVEL_RANGE} format={(v) => `${pctText(v, 0)} of capacity`} onChange={setLevel} />
          <Button onClick={() => { resetRamp(); setPaused(false); }}>{rampDone ? 'Ramp again' : 'Ramp the load'}</Button>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="cp-stage stage-pad">
        <div className="cp-plots">
          <Plot2D
            x={{ domain: xDomain, label: 'offered load (requests/s)', format: xFormat, ticks: 4 }}
            y={{ domain: [0, xDomain[1]], label: 'throughput (requests/s)', format: xFormat, ticks: 3 }}
            ariaLabel={`Throughput against offered load: it follows the load up to ${rps(cap)} and flattens there`}
          >
            <Band lo={(x) => achievedLoad(service, x)} hi={(x) => x} tone="bad" />
            <Curve fn={(x) => x} tone="info" />
            <Curve fn={(x) => achievedLoad(service, x)} tone="ok" />
            <Points data={points.map((p) => ({ x: p.offered, y: p.throughput, tone: 'ok' as const }))} r={3} hollow />
            <Points data={[{ x: offered, y: run.throughput, tone: 'ok' as const }]} r={4.5} />
            <VLine at={offered} tone="hi" onDrag={(x) => setLevel(snapLevel(x / cap))} onStep={(d) => setLevel((v) => snapLevel(v + d * KEY_STEP_LEVELS * LEVEL_RANGE.step))} ariaLabel="Offered load" valueText={`${pctText(level, 0)} of capacity`} />
          </Plot2D>
          <Plot2D
            x={{ domain: xDomain, label: 'offered load (requests/s)', format: xFormat, ticks: 4 }}
            y={{ domain: [0, LATENCY_MAX], label: 'latency (ms)', ticks: 4 }}
            ariaLabel={`p50 and p99 latency against offered load, with the ${SLO_MS} ms objective`}
          >
            <HLine at={SLO_MS} tone="dim" label={`${SLO_MS} ms objective`} />
            <Curve fn={(x) => latencyQuantileMs(service, x, 0.5) ?? NaN} tone="info" />
            <Curve fn={(x) => latencyQuantileMs(service, x, 0.99) ?? NaN} tone="orange" />
            <Points data={points.map((p) => ({ x: p.offered, y: p.p99Ms, tone: 'orange' as const }))} r={3} hollow />
            <Points data={[{ x: offered, y: run.p99Ms, tone: 'orange' as const }]} r={4.5} />
            {knee !== null && <VLine at={knee} tone="hi" label="knee" dashed />}
          </Plot2D>
        </div>
        <div className="cp-meters">
          <MetricMeter
            label="Utilisation at this load"
            value={level}
            max={LEVEL_RANGE.max}
            format={(v) => pctText(v, 0)}
            bands={
              kneeUtil === null
                ? [{ upTo: LEVEL_RANGE.max, tone: 'bad', label: 'no load meets the objective' }]
                : [
                    { upTo: kneeUtil, tone: 'ok', label: 'within the objective', tick: { label: `knee ${pctText(kneeUtil, 0)}`, tone: 'hi' } },
                    { upTo: 1, tone: 'orange', label: 'past the knee' },
                    { upTo: LEVEL_RANGE.max, tone: 'bad', label: 'over capacity' },
                  ]
            }
          />
          <MetricMeter
            label="Headroom to the knee"
            value={knee === null ? null : (knee - offered) / knee}
            max={1}
            format={(v) => pctText(v, 0)}
            bands={[
              { upTo: 0, tone: 'bad', label: 'past the knee' },
              { upTo: 0.2, tone: 'orange', label: 'thin' },
              { upTo: 1, tone: 'ok', label: 'room to grow' },
            ]}
          />
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>an open-loop test of {TEST_JOBS.toLocaleString('en-US')} Poisson arrivals per level; the curves are exact (analytic)</Provenance>
          <Provenance kind="illustrative">service times, the {SLO_MS} ms objective and the {TIMEOUT_MS} ms timeout are made up</Provenance>
          <Provenance kind="from-memory">the Erlang C formulas: verify against a queueing text</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="cp-note">
          The generator is open-loop: arrivals do not wait for replies (a closed-loop generator hides overload, which benchmarking methodology covers). Real systems have non-exponential service,
          bursty arrivals, garbage collection, shared dependencies and warm-up, so their knee comes sooner than this model&apos;s. Load-test the real thing.
          Past 100% the workers cannot keep up, so the run reads a queue that keeps growing for as long as the test lasts.
        </Hint>
      </div>
    </StageFrame>
  );
}
