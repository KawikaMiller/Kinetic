import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, MIGRATION, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(MIGRATION, { tradeoffs: true }).length === 0 ? 'every ending is reachable and no choice is a straw man' : undefined;

/** Scene 2: what to peel off first. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(MIGRATION));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(MIGRATION, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(MIGRATION, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={760}
      stats={
        <Stats>
          <Stat label="Incidents" value={walk.meters[METER.incidents]} color={color(METER.incidents)} sub="customer-visible, invented" />
          <Stat label="Weeks spent" value={walk.meters[METER.weeks]} color={color(METER.weeks)} sub="invented" />
          <Stat label="Strain" value={walk.meters[METER.strain]} color={color(METER.strain)} sub="from running two systems, invented" />
          <Stat label="Unknowns ahead" value={walk.meters[METER.surprises]} sub="lower is better; it can only fall, so it never goes red" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="sf-stage stage-pad">
        <ScenarioStory
          scenario={MIGRATION}
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
