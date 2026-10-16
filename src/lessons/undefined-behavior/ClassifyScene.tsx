import { useState, type ReactNode } from 'react';
import { ClassifyBoard, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { classifyScore, emptyClassify, sortedCount } from '../../core/classify';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { classifyCaption } from './captions';
import { CATEGORIES, KEY, SNIPPETS } from './classification';

const ITEMS: ClassifyItem[] = SNIPPETS.map((s) => ({ id: s.id, label: s.code, explanation: s.reason }));

/** Scene 3: sort eight snippets by what ISO C says about them. */
export function ClassifyScene({ picker }: { picker: ReactNode }) {
  const [board, setBoard] = useState(() => emptyClassify(ITEMS));
  const state = { sorted: sortedCount(ITEMS, board.answers), checked: board.checked, correct: classifyScore(ITEMS, KEY, board.answers) };
  return (
    <StageFrame
      height={560}
      intro={classifyCaption(state, ITEMS.length)}
      introKey={`${state.sorted}-${state.checked}-${state.correct}`}
      stats={
        <Stats>
          <Stat label="Sorted" value={`${state.sorted} of ${ITEMS.length}`} color="var(--info)" sub="items with a category chosen" />
          <Stat label="Right" value={state.checked ? `${state.correct} of ${ITEMS.length}` : 'not checked'} color={state.checked ? (state.correct === ITEMS.length ? 'var(--ok)' : 'var(--hi)') : undefined} sub="after Check" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'sorted right', shape: 'square' }, { color: 'var(--bad)', label: 'sorted wrong', shape: 'square' }]} />}
      controls={[picker]}
    >
      <div className="ub-stage stage-pad">
        <ClassifyBoard items={ITEMS} categories={CATEGORIES} answerKey={KEY} value={board} onChange={setBoard} labelFont="mono" />
      </div>
      <ProvenanceRow>
        <ClaimLabel kind="standard">per ISO C (C11 and C17 clause numbers quoted from memory); C++ differs in places</ClaimLabel>
        <Provenance kind="not-run">the snippets are shown, not run; INT_MIN / -1 is never executed here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
