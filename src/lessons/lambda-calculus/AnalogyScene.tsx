import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useIntroCaption } from '../../core/caption';
import { Hint, Provenance, ProvenanceRow, Segmented } from '../../components/ui';
import { PAIRINGS, type Example } from './pairings';

/** Scene 5: the same idea in the calculus and as JavaScript closures, side by side. Nothing here is run. */
export function AnalogyScene({ picker }: { picker: ReactNode }) {
  const [example, setExample] = useState<Example>('numerals');
  const p = PAIRINGS[example];
  useIntroCaption(<>{p.note}</>, [example]);
  return (
    <StageFrame
      height={420}
      controls={[
        <>
          {picker}
          <Segmented label="Idea" value={example} onChange={setExample} options={(Object.keys(PAIRINGS) as Example[]).map((k) => ({ value: k, label: PAIRINGS[k].label }))} />
        </>,
      ]}
    >
      <div className="ld stage-pad">
        <div className="ld-cols">
          <Box><SectionTitle>Lambda calculus</SectionTitle><CodePanel lines={p.lambda} gutter="none" /></Box>
          <Box><SectionTitle>JavaScript closures</SectionTitle><CodePanel lines={p.js} gutter="none" /></Box>
        </div>
        <Hint tone="muted">The two columns are analogous, not identical: the calculus has no numbers, strings or side effects, only functions applied to functions.</Hint>
        <ProvenanceRow>
          <Provenance kind="not-run">the JavaScript is shown, not run on this page (the tests run it)</Provenance>
          <Provenance kind="toy">an analogy between two systems, not a claim that they are the same</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
