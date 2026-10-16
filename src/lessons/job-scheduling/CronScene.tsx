import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { schedFrames, schedSummary } from './captions';
import { initialSched } from './init';
import {
  CAL_START, DAY_HOURS, FAULTS, FAULT_LABEL, HOUR_MS, MIN_MS, NET_RANGE, PAUSE_RANGE, PINNED_SCHED_SEED, SCHED_LABEL, SCHED_MODES, SKEW_RANGE, runSched, schedStatsAt, schedSweep, type SchedSetup,
} from './sched';
import { SCHED_LANES, schedBars, schedLog } from './view';

const MODE_OPTIONS = SCHED_MODES.map((m) => ({ value: m, label: SCHED_LABEL[m] }));
const FAULT_OPTIONS = FAULTS.map((f) => ({ value: f, label: FAULT_LABEL[f] }));
const PLAY_MS = 120;
const GANTT_MIN_WIDTH = 560;
const minutes = (ms: number) => `${ms / MIN_MS} min`;
const signedMinutes = (ms: number) => `${ms > 0 ? '+' : ''}${ms / MIN_MS} min`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

export function CronScene({ picker }: { picker: ReactNode }) {
  const [setup, setSetup] = useState(initialSched);
  const patch = (p: Partial<SchedSetup>) => setSetup((s) => ({ ...s, ...p }));
  const run = useMemo(() => runSched(setup), [setup]);
  const frames = useMemo(() => schedFrames(run, schedSummary(run)), [run]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const stats = schedStatsAt(run, now);
  const bars = useMemo(() => schedBars(run), [run]);
  const rows = useMemo(() => schedLog(run, now), [run, now]);
  const pinned = PINNED_SCHED_SEED[setup.mode];

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Runs that took effect" value={stats.applied} sub={`by ${String(Math.floor(now / HOUR_MS)).padStart(2, '0')}:00`} />
          <Stat label="Fires run more than once" value={stats.repeatedFires} color={stats.repeatedFires > 0 ? 'var(--bad)' : undefined} sub={`${stats.extraRuns} extra ${stats.extraRuns === 1 ? 'run' : 'runs'} in all`} />
          <Stat label="Attempts turned away" value={stats.turnedAway} color={stats.turnedAway > 0 ? 'var(--violet)' : undefined} sub="by the unique key or a stale token" />
          <Stat label="Fires missed" value={stats.missed} color={stats.missed > 0 ? 'var(--bad)' : undefined} sub="nobody ran them" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a fire that ran once (or a late run rejected by its token)' },
            { color: 'var(--bad)', label: 'a fire that ran again, or a missed fire (hatched)' },
            { color: 'var(--info)', label: 'the lease holder (the leader)' },
            { color: 'var(--orange)', label: 'a paused replica (hatched)' },
            { color: 'var(--violet)', label: 'an attempt turned away by the dedupe key' },
            { color: 'var(--dim)', label: 'a killed replica (dashed)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Who fires" value={setup.mode} onChange={(mode) => patch({ mode })} options={MODE_OPTIONS} />
        </>,
        <>
          <Segmented label="Fault" value={setup.fault} onChange={(fault) => patch({ fault })} options={FAULT_OPTIONS} />
          {setup.fault === 'pause' && <Slider label="Pause of r1" value={setup.pauseMs} min={PAUSE_RANGE.min} max={PAUSE_RANGE.max} step={PAUSE_RANGE.step} format={minutes} onChange={(pauseMs) => patch({ pauseMs })} />}
          <Slider label="r1's clock" value={setup.skewMs} min={SKEW_RANGE.min} max={SKEW_RANGE.max} step={SKEW_RANGE.step} format={signedMinutes} onChange={(skewMs) => patch({ skewMs })} />
          <Slider label="Messages lost" value={setup.loss} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(loss) => patch({ loss })} />
          <Slider label="Messages duplicated" value={setup.duplicate} min={NET_RANGE.min} max={NET_RANGE.max} step={NET_RANGE.step} format={percent} onChange={(duplicate) => patch({ duplicate })} />
        </>,
        <>
          <SeedField seed={setup.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" disabled={pinned === null} onClick={() => pinned !== null && setSetup(schedSweep(pinned, setup.mode))}>
            {pinned === null ? 'No failing seed' : `Load the lowest failing seed (${pinned})`}
          </ChipButton>
          <Button onClick={() => setSetup(initialSched())}>Reset</Button>
          <Hint tone="muted">
            {pinned === null ? 'None of the 200 seeded schedules runs a fire twice in this mode (kills, pauses and lost messages).' : `Seed ${pinned} is the lowest of 200 seeded schedules that runs a fire twice in this mode.`}
          </Hint>
        </>,
      ]}
    >
      <div className="js-stage stage-pad">
        <Box>
          <SectionTitle hint="UTC, one day; one cron minute is one simulated second">The day of fires, per replica</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="A day of fires on a calendar: scroll sideways to see all of it">
            <GanttLanes
              lanes={SCHED_LANES}
              bars={barsAt(bars, now / HOUR_MS)}
              domain={[0, DAY_HOURS]}
              now={now / HOUR_MS}
              axis={{ calendar: { start: CAL_START, unit: 'hour' } }}
              hideEmptyLanes
              size="md"
              labelWidth={92}
              labelMinPx={40}
              ariaLabel="A day of cron fires: which replica ran each, who led, and what was missed"
            />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle>What the database recorded</SectionTitle>
          <LogStream label="Runs the database recorded" rows={rows} maxHeight={150} live="off" empty="Nothing has run yet." />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>three scheduler replicas, a lease service and a database on the distSim harness</Provenance>
          <Provenance kind="illustrative">time is scaled (one cron minute is one simulated second) and the 3-minute lease is made up; one box stands in for a replicated lease service and for a table with a unique key; UTC throughout</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
