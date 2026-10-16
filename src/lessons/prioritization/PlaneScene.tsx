import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { planeCaption, QUADRANT_WORD, quadrantOf } from './captions';
import { FRAMEWORKS, RULES, SCALE, orderBy, placeItem, ranksBy, valueBy, type Item, type Rule } from './model';
import { OPENING } from './opening';

const PLOT = 520;
const SPLIT = 5;
const HORIZON = { min: 2, max: 40 };
const RULE_TONE: Record<Rule, 'violet' | 'orange' | 'ok'> = { impact: 'violet', effort: 'orange', ratio: 'ok' };

/** Scene 1: ten invented items on an impact against effort plane, three ordering rules and the value each delivers by a week. */
export function PlaneScene({ picker }: { picker: ReactNode }) {
  const [items, setItems] = useState<Item[]>(OPENING.plane.items);
  const [week, setWeek] = useState(OPENING.plane.week);
  const [note, setNote] = useState<string | null>(null);
  const ranks = useMemo(() => Object.fromEntries(RULES.map((r) => [r.value, ranksBy(items, r.value)])), [items]);
  const value = (rule: Rule) => valueBy(items, orderBy(items, rule), week);
  const lastWeek = items.reduce((s, i) => s + i.effort, 0);

  return (
    <StageFrame
      height={760}
      intro={planeCaption(items, week)}
      introKey={[JSON.stringify(items), week]}
      stats={
        <Stats>
          {RULES.map((r) => (
            <Stat key={r.value} label={`By week ${week}: ${r.label.toLowerCase()}`} value={Math.round(value(r.value))} color={`var(--${RULE_TONE[r.value]})`} sub="value delivered so far" />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'a backlog item (plain tone)' },
            { color: 'var(--violet)', label: 'cumulative value, highest impact first', shape: 'line' },
            { color: 'var(--orange)', label: 'lowest effort first', shape: 'line' },
            { color: 'var(--ok)', label: 'highest impact over effort', shape: 'line' },
            { color: 'var(--hi)', label: 'the week you picked', shape: 'line' },
          ]}
        />
      }
      controls={[<>{picker}<Slider label="Value delivered by week" value={week} {...HORIZON} onChange={setWeek} /></>]}
    >
      <div className="pz-stage stage-pad">
        <Hint tone="muted" block>Drag an item, or focus one and use the arrow keys (Page Up and Page Down pick the previous or next item). Effort stays at {SCALE.min} weeks or more: a zero-length item has no ratio.</Hint>
        {note && <Hint tone="muted" block>{note}</Hint>}
        <WideRegion minWidth={PLOT} label="Impact against effort: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [0, 10], ticks: 5, label: 'effort (weeks)' }}
            y={{ domain: [0, 10], ticks: 5, label: 'impact (value a week)' }}
            width={PLOT}
            height={320}
            ariaLabel="Backlog items placed by effort and impact"
          >
            <VLine at={SPLIT} tone="dim" />
            <HLine at={SPLIT} tone="dim" />
            <Points
              data={items.map((i) => ({ x: i.effort, y: i.impact, tone: 'sky' }))}
              r={6}
              roving
              labels={(k) => items[k].label}
              pointLabel={(k) => `${items[k].label}: ${QUADRANT_WORD[quadrantOf(items[k].impact, items[k].effort)]}`}
              onDrag={(k, [x, y]) => {
                const p = placeItem(x, y);
                setNote(p.refusal);
                setItems((all) => all.map((it, n) => (n === k ? { ...it, impact: p.impact, effort: p.effort } : it)));
              }}
            />
          </Plot2D>
        </WideRegion>
        <table className="data-table pz-table">
          <caption>Rank under each rule (1 is first)</caption>
          <thead><tr><th>Item</th><th>Group</th><th>Impact</th><th>Effort</th><th>Ratio</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.label}</td>
                <td>{QUADRANT_WORD[quadrantOf(i.impact, i.effort)]}</td>
                <td>{ranks.impact[i.id]}</td><td>{ranks.effort[i.id]}</td><td>{ranks.ratio[i.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <WideRegion minWidth={PLOT} label="Cumulative value delivered: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [0, lastWeek], ticks: 6, label: 'week' }}
            y={{ domain: [0, Math.max(...RULES.map((r) => valueBy(items, orderBy(items, r.value), lastWeek))) * 1.05], label: 'value delivered so far', ticks: 4 }}
            width={PLOT}
            height={240}
            ariaLabel="Cumulative value delivered by week under three ordering rules"
          >
            {RULES.map((r) => <Curve key={r.value} fn={(t) => valueBy(items, orderBy(items, r.value), t)} tone={RULE_TONE[r.value]} />)}
            <VLine at={Math.min(week, lastWeek)} tone="hi" />
          </Plot2D>
        </WideRegion>
        <table className="data-table pz-table">
          <caption>Scoring frameworks: heuristics, each with the inputs it uses</caption>
          <thead><tr><th>Name</th><th>Inputs</th><th>Note</th></tr></thead>
          <tbody>{FRAMEWORKS.map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.inputs}</td><td>{f.note}</td></tr>)}</tbody>
        </table>
        <ProvenanceRow>
          <ClaimLabel kind="practice">impact against effort, with quick wins, big bets, fill-ins and money pits, is a common grouping, not a method that gives an order</ClaimLabel>
          <ClaimLabel kind="practice">RICE, ICE, MoSCoW and WSJF are heuristics in common use</ClaimLabel>
          <Provenance kind="invented">ten backlog items with made-up impacts and efforts</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
