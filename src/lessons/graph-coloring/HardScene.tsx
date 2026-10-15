import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { ColourGraph } from './ColourGraph';
import { EditRow, PresetChips } from './Controls';
import { chromatic, conflicts, isInvented, twoColour } from './model';
import { hardCaption } from './text';
import type { ColorEditor } from './useColorEditor';

export function HardScene({ picker, ed }: { picker: ReactNode; ed: ColorEditor }) {
  const g = ed.graph;
  const two = useMemo(() => twoColour(g), [g]);
  const exact = useMemo(() => chromatic(g).number, [g]);
  const caption = hardCaption(g);
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Two-colour test" value={two.ok ? 'passes' : 'fails'} color={two.ok ? 'var(--ok)' : 'var(--bad)'} sub={two.ok ? 'one breadth-first sweep' : `odd cycle of ${two.oddCycle!.length}`} />
          <Stat label="Exact minimum" value={exact} color="var(--ok)" sub="by search" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'colour 1 of the sweep', shape: 'dot' },
            { color: 'var(--amber)', label: 'colour 2 of the sweep', shape: 'dot' },
            { color: 'var(--bad)', label: 'odd cycle: the clash', shape: 'line' },
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
          <ColourGraph
            g={g}
            colours={two.colours}
            cycle={two.oddCycle ?? []}
            conflictEdges={two.ok ? [] : conflicts(g, two.colours)}
            note={ed.note}
            onAddEdge={ed.addEdge}
            ariaLabel={`Two-colour sweep: ${two.ok ? 'succeeds' : `fails on an odd cycle of ${two.oddCycle!.length}`}`}
          />
        </div>
        <div className="gc-side">
          <Box className="gc-claims">
            <SectionTitle>What is known</SectionTitle>
            <p className="gc-line">
              <ClaimLabel kind="standard" /> Two colours: easy. A sweep that alternates colours either succeeds or finds an odd cycle.
            </p>
            <p className="gc-line">
              <ClaimLabel kind="standard" /> Deciding whether 3 or more colours suffice is NP-complete; see p-vs-np for what that means. The exact search here is feasible only because the graphs are tiny.
            </p>
            <p className="gc-line">
              <ClaimLabel kind="standard" /> Four colours suffice for any planar graph (the four colour theorem, proved with computer assistance).
            </p>
          </Box>
          <Hint tone="muted" block>
            Add an edge that closes an odd cycle and the sweep fails; remove one and it passes. A graph is two-colourable exactly when it has no odd cycle.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the two-colour sweep and the exact search run live on the graph you edit</Provenance>
        {isInvented(ed.presetId) && <Provenance kind="illustrative">invented example graph</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
