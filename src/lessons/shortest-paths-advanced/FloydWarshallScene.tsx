import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { EditControls, EditableGraph, PresetChips } from './Editor';
import type { GraphEditor } from './useGraphEditor';
import { fwFrames } from './frames';
import { floydWarshall, pathFromNext } from './model';
import { distText, sumText } from './text';

const STEP_MS = 1300;
const BIG_CELL = 40;
const SMALL_CELL = 32;
const BIG_GRID_NODES = 5;

export function FloydWarshallScene({ picker, ed }: { picker: ReactNode; ed: GraphEditor }) {
  const g = ed.graph;
  const n = g.names.length;
  const run = useMemo(() => floydWarshall(g), [g]);
  const frames = useMemo(() => fwFrames(g, run), [g, run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const step = run.steps[f.step];
  const [pair, setPair] = useState<{ i: number; j: number } | null>(null);
  const changed = new Set(f.changed.map((c) => `${c.i},${c.j}`));
  const negative = new Set(step.negativeDiagonal);

  const rings: GridHighlight[] = [];
  if (f.k >= 0) {
    for (let x = 0; x < n; x++) {
      rings.push({ r: f.k, c: x, tone: 'violet' });
      if (x !== f.k) rings.push({ r: x, c: f.k, tone: 'violet' });
    }
  }
  if (pair && pair.i < n && pair.j < n) rings.push({ r: pair.i, c: pair.j, tone: 'hi' });

  let pathLine: ReactNode = 'Click a cell to read one shortest path off the next-hop table.';
  if (pair && pair.i < n && pair.j < n) {
    const label = `${g.names[pair.i]} to ${g.names[pair.j]}`;
    if (negative.size > 0) {
      pathLine = `${label}: paths are not defined once a negative cycle is on the diagonal.`;
    } else {
      const path = pathFromNext(step.next, pair.i, pair.j);
      pathLine = path
        ? `${label}${f.k >= 0 ? ` (stopping only at nodes up to ${g.names[f.k]})` : ' (direct edges only)'}: ${path.map((v) => g.names[v]).join('→')}, cost ${sumText(g, step.d[pair.i][pair.j])}.`
        : `${label}: no path yet${f.k >= 0 ? ` with stops up to ${g.names[f.k]}` : ''}.`;
    }
  }

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Intermediate k" value={f.k < 0 ? '-' : g.names[f.k]} color="var(--violet)" sub={f.k < 0 ? 'direct edges only' : `step ${f.k + 1} of ${n}`} />
          <Stat label="Cells improved" value={f.changed.length} color="var(--ok)" sub="by this step" />
          <Stat
            label="Negative diagonal"
            value={negative.size}
            color={negative.size ? 'var(--bad)' : 'var(--muted)'}
            sub={negative.size ? [...negative].map((v) => g.names[v]).join(', ') : 'none yet'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'row and column k, read this step', shape: 'square' },
            { color: 'var(--ok)', label: 'cell improved', shape: 'square' },
            { color: 'var(--bad)', label: 'negative diagonal: negative cycle', shape: 'square' },
            { color: 'var(--hi)', label: 'cell whose path is shown', shape: 'square' },
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
            pickSource={false}
            ariaLabel={`Weighted directed graph, ${n} nodes and ${g.edges.length} edges`}
            edgeMark={() => undefined}
            nodeMark={(v) => (v === f.k ? { tone: 'violet', fill: 'tint' } : negative.has(v) ? { tone: 'bad', fill: 'tint' } : null)}
          />
        </div>
        <div className="spa-side">
          <Tray label="Distance matrix d[from][to]" labelWeight="regular" stack ariaLabel="Distance matrix">
            <CellGrid
              rows={n}
              cols={n}
              size={{ cell: n <= BIG_GRID_NODES ? BIG_CELL : SMALL_CELL, font: 12 }}
              rowLabels={g.names}
              colLabels={g.names}
              highlight={rings}
              cell={(r, c) => {
                const x = step.d[r][c];
                if (r === c && negative.has(r)) return { text: distText(g, x), tone: 'bad', fill: 'solid' };
                if (changed.has(`${r},${c}`)) return { text: distText(g, x), tone: 'ok', fill: 'tint', intensity: 0.4 };
                return { text: distText(g, x), fill: x === Infinity ? 'none' : 'outline', tone: 'muted' };
              }}
              onCellClick={(r, c) => setPair({ i: r, j: c })}
              cellAriaLabel={(r, c) => `From ${g.names[r]} to ${g.names[c]}: ${distText(g, step.d[r][c])}. Press to show the path`}
              ariaLabel="Floyd-Warshall distance matrix"
            />
          </Tray>
          <Tray label="Path recovery" labelWeight="regular" stack ariaLabel="Path recovery">
            <p className="spa-line" role="status">
              {pathLine}
            </p>
          </Tray>
          <Hint tone="muted" block>
            The next-hop table records, for each cell, the first step of the best path found so far; following it from i toward j prints the path.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">Floyd-Warshall runs live on the graph you edit</Provenance>
        {g.market && <Provenance kind="illustrative">invented exchange rates</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
