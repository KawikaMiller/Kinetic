import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClaimLabel, Provenance, ProvenanceRow } from '../components/ui';
import { CLAIM_LABEL, PROVENANCE_LABEL, type ClaimKind, type ProvenanceKind } from './provenance';

const provenanceKinds = Object.keys(PROVENANCE_LABEL) as ProvenanceKind[];
const claimKinds = Object.keys(CLAIM_LABEL) as ClaimKind[];
describe('Provenance and ClaimLabel kinds', () => {
  it('has the kinds the plan names', () => {
    expect(provenanceKinds).toEqual(['simulated', 'illustrative', 'toy', 'scripted', 'from-memory', 'not-run', 'invented', 'real']);
    expect(claimKinds).toEqual(['standard', 'research', 'practice', 'view', 'theorem']);
  });

  it('prints the theorem kind as "theorem (argued, not run here)" with the same note, role and aria shape as the others', () => {
    expect(CLAIM_LABEL.theorem).toBe('theorem (argued, not run here)');
    const html = renderToStaticMarkup(createElement(ClaimLabel, { kind: 'theorem' }, 'FLP'));
    expect(html).toContain('data-claim="theorem"');
    expect(html).toContain('role="note"');
    expect(html).toContain('class="chip claim-label is-theorem"');
    expect(html).toContain('aria-label="theorem (argued, not run here): FLP"');
    expect(renderToStaticMarkup(createElement(ClaimLabel, { kind: 'theorem' }))).toContain('aria-label="theorem (argued, not run here)"');
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

  it('ProvenanceRow puts its chips in one wrapping row, in the order given', () => {
    const html = renderToStaticMarkup(
      createElement(ProvenanceRow, null, createElement(Provenance, { kind: 'simulated' }), createElement(Provenance, { kind: 'scripted' }), createElement(ClaimLabel, { kind: 'view' })),
    );
    expect(html.match(/class="provenance-row"/g)).toHaveLength(1);
    expect(html.indexOf('data-provenance="simulated"')).toBeLessThan(html.indexOf('data-provenance="scripted"'));
    expect(html.indexOf('data-provenance="scripted"')).toBeLessThan(html.indexOf('data-claim="view"'));
  });
});
