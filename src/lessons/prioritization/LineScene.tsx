import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { lineCaption } from './captions';
import { CAPACITY, ITEMS, lineOf, orderBy, withinCapacity } from './model';
import { OPENING } from './opening';

const RATIO_ORDER = orderBy(ITEMS, 'ratio');

/** Scene 4: a capacity in weeks, the items inside it, and the price of the ones left out. */
export function LineScene({ picker }: { picker: ReactNode }) {
  const [capacity, setCapacity] = useState(OPENING.line.capacity);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(withinCapacity(ITEMS, OPENING.line.capacity)));
  const line = lineOf(ITEMS, chosen);
  const over = line.used > capacity;
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <StageFrame
      height={560}
      intro={lineCaption(line, capacity, chosen.size, ITEMS.length)}
      introKey={[capacity, [...chosen].sort().join()]}
      stats={
        <Stats>
          <Stat label="Work chosen" value={`${line.used} of ${capacity} weeks`} color={over ? 'var(--bad)' : 'var(--ok)'} sub={over ? 'over capacity' : 'fits'} />
          <Stat label="Value once live" value={`${line.value} a week`} color="var(--ok)" />
          <Stat label="Price of what is cut" value={`${line.cutCost} a week`} color="var(--bad)" sub="cost of delay of every item left out" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'in this quarter' }, { color: 'var(--dim)', label: 'not this quarter' }, { color: 'var(--bad)', label: 'over capacity, or the price of what is cut' }]} />}
      controls={[
        <>
          {picker}
          <Slider
            label="Team capacity (weeks)"
            value={capacity}
            {...CAPACITY}
            onChange={(v) => {
              setCapacity(v);
              setChosen(new Set(withinCapacity(ITEMS, v)));
            }}
          />
        </>,
      ]}
    >
      <div className="pz-stage stage-pad">
        <Hint tone="muted" block>Items are in cost-of-delay-over-duration order. Moving the capacity slider re-draws the line; press an item to move it across.</Hint>
        <ul className="pz-line">
          {RATIO_ORDER.map((id) => {
            const item = ITEMS.find((i) => i.id === id)!;
            const inside = chosen.has(id);
            return (
              <li key={id} className={inside ? 'pz-in' : 'pz-out'}>
                <ChipButton tone={inside ? 'ok' : 'dim'} size="md" on={inside} onStyle="solid" onClick={() => toggle(id)}>{inside ? 'In' : 'Out'}</ChipButton>
                <span className="pz-line-label">{item.label}</span>
                <span className="pz-line-meta">{item.impact} a week, {item.effort} weeks</span>
              </li>
            );
          })}
        </ul>
        <ProvenanceRow>
          <Provenance kind="invented">the items, the capacity and every number</Provenance>
          <ClaimLabel kind="practice">drawing a visible line and pricing what falls below it is a common way to make &quot;no&quot; concrete</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
