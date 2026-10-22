import { useEffect, useState } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import type { SceneProps } from './opening';
import { CLAIM_OF, MEETING, METER, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(MEETING, { tradeoffs: true }).length === 0 ? 'every ending is reachable, no single choice is beaten on every meter by its siblings, and no whole path is beaten by another path to the same ending' : undefined;

/** Scene 2: Dana objects live. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: SceneProps) {
  const [walk, setWalk] = useState(() => startWalk(MEETING));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(MEETING, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(MEETING, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Support" value={walk.meters[METER.support]} color={color(METER.support)} sub="weighted, invented" />
          <Stat label="Trust" value={walk.meters[METER.trust]} color={color(METER.trust)} sub="of 10, invented" />
          <Stat label="Weeks" value={walk.meters[METER.weeks]} color={color(METER.weeks)} sub="to a decision" />
          <Stat label="Scope kept" value={`${walk.meters[METER.scope]}%`} color={color(METER.scope)} sub="of the proposal" />
          <Stat label="Teams exposed" value={`${walk.meters[METER.risk]}%`} color={color(METER.risk)} sub="if it fails, invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="iw-stage stage-pad">
        <ScenarioStory
          scenario={MEETING}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          claimOf={(id) => CLAIM_OF[id]}
          notes={<ClaimLabel kind="view">no ending here is marked correct: each one shows what it cost, and escalating or waiting are defensible when speed or time is the point</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
