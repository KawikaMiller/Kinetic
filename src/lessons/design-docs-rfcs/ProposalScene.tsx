import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { enumeratePaths, findEnding, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { scenarioCaption } from './captions';
import { BECAUSE_CLAIM, PROPOSAL } from './proposal';

/** Every path in this scenario makes the same number of decisions. */
const DECISIONS = enumeratePaths(PROPOSAL)[0].choices.length;

/** Said only because the validator, run here, finds nothing wrong: every ending can be reached. */
const ENDING_HINT = validateScenario(PROPOSAL).length === 0 ? 'every ending is reachable' : undefined;

export function ProposalScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(PROPOSAL));
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(scenarioCaption(PROPOSAL, walk), { quiet: true });
  }, [setCaption, walk]);

  const red = redMeters(PROPOSAL, walk.meters);
  const ending = findEnding(PROPOSAL, walk.at);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Decisions made" value={walk.path.length} sub={ending ? 'at an ending' : `of ${DECISIONS} to make`} />
          <Stat label="Meters in the red" value={red.length} color={red.length ? 'var(--bad)' : 'var(--ok)'} sub={red.length ? red.map((m) => m.label.toLowerCase()).join(', ') : 'none'} />
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
      <div className="dd stage-pad">
        <ScenarioStory
          scenario={PROPOSAL}
          walk={walk}
          onWalk={setWalk}
          provenance="an invented scenario: every effect is a made-up number chosen to show a trade-off"
          notes={<ClaimLabel kind="view">each reason shown is a view or common practice, not a measurement; RFC processes differ between organisations</ClaimLabel>}
          claimOf={(id) => BECAUSE_CLAIM[id]}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
