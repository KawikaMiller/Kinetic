import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { Area, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, ControlGroup, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct, plural } from '../../core/format';
import { interestCaption } from './captions';
import {
  CAPACITY, DEFAULT_PLAN, HORIZONS, INITIAL_DEBT, PAYDOWN_MAX, RATE_MAX, RUSH_EXTRA, SHORTCUT_MAX, SHORTCUT_SAVING, SPRINTS, TARGET_VELOCITY,
  outcome, type Plan, type Sprint,
} from './model';

const PLOT_HEIGHT = 230;
/** Debt and velocity share one y axis, in points; it never drops below this so a small plan does not zoom in. */
const POINTS_FLOOR = 150;
const POINTS_STEP = 50;
const CUMULATIVE_STEP = 500;

const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;

/** Debt at the end of each sprint, with the starting stock at x = 0: a polyline read as a function of x. */
function debtAt(sprints: readonly Sprint[]) {
  const points: [number, number][] = [[0, INITIAL_DEBT], ...sprints.map((s): [number, number] => [s.t + 1, s.debtAfter])];
  return (x: number) => {
    const i = Math.min(points.length - 2, Math.max(0, Math.floor(x)));
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  };
}

export function InterestScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [horizon, setHorizon] = useState<number>(SPRINTS);
  const setCaption = useSetCaption();
  const o = useMemo(() => outcome(plan, horizon), [plan, horizon]);
  const set = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch });

  useEffect(() => {
    setCaption(interestCaption(plan, horizon, o), { quiet: true });
  }, [setCaption, plan, horizon, o]);

  const debtFn = useMemo(() => debtAt(o.paying), [o]);
  const maxDebt = Math.max(INITIAL_DEBT, ...o.paying.map((s) => s.debtAfter));
  const pointsTop = Math.max(POINTS_FLOOR, ceilTo(maxDebt, POINTS_STEP));
  const cumulativeTop = ceilTo(Math.max(o.total, o.baselineTotal), CUMULATIVE_STEP);
  const velocityPoints: [number, number][] = o.paying.map((s) => [s.t + 1, s.velocity]);
  const cumulativePoints = (xs: readonly Sprint[]): [number, number][] => [[0, 0], ...xs.map((s): [number, number] => [s.t + 1, s.cumulative])];
  const first = o.paying[0].velocity;
  const last = o.paying[o.paying.length - 1].velocity;

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Velocity" value={`${Math.round(first)} → ${Math.round(last)}`} color="var(--info)" sub={`points a sprint, sprint 1 to ${horizon}`} />
          <Stat
            label="Features delivered"
            value={Math.round(o.total).toLocaleString('en-US')}
            color="var(--ok)"
            sub={[`${Math.round(o.baselineTotal).toLocaleString('en-US')} with no paydown`, `by sprint ${horizon}`]}
          />
          <Stat
            label="Debt left"
            value={Math.round(o.finalDebt)}
            color="var(--bad)"
            sub={[`${Math.round(o.baselineFinalDebt)} with no paydown`, 'points of principal']}
          />
          <Stat
            label="Break-even"
            value={o.breakEven === null ? 'never' : `sprint ${o.breakEven}`}
            color="var(--hi)"
            sub={o.breakEven === null ? `within ${plural(horizon, 'sprint')}` : 'paydown overtakes no paydown'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'velocity', shape: 'line' },
            { color: 'var(--bad)', label: 'debt stock', shape: 'square' },
            { color: 'var(--ok)', label: 'features, with your paydown', shape: 'line' },
            { color: 'var(--dim)', label: 'features, no paydown (dashed)', shape: 'line' },
            { color: 'var(--hi)', label: 'break-even sprint', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Horizon"
            value={horizon}
            onChange={setHorizon}
            options={HORIZONS.map((h) => ({ value: h, label: `${h} sprints` }))}
          />
          <Toggle label="Team habit" value={plan.rush} onChange={(rush) => set({ rush })} off="Steady" on="Rush when behind" />
        </>,
        <ControlGroup key="sliders" label="The plan">
          <Slider label="Interest per sprint" value={Math.round(plan.rate * 100)} min={0} max={RATE_MAX * 100} onChange={(v) => set({ rate: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Shortcuts per sprint" value={plan.shortcuts} min={0} max={SHORTCUT_MAX} onChange={(shortcuts) => set({ shortcuts })} format={(v) => `${v} points`} />
          <Slider
            label="Capacity spent on paydown"
            value={Math.round(plan.paydownShare * 100)}
            min={0}
            max={PAYDOWN_MAX * 100}
            step={5}
            onChange={(v) => set({ paydownShare: v / 100 })}
            format={(v) => `${v}%`}
          />
        </ControlGroup>,
      ]}
    >
      <div className="td stage-pad">
        <div className="td-plots">
          <div className="td-plot">
            <SectionTitle hint="points a sprint; debt in points of principal">Velocity and debt</SectionTitle>
            <Plot2D
              x={{ domain: [0, horizon], label: 'sprint', ticks: Math.min(horizon, 6) }}
              y={{ domain: [0, pointsTop], label: 'points' }}
              height={PLOT_HEIGHT}
              ariaLabel={`Velocity and debt stock over ${horizon} sprints`}
            >
              <Area fn={debtFn} from={0} to={horizon} tone="bad" />
              <Curve points={velocityPoints} tone="info" width={3} />
            </Plot2D>
          </div>
          <div className="td-plot">
            <SectionTitle hint="running total of features">Cumulative features</SectionTitle>
            <Plot2D
              x={{ domain: [0, horizon], label: 'sprint', ticks: Math.min(horizon, 6) }}
              y={{ domain: [0, cumulativeTop], label: 'features' }}
              height={PLOT_HEIGHT}
              ariaLabel={`Cumulative features over ${horizon} sprints, with and without paydown`}
            >
              <Curve points={cumulativePoints(o.baseline)} tone="dim" dashed width={2} />
              <Curve points={cumulativePoints(o.paying)} tone="ok" width={3} />
              {o.breakEven !== null && <VLine at={o.breakEven} label={`sprint ${o.breakEven}`} tone="hi" />}
            </Plot2D>
          </div>
        </div>
        <div className="td-notes">
          <Provenance kind="toy">
            a toy model, not a measurement: capacity {CAPACITY} points a sprint, debt starts at {INITIAL_DEBT}, velocity = capacity + {SHORTCUT_SAVING}×shortcuts − interest×debt − paydown. Rushing adds {RUSH_EXTRA} shortcut points in a sprint whose planned velocity is under {TARGET_VELOCITY}.
          </Provenance>
          <span className="td-claim">
            <ClaimLabel kind="view">debt as interest is a metaphor teams use, not a measurement</ClaimLabel>
            <ClaimLabel kind="practice">paying down where interest is high is a common rule of thumb; this model charges one rate on all debt, so it does not show that choice</ClaimLabel>
          </span>
          <Hint block>
            A point of shortcut skips a point of work today and adds a point of principal. Each point of principal then costs {pct(plan.rate)} of a point of velocity, every sprint, until it is paid.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
