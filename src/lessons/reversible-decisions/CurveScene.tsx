import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { curveCaption, hoursText } from './captions';
import {
  DECISIONS, RIGOUR_BOUNDS, crossoverCost, decisionOf, optimalHours, optimalTotal, totalCost, type Rigour,
} from './model';
import { curveFor, type CurveState, type SceneProps } from './opening';

const PLOT = { width: 356, height: 240 } as const;
const NICE_STEP = 50;
const DECISION_OPTIONS = DECISIONS.map((d) => ({ value: d.id, label: d.short }));
const niceTop = (v: number): number => Math.max(NICE_STEP, Math.ceil(v / NICE_STEP) * NICE_STEP);

/** Scene 2: the expected cost against hours of rigour (a U), and where the crossover sits as the cost to undo grows. */
export function CurveScene({ picker, state, onState }: SceneProps & { state: CurveState; onState: (next: CurveState) => void }) {
  const m: Rigour = { undo: state.undo, p0: state.p0, tau: state.tau, w: state.w };
  const label = decisionOf(state.decision).label;
  const star = optimalHours(m);
  const crossover = crossoverCost(m.p0, m.tau, m.w);
  const atZero = totalCost(0, m);
  const atStar = optimalTotal(m);
  const atYours = totalCost(state.hours, m);
  const set = (change: Partial<CurveState>) => onState({ ...state, ...change });
  const totalTop = niceTop(Math.max(atZero, totalCost(RIGOUR_BOUNDS.hours.max, m)));
  const starTop = niceTop(optimalHours({ ...m, undo: RIGOUR_BOUNDS.undo.max }));

  return (
    <StageFrame
      height={640}
      intro={curveCaption(label, m, state.hours)}
      introKey={`${state.decision}|${state.undo}|${state.p0}|${state.tau}|${state.w}|${state.hours}`}
      stats={
        <Stats>
          <Stat label="Crossover cost" value={`${hoursText(crossover)} h`} sub={`below this many hours to undo, deciding now wins (tau ${state.tau} h x w ${state.w} / p0 ${state.p0})`} />
          <Stat label="Best rigour r*" value={star > 0 ? `${hoursText(star)} h` : 'decide now'} color="var(--ok)" sub={`lowest expected cost ${hoursText(atStar)} h`} />
          <Stat label="With no rigour" value={`${hoursText(atZero)} h`} color={atZero > atStar ? 'var(--bad)' : undefined} sub="expected cost of deciding now" />
          <Stat label="At your hours" value={`${hoursText(atYours)} h`} color="var(--hi)" sub={`${state.hours} h of rigour, ${hoursText(atYours - atStar)} h above the best`} />
        </Stats>
      }
      legend={<Legend items={[
        { color: 'var(--info)', label: 'expected cost against hours of rigour', shape: 'line' },
        { color: 'var(--bad)', label: 'no rigour', shape: 'dot' },
        { color: 'var(--ok)', label: 'best rigour', shape: 'dot' },
        { color: 'var(--hi)', label: 'your hours', shape: 'dot' },
      ]} />}
      controls={[
        <>{picker}<Segmented ariaLabel="Decision" value={state.decision} options={DECISION_OPTIONS} onChange={(id: string) => onState(curveFor(id, state))} /></>,
        <>
          <Slider label="Hours to undo C" value={state.undo} {...RIGOUR_BOUNDS.undo} format={integer} onChange={(undo) => set({ undo })} />
          <Slider label="Chance wrong p0" value={state.p0} {...RIGOUR_BOUNDS.p0} format={(v) => `${Math.round(v * 100)}%`} onChange={(p0) => set({ p0 })} />
        </>,
        <>
          <Slider label="Rigour speed tau" value={state.tau} {...RIGOUR_BOUNDS.tau} format={(v) => `${v} h`} onChange={(tau) => set({ tau })} />
          <Slider label="Price of rigour w" value={state.w} {...RIGOUR_BOUNDS.w} format={(v) => `${v}`} onChange={(w) => set({ w })} />
        </>,
        <><Slider label="Your rigour r" value={state.hours} {...RIGOUR_BOUNDS.hours} format={(v) => `${v} h`} onChange={(hours) => set({ hours })} /></>,
      ]}
    >
      <div className="rd-stage stage-pad">
        <Plot2D x={{ domain: [0, RIGOUR_BOUNDS.hours.max], label: 'hours of rigour' }} y={{ domain: [0, totalTop], label: 'expected cost (hours)', ticks: 5 }} width={PLOT.width} height={PLOT.height} ariaLabel={`Expected cost of deciding ${label} against hours of rigour`}>
          <Curve fn={(r) => totalCost(r, m)} tone="info" />
          <Points
            data={[{ x: 0, y: atZero, tone: 'bad' }, { x: star, y: atStar, tone: 'ok' }, { x: state.hours, y: atYours, tone: 'hi' }]}
            labels={(i) => (i === 0 ? 'none' : i === 1 ? 'r*' : 'you')}
          />
        </Plot2D>
        <Plot2D x={{ domain: [0, RIGOUR_BOUNDS.undo.max], label: 'hours to undo (C)' }} y={{ domain: [0, starTop], label: 'best rigour r* (hours)', ticks: 5 }} width={PLOT.width} height={PLOT.height} ariaLabel="Best hours of rigour against the cost to undo, flat at zero until the crossover">
          <Curve fn={(c) => optimalHours({ ...m, undo: c })} tone="info" />
          <VLine at={crossover} label={`C* ${hoursText(crossover)}`} tone="dim" />
          <Points data={[{ x: state.undo, y: star, tone: 'hi' }]} />
        </Plot2D>
        <table className="data-table rd-table">
          <caption>The three totals, in hours of work</caption>
          <thead><tr><th>Move</th><th>Rigour</th><th>Expected cost</th><th>Above the best</th></tr></thead>
          <tbody>
            <tr><td>Decide now</td><td>0 h</td><td>{hoursText(atZero)}</td><td>{hoursText(atZero - atStar)}</td></tr>
            <tr><td>Best rigour</td><td>{hoursText(star)} h</td><td>{hoursText(atStar)}</td><td>0</td></tr>
            <tr><td>Your hours</td><td>{state.hours} h</td><td>{hoursText(atYours)}</td><td>{hoursText(atYours - atStar)}</td></tr>
          </tbody>
        </table>
        <ProvenanceRow>
          <Provenance kind="invented">the formula and every constant are made up: it shows the arithmetic of a trade-off, not how much rigour any real decision deserves</Provenance>
          <ClaimLabel kind="practice">spending more care where a mistake is costly to undo is a common rule of thumb</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
