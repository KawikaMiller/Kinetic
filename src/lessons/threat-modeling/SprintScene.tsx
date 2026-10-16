import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { startWalk, validateScenario } from '../../core/scenario';
import { sprintCaption } from './captions';
import { METER, PROVENANCE_NOTE, SPRINT, SPRINT_DAYS, SPRINT_THREATS, slipOf } from './sprint';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(SPRINT).length === 0 ? 'every ending is reachable' : undefined;

/** Scene 3: one sprint, three open threats, a late event. */
export function SprintScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(SPRINT));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(sprintCaption(SPRINT, walk), { quiet: true });
  }, [setCaption, walk]);

  const risk = walk.meters[METER.risk];
  const effort = walk.meters[METER.effort];
  const ownerless = walk.meters[METER.ownerless];
  const slip = slipOf(effort);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Known residual risk" value={risk} color={risk > 20 ? 'var(--bad)' : undefined} sub={`${SPRINT_THREATS.length} open threats, likelihood x impact`} />
          <Stat label="Effort" value={`${effort} of ${SPRINT_DAYS} days`} color={slip ? 'var(--bad)' : undefined} sub={slip ? `slip of ${plural(slip, 'day')}` : 'no slip'} />
          <Stat label="Threats with no owner" value={ownerless} color={ownerless ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' },
            { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' },
            { color: 'var(--hi)', label: 'the choice you are looking at', shape: 'square' },
          ]}
        />
      }
      controls={[<>{picker}</>]}
    >
      <div className="tm-stage stage-pad">
        <ScenarioStory
          scenario={SPRINT}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          notes={<ClaimLabel kind="practice">likelihood x impact is a common way to rank threats; schemes such as DREAD have been criticised, so treat any score as a conversation starter</ClaimLabel>}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
