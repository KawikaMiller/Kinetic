import type { ReactNode } from 'react';
import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel, Hint } from '../../components/ui';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, PRICE_RISE, PROVENANCE_NOTE, TRAP_NOTE } from './scenario';

const STATS: readonly StoryStat[] = [
  { meter: METER.extra, label: 'Extra cost', sub: 'over two years, thousands, invented' },
  { meter: METER.weeks, label: 'Weeks diverted', sub: 'invented' },
  { meter: METER.lockin, label: 'Lock-in exposure', sub: 'of 10, invented' },
];

/** Scene 3: the vendor raises the price. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={PRICE_RISE}
      caption={storyCaption}
      stats={STATS}
      height={720}
      stageClass="bb-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={
        <>
          <ClaimLabel kind="view">no option here is marked correct: each one shows what it costs before you pick it</ClaimLabel>
          <Hint tone="muted" block>{TRAP_NOTE}</Hint>
        </>
      }
      endingClaim="every ending is reachable and no single choice is beaten on every meter by its siblings"
    />
  );
}
