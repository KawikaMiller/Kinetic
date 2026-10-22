import { ClaimLabel, Provenance, ProvenanceRow } from '../../components/ui';
import { SAMPLE_SEED } from './model';

/** The chips every scene wears: a toy, two theorems (argued, not run here), a from-memory attribution, and the sample's seed. */
export function Chips({ sampled = false }: { sampled?: boolean }) {
  return (
    <ProvenanceRow>
      <Provenance kind="toy">at most 4 variables and 5 clauses: real instances have thousands</Provenance>
      <ClaimLabel kind="theorem">3-SAT is NP-complete (Cook and Levin)</ClaimLabel>
      <ClaimLabel kind="theorem">a formula is satisfiable exactly when its graph has a cover of size K: argued from the two directions shown, checked only on the sets in the last scene</ClaimLabel>
      <Provenance kind="from-memory">
        the gadget is the textbook 3-SAT to vertex-cover construction, in Karp&apos;s 1972 list of 21 problems. Verify against Garey and Johnson, Computers and Intractability (1979), and Karp (1972).
      </Provenance>
      {sampled && <Provenance kind="simulated" seed={SAMPLE_SEED}>the 3-variable sample is seeded random formulas</Provenance>}
    </ProvenanceRow>
  );
}
