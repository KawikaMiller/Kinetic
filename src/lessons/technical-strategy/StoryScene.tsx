import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, PROVENANCE_NOTE, STORAGE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(STORAGE, { tradeoffs: true }).length === 0 ? 'every ending is reachable and no choice is a straw man' : undefined;

/** Scene 2: which storage policy, and how it is enforced. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(STORAGE));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(STORAGE, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(STORAGE, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Autonomy" value={walk.meters[METER.autonomy]} color={color(METER.autonomy)} sub="of 10, red below 4, invented" />
          <Stat label="Migration effort" value={walk.meters[METER.effort]} color={color(METER.effort)} sub="red above 8, invented" />
          <Stat label="Delivery drag" value={walk.meters[METER.drag]} color={color(METER.drag)} sub="of 10, red above 6, invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="ts-stage stage-pad">
        <ScenarioStory
          scenario={STORAGE}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          claimOf={(id) => CLAIM_OF[id]}
          notes={<ClaimLabel kind="view">no option here is marked correct: each one shows what it costs before you pick it</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
