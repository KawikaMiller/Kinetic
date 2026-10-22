import { ClaimLabel, Provenance, ProvenanceRow } from '../../components/ui';
import { SAMPLE_SEED } from './model';

/** The chips every scene wears: a toy, two theorems (the second with its outline on screen, not run here), a from-memory attribution, and the sample's seed. */
export function Chips({ sampled = false }: { sampled?: boolean }) {
  return (
    <ProvenanceRow>
      <Provenance kind="toy">at most 4 variables and 5 clauses: real instances have thousands</Provenance>
      <ClaimLabel kind="theorem">3-SAT is NP-complete (Cook and Levin)</ClaimLabel>
      <ClaimLabel kind="theorem">a formula is satisfiable exactly when its graph has a cover of size K = n + 2m. Outline of the argument: the n variable edges and m clause triangles are disjoint, so any cover needs at least one vertex per edge and two per triangle, which is already K. With exactly K, each variable edge gets one end (an assignment) and each triangle leaves out one vertex, whose edge to a literal vertex must be covered by that literal, so the clause has a true literal. Read the other way, a true literal per clause lets a triangle leave out the vertex joined to it. An outline, checked only on the sets in the last scene</ClaimLabel>
      <Provenance kind="from-memory">
        the gadget is the textbook 3-SAT to vertex-cover construction, in Karp&apos;s 1972 list of 21 problems. Verify against Garey and Johnson, Computers and Intractability (1979), and Karp (1972).
      </Provenance>
      {sampled && <Provenance kind="simulated" seed={SAMPLE_SEED}>the 3-variable sample is seeded random formulas</Provenance>}
    </ProvenanceRow>
  );
}
