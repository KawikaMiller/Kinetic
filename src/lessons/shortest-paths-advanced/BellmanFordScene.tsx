import { useMemo, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { EditControls, EditableGraph, PresetChips } from './Editor';
import type { GraphEditor } from './useGraphEditor';
import { bfFrames } from './frames';
import { bellmanFord } from './model';
import { distText, edgeText, nodeList } from './text';

const STEP_MS = 650;

export function BellmanFordScene({ picker, ed }: { picker: ReactNode; ed: GraphEditor }) {
  const g = ed.graph;
  const run = useMemo(() => bellmanFord(g, ed.source), [g, ed.source]);
  const frames = useMemo(() => bfFrames(g, run), [g, run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const n = g.names.length;
  const changedRounds = f.roundChanges.filter((c) => c > 0).length;
  const current = f.edge === null ? null : g.edges[f.edge];

  const cellState = (v: number): ArrayCellState => {
    if (f.noPath.includes(v)) return 'bad';
    if (f.dist[v] === Infinity) return 'dim';
    if (current && current.to === v) return 'active';
    return !run.cycle && f.dist[v] === run.dist[v] ? 'done' : 'idle';
  };
  const edgeTone = (i: number) => {
    if (f.cycle.includes(i) || f.checkEdges.includes(i)) return { tone: 'bad' as const, width: 5 };
    if (i === f.edge) return { tone: f.lowered.includes(i) ? ('ok' as const) : ('hi' as const), width: 5 };
    if (f.lowered.includes(i)) return { tone: 'ok' as const, width: 3.5 };
    return undefined;
  };

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Round" value={f.round === 0 ? '-' : f.round === n ? `${n} (check)` : f.round} color="var(--hi)" sub={`${changedRounds} of ${f.roundChanges.length} finished changed something`} />
          <Stat label="Changed this round" value={f.changes} color="var(--ok)" sub="distances lowered in the round shown" />
          <Stat label="Edge tests" value={f.tests} sub={`${g.edges.length} per round`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'edge being tested', shape: 'line' },
            { color: 'var(--ok)', label: 'lowered a distance', shape: 'line' },
            { color: 'var(--info)', label: 'negative edge', shape: 'line' },
            { color: 'var(--bad)', label: 'negative cycle / no shortest path', shape: 'line' },
            { color: 'var(--dim)', label: 'not reached yet', shape: 'dot' },
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
            ariaLabel={`Weighted directed graph, ${n} nodes and ${g.edges.length} edges, source ${g.names[ed.source]}`}
            edgeMark={edgeTone}
            nodeMark={(v) => (f.noPath.includes(v) ? { tone: 'bad', fill: 'tint' } : f.dist[v] === Infinity ? { tone: 'dim', fill: 'tint' } : null)}
          />
        </div>
        <div className="spa-side">
          <Tray label={`Distance from ${g.names[ed.source]}`} labelWeight="regular" stack ariaLabel="Distances">
            <ArrayStrip
              values={f.dist.map((x) => distText(g, x))}
              cellState={cellState}
              cellMax={64}
              fontSize={12}
              renderValue={(text, v) => (
                <span className="spa-cell" title={f.noPath.includes(v) ? 'no shortest path' : undefined}>
                  <small>{g.names[v]}</small>
                  <b>{f.noPath.includes(v) ? 'no path' : text}</b>
                </span>
              )}
            />
            {f.noPath.length > 0 && <Hint tone="muted" block>No shortest path: {nodeList(g, f.noPath)}.</Hint>}
          </Tray>
          <Tray label="Edge order, the same every round" labelWeight="regular" ariaLabel="Edge order">
            {g.edges.map((_, i) => (
              <span key={i} className={`chip spa-edge ${i === f.edge ? 'tone-hi' : f.lowered.includes(i) ? 'tone-ok' : ''}`}>
                {i + 1}. {edgeText(g, i)}
              </span>
            ))}
          </Tray>
          <Hint tone="muted" block>
            Round counts depend on this order: the same graph with its edges listed the other way round can need more or fewer rounds. The distances at the end do not.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">Bellman-Ford runs live on the graph you edit</Provenance>
        {g.market && <Provenance kind="illustrative">invented exchange rates: arbitrage is the idea, not advice</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
