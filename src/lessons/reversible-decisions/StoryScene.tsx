import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel } from '../../components/ui';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, METER, PROVENANCE_NOTE, QUEUE_SERVICE } from './scenario';

const STATS: readonly StoryStat[] = [
  { meter: METER.slack, label: 'Slack', sub: 'days before the review, invented' },
  { meter: METER.regret, label: 'Regret', sub: 'expected cost of being wrong, k$, invented' },
  { meter: METER.undo, label: 'Cost to reverse', sub: 'k$ to change course later, invented' },
  { meter: METER.upkeep, label: 'Upkeep', sub: 'hours a week, invented' },
];

/** Scene 4: the queue-service choice. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={QUEUE_SERVICE}
      caption={storyCaption}
      stats={STATS}
      height={720}
      stageClass="rd-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={<ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and a fast decision is defensible when it is cheap to undo</ClaimLabel>}
      endingClaim="every ending is reachable and no single choice is beaten on every meter by its siblings"
    />
  );
}
