import { bytes } from '../../core/format';
import {
  ALERT_FRACTION, GAUGES, MAX_HOURS, NODE_TEXT, PRIMARY, SECONDS_PER_HOUR, alertHours, cascade, firstIncident, formatHours, isActive, loopText, usageAt, warningHours,
  type AlertSet, type GaugeId, type Load,
} from './model';

export type GaugeTone = 'dim' | 'info' | 'hi' | 'bad';

/** Idle (no leak touches it), filling, past the alert line, or at its limit. */
export function gaugeTone(g: GaugeId, load: Load, hours: number): GaugeTone {
  if (!isActive(g, load)) return 'dim';
  const used = usageAt(g, load, hours);
  const { limit } = GAUGES[g];
  if (used >= limit * (1 - 1e-9)) return 'bad';
  return used >= limit * ALERT_FRACTION ? 'hi' : 'info';
}

export const formatValue = (g: GaugeId, v: number) => (GAUGES[g].unit === 'bytes' ? bytes(v) : Math.round(v).toLocaleString('en-US'));

/** H:MM:SS for an instant `hours` into the run. */
export function clockLabel(hours: number): string {
  const total = Math.round(hours * SECONDS_PER_HOUR);
  const h = Math.floor(total / SECONDS_PER_HOUR);
  const m = Math.floor((total % SECONDS_PER_HOUR) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface LogEntry {
  /** Hours into the run. */
  at: number;
  kind: 'alert' | 'first' | 'downstream';
  text: string;
}

/** The headroom alerts that are on, the first limit hit, and what it sets off, in time order. */
export function logEntries(load: Load, alerts: AlertSet): LogEntry[] {
  const out: LogEntry[] = [];
  for (const g of alerts) {
    const at = alertHours(g, load);
    if (at === null || at > MAX_HOURS) continue;
    const warn = warningHours(g, load);
    out.push({ at, kind: 'alert', text: `Alert: ${GAUGES[g].label} passed ${ALERT_FRACTION * 100}% of its limit${warn === null ? '' : `, ${formatHours(warn)} before it runs out`}.` });
  }
  const incident = firstIncident(load);
  if (incident) {
    for (const step of cascade(incident.gauge)) {
      const text = step.node === 'loop' ? loopText(incident.gauge, load) : NODE_TEXT[step.node];
      out.push({ at: incident.hours + step.seconds / SECONDS_PER_HOUR, kind: step.node === PRIMARY[incident.gauge] ? 'first' : 'downstream', text });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The gauge's readings, as 0-100, every `stepHours` up to `hours`, for its sparkline. */
export function history(g: GaugeId, load: Load, hours: number, stepHours: number): number[] {
  const out: number[] = [];
  for (let h = 0; h <= hours + 1e-9; h += stepHours) out.push((usageAt(g, load, h) / GAUGES[g].limit) * 100);
  return out;
}
