import { useMemo } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { Button, Slider } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import { useInterval } from '../../core/useInterval';
import { barsOf, jobEnd, lanesOf, worldAt, type ClusterRun } from './timeline';

/** The Gantt chart never shows a domain shorter than this, so a very short job still has room for its bars. */
const MIN_DOMAIN = 8;
const PLAY_MS = 220;
const GANTT_MIN_WIDTH = 540;

/** Workers and tasks on a time axis (clipped to `now`), with the scheduler's log under it. */
export function ClusterPane({ run, now, onBarClick, hint }: { run: ClusterRun; now: number; onBarClick?: (id: string) => void; hint: string }) {
  const bars = useMemo(() => barsOf(run), [run]);
  const lanes = useMemo(() => lanesOf(run.plan), [run.plan]);
  const rows = worldAt(run, now).events.map((e) => ({ id: e.id, at: `t ${e.tick}`, tone: e.kind === 'fail' ? ('bad' as const) : undefined, text: e.text }));
  return (
    <>
      <Box>
        <SectionTitle hint={hint}>Workers and tasks</SectionTitle>
        <WideRegion minWidth={GANTT_MIN_WIDTH} label="Workers and tasks over time: scroll sideways to see all of it">
          <GanttLanes
            lanes={lanes}
            bars={barsAt(bars, now)}
            domain={[0, Math.max(jobEnd(run), MIN_DOMAIN)]}
            now={now}
            axis
            unit=" ticks"
            size="md"
            labelWidth={104}
            labelMinPx={46}
            onBarClick={onBarClick}
            ariaLabel={`Gantt chart of ${run.world.attempts.length} task attempts on three workers, cut at tick ${now}`}
          />
        </WideRegion>
      </Box>
      <Box>
        <SectionTitle hint="what the scheduler did, up to the time cursor">Scheduler log</SectionTitle>
        <LogStream rows={rows} label="Scheduler events" maxHeight={150} follow live="off" empty="Nothing has happened yet." />
      </Box>
    </>
  );
}

/** A time slider and a play button; `at` is null while the cursor rests at the end of the job. */
export function TimeControls({ run, now, onNow, playing, onPlaying }: { run: ClusterRun; now: number; onNow: (t: number) => void; playing: boolean; onPlaying: (p: boolean) => void }) {
  const end = jobEnd(run);
  useInterval(() => {
    if (now >= end) onPlaying(false);
    else onNow(now + 1);
  }, PLAY_MS, playing);
  return (
    <>
      <Slider label="Time" value={Math.min(now, end)} min={0} max={end} format={(t) => `tick ${t}`} onChange={(t) => { onPlaying(false); onNow(t); }} />
      <Button onClick={() => { if (playing) onPlaying(false); else { if (now >= end) onNow(0); onPlaying(true); } }}>{playing ? 'Pause' : 'Play'}</Button>
    </>
  );
}
