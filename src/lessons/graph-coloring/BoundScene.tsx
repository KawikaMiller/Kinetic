import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { ColourGraph } from './ColourGraph';
import { EditRow, PresetChips } from './Controls';
import { greedyColour, isInvented } from './model';
import { bound, boundCaption } from './text';
import type { ColorEditor } from './useColorEditor';

interface Row {
  label: string;
  value: number;
  tone: 'orange' | 'info' | 'violet' | 'ok';
}

export function BoundScene({ picker, ed }: { picker: ReactNode; ed: ColorEditor }) {
  const g = ed.graph;
  const b = useMemo(() => bound(g, ed.order), [g, ed.order]);
  const colours = useMemo(() => greedyColour(g, ed.order).colours, [g, ed.order]);
  const caption = boundCaption(b);
  useIntroCaption(<>{caption}</>, [caption]);
  const rows: Row[] = [
    { label: 'Greedy, your order', value: b.yours, tone: 'orange' },
    { label: 'Greedy, smallest-last', value: b.smallestLast, tone: 'violet' },
    { label: 'Bound: max degree + 1', value: b.degreeBound, tone: 'info' },
    { label: 'Bound: degeneracy + 1', value: b.degeneracyBound, tone: 'info' },
    { label: 'Exact minimum', value: b.optimum, tone: 'ok' },
  ];
  const widest = Math.max(...rows.map((r) => r.value), 1);

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Max degree" value={b.degreeBound - 1} sub="most neighbours any node has" />
          <Stat label="Degeneracy" value={b.degeneracy} color="var(--violet)" sub="the largest degree left when peeling" />
          <Stat label="Exact minimum" value={b.optimum} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'greedy in your order', shape: 'square' },
            { color: 'var(--violet)', label: 'greedy, smallest-last', shape: 'square' },
            { color: 'var(--info)', label: 'a bound', shape: 'square' },
            { color: 'var(--ok)', label: 'the exact minimum', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="gc-stage stage-pad">
        <div className="gc-main">
          <ColourGraph g={g} colours={colours} note={ed.note} onAddEdge={ed.addEdge} ariaLabel={`Graph coloured greedily in your order: ${b.yours} colours`} />
        </div>
        <div className="gc-side">
          <Box className="gc-bars">
            <SectionTitle hint="one unit: one colour">Colours used against the bounds</SectionTitle>
            {rows.map((r) => (
              <div key={r.label} className="gc-bar-row">
                <span className="gc-bar-label">{r.label}</span>
                <span className="gc-bar" role="img" aria-label={`${r.label}: ${r.value}`}>
                  <i style={{ width: `${(r.value / widest) * 100}%`, background: `var(--${r.tone})` }} />
                </span>
                <b>{r.value}</b>
              </div>
            ))}
          </Box>
          <Tray label="Peeling order, with the degree each node had when removed" labelWeight="regular" ariaLabel="Peeling order">
            {b.peelOrder.map((v, i) => (
              <span key={v} className="chip gc-peel">
                {g.names[v]} · {b.peelDegrees[i]}
              </span>
            ))}
          </Tray>
          <Hint tone="muted" block>
            Smallest-last colours in the reverse of this peeling order, so each node meets at most {b.degeneracy} earlier neighbours and always has a free colour among the first {b.degeneracy + 1}.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">greedy, the bounds and the exact minimum are computed live</Provenance>
        {isInvented(ed.presetId) && <Provenance kind="illustrative">invented example graph</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
