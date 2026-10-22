import { useEffect, useState } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, DEBRIEF, METER, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(DEBRIEF, { tradeoffs: true }).length === 0 ? 'every ending is reachable, no single choice is beaten on every meter by its siblings, and no whole path is beaten by another path to the same ending' : undefined;

/** Scene 4: the debrief. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  const [walk, setWalk] = useState(() => startWalk(DEBRIEF));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(DEBRIEF, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(DEBRIEF, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Regret" value={walk.meters[METER.regret]} color={color(METER.regret)} sub="expected cost of a wrong decision, k$, invented" />
          <Stat label="Days" value={walk.meters[METER.days]} color={color(METER.days)} sub="to a decision" />
          <Stat label="Panel goodwill" value={walk.meters[METER.goodwill]} color={color(METER.goodwill)} sub="of 10, invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="hi-stage stage-pad">
        <ScenarioStory
          scenario={DEBRIEF}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          claimOf={(id) => CLAIM_OF[id]}
          notes={<ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and a fast average is defensible when a wrong call is cheap to undo</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
