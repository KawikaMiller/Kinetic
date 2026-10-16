import { useMemo } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { Button, Slider } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import { barsOf, hourLabel, lanesOf } from './chart';
import { CALENDAR_START, DAYS, HORIZON_HOURS, dayStatus, type World } from './engine';

const GANTT_MIN_WIDTH = 620;

/** The week of daily runs, one lane per task, on a UTC calendar axis, cut at the time cursor. */
export function RunChart({ finalWorld, now, onBarClick, hint }: { finalWorld: World; now: number; onBarClick?: (id: string) => void; hint: string }) {
  const bars = useMemo(() => barsOf(finalWorld), [finalWorld]);
  return (
    <Box>
      <SectionTitle hint={hint}>One run a day, one lane a task</SectionTitle>
      <WideRegion minWidth={GANTT_MIN_WIDTH} label="Daily runs on a calendar: scroll sideways to see all of it">
        <GanttLanes
          lanes={lanesOf()}
          bars={barsAt(bars, now)}
          domain={[0, HORIZON_HOURS]}
          now={now}
          axis={{ calendar: { start: CALENDAR_START, unit: 'day' } }}
          size="md"
          labelWidth={104}
          labelMinPx={12}
          onBarClick={onBarClick}
          ariaLabel={`Gantt chart of daily pipeline runs, cut at ${hourLabel(CALENDAR_START, now)} UTC`}
        />
      </WideRegion>
    </Box>
  );
}

export function SchedulerLog({ world }: { world: World }) {
  const rows = world.log.map((e) => ({ id: e.id, at: hourLabel(CALENDAR_START, e.hour), tone: e.bad ? ('bad' as const) : undefined, text: e.text }));
  return (
    <Box>
      <SectionTitle hint="what the scheduler did, up to the time cursor">Scheduler log</SectionTitle>
      <LogStream rows={rows} label="Scheduler events" maxHeight={140} follow live="off" empty="Nothing has happened yet." />
    </Box>
  );
}

const HOURS_PER_DAY = 24;
/** A slider over the whole calendar, and buttons that step a day. */
export function CalendarTime({ now, onNow }: { now: number; onNow: (h: number) => void }) {
  return (
    <>
      <Slider label="Time" value={now} min={0} max={HORIZON_HOURS} format={(h) => hourLabel(CALENDAR_START, h)} onChange={onNow} />
      <Button onClick={() => onNow(Math.max(0, now - HOURS_PER_DAY))} softDisabled={now === 0}>Back a day</Button>
      <Button onClick={() => onNow(Math.min(HORIZON_HOURS, now + HOURS_PER_DAY))} softDisabled={now === HORIZON_HOURS}>Forward a day</Button>
    </>
  );
}

const STATUS_TEXT: Record<string, string> = { ok: 'equal', stale: 'stale', duplicated: 'duplicated', missing: 'not loaded' };
const STATUS_CLASS: Record<string, string> = { ok: 'eo-ok', stale: 'eo-late', duplicated: 'eo-bad', missing: 'eo-dim' };

/** What the report table holds for each date, against the source, at the world shown. */
export function DayTable({ world, dateOf }: { world: World; dateOf: (d: number) => string }) {
  return (
    <div className="eo-scroll" role="region" aria-label="Rows in the report for each date against the source" tabIndex={0}>
      <table className="data-table eo-table">
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Source rows</th><th scope="col">Report rows</th><th scope="col">Loads</th><th scope="col">State</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: DAYS }, (_, d) => {
            const s = dayStatus(world, d);
            return (
              <tr key={d}>
                <th scope="row">{dateOf(d)}</th>
                <td>{world.source[d]}</td>
                <td className={STATUS_CLASS[s]}>{world.output[d]}</td>
                <td>{world.loads[d]}</td>
                <td className={STATUS_CLASS[s]}>{STATUS_TEXT[s]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
