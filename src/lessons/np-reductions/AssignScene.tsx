import { useMemo, type ReactNode } from 'react';
import type { GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { Chips } from './Chips';
import { FormulaEditor, FormulaLine } from './FormulaEditor';
import { GadgetGraph } from './GadgetGraph';
import { assignmentCaption, buildGadget, clauseOfVertex, coverFromAssignment, vertexName } from './model';
import type { FormulaState } from './useFormula';
import { useKeyedState } from './useKeyedState';

interface Assign {
  values: boolean[];
  /** The learner's choice of left-out vertex per clause. */
  picks: (number | undefined)[];
  note: string | null;
}
const COVER_MARK: GraphNodeMark = { tone: 'hi', fill: 'solid' };
const COSTLY_MARK: GraphNodeMark = { tone: 'bad', fill: 'solid' };

/** Scene 2: an assignment becomes a cover by the reduction's rule, and an assignment that falsifies a clause costs extra. */
export function AssignScene({ picker, f }: { picker: ReactNode; f: FormulaState }) {
  const g = useMemo(() => buildGadget(f.formula), [f.formula]);
  const [a, setA] = useKeyedState<Assign>(f.key, () => ({ values: Array.from({ length: g.n }, () => false), picks: [], note: null }));
  const r = useMemo(() => coverFromAssignment(g, a.values, a.picks), [g, a.values, a.picks]);
  const inCover = new Set(r.cover);
  const costly = new Set(r.falsified.flatMap((j) => [0, 1, 2].map((s) => 2 * g.n + 3 * j + s)));
  const caption = assignmentCaption(g, r);

  const pick = (v: number) => {
    const c = clauseOfVertex(g.n, v);
    if (!c) return;
    const lit = g.formula.clauses[c.clause][c.slot];
    const literalTrue = lit > 0 ? a.values[lit - 1] : !a.values[-lit - 1];
    if (r.falsified.includes(c.clause)) {
      setA((s) => ({ ...s, note: `Clause ${c.clause + 1} has no true literal, so the whole clause is falsified and all three vertices must be covered.` }));
    } else if (!literalTrue) {
      setA((s) => ({ ...s, note: `${vertexName(g.n, v)} holds a false literal, so it must stay in the cover. Only a vertex with a true literal can be left out.` }));
    } else {
      setA((s) => {
        const picks = [...s.picks];
        picks[c.clause] = c.slot;
        return { ...s, picks, note: `${vertexName(g.n, v)} is left out of the cover: its literal is true, so its neighbour in the literal row is already covered.` };
      });
    }
  };

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Cover size" value={r.size} color={r.size > g.K ? 'var(--bad)' : 'var(--ok)'} sub={r.size > g.K ? `K + ${r.size - g.K}` : 'equal to K'} />
          <Stat label="Target size K" value={g.K} sub={`n + 2m = ${g.n} + 2 x ${g.m}`} />
          <Stat label="Covers every edge" value={r.isCover ? 'yes' : 'no'} color={r.isCover ? 'var(--ok)' : 'var(--bad)'} sub={`${g.edges.length} edges checked`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'in the cover', shape: 'dot' },
            { color: 'var(--bad)', label: 'in the cover only because its clause has no true literal', shape: 'dot' },
            { color: 'var(--violet)', label: 'clause vertex left out (outlined, not filled)', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {a.values.map((v, i) => (
            <Toggle key={i} label={`x${i + 1}`} value={v} off="false" on="true" onChange={(next) => setA((s) => ({ ...s, values: s.values.map((x, k) => (k === i ? next : x)) }))} />
          ))}
        </>,
        <FormulaEditor key="editor" f={f} />,
      ]}
    >
      <div className="stage-pad npr-stage">
        <GadgetGraph
          g={g}
          mark={(v) => (costly.has(v) ? COSTLY_MARK : inCover.has(v) ? COVER_MARK : null)}
          onNodeClick={pick}
          ariaLabel={`Gadget graph with a cover of ${r.size} vertices; press a clause vertex to choose which one to leave out`}
        />
        <div role="status" className="npr-note">
          <Hint block>{a.note ?? 'Press a clause vertex whose literal is true to choose which one of its three is left out of the cover.'}</Hint>
        </div>
        <FormulaLine formula={f.formula} />
      </div>
      <Chips />
    </StageFrame>
  );
}
