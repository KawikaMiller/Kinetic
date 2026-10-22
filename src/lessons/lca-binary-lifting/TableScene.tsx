import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { judgeGrandparent } from './model';
import { TableGrid } from './TableGrid';
import { TreeControls } from './TreeControls';
import { TreeView } from './TreeView';
import { useTree } from './useTree';

interface Progress {
  key: string;
  /** Nodes whose level-1 cell the learner has filled in (or that Fill the rest revealed). */
  filled: readonly number[];
  /** The unfilled node whose cell the learner chose to answer next, if any. */
  chosen: number | null;
  message: string | null;
  ok: boolean;
  /** A filled cell the learner clicked, to see how it comes from the level below. */
  explain: readonly [number, number] | null;
}

const NONE: readonly number[] = [];

/** Scene 1: the learner fills level 1 of the jump table (the grandparents) by clicking nodes; higher levels are then computed from the one below. */
export function TableScene({ picker }: { picker: ReactNode }) {
  const tree = useTree();
  const { parents, table } = tree;
  const n = parents.length;
  const key = parents.join();
  const [progress, setProgress] = useState<Progress>({ key, filled: NONE, chosen: null, message: null, ok: true, explain: null });
  const p: Progress = progress.key === key ? progress : { key, filled: NONE, chosen: null, message: null, ok: true, explain: null };
  const isFilled = (v: number) => p.filled.includes(v);
  const firstOpen = Array.from({ length: n }, (_, v) => v).find((v) => !isFilled(v));
  const target = p.chosen !== null && !isFilled(p.chosen) ? p.chosen : firstOpen;
  const complete = target === undefined;

  const answer = (picked: number) => {
    if (target === undefined) return;
    const verdict = judgeGrandparent(parents, target, picked);
    if (verdict.ok) {
      setProgress({ ...p, filled: [...p.filled, target], chosen: null, message: `Right: up[1][${target}] = ${picked}.`, ok: true });
    } else {
      setProgress({ ...p, message: verdict.error, ok: false });
    }
  };
  const fillRest = () => setProgress({ ...p, filled: Array.from({ length: n }, (_, v) => v), chosen: null, message: 'Filled in: level 1 is the grandparent of every node.', ok: true });
  const reset = () => setProgress({ key, filled: NONE, chosen: null, message: null, ok: true, explain: null });

  const click = (k: number, v: number) => {
    if (k === 0) return;
    if (k === 1 && !isFilled(v)) setProgress({ ...p, chosen: v });
    else if (k === 1 || complete) setProgress({ ...p, explain: [k, v] });
  };
  const explanation = p.explain
    ? (() => {
        const [k, v] = p.explain;
        const mid = table.up[k - 1][v];
        return `up[${k}][${v}] = up[${k - 1}][up[${k - 1}][${v}]] = up[${k - 1}][${mid}] = ${table.up[k][v]}.`;
      })()
    : null;
  const prompt = complete
    ? 'Level 1 is complete, and higher levels are computed from the one below: click any cell to see how.'
    : `Click the node that is two parents above node ${target}: that is up[1][${target}].`;

  return (
    <StageFrame
      height={520}
      intro={<>{p.message ? `${p.message} ` : ''}{explanation && complete ? `${explanation} ` : ''}{prompt}</>}
      introKey={`table|${key}|${p.filled.length}|${p.message ?? ''}|${p.explain?.join() ?? ''}`}
      stats={
        <Stats>
          <Stat label="Level 1 filled" value={`${p.filled.length} of ${n}`} color="var(--ok)" sub="the grandparent of each node" />
          <Stat label="Levels" value={table.levels} color="var(--info)" sub={`max(1, ceil(log2 ${n})) for ${n} nodes`} />
          <Stat label="Table entries" value={n * table.levels} color="var(--violet)" sub={`${n} nodes x ${table.levels} levels`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the node whose cell is next', shape: 'square' },
            { color: 'var(--ok)', label: 'a cell you filled in', shape: 'square' },
            { color: 'var(--info)', label: 'a cell computed from the level below', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TreeControls tree={tree} note="Adding a leaf rebuilds the table, so level 1 starts again." />
        </>,
        <>
          <Button softDisabled={complete} onClick={fillRest}>Fill the rest</Button>
          <Button onClick={reset}>Reset the table</Button>
          <Hint tone={p.ok ? 'muted' : 'bad'}>
            <span role="status">{p.message ?? 'Level 0 is the parent of each node; the root is its own parent, so its cells hold 0.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <TreeView
          parents={parents}
          nodeMark={(id) => (id === target ? { tone: 'hi', fill: 'solid' } : null)}
          reveal={target === undefined ? undefined : [target, table.up[1][target]]}
          onNodeClick={complete ? undefined : answer}
          ariaLabel="The tree: click the node that is two parents above the highlighted node"
        />
        <TableGrid
          table={table}
          cell={(k, v) => {
            if (k === 0) return { text: table.up[0][v], tone: 'muted', fill: 'tint' };
            if (k === 1) return isFilled(v) ? { text: table.up[1][v], tone: 'ok', fill: 'tint' } : { text: v === target ? '?' : '', tone: v === target ? 'hi' : 'muted', fill: v === target ? 'outline' : 'none' };
            return complete ? { text: table.up[k][v], tone: 'info', fill: 'tint' } : { text: '', tone: 'muted', fill: 'none' };
          }}
          highlight={p.explain ? [{ r: p.explain[0], c: p.explain[1], tone: 'violet' }] : []}
          onCellClick={click}
          revealColumn={target}
        />
        <p className="lc-note">
          Row k holds the 2^k-th ancestor of each node: up[k][v] = up[k-1][up[k-1][v]], two jumps of 2^(k-1) make one of 2^k.
          The root is its own parent, so a jump that would go past the top lands on the root: those zeros are a clamp, not a claim that node 0 is an ancestor of everything.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the table is built by the same code that answers the queries</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
