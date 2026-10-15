import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Band, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { us, warmupCaption } from './frames';
import {
  DISCARD_RANGE, IMPLS, discardCrossover, SERIES_LENGTH, WARMUP_DEFAULT, WINDOW_MODES, WINDOW_NAME, logBinnedMeans, readWindow, startRealRun, stepRealRun, timerGranularityMs, warmupSeries,
  type Clock, type RealRun, type WindowMode,
} from './model';
import { SeedField } from '../../components/SeedField';
import { sig } from '../../core/format';

const MODE_OPTIONS = WINDOW_MODES.map((m) => ({ value: m, label: WINDOW_NAME[m] }));
const CURVE_BINS = 40;
const Y_DOMAIN: [number, number] = [0.01, 300];
/** The only place a clock is read: a button the learner presses. The default state, smoke and tests never touch it. */
const browserClock: Clock = { now: () => performance.now() };

interface RealResult {
  run: RealRun;
  granularityMs: number | null;
}

/** Runs the real function in batches from timers, cancelling when the scene unmounts. */
function useRealRun() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RealResult | null>(null);
  const live = useRef<{ cancelled: boolean; timer: number | null }>({ cancelled: false, timer: null });

  useEffect(() => {
    const state = live.current;
    state.cancelled = false;
    return () => {
      state.cancelled = true;
      if (state.timer !== null) window.clearTimeout(state.timer);
    };
  }, []);

  const start = () => {
    const state = live.current;
    setRunning(true);
    setResult(null);
    let run = startRealRun(browserClock);
    const tick = () => {
      if (state.cancelled) return;
      run = stepRealRun(run, browserClock);
      if (run.done) {
        setResult({ run, granularityMs: timerGranularityMs(browserClock) });
        setRunning(false);
        return;
      }
      state.timer = window.setTimeout(tick, 0);
    };
    state.timer = window.setTimeout(tick, 0);
  };
  return { running, result, start };
}

export function WarmupScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<WindowMode>(WARMUP_DEFAULT.mode);
  const [discard, setDiscard] = useState(WARMUP_DEFAULT.discard);
  const [useResult, setUseResult] = useState(WARMUP_DEFAULT.useResult);
  const [seed, setSeed] = useState(WARMUP_DEFAULT.seed);
  const real = useRealRun();
  const crossover = useMemo(() => discardCrossover(), []);

  const series = useMemo(() => warmupSeries(seed, useResult), [seed, useResult]);
  const reading = readWindow(series, mode, discard, useResult);
  const curveA = useMemo(() => logBinnedMeans(series.a, CURVE_BINS), [series]);
  const curveB = useMemo(() => logBinnedMeans(series.b, CURVE_BINS), [series]);
  const [from, to] = reading.window;

  useIntroCaption(warmupCaption(reading, mode, useResult), [seed, mode, discard, useResult]);

  const realPoints = real.result ? real.result.run.perCallNs.map((ns, i) => [i + 1, ns] as [number, number]) : [];
  const realTop = real.result ? Math.max(...real.result.run.perCallNs) * 1.1 : 1;

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="A, mean in the window" value={us(reading.meanA)} color="var(--sky)" sub={[`noise-free ${us(reading.exactA)}`, `steady state ${us(IMPLS.A.steadyUs)}`]} />
          <Stat label="B, mean in the window" value={us(reading.meanB)} color="var(--amber)" sub={[`noise-free ${us(reading.exactB)}`, `steady state ${us(IMPLS.B.steadyUs)}`]} />
          <Stat
            label="Verdict"
            value={reading.faster === null ? 'none' : `${reading.faster} is ${sig(reading.ratio, 3)}× faster`}
            color={reading.faster === null ? 'var(--dim)' : 'var(--hi)'}
            sub={[reading.faster === null ? 'both read the empty loop' : `in ${WINDOW_NAME[mode]}`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'A', shape: 'line' },
            { color: 'var(--amber)', label: 'B', shape: 'line' },
            { color: 'var(--hi)', label: 'the window measured', shape: 'line' },
            { color: 'var(--dim)', label: 'discarded warm-up' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Measure" value={mode} onChange={setMode} options={MODE_OPTIONS} />
          <Toggle label="Use the result" value={useResult} onChange={setUseResult} off="unused" on="used" />
        </>,
        <>
          {mode === 'discard' && <Slider label="Discard the first k" value={discard} {...DISCARD_RANGE} format={(v) => `${v.toLocaleString('en-US')} iterations`} onChange={setDiscard} />}
          <SeedField seed={seed} onSeed={setSeed} />
          <Button onClick={real.start} disabled={real.running}>{real.running ? 'Timing…' : 'Time a real function here'}</Button>
        </>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <Plot2D
          x={{ domain: [1, SERIES_LENGTH], log: true, label: 'iteration, log scale', ticks: 4 }}
          y={{ domain: Y_DOMAIN, log: true, label: 'time per call (µs)', ticks: 4 }}
          ariaLabel={`Time per call against iteration for two implementations; the window measured is iterations ${from} to ${to - 1}`}
        >
          {from > 1 && <Band lo={Y_DOMAIN[0]} hi={Y_DOMAIN[1]} from={1} to={from} tone="dim" />}
          <Curve points={curveA} tone="sky" />
          <Curve points={curveB} tone="amber" />
          <VLine at={Math.max(1, from)} tone="hi" label="window" dashed />
          <VLine at={to} tone="hi" dashed />
        </Plot2D>
        {real.result && (
          <div className="bm-real">
            <Plot2D
              x={{ domain: [1, Math.max(2, realPoints.length)], label: 'batch of 2,000 calls', ticks: 4 }}
              y={{ domain: [0, realTop], label: 'ns per call', ticks: 3 }}
              ariaLabel="Real timings of a small function on this machine, one point per batch"
            >
              <Curve points={realPoints} tone="violet" />
            </Plot2D>
            <Hint tone="muted" className="bm-note">
              {real.result.run.perCallNs.length} batches on this machine, {sig(Math.min(...real.result.run.perCallNs))} to {sig(Math.max(...real.result.run.perCallNs))} ns per call.
              The smallest step the clock showed was {real.result.granularityMs === null ? 'none: it never moved in the probe' : `${sig(real.result.granularityMs * 1000)} µs`}. Browsers may coarsen timer resolution on purpose
              (from memory: verify for your browser), and a rerun gives different numbers.
            </Hint>
          </div>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a made-up JIT-like warm-up curve, not V8, plus seeded noise</Provenance>
          <Provenance kind="from-memory">an optimiser can remove work whose result is unused: real compilers can, so harnesses keep results alive; verify for your toolchain</Provenance>
          {real.result && <Provenance kind="real">timed here with performance.now, one run, not seeded</Provenance>}
        </ProvenanceRow>
        <Hint tone="muted" className="bm-note">
          A is slower in steady state but warms up in about 20 iterations; B is faster in steady state and takes about 300. The measurement window picks the winner.
          {crossover === null ? ' No discard on the slider reaches the point where B reads faster.' : ` Discarding the first ${crossover.toLocaleString('en-US')} iterations is the smallest cut on the slider where B reads faster; a smaller cut still measures B's warm-up.`} The real-timing button
          is off until you press it, runs for under a second and stops if you leave the page.
        </Hint>
      </div>
    </StageFrame>
  );
}
