import { ScenarioStage, type StoryStat } from '../../components/ScenarioStage';
import { ClaimLabel, Provenance } from '../../components/ui';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, MEETING, METER, PROVENANCE_NOTE } from './scenario';

const percent = (v: number) => `${v}%`;

const STATS: readonly StoryStat[] = [
  { meter: METER.support, label: 'Support', sub: 'weighted, invented' },
  { meter: METER.trust, label: 'Trust', sub: 'of 10, invented' },
  { meter: METER.weeks, label: 'Weeks', sub: 'to a decision' },
  { meter: METER.scope, label: 'Scope kept', sub: 'of the proposal', format: percent },
  { meter: METER.risk, label: 'Teams exposed', sub: 'if it fails, invented', format: percent },
];

/** Scene 2: Dana objects live. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  return (
    <ScenarioStage
      picker={picker}
      scenario={MEETING}
      caption={storyCaption}
      stats={STATS}
      height={720}
      stageClass="iw-stage"
      provenance={PROVENANCE_NOTE}
      claimOf={(id) => CLAIM_OF[id]}
      notes={
        <>
          <Provenance kind="invented">every effect in this scene is an authored number, not a measurement; one was set so that no path is beaten on every meter (conceding after pushing takes one week, not the two that asking first takes), and the support meter is a separate invented scale from the plan score in the first scene</Provenance>
          <ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and escalating or waiting are defensible when speed or time is the point</ClaimLabel>
        </>
      }
      endingClaim="every ending is reachable, no single choice is beaten on every meter by its siblings, and no whole path is beaten by another path to the same ending"
    />
  );
}
