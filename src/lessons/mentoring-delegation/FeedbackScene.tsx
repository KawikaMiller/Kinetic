import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { feedbackCaption } from './captions';
import { FEEDBACK, METER, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(FEEDBACK).length === 0 ? 'every ending is reachable' : undefined;

/** Scene 2: a feedback conversation, invented. */
export function FeedbackScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(FEEDBACK));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(feedbackCaption(FEEDBACK, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(FEEDBACK, walk.meters).map((m) => m.id);
  const tone = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Clarity" value={walk.meters[METER.clarity]} color={tone(METER.clarity)} sub="of 10, invented" />
          <Stat label="Their ownership" value={walk.meters[METER.ownership]} color={tone(METER.ownership)} sub="of 10, invented" />
          <Stat label="Your hours" value={`${walk.meters[METER.hours]} h`} color={tone(METER.hours)} sub="from the board's costs" />
          <Stat label="Delivered this week" value={walk.meters[METER.delivery]} sub="invented scale" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="md-stage stage-pad">
        <ScenarioStory
          scenario={FEEDBACK}
          walk={walk}
          onWalk={setWalk}
          provenance={PROVENANCE_NOTE}
          notes={<ClaimLabel kind="practice">Situation-Behaviour-Impact is a common feedback framing, credited to the Center for Creative Leadership (from memory: check the source)</ClaimLabel>}
          claimOf={(id) => (id === 'sbi' ? 'practice' : undefined)}
          endingHint={ENDING_HINT}
        />
      </div>
    </StageFrame>
  );
}
