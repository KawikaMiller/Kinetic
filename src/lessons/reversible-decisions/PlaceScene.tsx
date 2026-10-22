import { ClassifyBoard, type ClassifyCategory, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { allSorted, sortedCount, type ClassifyState } from '../../core/classify';
import { decimal, integer } from '../../core/format';
import { placeCaption } from './captions';
import { CELLS, COSTLY_UNDO_HOURS, DECISIONS, REFERENCE, UNSURE_P0, deliberateCount, revealRows } from './model';
import type { SceneProps } from './opening';

/** The narrowest width at which the six-column table reads; narrower screens scroll it sideways. */
const TABLE_MIN_WIDTH = 600;

const ITEMS: readonly ClassifyItem[] = DECISIONS.map((d) => ({ id: d.id, label: d.label, text: d.label }));
const CATEGORIES: readonly ClassifyCategory[] = CELLS.map((c) => ({ id: c.id, label: c.label }));
const REVEAL = revealRows();
const cellLabel = (id: string | null): string => CELLS.find((c) => c.id === id)?.label ?? 'not placed';

/** Scene 1: place ten invented decisions by judgement; the model's numbers and one reference placement appear once all are placed. */
export function PlaceScene({ picker, board, onBoard }: SceneProps & { board: ClassifyState; onBoard: (next: ClassifyState) => void }) {
  const placed = sortedCount(ITEMS, board.answers);
  const done = allSorted(ITEMS, board.answers);

  return (
    <StageFrame
      height={640}
      intro={placeCaption(placed)}
      introKey={placed}
      stats={
        <Stats>
          <Stat label="Placed" value={`${placed} of ${DECISIONS.length}`} color={done ? 'var(--hi)' : undefined} sub="the board does not mark them" />
          <Stat label="Worth some rigour" value={done ? `${deliberateCount()} of ${DECISIONS.length}` : '–'} sub={done ? 'rigour beats deciding now, in the model' : 'shown once all are placed'} />
        </Stats>
      }
      controls={[<>{picker}</>]}
    >
      <div className="rd-stage stage-pad">
        <Hint tone="muted" block>
          Where does each decision belong? Two questions place it: how much work it takes to undo, and how likely you are to be wrong. This lesson decides how much rigour to spend; the earlier lessons decide the order of the work and the document that records it.
        </Hint>
        <ClassifyBoard mode="explore" items={ITEMS} categories={CATEGORIES} value={board} onChange={onBoard} reference={REFERENCE} groupLabel={(item) => `Cell of ${item.text}`} />
        {done && (
          <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
            <table className="data-table rd-table">
              <caption>What the model says about each decision, in hours of work (tau 10 h, w 1; all invented)</caption>
              <thead>
                <tr><th>Decision</th><th>You placed it</th><th>Hours to undo</th><th>Chance wrong</th><th>Crossover</th><th>Best rigour</th><th>Cost at best</th><th>Cost with none</th></tr>
              </thead>
              <tbody>
                {REVEAL.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{cellLabel(board.answers[r.id])}</td>
                    <td>{integer(r.undo)}</td>
                    <td>{Math.round(r.p0 * 100)}%</td>
                    <td>{decimal(r.crossover, 1)}</td>
                    <td>{r.hours > 0 ? `${decimal(r.hours, 1)} h` : 'decide now'}</td>
                    <td>{decimal(r.atOptimum, 1)}</td>
                    <td>{decimal(r.atZero, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
        )}
        {done && (
          <Hint tone="muted" block>
            {`The reference placement, from the button above the table, uses two illustrative cut-offs: cheap to undo means under ${COSTLY_UNDO_HOURS} hours and unsure means a chance of being wrong of ${decimal(UNSURE_P0 * 100, 0)}% or more. The crossover is where rigour starts to pay, and it moves with the chance of being wrong, so a cell is a rough sort and the table is the model.`}
          </Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="invented">the ten decisions, their hours to undo and their chances of being wrong are made up</Provenance>
          <ClaimLabel kind="view">sorting decisions by how costly they are to undo, and how unsure you are, is one way to decide how much care to spend</ClaimLabel>
          <ClaimLabel kind="practice">matching the rigour of a decision to how hard it is to undo is a common rule of thumb</ClaimLabel>
          <Provenance kind="from-memory">a one-way door against a two-way door is a framing in common use in engineering management, recalled from memory; verify against a published source</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
