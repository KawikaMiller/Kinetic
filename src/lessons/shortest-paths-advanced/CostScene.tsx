import { useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toneVar, type Tone } from '../../core/tone';
import { EditControls, EditableGraph, PresetChips } from './Editor';
import type { GraphEditor } from './useGraphEditor';
import { bellmanFord, costs, floydWarshall } from './model';
import { costVerdict } from './text';

interface Row {
  label: string;
  formula: string;
  count: number;
  tone: Tone;
}

export function CostScene({ picker, ed }: { picker: ReactNode; ed: GraphEditor }) {
  const g = ed.graph;
  const c = useMemo(() => costs(g, bellmanFord(g, ed.source), floydWarshall(g)), [g, ed.source]);
  useIntroCaption(<>{costVerdict(c)}</>, [c.bellmanFordAll, c.floydWarshall, c.floydWarshallFull, c.nodes, c.edges]);
  const rows: Row[] = [
    { label: `Bellman-Ford from ${g.names[ed.source]}`, formula: 'rounds × edges', count: c.bellmanFordOne, tone: 'info' },
    { label: 'Bellman-Ford from every node', formula: 'added up over the sources', count: c.bellmanFordAll, tone: 'info' },
    { label: 'Floyd-Warshall, all pairs', formula: 'k × n × n', count: c.floydWarshall, tone: 'violet' },
  ];
  const widest = Math.max(...rows.map((r) => r.count), 1);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Nodes n" value={c.nodes} />
          <Stat label="Edges m" value={c.edges} />
          <Stat label="Worst case, one source" value={c.bellmanFordWorst} color="var(--info)" sub="n rounds × m edges (n - 1, plus the check)" />
          <Stat label="Worst case, Floyd-Warshall" value={c.floydWarshallFull} color="var(--violet)" sub="n × n × n" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'Bellman-Ford', shape: 'square' },
            { color: 'var(--violet)', label: 'Floyd-Warshall', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <><EditControls ed={ed} /></>,
      ]}
    >
      <div className="spa-stage stage-pad">
        <div className="spa-main">
          <EditableGraph
            ed={ed}
            ariaLabel={`Weighted directed graph, ${c.nodes} nodes and ${c.edges} edges`}
            edgeMark={() => undefined}
            nodeMark={() => null}
          />
        </div>
        <div className="spa-side">
          <Box className="spa-costs">
            <SectionTitle hint="one unit: one relaxation, a comparison of a path against the best known">What each run did on this graph</SectionTitle>
            {rows.map((r) => (
              <div key={r.label} className="spa-cost-row">
                <span className="spa-cost-label">
                  {r.label}
                  <small>{r.formula}</small>
                </span>
                <span className="spa-cost-bar" role="img" aria-label={`${r.label}: ${r.count} relaxations`}>
                  <i style={{ width: `${(r.count / widest) * 100}%`, background: toneVar(r.tone) }} />
                </span>
                <b>{r.count}</b>
              </div>
            ))}
            <p className="spa-line">{costVerdict(c)}</p>
          </Box>
          <Hint tone="muted" block>
            Bellman-Ford&apos;s bound is O(V·E) and Floyd-Warshall&apos;s is O(V³). The counts are the runs on the graph you see, with the early stop and the negative-cycle stop included.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">counts come from running both algorithms, not from the formulas</Provenance>
        {g.market && <Provenance kind="illustrative">invented exchange rates</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
