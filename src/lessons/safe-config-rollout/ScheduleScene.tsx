import { useEffect, useMemo, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import { pad2 } from '../../core/format';
import { scheduleCaption } from './captions';
import { CHANGES, planFrom, simulate, changeOf, type ChangeId } from './model';
import { MIN_PER_HOUR, calendarStart, domainHours, landingsInPeak, scheduleBars, scheduleLanes } from './schedule';
import type { PlanState } from './plan';

const GANTT_MIN_W = 520;
const LABEL_W = 108;
const NO_BAR_TEXT = Number.POSITIVE_INFINITY;

export function ScheduleScene({ picker, change, onChange, state, startHour, onStartHour }: {
  picker: ReactNode;
  change: ChangeId;
  onChange: (c: ChangeId) => void;
  state: PlanState;
  startHour: number;
  onStartHour: (h: number) => void;
}) {
  const setCaption = useSetCaption();
  const c = changeOf(change);
  const plan = useMemo(() => planFrom(state.stages, { bake: state.bake, gate: state.gate, validate: state.validate, autoRollback: state.autoRollback }), [state]);
  const result = useMemo(() => simulate(c, plan), [c, plan]);
  const inPeak = useMemo(() => landingsInPeak(plan, result, startHour), [plan, result, startHour]);
  const bars = useMemo(() => scheduleBars(plan, result, startHour), [plan, result, startHour]);

  useEffect(() => {
    setCaption(scheduleCaption(plan, result, inPeak), { quiet: true });
  }, [setCaption, plan, result, inPeak]);

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Stages" value={result.stages.length} sub={`of ${plan.stages.length} planned`} />
          <Stat label="Stages landing in a peak" value={inPeak.length} sub="a riskier time to ship" color={inPeak.length ? 'var(--hi)' : undefined} />
          <Stat label="Blast radius" value={result.serverMinutes.toLocaleString('en-US')} sub="server-minutes affected" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'a stage baking (hatched)', shape: 'square' },
            { color: 'var(--hi)', label: 'a stage lands', shape: 'square' },
            { color: 'var(--ok)', label: 'gate passed', shape: 'square' },
            { color: 'var(--bad)', label: 'the rollout is stopped', shape: 'square' },
            { color: 'var(--amber)', label: 'a region’s traffic peak', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="The change" value={change} onChange={onChange} options={CHANGES.map((x) => ({ value: x.id, label: x.label }))} />
          <Slider label="Start at (UTC)" value={startHour} min={0} max={23} onChange={onStartHour} format={(h) => `${pad2(h)}:00`} />
        </>,
      ]}
    >
      <div className="cr stage-pad">
        <Hint block>The plan is the one from the staged scene: change it there. Times are UTC. A region&apos;s peak is drawn only when it falls inside the hours the rollout spans.</Hint>
        <WideRegion minWidth={GANTT_MIN_W} label="Rollout schedule: scroll sideways to see all of it">
          <GanttLanes
            lanes={scheduleLanes()}
            bars={bars}
            domain={[0, domainHours(result)]}
            axis={{ calendar: { start: calendarStart(startHour), unit: 'hour' } }}
            hideEmptyLanes
            labelWidth={LABEL_W}
            labelMinPx={NO_BAR_TEXT}
            ariaLabel={`Rollout schedule starting at ${pad2(startHour)}:00 UTC, ${Math.round(domainHours(result) * MIN_PER_HOUR)} minutes shown`}
          />
        </WideRegion>
        <ProvenanceRow>
          <Provenance kind="illustrative">peak windows are invented; the model does not simulate load</Provenance>
          <ClaimLabel kind="practice">shipping during a region’s peak is riskier: common practice, not something this model measures</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
