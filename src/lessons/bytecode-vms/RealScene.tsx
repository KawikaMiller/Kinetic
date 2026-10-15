import type { ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useIntroCaption } from '../../core/caption';
import { Hint, Provenance, ProvenanceRow } from '../../components/ui';
import { CPYTHON_LISTING, JVM_LISTING, OWN_LISTING } from './listings';

/** Scene 5: the same addition in three instruction sets. All shown, none run on this page. */
export function RealScene({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>The same addition, a + b, in this lesson’s VM, in CPython’s bytecode and in the JVM’s: all stack machines, all with their own instructions.</>);
  return (
    <StageFrame height={420} controls={[<>{picker}</>]}>
      <div className="bv stage-pad">
        <div className="bv-cols">
          <Box><SectionTitle hint="compiled here, from print a + b">This lesson’s VM</SectionTitle><CodePanel lines={OWN_LISTING} gutter="none" /></Box>
          <Box><SectionTitle hint="def add(a, b): return a + b">CPython</SectionTitle><CodePanel lines={CPYTHON_LISTING} gutter="none" /></Box>
          <Box><SectionTitle hint="int add(int a, int b)">JVM</SectionTitle><CodePanel lines={JVM_LISTING} gutter="none" /></Box>
        </div>
        <Hint tone="muted">CPython’s list depends on the version: the one shown is from 3.12.10, and other versions print different instructions. The JVM lines are for an instance method, where slot 0 holds this. To see your own, run python -m dis and javap -c.</Hint>
        <ProvenanceRow>
          <Provenance kind="not-run">the CPython listing is shown, not run: captured from CPython 3.12.10 when this lesson was written</Provenance>
          <Provenance kind="from-memory">the JVM listing is from memory, not run: verify with javap -c</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
