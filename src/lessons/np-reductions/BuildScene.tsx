import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats } from '../../components/ui';
import { Chips } from './Chips';
import { FormulaEditor, FormulaLine } from './FormulaEditor';
import { GadgetGraph } from './GadgetGraph';
import { buildGadget, edgeText, firstMissing, judgeEdge } from './model';
import { buildCaption } from './text';
import type { FormulaState } from './useFormula';
import { useKeyedState } from './useKeyedState';

interface Note {
  tone: 'muted' | 'bad';
  text: string;
}
interface Build {
  /** Edge indices in the order the learner placed them. */
  placed: number[];
  ghost: boolean;
  note: Note | null;
}
const START: Build = { placed: [], ghost: false, note: null };
const EMPTY_SET: ReadonlySet<number> = new Set<number>();

const KIND_WORD = { variable: 'a variable edge', triangle: 'a triangle edge', connection: 'a connection edge' } as const;

/** Scene 1: the learner places every edge of the gadget graph; a wrong edge is refused with the construction's rule. */
export function BuildScene({ picker, f }: { picker: ReactNode; f: FormulaState }) {
  const g = useMemo(() => buildGadget(f.formula), [f.formula]);
  const [build, setBuild] = useKeyedState(f.key, () => START);
  const placedSet = useMemo(() => new Set(build.placed), [build.placed]);
  const all = useMemo(() => g.edges.map((_, i) => i), [g]);
  const ghostSet = build.ghost ? new Set(all.filter((i) => !placedSet.has(i))) : EMPTY_SET;
  const shown = build.ghost ? all : build.placed;
  const caption = buildCaption(g, build.placed.length);

  const addEdge = (a: number, b: number) => {
    const r = judgeEdge(g, placedSet, a, b);
    if (r.ok) {
      setBuild((s) => ({ ...s, placed: [...s.placed, r.index], note: { tone: 'muted', text: `Added ${edgeText(g, g.edges[r.index])}: ${KIND_WORD[g.kinds[r.index]]}.` } }));
    } else {
      setBuild((s) => ({ ...s, note: { tone: 'bad', text: `${r.text} The graph is unchanged.` } }));
    }
  };
  const check = () => {
    const missing = firstMissing(g, placedSet);
    const text = missing ? `${missing}.` : `Complete: all ${g.edges.length} edges are in place, and K = ${g.K}.`;
    setBuild((s) => ({ ...s, note: { tone: missing ? 'bad' : 'muted', text } }));
  };

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Edges placed" value={`${build.placed.length} of ${g.edges.length}`} sub={`${g.n} variable, ${3 * g.m} triangle, ${3 * g.m} connection`} />
          <Stat label="Target size K" value={g.K} sub={`n + 2m = ${g.n} + 2 x ${g.m}`} />
          <Stat label="Vertices" value={g.vertexCount} sub={`2n + 3m = ${2 * g.n} + ${3 * g.m}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'variable edge: a literal to its own negation', shape: 'line' },
            { color: 'var(--amber)', label: 'triangle edge: inside one clause', shape: 'line' },
            { color: 'var(--pink)', label: 'connection edge: a clause vertex to its literal', shape: 'line' },
            { color: 'var(--dim)', label: 'dashed: the reference edge you have not placed', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={check}>Check my graph</Button>
          <Button softDisabled={build.placed.length === 0} onClick={() => setBuild((s) => ({ ...s, placed: s.placed.slice(0, -1), note: null }))}>Undo edge</Button>
          <Button softDisabled={build.placed.length === 0} onClick={() => setBuild((s) => ({ ...s, placed: [], note: null }))}>Clear</Button>
          <Button onClick={() => setBuild((s) => ({ ...s, ghost: !s.ghost }))}>{build.ghost ? 'Hide the reference' : 'Show the reference'}</Button>
        </>,
        <FormulaEditor key="editor" f={f} />,
      ]}
    >
      <div className="stage-pad npr-stage">
        <GadgetGraph
          g={g}
          shown={shown}
          ghost={ghostSet}
          onAddEdge={addEdge}
          ariaLabel={`Gadget graph, ${build.placed.length} of ${g.edges.length} edges placed`}
        />
        <div role="status" className="npr-note">
          {build.note ? <Hint tone={build.note.tone === 'bad' ? 'bad' : 'muted'} block>{build.note.text}</Hint> : <Hint block>Drag from one vertex to another to add an edge; with the keyboard press C on a vertex, then Enter on another.</Hint>}
        </div>
        <FormulaLine formula={f.formula} />
      </div>
      <Chips />
    </StageFrame>
  );
}
