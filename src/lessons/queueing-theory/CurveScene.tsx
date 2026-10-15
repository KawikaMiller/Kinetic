import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { curveCaption } from './frames';
import { CURVE_DEFAULT, CURVE_MARKS, MU, curveRunLength, measureCurve, mm1Multiple } from './model';

const RHO = { min: 0.05, max: 0.99, step: 0.01 } as const;
const Y_DOMAIN: [number, number] = [1, 120];
const KEY_STEP = 0.01;

export function CurveScene({ picker }: { picker: ReactNode }) {
  const [rho, setRho] = useState(CURVE_DEFAULT.rho);
  const [seed, setSeed] = useState(CURVE_DEFAULT.seed);

  const measured = useMemo(() => measureCurve(rho, seed), [rho, seed]);
  const { warmup, jobs } = curveRunLength(rho);
  const runText = `${jobs.toLocaleString('en-US')} jobs after ${warmup.toLocaleString('en-US')} of warm-up`;
  const theory = mm1Multiple(rho);

  useIntroCaption(curveCaption(rho), [rho]);

  const clamp = (v: number) => Math.min(RHO.max, Math.max(RHO.min, Number(v.toFixed(2))));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={<span className="keep-case">ρ = λ/μ</span>} value={pctText(rho, 0)} sub={[`λ = ${sig(rho * MU)}/s, μ = ${MU}/s`]} />
          <Stat label="Theory: W ÷ service time" value={`${sig(theory)}×`} color="var(--violet)" sub={['1 / (1 − ρ), analytic']} />
          <Stat label="Measured" value={`${sig(measured)}×`} color="var(--info)" sub={[`${runText}, one seed`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'M/M/1 theory', shape: 'line' },
            { color: 'var(--hi)', label: 'your ρ', shape: 'line' },
            { color: 'var(--info)', label: 'measured at your ρ', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Utilisation ρ" value={rho} {...RHO} format={(v) => pctText(v, 0)} onChange={setRho} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="qt-stage stage-pad">
        <Plot2D
          x={{ domain: [0, 1], label: 'utilisation ρ', format: (v) => pctText(v, 0), ticks: 5 }}
          y={{ domain: Y_DOMAIN, log: true, label: 'time in system ÷ service time', ticks: 3 }}
          ariaLabel={`Time in system in service times against utilisation; ${pctText(rho, 0)} gives ${sig(theory)} times`}
        >
          <Curve fn={(x) => (x < 1 ? mm1Multiple(x) : NaN)} tone="violet" />
          <Points
            data={CURVE_MARKS.map((x) => ({ x, y: mm1Multiple(x), tone: 'violet' as const }))}
            r={3.5}
            hollow
            labels={(i) => ({ text: `${sig(mm1Multiple(CURVE_MARKS[i]), 3)}×`, left: true })}
          />
          <Points data={[{ x: rho, y: measured, tone: 'info' as const }]} r={4.5} />
          <VLine
            at={rho}
            tone="hi"
            onDrag={(x) => setRho(clamp(x))}
            onStep={(dir) => setRho((r) => clamp(r + dir * KEY_STEP))}
            ariaLabel="Utilisation"
            valueText={`${pctText(rho, 0)} utilisation, ${sig(theory)} service times in the system`}
          />
        </Plot2D>
        <Hint tone="muted" className="qt-note">
          The marks are the M/M/1 values at 50%, 80%, 90%, 95% and 99%. The measured dot is one seeded run that starts with an empty queue, discards a warm-up so that start does not drag it low, and averages a run length that grows like 1/(1 − ρ)²: here {runText}. It is not biased, but it still moves from seed to seed, most near the top where waits are long and slow to average.
        </Hint>
        <div className="qt-chips">
          <Provenance kind="simulated" seed={seed}>measured: {runText} at your ρ</Provenance>
          <Provenance kind="illustrative">μ = {MU}/s is made up; the curve is the same shape for any μ once time is measured in service times</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
