import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel, Provenance } from '../../components/ui';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, DEBRIEF, METER, PROVENANCE_NOTE } from './scenario';

const STATS: readonly StoryStat[] = [
  { meter: METER.regret, label: 'Regret', sub: 'expected cost of a wrong decision, k$, invented' },
  { meter: METER.days, label: 'Days', sub: 'to a decision' },
  { meter: METER.goodwill, label: 'Panel goodwill', sub: 'of 10, invented' },
];

/** Scene 4: the debrief. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={DEBRIEF}
      caption={storyCaption}
      stats={STATS}
      height={720}
      stageClass="hi-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={
        <>
          <Provenance kind="invented">every effect in this scene is an authored number, not a measurement; two were set so that no option is beaten on every meter (letting the strong no decide costs regret 8, and a follow-up after thin evidence lowers it by 2), and the goodwill edge of 4 is authored too</Provenance>
          <ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and a fast average is defensible when the scores are independent and the bar is clear</ClaimLabel>
        </>
      }
      endingClaim="every ending is reachable, no single choice is beaten on every meter by its siblings, and no whole path is beaten by another path to the same ending"
    />
  );
}
