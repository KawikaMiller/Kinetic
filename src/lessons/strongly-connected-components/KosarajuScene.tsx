import { useMemo, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { EditRow, PresetChips } from './Controls';
import { sccFrames } from './frames';
import { kosaraju } from './model';
import { compColor } from './colors';
import { SccGraph } from './SccGraph';
import type { SccEditor } from './useSccEditor';

const STEP_MS = 800;

export function KosarajuScene({ picker, ed }: { picker: ReactNode; ed: SccEditor }) {
  const g = ed.graph;
  const run = useMemo(() => kosaraju(g, ed.order), [g, ed.order]);
  const frames = useMemo(() => sccFrames(g, run), [g, run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const assigned = f.comp.filter((c) => c >= 0).length;
  const compsSoFar = new Set(f.comp.filter((c) => c >= 0)).size;

  const cellState = (i: number): ArrayCellState => {
    const v = f.finished[i];
    if (f.phase === 'pass2' && f.comp[v] >= 0) return 'dim';
    return 'info';
  };

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Pass" value={f.phase === 'pass1' ? 1 : f.phase === 'reverse' ? '1 → 2' : 2} color="var(--hi)" sub={f.phase === 'pass2' ? 'reversed graph' : 'graph as drawn'} />
          <Stat label="On the stack" value={f.finished.length} color="var(--info)" sub={`of ${g.names.length} nodes finished`} />
          <Stat label="Components found" value={compsSoFar} sub={`${assigned} of ${g.names.length} nodes placed`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'node the search is on', shape: 'dot' },
            { color: 'var(--ok)', label: 'finished (pass 1)', shape: 'dot' },
            { color: 'var(--info)', label: 'on the finish stack', shape: 'square' },
            { color: 'var(--violet)', label: 'reversed edge (pass 2)', shape: 'line' },
            { color: 'var(--amber)', label: 'a component: node colour and hull', shape: 'dot' },
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
      <div className="scc-stage stage-pad">
        <div className="scc-main">
          <SccGraph
            ed={ed}
            comp={f.comp}
            reversed={f.reversed}
            current={f.current}
            nodeMark={(v) => (f.phase !== 'pass2' && f.finished.includes(v) ? { tone: 'ok', fill: 'tint' } : null)}
            ariaLabel={`Directed graph with ${g.names.length} nodes and ${g.edges.length} edges${f.reversed ? ', edges reversed' : ''}`}
          />
        </div>
        <div className="scc-side">
          <Tray label="Finish-order stack (top on the right)" labelWeight="regular" stack ariaLabel="Finish-order stack">
            {f.finished.length === 0 ? (
              <Hint>empty: nothing has finished yet</Hint>
            ) : (
              <ArrayStrip
                values={f.finished.map((v, i) => `${g.names[v]}·${f.times[i]}`)}
                cellState={cellState}
                pointers={[{ i: f.finished.length - 1, label: 'top', tone: 'info' }]}
                cellMax={52}
                fontSize={12}
              />
            )}
            <Hint tone="muted" block>Each cell is a node and its finish time.</Hint>
          </Tray>
          <Tray label="Components so far" labelWeight="regular" stack ariaLabel="Components so far">
            {compsSoFar === 0 ? (
              <Hint>none until pass 2</Hint>
            ) : (
              run.components.map((c, i) => {
                const placed = c.filter((v) => f.comp[v] === i);
                if (placed.length === 0) return null;
                return (
                  <span key={i} className="chip scc-comp" style={{ borderColor: compColor(i), color: compColor(i) }}>
                    {i + 1}: {placed.map((v) => g.names[v]).join(' ')}
                  </span>
                );
              })
            )}
          </Tray>
          <Hint tone="muted" block>
            The search order shown ({run.order.map((v) => g.names[v]).join(' ')}) is one valid choice: Scene 3 changes it, and the components stay the same.
          </Hint>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">Kosaraju&apos;s algorithm runs live on the graph you edit; Tarjan&apos;s is the second implementation the tests compare it with</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
