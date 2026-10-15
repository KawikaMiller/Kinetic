import { SectionTitle } from '../components/Panel';
import { Provenance, type ProvenanceKind } from '../components/ui';
import { DevKitSection as Section } from './DevKitSection';

const PROVENANCE_DEMO: { kind: ProvenanceKind; note?: string; seed?: number }[] = [
  { kind: 'simulated', note: 'seeded fault schedule', seed: 42 },
  { kind: 'illustrative', note: 'cloud prices are examples' },
  { kind: 'toy', note: 'three-layer net on 40 points' },
  { kind: 'scripted', note: 'the leader crash is forced at tick 12' },
  { kind: 'from-memory', note: 'what EXPLAIN prints on Postgres' },
  { kind: 'not-run', note: 'an AWS console screen' },
  { kind: 'real', note: 'crypto.subtle, run in your browser' },
  { kind: 'simulated' },
];

/** Dev-only demos of the Tier 3 kit, rendered after DevKitTier2c (#/dev/kit). */
export function DevKitTier3() {
  return (
    <>
      <SectionTitle>Tier 3 kit · kickoff</SectionTitle>
      <Section title="Provenance · every kind, with a note, a seed, and bare">
        <div className="devkit-row">
          {PROVENANCE_DEMO.map((p) => (
            <Provenance key={p.kind + (p.note ?? '')} kind={p.kind} seed={p.seed}>{p.note}</Provenance>
          ))}
        </div>
      </Section>
    </>
  );
}
