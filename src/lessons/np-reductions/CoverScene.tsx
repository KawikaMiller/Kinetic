import { useMemo, type ReactNode } from 'react';
import type { GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats } from '../../components/ui';
import { minVertexCover, uncoveredEdges } from '../../core/vertexCover';
import { Chips } from './Chips';
import { FormulaEditor, FormulaLine } from './FormulaEditor';
import { GadgetGraph } from './GadgetGraph';
import { assignmentFromCover, buildGadget, checkCover } from './model';
import type { FormulaState } from './useFormula';
import { useKeyedState } from './useKeyedState';

interface Pick {
  chosen: number[];
  /** What Check or Read last said; any change to the cover clears it. */
  said: { tone: 'muted' | 'bad'; text: string } | null;
}
const START: Pick = { chosen: [], said: null };
const COVER_MARK: GraphNodeMark = { tone: 'hi', fill: 'solid' };

/** Scene 3: the learner clicks vertices into a cover; a cover of size K or less is read back as an assignment. */
export function CoverScene({ picker, f }: { picker: ReactNode; f: FormulaState }) {
  const g = useMemo(() => buildGadget(f.formula), [f.formula]);
  const exact = useMemo(() => minVertexCover(g.vertexCount, g.edges), [g]);
  const [pick, setPick] = useKeyedState(f.key, () => START);
  const chosen = new Set(pick.chosen);
  const bad = uncoveredEdges(g.edges, pick.chosen);
  const canRead = pick.chosen.length <= g.K && bad.length === 0;
  const caption = `${pick.chosen.length} vertices chosen, ${bad.length} of ${g.edges.length} edges uncovered. The exact minimum cover has ${exact.size} vertices and K = ${g.K}.`;

  const toggle = (v: number) =>
    setPick((s) => ({ chosen: s.chosen.includes(v) ? s.chosen.filter((x) => x !== v) : [...s.chosen, v].sort((a, b) => a - b), said: null }));

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Vertices chosen" value={pick.chosen.length} sub={`K = ${g.K}`} />
          <Stat label="Uncovered edges" value={bad.length} color={bad.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${g.edges.length}`} />
          <Stat label="Exact minimum" value={exact.size} sub="by exhaustive branching" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'chosen for the cover', shape: 'dot' },
            { color: 'var(--bad)', label: 'an edge no chosen vertex touches', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button
            variant="primary"
            onClick={() => {
              const verdict = checkCover(g, pick.chosen);
              setPick((s) => ({ ...s, said: { tone: verdict.kind === 'ok' ? 'muted' : 'bad', text: verdict.text } }));
            }}
          >
            Check
          </Button>
          {canRead && (
            <Button
              onClick={() => {
                const read = assignmentFromCover(g, pick.chosen);
                setPick((s) => ({ ...s, said: { tone: read.satisfied === false ? 'bad' : 'muted', text: read.text } }));
              }}
            >
              Read the assignment
            </Button>
          )}
          <Button onClick={() => setPick({ chosen: exact.cover, said: null })}>Load a minimum cover</Button>
          <Button softDisabled={pick.chosen.length === 0} onClick={() => setPick(START)}>Clear</Button>
        </>,
        <FormulaEditor key="editor" f={f} />,
      ]}
    >
      <div className="stage-pad npr-stage">
        <GadgetGraph
          g={g}
          bad={bad}
          mark={(v) => (chosen.has(v) ? COVER_MARK : null)}
          onNodeClick={toggle}
          ariaLabel={`Gadget graph: ${pick.chosen.length} vertices chosen for the cover, ${bad.length} edges uncovered; press a vertex to choose or drop it`}
        />
        <div role="status" className="npr-note">
          <Hint tone={pick.said?.tone === 'bad' ? 'bad' : 'muted'} block>
            {pick.said?.text ?? 'Press vertices to build a cover, then Check. A cover of size K or less lets you read the assignment back.'}
          </Hint>
        </div>
        <FormulaLine formula={f.formula} />
      </div>
      <Chips />
    </StageFrame>
  );
}
