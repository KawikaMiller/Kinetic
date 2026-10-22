import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { redMeters, startWalk, validateScenario } from '../../core/scenario';
import { storyCaption } from './captions';
import { CLAIM_OF, METER, PRICE_RISE, PROVENANCE_NOTE } from './scenario';

/** Said only because the validator, run here, finds nothing wrong. */
const ENDING_HINT = validateScenario(PRICE_RISE, { tradeoffs: true }).length === 0 ? 'every ending is reachable and no choice is a straw man' : undefined;

/** Scene 3: the vendor raises the price. Every option shows its price before it is picked; no ending is marked correct. */
export function StoryScene({ picker }: { picker: ReactNode }) {
  const [walk, setWalk] = useState(() => startWalk(PRICE_RISE));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(storyCaption(PRICE_RISE, walk), { quiet: true });
  }, [setCaption, walk]);
  const red = redMeters(PRICE_RISE, walk.meters).map((m) => m.id);
  const color = (id: string) => (red.includes(id) ? 'var(--bad)' : undefined);

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Extra cost" value={walk.meters[METER.extra]} color={color(METER.extra)} sub="over two years, thousands, invented" />
          <Stat label="Weeks diverted" value={walk.meters[METER.weeks]} color={color(METER.weeks)} sub="invented" />
          <Stat label="Lock-in exposure" value={walk.meters[METER.lockin]} color={color(METER.lockin)} sub="of 10, invented" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' }, { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="bb-stage stage-pad">
        <ScenarioStory
          scenario={PRICE_RISE}
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
