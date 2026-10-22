import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSetCaption } from '../core/caption';
import type { ClaimKind } from '../core/provenance';
import { redMeters, startWalk, validateScenario, type Scenario, type Walk } from '../core/scenario';
import { ScenarioStory } from './ScenarioStory';
import { StageFrame } from './StageFrame';
import { Legend, Stat, Stats } from './ui';

/** One stat tile that follows a scenario meter: its value turns red with the meter. */
export interface StoryStat {
  /** The scenario meter this tile reads. */
  meter: string;
  label: string;
  sub: string;
  /** How the value prints (default: the bare number). */
  format?: (value: number) => string;
}

/** The scene legend every story scene shares: a meter is blue while fine and red past its edge. */
const METER_LEGEND = [
  { color: 'var(--info)', label: 'a meter while it is fine', shape: 'square' as const },
  { color: 'var(--bad)', label: 'a meter in the red', shape: 'square' as const },
];

/**
 * A whole story scene (K4 lead lessons): a `ScenarioStory` inside a `StageFrame`, with one stat tile per meter that
 * turns red with it, the shared meter legend, and a caption the lesson derives from the walk. The lesson supplies
 * the scenario and its words; this owns the walk state, the caption effect and the stat colouring.
 *
 * `endingClaim` is the sentence about the scenario as a whole (every ending reachable, no straw-man choice, ...).
 * It is shown only when `validateScenario(scenario, { tradeoffs: true })` finds nothing wrong, so it is never said
 * of a scenario the validator has not cleared. `notes` are the claim labels and chips under the story.
 */
export function ScenarioStage({
  picker, scenario, caption, stats, height, stageClass, provenance, claimOf, notes, endingClaim,
}: {
  picker: ReactNode;
  scenario: Scenario;
  caption: (scenario: Scenario, walk: Walk) => ReactNode;
  stats: readonly StoryStat[];
  height: number;
  /** The lesson's own stage class (with its prefix), e.g. `sf-stage`. */
  stageClass: string;
  provenance: ReactNode;
  claimOf: (choiceId: string) => ClaimKind | undefined;
  notes: ReactNode;
  endingClaim: string;
}) {
  const [walk, setWalk] = useState(() => startWalk(scenario));
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(caption(scenario, walk), { quiet: true });
  }, [setCaption, caption, scenario, walk]);
  const red = redMeters(scenario, walk.meters).map((m) => m.id);
  const endingHint = useMemo(
    () => (validateScenario(scenario, { tradeoffs: true }).length === 0 ? endingClaim : undefined),
    [scenario, endingClaim],
  );

  return (
    <StageFrame
      height={height}
      stats={
        <Stats>
          {stats.map((s) => {
            const value = walk.meters[s.meter];
            return <Stat key={s.meter} label={s.label} value={s.format ? s.format(value) : value} color={red.includes(s.meter) ? 'var(--bad)' : undefined} sub={s.sub} />;
          })}
        </Stats>
      }
      legend={<Legend items={METER_LEGEND} />}
      controls={[<>{picker}</>]}
    >
      <div className={`${stageClass} stage-pad`}>
        <ScenarioStory scenario={scenario} walk={walk} onWalk={setWalk} provenance={provenance} claimOf={claimOf} notes={notes} endingHint={endingHint} />
      </div>
    </StageFrame>
  );
}
