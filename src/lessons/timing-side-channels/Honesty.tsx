import { Provenance, ProvenanceRow } from '../../components/ui';
import { HONESTY_LINE } from './captions';
import { NOISE_SEED } from './noise';

/** The permanent line on every scene, and the chips for what is simulated and what is from memory. */
export function Honesty({ simulated = true, memory }: { simulated?: boolean; memory?: string }) {
  return (
    <>
      <p className="tsc-honesty" role="note">{HONESTY_LINE}</p>
      {(simulated || memory) && (
        <ProvenanceRow>
          {simulated && <Provenance kind="simulated" seed={NOISE_SEED}>seeded noise model; nothing is timed</Provenance>}
          {memory && <Provenance kind="from-memory">{memory}</Provenance>}
        </ProvenanceRow>
      )}
    </>
  );
}
