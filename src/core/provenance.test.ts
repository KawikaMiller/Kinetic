import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClaimLabel, Provenance } from '../components/ui';import { CLAIM_LABEL, PROVENANCE_LABEL, type ClaimKind, type ProvenanceKind } from './provenance';

const provenanceKinds = Object.keys(PROVENANCE_LABEL) as ProvenanceKind[];
const claimKinds = Object.keys(CLAIM_LABEL) as ClaimKind[];

describe('Provenance and ClaimLabel kinds', () => {
  it('has the kinds the plan names', () => {
    expect(provenanceKinds).toEqual(['simulated', 'illustrative', 'toy', 'scripted', 'from-memory', 'not-run', 'invented', 'real']);
    expect(claimKinds).toEqual(['standard', 'research', 'practice', 'view']);
  });

  it('gives every kind its own non-empty printed label, so meaning never rides on colour alone', () => {
    for (const labels of [Object.values(PROVENANCE_LABEL), Object.values(CLAIM_LABEL)]) {
      expect(new Set(labels).size).toBe(labels.length);
      for (const l of labels) expect(l.trim().length).toBeGreaterThan(0);
    }
  });

  it('renders each Provenance kind with its label, a data hook, and the seed when given', () => {
    for (const kind of provenanceKinds) {
      const html = renderToStaticMarkup(createElement(Provenance, { kind, seed: 7 }, 'a note'));
      expect(html).toContain(`data-provenance="${kind}"`);
      expect(html).toContain(PROVENANCE_LABEL[kind]);
      expect(html).toContain('seed 7');
      expect(html).toContain('a note');
    }
    expect(renderToStaticMarkup(createElement(Provenance, { kind: 'toy' }))).not.toContain('seed');
  });

  it('renders each ClaimLabel kind as a note read out as "kind: text"', () => {
    for (const kind of claimKinds) {
      const html = renderToStaticMarkup(createElement(ClaimLabel, { kind }, 'Dunning 2002'));
      expect(html).toContain(`data-claim="${kind}"`);
      expect(html).toContain('role="note"');
      expect(html).toContain(`aria-label="${CLAIM_LABEL[kind]}: Dunning 2002"`);
    }
    expect(renderToStaticMarkup(createElement(ClaimLabel, { kind: 'view' }))).toContain('aria-label="one view"');
  });
});
