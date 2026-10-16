import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { FULL_AT, MAX_LOG_MIN, MAX_SNAPSHOT_H, MAX_THROUGHPUT, MIN_LOG_MIN, MIN_SNAPSHOT_H, MIN_THROUGHPUT, WEEK_MIN, clock, dataLostMin, latestRecoverable, restore, restoreTime } from './backup';
import {
  DAY_OPTIONS, HISTORY_SEED, TIMELINE_OPEN, axis, checkTarget, historyOf, matchesOracle, minutesText, restoreInput, secondsText, timeline, timelineCaption,
} from './view';

const GANTT_MIN_WIDTH = 560;

export function TimelineScene({ picker }: { picker: ReactNode }) {
  const [snapshotH, setSnapshotH] = useState<number>(TIMELINE_OPEN.snapshotH);
  const [logOn, setLogOn] = useState<boolean>(TIMELINE_OPEN.logOn);
  const [logMin, setLogMin] = useState<number>(TIMELINE_OPEN.logMin);
  const [throughput, setThroughput] = useState<number>(TIMELINE_OPEN.throughput);
  const [disasterAt, setDisasterAt] = useState<number>(TIMELINE_OPEN.disasterAt);
  const [day, setDay] = useState<number>(TIMELINE_OPEN.day);
  const [targetText, setTargetText] = useState<string>(TIMELINE_OPEN.targetText);
  const [gap, setGap] = useState<boolean>(TIMELINE_OPEN.gap);
  const [gapSeed, setGapSeed] = useState<number>(TIMELINE_OPEN.gapSeed);

  const input = useMemo(() => restoreInput({ snapshotH, logOn, logMin, gapSeed: gap ? gapSeed : null, disasterAt }), [snapshotH, logOn, logMin, gap, gapSeed, disasterAt]);
  const check = useMemo(() => checkTarget(targetText, day, input), [targetText, day, input]);
  const target = check.ok ? check.minute : null;
  const gantt = useMemo(() => timeline(input, target, throughput), [input, target, throughput]);
  const restored = target === null ? null : restore(input, target);
  const time = useMemo(() => restoreTime(input, target ?? latestRecoverable(input), throughput), [input, target, throughput]);
  const caption = timelineCaption(input, target, throughput);
  const lost = dataLostMin(input);

  return (
    <StageFrame
      height={560}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Data lost (RPO)" value={minutesText(lost)} color={lost > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`recoverable to ${clock(latestRecoverable(input))}`} />
          <Stat label="Time to restore (RTO)" value={minutesText(time.totalS / 60)} color="var(--orange)" sub={[`${secondsText(time.restoreS)} restoring ${time.restoreGB} GB`, `${secondsText(time.replayS)} replaying ${time.replayGB.toFixed(0)} GB of log`]} />
          <Stat label="Restored database" value={restored === null ? 'no target' : matchesOracle(historyOf(), restored) ? `matches at ${clock(restored.reached)}` : 'differs'} color={restored === null ? undefined : matchesOracle(historyOf(), restored) ? 'var(--ok)' : 'var(--bad)'} sub={restored === null ? 'type a valid time' : 'the never-failed database at that minute'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a backup or a shipped log stretch', shape: 'square' },
            { color: 'var(--ok)', label: 'the recoverable range, and the target', shape: 'square' },
            { color: 'var(--bad)', label: 'data lost, a log gap, the bad deployment', shape: 'square' },
            { color: 'var(--orange)', label: 'downtime while restoring', shape: 'square' },
            { color: 'var(--hi)', label: 'the disaster', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Backup every" value={snapshotH} min={MIN_SNAPSHOT_H} max={MAX_SNAPSHOT_H} step={6} onChange={setSnapshotH} format={(v) => `${v} h`} />
          <Toggle label="Log archive" value={logOn} onChange={setLogOn} off="Off" on="On" />
          {logOn && <Slider label="Ship a segment every" value={logMin} min={MIN_LOG_MIN} max={MAX_LOG_MIN} step={5} onChange={setLogMin} format={(v) => `${v} min`} />}
          <Slider label="Restore throughput" value={throughput} min={MIN_THROUGHPUT} max={MAX_THROUGHPUT} step={100} onChange={setThroughput} format={(v) => `${v} MB/s`} />
        </>,
        <>
          <Slider label="Disaster at" value={disasterAt} min={FULL_AT + 60} max={WEEK_MIN} step={1} onChange={setDisasterAt} format={clock} />
          <Segmented label="Target day" value={day} onChange={setDay} options={DAY_OPTIONS} />
          <TextField label="Target time (HH:MM, UTC)" value={targetText} onChange={setTargetText} width={90} spellCheck={false} />
          {!check.ok && <Hint tone="muted">{check.error}</Hint>}
        </>,
        <>
          {logOn && <Toggle label="A log segment is lost" value={gap} onChange={setGap} off="No" on="Yes" />}
          {logOn && gap && <SeedField seed={gapSeed} onSeed={setGapSeed} label="Which segment (seed)" />}
        </>,
      ]}
    >
      <div className="bdr-stage stage-pad">
        <Box>
          <SectionTitle hint="seven days, UTC; drag the disaster with the slider">The week</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Backup timeline: scroll sideways to see all of it">
            <GanttLanes lanes={gantt.lanes} bars={gantt.bars} domain={gantt.domain} axis={axis} hideEmptyLanes size="md" labelWidth={96} ariaLabel="Backups, log archive, disaster and recovery over one week" />
          </WideRegion>
          <Hint tone="muted" block>Restore = the latest backup before the target, then replay the log up to it. Without a log archive the nearest point is the last backup. Every incremental is 20 GB in this toy, however long since the last backup, and the restore applies the whole chain, so more frequent backups lengthen a restore.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={HISTORY_SEED}>a toy database of 8 keys with a seeded week of writes, and a drop at Thursday 14:07</Provenance>
          <Provenance kind="illustrative">all sizes, throughputs and times are made-up round numbers: a 400 GB full, 20 GB incrementals, 2 GB of log an hour</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
