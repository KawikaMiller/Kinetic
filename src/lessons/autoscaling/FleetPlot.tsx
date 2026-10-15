import { useMemo } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { Band, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { INSTANCE_RPS, MAX_INSTANCES, MINUTES_PER_DAY, RUN_MINUTES, type FleetRun } from './model';
import { rps } from './frames';

const WINDOW_HOURS = { before: 2.5, after: 0.5 } as const;
const MIN_WARM_PX = 3;
/** A Monday at midnight UTC: the Gantt's calendar axis counts hours from here. */
const CALENDAR_START = '2026-03-02T00:00:00Z';
const KEY_STEP_MINUTES = 5;

const hourLabel = (minute: number): string => `${Math.round((minute - MINUTES_PER_DAY) / 60)}h`;
const clampMinute = (m: number): number => Math.min(RUN_MINUTES - 1, Math.max(MINUTES_PER_DAY, Math.round(m)));

/** Day 2 as capacity against load: what is offered, what is ready, what is paid for, and what is dropped. */
export function FleetPlot({ run, now, onNow }: { run: FleetRun; now: number; onNow?: (minute: number) => void }) {
  const row = (x: number) => run.rows[Math.min(RUN_MINUTES - 1, Math.max(0, Math.floor(x)))];
  const top = useMemo(() => Math.max(...run.rows.map((r) => Math.max(r.load, r.billed * INSTANCE_RPS))) * 1.05, [run]);
  return (
    <Plot2D
      x={{ domain: [MINUTES_PER_DAY, RUN_MINUTES], label: 'hour of day 2 (UTC)', format: hourLabel, ticks: 6 }}
      y={{ domain: [0, top], label: 'requests/s', format: (v) => rps(v).replace('/s', ''), ticks: 4 }}
      ariaLabel={`Day 2: offered load, ready capacity and instances paid for; ${run.summary.violationMinutes} violation minutes`}
    >
      <Band lo={(x) => Math.min(row(x).load, row(x).ready * INSTANCE_RPS)} hi={(x) => row(x).load} tone="bad" />
      <Curve fn={(x) => row(x).billed * INSTANCE_RPS} tone="violet" dashed />
      <Curve fn={(x) => row(x).ready * INSTANCE_RPS} tone="ok" />
      <Curve fn={(x) => row(x).load} tone="info" />
      {onNow ? (
        <VLine
          at={now}
          tone="hi"
          onDrag={(x) => onNow(clampMinute(x))}
          onStep={(d) => onNow(clampMinute(now + d * KEY_STEP_MINUTES))}
          ariaLabel="Minute"
          valueText={`minute ${now - MINUTES_PER_DAY} of day 2`}
        />
      ) : (
        <VLine at={now} tone="hi" />
      )}
    </Plot2D>
  );
}

/** Each instance's life in the three hours around `now`: warming (hatched), then serving. Lanes are instance slots. */
export function InstanceLanes({ run, now }: { run: FleetRun; now: number }) {
  const nowHours = now / 60;
  const domain: [number, number] = [nowHours - WINDOW_HOURS.before, nowHours + WINDOW_HOURS.after];
  const W = run.controller.warmupMin;
  const lanes: GanttLane[] = Array.from({ length: run.controller.max }, (_, i) => ({ id: `s${i}`, label: `instance ${i + 1}` }));
  const planned = run.lifetimes.flatMap((life, i): GanttBar[] => {
    const end = (life.endedAt ?? RUN_MINUTES) / 60;
    if (end < domain[0] || life.launchedAt / 60 > domain[1]) return [];
    const bars: GanttBar[] = [];
    if (W > 0 && life.launchedAt > 0) bars.push({ id: `w${i}`, lane: `s${life.slot}`, start: (life.launchedAt + 1) / 60, end: life.readyAt / 60, tone: 'violet', kind: 'wait', minPx: MIN_WARM_PX, label: 'warming' });
    bars.push({ id: `r${i}`, lane: `s${life.slot}`, start: life.readyAt / 60, end, tone: 'ok', label: 'serving' });
    // A bar that began before the window starts at its left edge, so it never paints over the lane labels.
    return bars.filter((b) => b.end > domain[0]).map((b) => ({ ...b, start: Math.max(b.start, domain[0]) }));
  });
  return (
    <Box className="as-lanes">
      <SectionTitle hint={`${W} minute${W === 1 ? '' : 's'} of warm-up, up to ${MAX_INSTANCES} instances`}>Instance lifetimes around the cursor</SectionTitle>
      <WideRegion minWidth={480} label="Instance lifetimes: scroll sideways to see all of it">
        <GanttLanes
          lanes={lanes}
          bars={barsAt(planned, nowHours)}
          domain={domain}
          now={nowHours}
          axis={{ calendar: { start: CALENDAR_START, unit: 'hour' } }}
          hideEmptyLanes
          size="sm"
          labelWidth={92}
          labelMinPx={Number.POSITIVE_INFINITY}
          ariaLabel="Instance lifetimes: warming, then serving"
        />
      </WideRegion>
    </Box>
  );
}
