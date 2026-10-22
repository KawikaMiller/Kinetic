import { useEffect, useState } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, METER, PROVENANCE_NOTE, QUEUE_SERVICE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(QUEUE_SERVICE, { tradeoffs: true }).length === 0 ? 'every ending is reachable and no single choice is beaten on every meter by its siblings' : undefined;

/** Scene 4: the queue-service choice. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  const [walk, setWalk] = useState(() => startWalk(QUEUE_SERVICE));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(QUEUE_SERVICE, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(QUEUE_SERVICE, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Slack" value={walk.meters[METER.slack]} color={color(METER.slack)} sub="days before the review, invented" />
          <Stat label="Regret" value={walk.meters[METER.regret]} color={color(METER.regret)} sub="expected cost of being wrong, k$, invented" />
          <Stat label="Cost to reverse" value={walk.meters[METER.undo]} color={color(METER.undo)} sub="k$ to change course later, invented" />
          <Stat label="Upkeep" value={walk.meters[METER.upkeep]} color={color(METER.upkeep)} sub="hours a week, invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="rd-stage stage-pad">
        <ScenarioStory
          scenario={QUEUE_SERVICE}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          claimOf={(id) => CLAIM_OF[id]}
          notes={<ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and a fast decision is defensible when it is cheap to undo</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
