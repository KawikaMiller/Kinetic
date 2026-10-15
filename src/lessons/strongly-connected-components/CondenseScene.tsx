import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { cssVar } from '../../core/palette';
import { plainTone } from '../../core/tone';
import { EditRow, PresetChips } from './Controls';
import { condense, kosaraju } from './model';
import { compColor } from './colors';
import { SccGraph } from './SccGraph';
import type { SccEditor } from './useSccEditor';

const CONDENSED_BOX = { w: 96, h: 40 };
const CONDENSED_MIN_WIDTH = 300;

export function CondenseScene({ picker, ed }: { picker: ReactNode; ed: SccEditor }) {
  const g = ed.graph;
  const { run, cond } = useMemo(() => {
    const r = kosaraju(g);
    return { run: r, cond: condense(g, r.comp, r.components.length) };
  }, [g]);
  const [showOrder, setShowOrder] = useState(false);
  const label = (c: number) => [...run.components[c]].sort((a, b) => a - b).map((v) => g.names[v]).join(' ');
  const isDag = run.components.length === g.names.length;
  useIntroCaption(
    <>
      Collapsing each hull leaves {run.components.length} {run.components.length === 1 ? 'node' : 'nodes'} and {cond.edges.length} {cond.edges.length === 1 ? 'edge' : 'edges'}, and the collapsed graph has no cycle.
      {showOrder && cond.order ? ` A dependency order: ${cond.order.map(label).map((l) => `{${l}}`).join(' then ')}.` : ' Press Topological order to see one.'}
    </>,
    [run.components.length, cond.edges.length, showOrder, g],
  );

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Nodes" value={g.names.length} />
          <Stat label="Components" value={run.components.length} color="var(--amber)" sub={isDag ? 'one per node: no cycle at all' : undefined} />
          <Stat label="Edges between components" value={cond.edges.length} color="var(--violet)" sub="after collapsing" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a component: hull and box colour', shape: 'dot' },
            { color: 'var(--info)', label: 'position in the topological order', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <EditRow ed={ed} />
          <ChipButton tone="info" on={showOrder} onClick={() => setShowOrder(!showOrder)}>
            Topological order
          </ChipButton>
        </>,
      ]}
    >
      <div className="scc-stage stage-pad">
        <div className="scc-main">
          <SccGraph ed={ed} comp={run.comp} ariaLabel={`Directed graph with ${run.components.length} components`} />
        </div>
        <div className="scc-side">
          <Tray label="Collapse each hull to one node" labelWeight="regular" stack ariaLabel="Condensed graph">
            <WideRegion minWidth={CONDENSED_MIN_WIDTH} label="Condensed graph: scroll sideways to see all of it">
              <GraphView
                nodes={run.components.map((_, c) => ({ id: c, label: label(c), shape: 'box' as const }))}
                edges={cond.edges.map(([from, to]) => ({ from, to }))}
                directed
                layout="layered"
                spacing={{ direction: 'right', layerGap: 120, nodeGap: 52, padMain: 56, padCross: 30 }}
                box={CONDENSED_BOX}
                className="scc-condensed"
                nodeColor={(c) => cssVar(plainTone(c))}
                nodeMark={() => (showOrder ? { tone: 'info', fill: 'tint' } : null)}
                renderNode={(n, at, base) => (
                  <>
                    {base}
                    {showOrder && cond.order && (
                      <text x={at.x + CONDENSED_BOX.w / 2 - 10} y={at.y - CONDENSED_BOX.h / 2 - 4} className="scc-order-badge" textAnchor="middle">
                        {cond.order.indexOf(Number(n.id)) + 1}
                      </text>
                    )}
                  </>
                )}
                ariaLabel="Condensed graph: one node per component"
              />
            </WideRegion>
          </Tray>
          {showOrder && cond.order && (
            <Tray label="Dependency order" labelWeight="regular" ariaLabel="Topological order of the components">
              {cond.order.map((c, i) => (
                <span key={c} className="chip scc-comp" style={{ borderColor: compColor(c), color: compColor(c) }}>
                  {i + 1}. {label(c)}
                </span>
              ))}
            </Tray>
          )}
          <Hint tone="muted" block>
            The collapsed graph has no cycle: a cycle through two components would let each reach the other, and then they would have been one component to begin with.
            {isDag ? ' Here the graph had no cycle already, so collapsing changes nothing.' : ''}
            {' '}In the dependency order an edge from a to b puts a before b.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">components and the order are computed live from the graph you edit</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
