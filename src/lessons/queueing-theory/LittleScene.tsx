import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Area, Plot2D, Steps } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { boundaryNote, littleCaption, sizingCaption } from './frames';
import {
  BOUNDARY_NAME, LITTLE_DEFAULT, concurrency, drainedRun, littleRun, parseRate, parseSeconds, populationSteps, type Boundary,
} from './model';

const BOUNDARIES: Boundary[] = ['system', 'queue', 'server'];
const BOUNDARY_OPTIONS: Option<Boundary>[] = BOUNDARIES.map((b) => ({ value: b, label: BOUNDARY_NAME[b] }));
const RHO = { min: 0.05, max: 0.95, step: 0.05 } as const;
const HORIZON = { min: 10, max: 120, step: 10 } as const;
const HEADROOM = 1.15;

/** The jobs in the chosen part of the system at time x, read off the step vertices. */
function populationAt(steps: readonly [number, number][], x: number): number {
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (steps[mid][0] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : steps[lo - 1][1];
}

interface Valid {
  rate: number;
  seconds: number;
}

export function LittleScene({ picker }: { picker: ReactNode }) {
  const [rho, setRho] = useState(LITTLE_DEFAULT.rho);
  const [horizon, setHorizon] = useState(LITTLE_DEFAULT.horizon);
  const [boundary, setBoundary] = useState<Boundary>(LITTLE_DEFAULT.boundary);
  const [seed, setSeed] = useState(LITTLE_DEFAULT.seed);
  const [rateText, setRateText] = useState(LITTLE_DEFAULT.rate);
  const [secondsText, setSecondsText] = useState(LITTLE_DEFAULT.seconds);
  const setCaption = useSetCaption();

  const run = useMemo(() => drainedRun({ rho, horizon, seed }), [rho, horizon, seed]);
  const little = useMemo(() => littleRun(run, boundary), [run, boundary]);
  const steps = useMemo(
    () => populationSteps(boundary === 'server' ? run.start : run.arrival, boundary === 'queue' ? run.start : run.departure),
    [run, boundary],
  );
  const peak = Math.max(1, ...steps.map((s) => s[1]));

  const rate = parseRate(rateText);
  const seconds = parseSeconds(secondsText);
  const [kept, setKept] = useState<Valid>({ rate: Number(LITTLE_DEFAULT.rate), seconds: Number(LITTLE_DEFAULT.seconds) });
  const inFlight = concurrency(kept.rate, kept.seconds);

  useIntroCaption(littleCaption(little), [little]);

  const typeRate = (text: string) => {
    setRateText(text);
    const r = parseRate(text);
    if (r.ok && seconds.ok) {
      setKept({ rate: r.value, seconds: seconds.value });
      setCaption(sizingCaption(r.value, seconds.value, concurrency(r.value, seconds.value)));
    }
  };
  const typeSeconds = (text: string) => {
    setSecondsText(text);
    const s = parseSeconds(text);
    if (s.ok && rate.ok) {
      setKept({ rate: rate.value, seconds: s.value });
      setCaption(sizingCaption(rate.value, s.value, concurrency(rate.value, s.value)));
    }
  };

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Area under N(t)" value={sig(little.area, 6)} sub={['job·seconds, from sweeping the events', `window ${sig(little.window, 4)} s`]} />
          <Stat label="Sum of times" value={sig(little.sum, 6)} sub={['job·seconds, one time per job', `${little.jobs.toLocaleString('en-US')} jobs, differ by ${Math.abs(little.area - little.sum).toExponential(1)}`]} />
          <Stat label={<>L = <span className="keep-case">λ</span> × W</>} value={sig(little.L)} sub={[`λ = ${sig(little.lambda)}/s × W = ${sig(little.W)} s`, BOUNDARY_NAME[boundary]]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'jobs present, N(t)', shape: 'line' },
            { color: 'var(--violet)', label: 'area under it' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="System boundary" value={boundary} onChange={setBoundary} options={BOUNDARY_OPTIONS} />
        </>,
        <>
          <Slider label="Utilisation ρ" value={rho} {...RHO} format={(v) => pctText(v, 0)} onChange={setRho} />
          <Slider label="Arrivals for (s)" value={horizon} {...HORIZON} onChange={setHorizon} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="qt-stage stage-pad">
        <Plot2D
          x={{ domain: [0, little.window], label: 'time (s)', ticks: 5 }}
          y={{ domain: [0, peak * HEADROOM], label: boundary === 'queue' ? 'jobs waiting' : boundary === 'server' ? 'jobs in service' : 'jobs in system', ticks: 4 }}
          ariaLabel={`Jobs in the ${BOUNDARY_NAME[boundary]} over time; area ${sig(little.area, 6)} job-seconds`}
        >
          <Area fn={(x) => populationAt(steps, x)} tone="violet" />
          <Steps data={steps} startY={0} tone="info" />
        </Plot2D>
        <Hint tone="muted" className="qt-note">
          {boundaryNote(boundary)} Arrivals stop after {horizon} s and the system drains, so the window ends when the last job leaves: that is what makes the identity exact.
        </Hint>
        <Box className="qt-calc">
          <SectionTitle hint="Little's law as a sizing rule: L = λ × W">How many requests are in flight?</SectionTitle>
          <div className="qt-calc-fields">
            <TextField label="Requests per second" value={rateText} onChange={typeRate} width={110} spellCheck={false} />
            <TextField label="Seconds each" value={secondsText} onChange={typeSeconds} width={110} spellCheck={false} />
          </div>
          {!rate.ok && <span className="qt-refusal" role="status">{rate.error}</span>}
          {!seconds.ok && <span className="qt-refusal" role="status">{seconds.error}</span>}
          <p className="qt-calc-out">
            {sig(kept.rate)} req/s × {sig(kept.seconds)} s = <b>{sig(inFlight)}</b> in flight on average
            {(!rate.ok || !seconds.ok) && <> (still showing the last valid pair)</>}.
          </p>
          <Hint tone="muted" block>
            That is the average. A connection pool needs at least {Math.ceil(Number(inFlight.toFixed(9))).toLocaleString('en-US')} slots just to cover it, and more for bursts
            and variation (connection pooling has its own lesson).
          </Hint>
        </Box>
        <div className="qt-chips">
          <Provenance kind="simulated" seed={seed}>one seeded run of M/M/1 jobs at μ = 10/s, then drained</Provenance>
          <Provenance kind="illustrative">the rates are made up</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
