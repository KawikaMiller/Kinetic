/** Scene 2's alerts over the synthetic week, each reduced to the minutes at which it pages. Pure. */
import { CPU_CAUSE_THRESHOLD, DISK_CAUSE_THRESHOLD, SYMPTOM_FOR, SYMPTOM_THRESHOLD, judge, leadTime, pageMinutes, predictionFires, type Verdict } from './rules';
import { WEEK } from './week';

export interface AlertRow {
  id: 'cpu' | 'disk' | 'pods' | 'symptom';
  label: string;
  kind: 'cause' | 'symptom';
  fires: number[];
  verdict: Verdict;
}

const row = (id: AlertRow['id'], label: string, kind: AlertRow['kind'], fires: number[]): AlertRow => ({ id, label, kind, fires, verdict: judge(fires) });

export function alertRows(): AlertRow[] {
  return [
    row('cpu', `CPU above ${CPU_CAUSE_THRESHOLD}%`, 'cause', pageMinutes(WEEK.cpu, CPU_CAUSE_THRESHOLD, 0)),
    row('disk', `Disk above ${DISK_CAUSE_THRESHOLD}%`, 'cause', pageMinutes(WEEK.disk, DISK_CAUSE_THRESHOLD, 0)),
    row('pods', 'A pod restarts', 'cause', [...WEEK.restarts]),
    row('symptom', `Error ratio above ${SYMPTOM_THRESHOLD}% for ${SYMPTOM_FOR} minutes`, 'symptom', pageMinutes(WEEK.errors, SYMPTOM_THRESHOLD, SYMPTOM_FOR)),
  ];
}

/** The disk-full prediction's ticket: the minute it is raised and how long before the disk actually fills. */
export function predictionTicket(): { fire: number; lead: number } | null {
  const fire = predictionFires(WEEK.disk).find((f) => leadTime(f) >= 0);
  return fire === undefined ? null : { fire, lead: leadTime(fire) };
}
