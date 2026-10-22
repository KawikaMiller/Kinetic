/**
 * The vocabularies behind the `Provenance` and `ClaimLabel` chips (components/ui.tsx,
 * docs/tier3-plan.md AC-0/T3 #21 and #24). Plain data, so tests can check every kind has a
 * distinct visible label.
 */

/** What the learner is looking at: how real it is. */
export const PROVENANCE_LABEL = {
  simulated: 'simulated',
  illustrative: 'illustrative',
  toy: 'toy model',
  scripted: 'scripted',
  'from-memory': 'from memory',
  'not-run': 'shown, not run',
  invented: 'invented',
  real: 'real',
} as const;
export type ProvenanceKind = keyof typeof PROVENANCE_LABEL;

/** What kind of claim a sentence is: how much weight it can bear (non-technical lessons). */
export const CLAIM_LABEL = {
  standard: 'standard',
  research: 'research finding',
  practice: 'common practice',
  view: 'one view',
  /** A theorem-shaped statement that is argued in the lesson, not computed by it (AC-0/T4 #27, K4-8). */
  theorem: 'theorem (argued, not run here)',
} as const;
export type ClaimKind = keyof typeof CLAIM_LABEL;
