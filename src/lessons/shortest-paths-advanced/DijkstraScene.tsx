import { useMemo, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { EditControls, EditableGraph, PresetChips } from './Editor';
import type { GraphEditor } from './useGraphEditor';
import { dijkstraFrames } from './frames';
import { bellmanFord } from './model';
import { distText, nodeList } from './text';

const STEP_MS = 1100;

export function DijkstraScene({ picker, ed }: { picker: ReactNode; ed: GraphEditor }) {
  const g = ed.graph;
  const truth = useMemo(() => bellmanFord(g, ed.source), [g, ed.source]);
  const frames = useMemo(() => dijkstraFrames(g, ed.source), [g, ed.source]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const showWrong = player.atEnd ? f.wrong : [];
  const wrongNow = new Set(showWrong);

  const cellState = (v: number): ArrayCellState => {
    if (wrongNow.has(v)) return 'bad';
    if (v === f.current) return 'active';
    if (f.dist[v] === Infinity) return 'dim';
    return f.finalised.includes(v) ? 'info' : 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Finalised" value={`${f.finalised.length} of ${g.names.length}`} color="var(--info)" sub="nodes Dijkstra will not revisit" />
          <Stat
            label="Wrong at the end"
            value={player.atEnd ? f.wrong.length : '-'}
            color={player.atEnd && f.wrong.length ? 'var(--bad)' : 'var(--muted)'}
            sub={player.atEnd ? (f.wrong.length ? nodeList(g, f.wrong) : 'none on this graph') : 'play to the end'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'node being finalised', shape: 'dot' },
            { color: 'var(--info)', label: 'finalised, never revisited', shape: 'dot' },
            { color: 'var(--bad)', label: 'wrong distance / skipped edge', shape: 'dot' },
            { color: 'var(--ok)', label: 'edge that lowered a distance', shape: 'line' },
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
            ariaLabel={`Weighted directed graph, ${g.names.length} nodes, Dijkstra from ${g.names[ed.source]}`}
            edgeMark={(i) => {
              if (f.skipped.includes(i)) return { tone: 'bad', width: 5, dashed: true };
              if (f.lowered.includes(i)) return { tone: 'ok', width: 4.5 };
              return undefined;
            }}
            nodeMark={(v) => {
              if (wrongNow.has(v)) return { tone: 'bad', fill: 'tint' };
              if (v === f.current) return { tone: 'hi', fill: 'tint' };
              return f.finalised.includes(v) ? { tone: 'info', fill: 'tint' } : null;
            }}
          />
        </div>
        <div className="spa-side">
          <Tray label="Dijkstra's distances" labelWeight="regular" stack ariaLabel="Dijkstra distances">
            <ArrayStrip
              values={f.dist.map((x) => distText(g, x))}
              cellState={cellState}
              cellMax={64}
              fontSize={12}
              renderValue={(text, v) => (
                <span className="spa-cell">
                  <small>{g.names[v]}</small>
                  <b>{text}</b>
                </span>
              )}
            />
          </Tray>
          <Tray label="Bellman-Ford's distances (the truth)" labelWeight="regular" stack ariaLabel="Bellman-Ford distances">
            <ArrayStrip
              values={truth.dist.map((x) => (x === -Infinity ? 'no path' : distText(g, x)))}
              cellState={(v) => (wrongNow.has(v) ? 'bad' : truth.dist[v] === Infinity ? 'dim' : 'done')}
              cellMax={64}
              fontSize={12}
              renderValue={(text, v) => (
                <span className="spa-cell" title={truth.dist[v] === -Infinity ? 'no shortest path' : undefined}>
                  <small>{g.names[v]}</small>
                  <b>{text}</b>
                </span>
              )}
            />
          </Tray>
          <Hint tone="muted" block>
            Dijkstra here is the textbook one with a visited set: once a node is finalised its edges in are never looked at again.
            {player.atEnd ? ` On this graph it ${f.wrong.length ? 'gets a distance wrong' : 'gets every distance right'}.` : ''} Variants that re-open finalised nodes exist; they can lose
            Dijkstra&apos;s running-time guarantee (named here, not shown).
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">both algorithms run live on the graph you edit</Provenance>
        {g.market && <Provenance kind="illustrative">invented exchange rates</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
