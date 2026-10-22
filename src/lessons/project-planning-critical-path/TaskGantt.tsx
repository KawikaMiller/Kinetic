import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { barLabelPx } from '../../core/gantt';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { CALENDAR_START, endHours, startHours, type Plan, type Schedule } from './cpm';

const GANTT_MIN_WIDTH = 480;
const LANE_LABEL_WIDTH = 78;

/** A task's bar tone: critical, became critical since the preset (a labelled category), or has slack. */
export type TaskRole = 'critical' | 'newly-critical' | 'slack';

const ROLE_TONE: Record<TaskRole, Tone> = { critical: 'hi', 'newly-critical': 'orange', slack: 'info' };

/**
 * One lane per task on a calendar axis (working days, weekends skipped, UTC), with each task's slack as a faint
 * extension and the project end as a milestone diamond. Scenes 1 and 2 draw their schedules through this.
 */
export function TaskGantt({ plan, schedule, roleOf, ariaLabel }: { plan: Plan; schedule: Schedule; roleOf: (id: string) => TaskRole; ariaLabel: string }) {
  const end = endHours(schedule.length);
  const bars: GanttBar[] = plan.tasks.flatMap((t) => {
    const work: GanttBar = { id: t.id, lane: t.id, start: startHours(schedule.es[t.id]), end: endHours(schedule.ef[t.id]), tone: ROLE_TONE[roleOf(t.id)], label: `${t.days}d` };
    const slack = schedule.slack[t.id];
    return slack > 0
      ? [work, { id: `${t.id}-slack`, lane: t.id, start: endHours(schedule.ef[t.id]), end: endHours(schedule.lf[t.id]), tone: 'dim' as const, label: `${slack}d slack` }]
      : [work];
  });
  bars.push({ id: 'project-end', lane: 'milestone', start: end, end, tone: 'ok', label: `Project end, day ${schedule.length}` });
  return (
    <WideRegion minWidth={GANTT_MIN_WIDTH} label="Schedule on a calendar: scroll sideways to see all of it">
      <GanttLanes
        lanes={[...plan.tasks.map((t) => ({ id: t.id, label: t.label })), { id: 'milestone', label: 'Milestone' }]}
        bars={bars}
        domain={[0, end]}
        axis={{ calendar: { start: CALENDAR_START, unit: 'day' } }}
        size="md"
        labelWidth={LANE_LABEL_WIDTH}
        labelMinPx={barLabelPx('2d')}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
