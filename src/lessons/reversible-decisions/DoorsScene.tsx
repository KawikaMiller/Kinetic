import { useState } from 'react';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { doorsCaption, hoursText, techniqueCaption } from './captions';
import {
  DEFAULT_TAU, DEFAULT_W, DOORS, DOORS_P0, RIGOUR_BOUNDS, TECHNIQUES, crossoverCost, decisionOf, doorClosing, rigourOf, techniqueRows, undoAt,
} from './model';
import type { SceneProps } from './opening';

const PLOT = { width: 356, height: 240 } as const;
const TABLE_MIN_WIDTH = 520;
const NICE_STEP = 50;
/** The four decisions of scene 1 that cost the most to undo. */
const PICKABLE = ['database', 'contract', 'schema', 'fields'].map((id) => decisionOf(id));
const PICK_OPTIONS = PICKABLE.map((d) => ({ value: d.id, label: d.short }));
const niceTop = (v: number): number => Math.max(NICE_STEP, Math.ceil(v / NICE_STEP) * NICE_STEP);
const NO_TECHNIQUE = 'none';
const TECHNIQUE_OPTIONS = [{ value: NO_TECHNIQUE, label: 'No technique' }, ...TECHNIQUES.map((t) => ({ value: t.id, label: t.label }))];

/** Scene 3: a door that closes as adoption grows, and five techniques that make a door wider, each with its price. */
export function DoorsScene({ picker }: SceneProps) {
  const [c0, setC0] = useState(20);
  const [growth, setGrowth] = useState(10);
  const [month, setMonth] = useState(0);
  const [decision, setDecision] = useState('database');
  const [tau, setTau] = useState(DEFAULT_TAU);
  const [w, setW] = useState(DEFAULT_W);
  const [technique, setTechnique] = useState(NO_TECHNIQUE);

  const crossover = crossoverCost(DOORS_P0, tau, w);
  const closing = doorClosing(c0, growth, crossover);
  const costNow = undoAt(c0, growth, month);
  const top = niceTop(Math.max(undoAt(c0, growth, DOORS.month.max), crossover * 1.2));
  const d = decisionOf(decision);
  const rows = techniqueRows(rigourOf(d, tau, w));
  const picked = rows.find((r) => r.technique.id === technique) ?? null;

  return (
    <StageFrame
      height={640}
      intro={<>{doorsCaption(c0, growth, crossover, month)} {techniqueCaption(d.short.toLowerCase(), picked)}</>}
      introKey={`${c0}|${growth}|${month}|${decision}|${tau}|${w}|${technique}`}
      stats={
        <Stats>
          <Stat label="Door closes" value={closing.kind === 'month' ? `month ${hoursText(closing.month)}` : closing.kind === 'already' ? 'at month 0' : 'never'} sub={`when the cost to undo reaches the crossover of ${hoursText(crossover)} h (p0 ${DOORS_P0})`} />
          <Stat label={`Cost to undo at month ${month}`} value={`${hoursText(costNow)} h`} color={costNow >= crossover ? 'var(--bad)' : 'var(--ok)'} sub={costNow >= crossover ? 'one-way: past the crossover' : 'two-way: under the crossover'} />
          <Stat label="Techniques that pay" value={`${rows.filter((r) => r.pays).length} of ${rows.length}`} sub={`on ${d.short.toLowerCase()}, with tau ${tau} h and w ${w}`} />
        </Stats>
      }
      legend={<Legend items={[
        { color: 'var(--info)', label: 'cost to undo over the months', shape: 'line' },
        { color: 'var(--dim)', label: 'the crossover', shape: 'line' },
        { color: 'var(--ok)', label: 'a technique that pays', shape: 'square' },
        { color: 'var(--orange)', label: 'one that does not', shape: 'square' },
      ]} />}
      controls={[
        <>{picker}</>,
        <>
          <Slider label="Cost to undo today C0" value={c0} {...DOORS.c0} format={integer} onChange={setC0} />
          <Slider label="Growth a month" value={growth} {...DOORS.growth} format={(v) => `${v}%`} onChange={setGrowth} />
          <Slider label="Month" value={month} {...DOORS.month} format={(v) => `${v}`} onChange={setMonth} />
        </>,
        <>
          <Slider label="Rigour speed tau" value={tau} {...RIGOUR_BOUNDS.tau} format={(v) => `${v} h`} onChange={setTau} />
          <Slider label="Price of rigour w" value={w} {...RIGOUR_BOUNDS.w} format={(v) => `${v}`} onChange={setW} />
        </>,
        <>
          <Segmented ariaLabel="Decision for the techniques" value={decision} options={PICK_OPTIONS} onChange={setDecision} />
          <Segmented ariaLabel="Technique" value={technique} options={TECHNIQUE_OPTIONS} onChange={setTechnique} />
        </>,
      ]}
    >
      <div className="rd-stage stage-pad">
        <Plot2D x={{ domain: [0, DOORS.month.max], label: 'months of adoption' }} y={{ domain: [0, top], label: 'hours to undo', ticks: 5 }} width={PLOT.width} height={PLOT.height} ariaLabel="Cost to undo over twelve months against the crossover cost">
          <Curve fn={(t) => undoAt(c0, growth, t)} tone="info" />
          <HLine at={crossover} label={`crossover ${hoursText(crossover)}`} tone="dim" />
          {closing.kind === 'month' && closing.month <= DOORS.month.max && <VLine at={closing.month} label="one-way" tone="dim" />}
        </Plot2D>
        <Hint tone="muted" block>
          {`The first plot uses a chance of being wrong of ${DOORS_P0} and the tau and w below it; the techniques use the chosen decision's own chance. A technique multiplies the cost to undo by its factor, and costs its set-up hours first.`}
        </Hint>
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table rd-table">
            <caption>Five techniques on the {d.short.toLowerCase()} decision ({integer(d.undo)} hours to undo, {Math.round(d.p0 * 100)}% chance wrong)</caption>
            <thead><tr><th>Technique</th><th>Multiplies cost by</th><th>Set-up hours</th><th>Cost to undo after</th><th>Expected saving</th><th>Verdict</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.technique.id} className={r.technique.id === technique ? 'rd-picked' : undefined}>
                  <td>{r.technique.label}</td>
                  <td>{r.technique.factor}</td>
                  <td>{r.technique.setup}</td>
                  <td>{hoursText(r.undoAfter)}</td>
                  <td>{hoursText(r.saving)}</td>
                  <td style={{ color: r.pays ? 'var(--ok)' : 'var(--orange)' }}>{r.pays ? 'pays' : 'does not pay'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <ProvenanceRow>
          <Provenance kind="invented">each technique&apos;s factor and set-up hours, and the growth of the cost to undo, are made up</Provenance>
          <ClaimLabel kind="view">a decision can start as a two-way door and become a one-way door as people come to depend on it</ClaimLabel>
          <ClaimLabel kind="practice">flags, adapter layers, expand-then-contract changes, pilots and time-boxed contracts are common ways to make a decision cheaper to undo</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
