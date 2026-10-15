/**
 * The invented log lines of the replay, derived from the timeline of the path: the 14:02 deploy
 * marker is always there (a quick look would have shown it, even when it was not the cause).
 */
import { clock, pct } from '../../core/format';
import type { LogRow } from '../../components/logRows';
import {
  ACK_MIN, ACTION_LABEL, DETECT_MIN, EVIDENCE, ONSET_CLOCK_MIN, ONSET_RATE, SEVERITY_TEXT, TRAFFIC, hasCommander, hasComms,
  type Action, type Cause, type Segment, type Timeline,
} from './model';

export interface IncidentLog extends LogRow {
  id: string;
  minute: number;
}

const rate = (r: number) => pct(r / TRAFFIC);

function resultRow(s: Segment, i: number, cause: Cause): IncidentLog {
  const base = { id: `result-${i}`, minute: s.end, source: 'on-call' };
  if (s.kind === 'delay') return { ...base, level: 'WARN', text: 'two responders applied conflicting actions; the time is lost', tone: 'orange' };
  if (s.kind === 'escalate') return { ...base, level: 'INFO', text: 'mitigation left on; the dependency’s owner has the rest' };
  if (s.kind === 'investigate') return { ...base, level: 'INFO', text: `finding: ${EVIDENCE[cause]}` };
  const name = ACTION_LABEL[s.kind as Action].toLowerCase();
  if (s.outcome === 'fixed') return { ...base, level: 'INFO', text: `${name} took effect: errors back to ${rate(s.rateAfter)}`, tone: 'ok' };
  if (s.outcome === 'partial') return { ...base, level: 'INFO', text: `${name} took effect: errors fell from ${rate(s.rateBefore)} to ${rate(s.rateAfter)}`, tone: 'ok' };
  return { ...base, level: 'WARN', text: `${name} took effect and changed nothing: errors still ${rate(s.rateAfter)}`, tone: 'orange' };
}

/** Every line of the incident, oldest first, each with the minute it was logged at. */
export function incidentLog(cause: Cause, tl: Timeline): IncidentLog[] {
  const rows: IncidentLog[] = [
    { id: 'deploy', minute: 0, level: 'INFO', source: 'deploy', text: 'checkout-api build 212 finished rolling out' },
    { id: 'errors', minute: 0, level: 'ERROR', source: 'checkout', text: `${rate(ONSET_RATE)} of requests are returning 5xx` },
    { id: 'alert', minute: DETECT_MIN, level: 'WARN', source: 'alerts', text: 'symptom alert fired: checkout error ratio above its threshold, page sent' },
    { id: 'ack', minute: ACK_MIN, level: 'INFO', source: 'pager', text: 'page acknowledged by the on-call engineer' },
    { id: 'sev', minute: ACK_MIN, level: 'INFO', source: 'on-call', text: `declared ${SEVERITY_TEXT[tl.severity].label.split(':')[0]} (an example scale)` },
    {
      id: 'roles',
      minute: ACK_MIN,
      level: 'INFO',
      source: 'on-call',
      text: `${hasCommander(tl.roles) ? 'incident commander assigned' : 'no incident commander'}; ${hasComms(tl.roles) ? 'communications lead assigned' : 'no communications lead'}`,
    },
  ];
  tl.segments.forEach((s, i) => {
    if (s.kind !== 'delay') {
      const what = s.kind === 'escalate' ? 'handing the rest to the dependency’s owner' : ACTION_LABEL[s.kind as Action].toLowerCase();
      rows.push({ id: `start-${i}`, minute: s.start, level: 'INFO', source: 'on-call', text: `started: ${what}` });
    }
    rows.push(resultRow(s, i, cause));
    if (hasComms(tl.roles)) rows.push({ id: `status-${i}`, minute: s.end, level: 'INFO', source: 'status', text: 'status page updated', tone: 'info' });
  });
  return rows.sort((a, b) => a.minute - b.minute).map((r) => ({ ...r, at: clock(ONSET_CLOCK_MIN + r.minute) }));
}
