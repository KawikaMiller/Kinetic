import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { darts, DART_RUNS, MAX_DRAWN, MAX_EXP, meanAbsErrors, MIN_EXP, runCheckpoints, standardError } from './monteCarlo';
import { OPENING } from './presets';

const BOARD_WIDTH = 300;
const ERROR_FLOOR = 1e-4;

/** Scene 2, Monte Carlo: bounded time, random correctness. The error against the number of darts, on log-log axes. */
export function PiScene({ picker }: { picker: ReactNode }) {
  const [exponent, setExponent] = useState<number>(OPENING.pi.exponent);
  const [seed, setSeed] = useState<number>(OPENING.pi.seed);
  const n = 2 ** exponent;

  const run = useMemo(() => runCheckpoints(seed), [seed]);
  const mean = useMemo(() => meanAbsErrors(seed), [seed]);
  const at = run.find((c) => c.n === n)!;
  const shown = useMemo(() => darts(seed, Math.min(n, MAX_DRAWN)), [seed, n]);
  const ratioFrom = exponent + 2 <= MAX_EXP ? exponent : MAX_EXP - 2;
  const lo = mean.find((m) => m.n === 2 ** ratioFrom)!;
  const hi = mean.find((m) => m.n === 2 ** (ratioFrom + 2))!;
  const sigma = standardError(n);

  return (
    <StageFrame
      height={520}
      intro={
        <>
          {n.toLocaleString('en-US')} seeded darts landed {Math.round((at.estimate * n) / 4).toLocaleString('en-US')} times inside the quarter circle: the estimate is {at.estimate.toFixed(4)}, off by {at.error.toFixed(4)}. The typical error at this size is about {sigma.toFixed(4)}, and four times the darts halve it.
        </>
      }
      introKey={`${exponent}-${seed}`}
      stats={
        <Stats>
          <Stat label="Estimate of pi" value={at.estimate.toFixed(4)} color="var(--hi)" sub={`after ${n.toLocaleString('en-US')} darts`} />
          <Stat label="This run's error" value={at.error.toFixed(4)} color="var(--hi)" sub={`one standard error is ${sigma.toFixed(4)}`} />
          <Stat label={`Mean error, ${DART_RUNS} runs`} value={mean.find((m) => m.n === n)!.error.toFixed(4)} color="var(--info)" sub={`expected about 0.8 x ${sigma.toFixed(4)}`} />
          <Stat label={`Error at ${(2 ** (ratioFrom + 2)).toLocaleString('en-US')} against ${(2 ** ratioFrom).toLocaleString('en-US')} darts`} value={(hi.error / lo.error).toFixed(2)} color="var(--ok)" sub="four times the darts: about half the error" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'dart inside the quarter circle', shape: 'dot' },
            { color: 'var(--amber)', label: 'dart outside', shape: 'dot' },
            { color: 'var(--hi)', label: 'this run: error against darts', shape: 'dot' },
            { color: 'var(--info)', label: 'standard error 4 sqrt(p(1-p)/n)', shape: 'line' },
            { color: 'var(--ok)', label: `mean error over ${DART_RUNS} runs`, shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Darts" value={exponent} min={MIN_EXP} max={MAX_EXP} onChange={setExponent} format={(e) => (2 ** e).toLocaleString('en-US')} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ra-stage stage-pad ra-two">
        <Plot2D x={{ domain: [0, 1], label: 'x' }} y={{ domain: [0, 1], label: 'y' }} width={BOARD_WIDTH} aspect="equal" ariaLabel={`Dartboard: the first ${shown.length} darts, coloured by whether they are inside the quarter circle`}>
          <Curve fn={(x) => Math.sqrt(Math.max(0, 1 - x * x))} tone="muted" dashed />
          <Points data={shown.map((d) => ({ x: d.x, y: d.y, tone: d.inside ? ('sky' as const) : ('amber' as const) }))} r={2.5} />
        </Plot2D>
        <Plot2D
          x={{ domain: [2 ** MIN_EXP, 2 ** MAX_EXP], log: true, label: 'darts n' }}
          y={{ domain: [ERROR_FLOOR, 1], log: true, label: 'error in pi' }}
          ariaLabel="Error of the pi estimate against the number of darts on log-log axes, with the standard error line"
        >
          <Curve fn={standardError} tone="info" />
          <Curve points={mean.map((m) => [m.n, m.error] as const)} tone="ok" />
          <Points data={run.filter((c) => c.error > 0).map((c) => ({ x: c.n, y: c.error, tone: 'hi' as const, hollow: c.n !== n }))} r={3.5} />
        </Plot2D>
      </div>
      <p className="ra-note stage-pad">
        Only the first {Math.min(n, MAX_DRAWN).toLocaleString('en-US')} darts are drawn; every dart is counted. Each point is a checkpoint of this one seeded run; the green line averages {DART_RUNS} other seeded runs (seeds {seed + 1} to {seed + DART_RUNS}). Runs whose error is exactly 0 are left off the log axis. The time is fixed by n; what is random is how wrong the answer is.
      </p>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>seeded random darts, not measured</Provenance>
        <Provenance kind="real">the error line is the formula 4 sqrt(p(1-p)/n) with p = pi/4, checked against the spread of seeded runs</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
