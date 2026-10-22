import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { chooseCaption } from './captions';
import { CHOOSE, METER, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(CHOOSE).length === 0 ? 'every ending is reachable' : undefined;

/** Scene 5: an invented product team picks a criterion to report; no ending is marked correct. */
export function ChooseScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(CHOOSE));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(chooseCaption(CHOOSE, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(CHOOSE, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={680}
      stats={
        <Stats>
          <Stat label="Group B approved" value={`${walk.meters[METER.approved]}%`} color={color(METER.approved)} sub="computed on the synthetic data" />
          <Stat label="Creditworthy denied" value={walk.meters[METER.denied]} color={color(METER.denied)} sub="in error, both groups" />
          <Stat label="Defaulters approved" value={walk.meters[METER.defaulters]} color={color(METER.defaulters)} sub="both groups" />
          <Stat label="Trust" value={`${walk.meters[METER.trust]} of 10`} color={color(METER.trust)} sub="invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="fb-stage stage-pad">
        <ScenarioStory
          scenario={CHOOSE}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          notes={
            <>
              <ClaimLabel kind="view">no ending is marked correct: each one shows what it gives up, and the choice of criterion is a values and legal question</ClaimLabel>
              <Provenance kind="toy">synthetic data and a simple scorer; real audits need real data, domain judgement and often legal advice</Provenance>
            </>
          }
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
