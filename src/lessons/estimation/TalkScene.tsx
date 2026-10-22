import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { talkCaption } from './captions';
import { MANAGER, METER, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(MANAGER).length === 0 ? 'every ending is reachable' : undefined;

/** Scene 5: the manager's question, an invented conversation whose schedule risk comes from the scene 2 model. */
export function TalkScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(MANAGER));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(talkCaption(MANAGER, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(MANAGER, walk.meters).map((m) => m.id);

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label="Trust" value={`${walk.meters[METER.trust]} of 10`} color={red.includes(METER.trust) ? 'var(--bad)' : undefined} sub="invented" />
          <Stat label="Chance of missing the planned day" value={`${walk.meters[METER.risk]}%`} color={red.includes(METER.risk) ? 'var(--bad)' : undefined} sub="computed for your first answer; week-four changes are invented" />
          <Stat label="Slack" value={`${walk.meters[METER.slack]} days`} color={red.includes(METER.slack) ? 'var(--bad)' : undefined} sub="planned day minus the medians of the work kept" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="es-stage stage-pad">
        <ScenarioStory
          scenario={MANAGER}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          notes={<ClaimLabel kind="view">how to answer a manager is a judgement call: this lesson shows each answer&apos;s price and recommends none</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
