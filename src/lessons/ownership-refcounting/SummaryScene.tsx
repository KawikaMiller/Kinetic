import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Provenance, ProvenanceRow } from '../../components/ui';
import { summaryColumns } from './summary';

const COLUMNS = summaryColumns();

/** Scene 3: when memory goes back under each approach, generated from the other two scenes' runs. */
export function SummaryScene({ picker }: { picker: ReactNode }) {
  return (
    <StageFrame
      height={360}
      intro={<>Three ways to give memory back. The sentences below are generated from the cycle script run both ways and from the accepted ownership program, not typed.</>}
      controls={[picker]}
    >
      <div className="rc-stage stage-pad">
        <div className="rc-cols">
          {COLUMNS.map((c) => (
            <section key={c.id} className="rc-col" aria-label={c.title}>
              <h3 className="rc-col-title">{c.title}</h3>
              <p className="rc-col-text"><b>Memory goes back.</b> {c.when}</p>
              <p className="rc-col-text"><b>Cost.</b> {c.cost}</p>
            </section>
          ))}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">generated from this lesson's toy runs, not from a real runtime</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
