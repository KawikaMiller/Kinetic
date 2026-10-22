import type { ReactNode } from 'react';
import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel } from '../../components/ui';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, PROVENANCE_NOTE, STORAGE } from './scenario';

const STATS: readonly StoryStat[] = [
  { meter: METER.autonomy, label: 'Autonomy', sub: 'of 10, red below 4, invented' },
  { meter: METER.effort, label: 'Migration effort', sub: 'red above 8, invented' },
  { meter: METER.drag, label: 'Delivery drag', sub: 'of 10, red above 6, invented' },
];

/** Scene 2: which storage policy, and how it is enforced. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={STORAGE}
      caption={storyCaption}
      stats={STATS}
      height={720}
      stageClass="ts-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={<ClaimLabel kind="view">no option here is marked correct: each one shows what it costs before you pick it</ClaimLabel>}
      endingClaim="every ending is reachable and no choice is a straw man"
    />
  );
}
