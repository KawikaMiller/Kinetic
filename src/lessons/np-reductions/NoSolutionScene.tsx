import { useMemo, useState, type ReactNode } from 'react';
import type { GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Stat, Stats } from '../../components/ui';
import { minVertexCover } from '../../core/vertexCover';
import { Chips } from './Chips';
import { FormulaLine } from './FormulaEditor';
import { GadgetGraph } from './GadgetGraph';
import { U, buildGadget, clauseLabel, coverCountBySize, coverFromAssignment } from './model';
import { unsatCaption } from './text';

const ASSIGNMENTS: readonly (readonly boolean[])[] = [[true, true], [true, false], [false, true], [false, false]];
const assignmentName = (a: readonly boolean[]) => a.map((v, i) => `x${i + 1} = ${v ? 'true' : 'false'}`).join(', ');
const COVER_MARK: GraphNodeMark = { tone: 'hi', fill: 'solid' };
const COSTLY_MARK: GraphNodeMark = { tone: 'bad', fill: 'solid' };

/** Scene 4: the unsatisfiable preset U, where every assignment costs K + 1 and no cover of size K exists. */
export function NoSolutionScene({ picker }: { picker: ReactNode }) {
  const g = useMemo(() => buildGadget(U), []);
  const facts = useMemo(() => {
    const counts = coverCountBySize(g);
    const rows = ASSIGNMENTS.map((a) => ({ a, r: coverFromAssignment(g, a) }));
    return { atK: counts[g.K], minimum: minVertexCover(g.vertexCount, g.edges).size, rows, cheapest: Math.min(...rows.map((x) => x.r.size)) };
  }, [g]);
  const [selected, setSelected] = useState(0);
  const row = facts.rows[selected];
  const cover = new Set(row.r.cover);
  const costly = new Set(row.r.falsified.flatMap((j) => [0, 1, 2].map((s) => 2 * g.n + 3 * j + s)));
  const caption = unsatCaption(g, facts.minimum, facts.atK, facts.rows.length, facts.cheapest);

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Covers of size K" value={facts.atK} color={facts.atK === 0 ? 'var(--bad)' : 'var(--ok)'} sub={`K = ${g.K}, all ${2 ** g.vertexCount} subsets tried`} />
          <Stat label="Exact minimum" value={facts.minimum} sub={`${g.vertexCount} vertices, ${g.edges.length} edges`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'in the cover of the chosen assignment', shape: 'dot' },
            { color: 'var(--bad)', label: 'in it only because a clause has no true literal', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {facts.rows.map((x, i) => (
            <ChipButton key={i} on={selected === i} onClick={() => setSelected(i)}>
              {assignmentName(x.a)}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="stage-pad npr-stage">
        <GadgetGraph
          g={g}
          mark={(v) => (costly.has(v) ? COSTLY_MARK : cover.has(v) ? COVER_MARK : null)}
          ariaLabel={`Gadget graph of the unsatisfiable formula with the cover for ${assignmentName(row.a)}`}
        />
        <table className="data-table npr-table">
          <thead>
            <tr><th>Assignment</th><th>Clause it falsifies</th><th>Cover size</th></tr>
          </thead>
          <tbody>
            {facts.rows.map((x, i) => (
              <tr key={i} className={selected === i ? 'is-selected' : undefined}>
                <td>{assignmentName(x.a)}</td>
                <td>{x.r.falsified.map((j) => `clause ${j + 1} ${clauseLabel(U, j)}`).join(', ')}</td>
                <td>{x.r.size} = K + {x.r.size - g.K}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormulaLine formula={U} />
      </div>
      <Chips />
    </StageFrame>
  );
}
