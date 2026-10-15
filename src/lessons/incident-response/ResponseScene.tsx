import { useEffect, useMemo, type ReactNode } from 'react';
import { ScenarioStory } from '../../components/ScenarioStory';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { ClaimKind } from '../../core/provenance';
import { validateScenario, type Walk } from '../../core/scenario';
import { responseCaption } from './captions';
import { CAUSES, CAUSE_LABEL, SCENARIOS, TRAFFIC, choiceIdsOf, rateAt, timelineOf, type Cause } from './model';

/** Which kind of claim each choice's reason is: the severity scale is one organisation's; the rest is how incidents are usually run. */
const CLAIM: Record<string, ClaimKind> = { sev1: 'view', sev2: 'view', sev3: 'view' };
const claimOf = (id: string): ClaimKind => CLAIM[id] ?? 'practice';

export function ResponseScene({ picker, cause, onCause, walk, onWalk }: {
  picker: ReactNode;
  cause: Cause;
  onCause: (c: Cause) => void;
  walk: Walk;
  onWalk: (w: Walk) => void;
}) {
  const setCaption = useSetCaption();
  const scenario = SCENARIOS[cause];
  const tl = timelineOf(cause, choiceIdsOf(walk));
  const rate = rateAt(tl, tl.end);
  const reachable = useMemo(() => validateScenario(scenario).length === 0, [scenario]);
  const mitigation = tl.resolvedAt !== null ? `fixed at minute ${tl.resolvedAt}` : tl.mitigatedAt !== null ? `cut at minute ${tl.mitigatedAt}, not fixed` : 'not mitigated yet';

  useEffect(() => {
    setCaption(responseCaption(scenario, cause, walk), { quiet: true });
  }, [setCaption, scenario, cause, walk]);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Failing now" value={`${rate} of ${TRAFFIC.toLocaleString('en-US')}`} color={rate === 0 ? 'var(--ok)' : 'var(--bad)'} sub="requests per minute" />
          <Stat label="Mitigation" value={mitigation} color={tl.resolvedAt !== null ? 'var(--ok)' : undefined} />
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
      controls={[
        <>
          {picker}
          <Segmented
            label="Hidden cause (changing it restarts the story; it stays hidden until you investigate)"
            value={cause}
            onChange={onCause}
            options={CAUSES.map((c) => ({ value: c, label: CAUSE_LABEL[c] }))}
          />
        </>,
      ]}
    >
      <div className="ir stage-pad">
        <ScenarioStory
          scenario={scenario}
          walk={walk}
          onWalk={onWalk}
          provenance="an invented incident: every number is made up to show a trade-off, not measured"
          notes={
            <>
              <ClaimLabel kind="practice">mitigate first, understand second is how many teams run incidents, not a law</ClaimLabel>
              <ClaimLabel kind="view">the SEV scale and role names are one organisation&apos;s example; real ones differ</ClaimLabel>
            </>
          }
          claimOf={claimOf}
          endingHint={reachable ? 'every ending is reachable' : undefined}
          stepTitle={(n) => `Move ${n}`}
        />
      </div>
    </StageFrame>
  );
}
