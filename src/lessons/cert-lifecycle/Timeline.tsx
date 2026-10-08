import { useMemo } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { GanttLanes, type GanttBar, type GanttLane, type GanttMarker } from '../../components/GanttLanes';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { daysFromStart, handshake, lifetimeDays, outageRanges, sampleTimes, SAMPLES, type Cert, type EventKind, type Scenario } from './model';

export const TIMELINE_MIN_WIDTH = 520;
const MARKER_TONE: Partial<Record<EventKind, Tone>> = { issued: 'ok', expired: 'bad', alert: 'hi', reminder: 'hi', 'attempt-failed': 'orange', note: 'violet' };

/** Lanes that stay even when empty: an empty outage lane is the good news. */
const ALWAYS_SHOWN = new Set(['leaf', 'out']);
const LANES: GanttLane[] = [
  { id: 'leaf', label: 'Certificate' },
  { id: 'window', label: 'Renewal window' },
  { id: 'ica', label: 'Intermediate' },
  { id: 'out', label: 'Handshakes fail' },
];

function bars(s: Scenario): GanttBar[] {
  const d = (t: number) => Math.min(Math.max(daysFromStart(s, t), 0), daysFromStart(s, s.end));
  const notLoaded = new Set(s.onDisk.map((c) => c.id));
  const leaf = (c: Cert): GanttBar =>
    notLoaded.has(c.id)
      ? { id: c.id, lane: 'leaf', start: d(c.notBefore), end: d(c.notAfter), tone: 'violet', kind: 'blocked', label: 'on disk, not loaded' }
      : { id: c.id, lane: 'leaf', start: d(c.notBefore), end: d(c.notAfter), tone: 'ok', label: `${Math.round(lifetimeDays(c))} d` };
  return [
    ...s.leaves.map(leaf),
    ...s.renewalWindows.map((w) => ({ id: `w-${w.certId}`, lane: 'window', start: d(w.from), end: d(w.to), tone: 'hi' as const, kind: 'wait' as const, label: 'renew' })),
    ...s.intermediates.map((c) => ({ id: c.id, lane: 'ica', start: d(c.notBefore), end: d(c.notAfter), tone: 'ok' as const, label: c.label })),
    ...outageRanges(s).map((r) => ({ id: `out-${r.from}`, lane: 'out', start: d(r.from), end: d(r.to), tone: 'bad' as const, label: 'outage' })),
  ].filter((b) => b.end > b.start);
}

function markers(s: Scenario): GanttMarker[] {
  let sawFail = false;
  return s.events.flatMap((e) => {
    if (!e.short) return [];
    if (e.kind === 'attempt-failed') {
      if (sawFail) return [];
      sawFail = true;
    }
    return [{ at: daysFromStart(s, e.t), label: e.short, tone: MARKER_TONE[e.kind] ?? 'muted' }];
  });
}

/** A certificate timeline (days from the start of the scenario) with the "today" cursor, and one row of handshakes per client. */
export function Timeline({ scenario, now }: { scenario: Scenario; now: number }) {
  const domainDays = daysFromStart(scenario, scenario.end);
  const nowDays = daysFromStart(scenario, now);
  const barList = useMemo(() => bars(scenario), [scenario]);
  const markerList = useMemo(() => markers(scenario), [scenario]);
  const times = useMemo(() => sampleTimes(scenario), [scenario]);
  const result = (r: number, c: number) => handshake(scenario.served, scenario.clients[r], times[c]);
  return (
    <WideRegion minWidth={TIMELINE_MIN_WIDTH} label="Certificate timeline: scroll sideways to see all of it">
      <div className="cl-timeline">
        <GanttLanes
          lanes={LANES.filter((l) => barList.some((b) => b.lane === l.id) || ALWAYS_SHOWN.has(l.id))}
          bars={barList}
          domain={[0, domainDays]}
          now={nowDays}
          markers={markerList}
          unit=" d"
          axis
          size="md"
          labelWidth={110}
          ariaLabel="Certificate timeline in days from the start. Green is a valid certificate, yellow hatched the renewal window, red a stretch when handshakes fail."
        />
        <div className="cl-strip" role="group" aria-label="One handshake per cell, in time order">
          <CellGrid
            rows={scenario.clients.length}
            cols={SAMPLES}
            size="xs"
            rowLabels={scenario.clients.length > 1 ? scenario.clients.map((c) => c.label) : undefined}
            cell={(r, c) => ({ tone: result(r, c).ok ? 'ok' : 'bad', fill: times[c] <= now ? 'solid' : 'tint' })}
            cellTitle={(r, c) => {
              const h = result(r, c);
              return `${scenario.clients[r].label}: ${h.ok ? 'handshake succeeds' : h.reason}`;
            }}
            ariaLabel={`${SAMPLES} handshakes for ${scenario.clients.map((c) => c.label).join(' and ')}`}
          />
        </div>
      </div>
    </WideRegion>
  );
}
