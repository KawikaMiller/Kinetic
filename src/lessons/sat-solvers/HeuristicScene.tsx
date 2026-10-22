import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark } from '../../components/TreeSvg';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend } from '../../components/ui';
import { layoutTree } from '../../core/treeLayout';
import { dpll, startDpll, type DpllState } from '../../core/sat';
import { H, buildSearchTree, drawnTree, finishWith, pickBranch, type DrawnNode } from './model';
import { Chips, Counters } from './parts';
import { HEURISTIC_IDLE, searchCaption, statsLine } from './text';

const START: DpllState = startDpll(H);
const REFERENCE_FIRST = dpll(H, { heuristic: 'first' }).stats;
const REFERENCE_MOST = dpll(H, { heuristic: 'most-occurring' }).stats;
const COLUMN_PX = 46;
const LEVEL_PX = 62;
const TREE_PAD = 30;
const MARKS: Record<DrawnNode['end'], TreeNodeMark | null> = {
  open: null,
  conflict: { tone: 'bad', fill: 'tint' },
  sat: { tone: 'ok', fill: 'solid' },
  more: { tone: 'dim', fill: 'tint' },
};

interface Run {
  state: DpllState;
  note: string | null;
}
const FRESH: Run = { state: START, note: null };

/** Scene 2: the learner is the branching heuristic on formula H and sees the tree and the counts against two reference rules. */
export function HeuristicScene({ picker }: { picker: ReactNode }) {
  const [run, setRun] = useState<Run>(FRESH);
  const { state } = run;
  const caption = searchCaption(state, 'correct', HEURISTIC_IDLE);
  const drawn = useMemo(() => drawnTree(buildSearchTree(state.trace), H), [state.trace]);
  const shape = useMemo(() => ({ root: 'n0', children: (id: string) => drawn.get(id)?.children ?? [] }), [drawn]);
  const geometry = useMemo(() => layoutTree(shape, 'tidy'), [shape]);
  const width = Math.max(320, geometry.columns * COLUMN_PX + 2 * TREE_PAD);
  const height = 40 + geometry.depth * LEVEL_PX + 50;

  const pick = (v: number) => {
    const r = pickBranch(state, v);
    setRun(r.ok ? { state: r.state, note: null } : { ...run, note: r.text });
  };

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={<Counters state={state} />}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a branch ended in a conflict', shape: 'dot' },
            { color: 'var(--ok)', label: 'a branch found a model', shape: 'dot' },
            { color: 'var(--dim)', label: '+n: n more branches below depth 4, not drawn', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Branch on">
            {H.names!.map((name, i) => (
              <ChipButton key={name} tone="info" on={state.values[i + 1] !== null} onClick={() => pick(i + 1)}>
                {name}
                {state.values[i + 1] === null ? '' : state.values[i + 1] ? ' = T' : ' = F'}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button onClick={() => setRun({ state: finishWith(state, 'first'), note: null })} softDisabled={state.outcome !== 'running'}>Finish with first unassigned</Button>
          <Button onClick={() => setRun({ state: finishWith(state, 'most-occurring'), note: null })} softDisabled={state.outcome !== 'running'}>Finish with most occurring</Button>
          <Button onClick={() => setRun(FRESH)}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <WideRegion minWidth={Math.min(width, 640)} label="Search tree: scroll sideways to see all of it">
          <TreeSvg
            shape={shape}
            width={width}
            height={height}
            levelGap={LEVEL_PX}
            pad={TREE_PAD}
            radius={19}
            natural
            label={(id) => drawn.get(id)?.label ?? ''}
            nodeMark={(id) => MARKS[drawn.get(id)?.end ?? 'open']}
            ariaLabel={`Search tree with ${state.stats.branches} branches`}
          />
        </WideRegion>
        <div role="status" className="ss-note">
          {run.note ? <Hint tone="bad" block>{run.note}</Hint> : <Hint block>Your pick: branches, propagations and conflicts so far. Press a variable to branch on it; propagation and backtracking then run by themselves.</Hint>}
        </div>
        <table className="data-table ss-table">
          <thead>
            <tr><th>Branching rule</th><th>Result</th></tr>
          </thead>
          <tbody>
            <tr><td>You</td><td>{statsLine(state.stats)}{state.outcome === 'running' ? ' (still running)' : ''}</td></tr>
            <tr><td>First unassigned</td><td>{statsLine(REFERENCE_FIRST)}</td></tr>
            <tr><td>Most occurring</td><td>{statsLine(REFERENCE_MOST)}</td></tr>
          </tbody>
        </table>
        <Hint block>Formula H (variables x1 to x6, y1, y2): (x1 or x2), (x3 or x4), (x5 or x6), (y1 or y2), (y1 or not y2), (not y1 or y2), (not y1 or not y2). The contradiction hides in the last four clauses; the first three clauses are free choices.</Hint>
      </div>
      <Chips />
    </StageFrame>
  );
}

