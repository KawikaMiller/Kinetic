import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import { METER, PROVENANCE_NOTE, STAKEHOLDER } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(STAKEHOLDER).length === 0 ? 'every ending is reachable' : undefined;

/** Scene 5: a stakeholder asks for an urgent item mid-quarter. Every option's trade-off is shown. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(STAKEHOLDER));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(STAKEHOLDER, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(STAKEHOLDER, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={680}
      stats={
        <Stats>
          <Stat label="Value delivered this quarter" value={walk.meters[METER.value]} color={color(METER.value)} sub="computed from the cost-of-delay model" />
          <Stat label="Trust" value={`${walk.meters[METER.trust]} of 10`} color={color(METER.trust)} sub="invented" />
          <Stat label="Weeks committed" value={walk.meters[METER.load]} color={color(METER.load)} sub="against a full quarter" />
          <Stat label="Committed items moved" value={walk.meters[METER.changed]} color={color(METER.changed)} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="pz-stage stage-pad">
        <ScenarioStory
          scenario={STAKEHOLDER}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          notes={<ClaimLabel kind="view">no option here is marked correct: each one shows what it gives up</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
