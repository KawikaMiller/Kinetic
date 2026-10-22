import { SectionTitle } from '../components/Panel';
import { ClaimLabel, Provenance } from '../components/ui';
import type { ClaimKind, ProvenanceKind } from '../core/provenance';
import { DevKitSection as Section } from './DevKitSection';

const CLAIM_DEMO: { kind: ClaimKind; note?: string }[] = [
  { kind: 'standard', note: 'semantic versioning 2.0.0' },
  { kind: 'research', note: 'a named study, from memory' },
  { kind: 'practice', note: 'many teams write an ADR per decision' },
  { kind: 'view', note: 'estimates are mostly guesses' },
  { kind: 'view' },
  { kind: 'theorem', note: 'FLP: no deterministic protocol decides under one crash' },
  { kind: 'theorem' },
];

const PROVENANCE_DEMO: { kind: ProvenanceKind; note?: string; seed?: number }[] = [
  { kind: 'invented', note: 'the team and the incident are made up' },
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
      <Section title="ClaimLabel · standard, research finding, common practice, one view, theorem">
        <div className="devkit-row">
          {CLAIM_DEMO.map((c) => (
            <ClaimLabel key={c.kind + (c.note ?? '')} kind={c.kind}>{c.note}</ClaimLabel>
          ))}
        </div>
      </Section>
    </>
  );
}
