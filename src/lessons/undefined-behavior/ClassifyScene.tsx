import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { classifyCaption } from './captions';
import { ClassifyBoard } from './ClassifyBoard';
import { CATEGORIES, KEY, SNIPPETS } from './classification';

const ITEMS = SNIPPETS.map((s) => ({ id: s.id, label: s.code }));
const reasonOf = (id: string) => SNIPPETS.find((s) => s.id === id)?.reason ?? '';
const labelOf = (id: string) => CATEGORIES.find((c) => c.id === id)?.label.toLowerCase() ?? id;

/** Scene 3: sort eight snippets by what ISO C says about them. */
export function ClassifyScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState({ sorted: 0, checked: false, correct: 0 });
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
        <ClassifyBoard items={ITEMS} bins={CATEGORIES} answerKey={KEY} explain={reasonOf} binLabel={labelOf} onChange={setState} />
      </div>
      <ProvenanceRow>
        <ClaimLabel kind="standard">per ISO C (C11 and C17 clause numbers quoted from memory); C++ differs in places</ClaimLabel>
        <Provenance kind="not-run">the snippets are shown, not run; INT_MIN / -1 is never executed here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
