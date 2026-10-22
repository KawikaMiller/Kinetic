import type { ReactNode } from 'react';
import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel } from '../../components/ui';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, MIGRATION, PROVENANCE_NOTE } from './scenario';

const STATS: readonly StoryStat[] = [
  { meter: METER.incidents, label: 'Incidents', sub: 'customer-visible, invented' },
  { meter: METER.weeks, label: 'Weeks spent', sub: 'invented' },
  { meter: METER.strain, label: 'Strain', sub: 'from running two systems, invented' },
  { meter: METER.surprises, label: 'Unknowns ahead', sub: 'lower is better; it can only fall, so it never goes red' },
];

/** Scene 2: what to peel off first. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={MIGRATION}
      caption={storyCaption}
      stats={STATS}
      height={760}
      stageClass="sf-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={<ClaimLabel kind="view">no option here is marked correct: each one shows what it costs before you pick it</ClaimLabel>}
      endingClaim="every ending is reachable and no choice is a straw man"
    />
  );
}
