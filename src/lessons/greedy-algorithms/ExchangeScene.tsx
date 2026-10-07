import { useMemo, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { exchangeFrames } from './frames';
import { DAY, exchange, isCompatible, type Meeting } from './model';

const STEP_MS = 1800;
const TIMELINE_MIN_W = 560;

export function ExchangeScene({ picker, presets, meetings: ms }: { picker: ReactNode; presets: ReactNode; meetings: Meeting[] }) {
  const frames = useMemo(() => exchangeFrames(ms), [ms]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const { greedy } = useMemo(() => exchange(ms), [ms]);

  const bars: GanttBar[] = [
    ...greedy.map((m) => ({ id: `g-${m.id}`, lane: 'greedy', start: m.start, end: m.end, tone: 'ok' as const, label: m.id })),
    ...f.schedule.map((m) => ({ id: `o-${m.id}`, lane: 'best', start: m.start, end: m.end, tone: m.id === f.swappedIn ? ('hi' as const) : ('violet' as const), label: m.id })),
    ...(f.swappedOut ? [{ id: `out-${f.swappedOut.id}`, lane: 'out', start: f.swappedOut.start, end: f.swappedOut.end, tone: 'dim' as const, kind: 'blocked' as const, label: f.swappedOut.id }] : []),
  ];

  return (
    <StageFrame
      player={player}
      height={220}
      stats={
        <Stats>
          <Stat label="Earliest finish" value={greedy.length} color="var(--ok)" sub="meetings" />
          <Stat label="Best schedule" value={f.schedule.length} color="var(--violet)" sub={isCompatible(f.schedule) ? 'no overlaps' : 'overlaps!'} />
          <Stat label="Swaps made" value={f.swaps} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: "greedy's schedule" },
            { color: 'var(--violet)', label: 'a best schedule' },
            { color: 'var(--hi)', label: 'just swapped in' },
            { color: 'var(--dim)', label: 'dashed: just swapped out', shape: 'line' },
          ]}
        />
      }
      controls={[picker, presets]}
    >
      <div className="gr stage-pad">
        <WideRegion minWidth={TIMELINE_MIN_W} label="Two schedules: scroll sideways to see all of it">
          <GanttLanes
            lanes={[
              { id: 'greedy', label: 'earliest finish' },
              { id: 'best', label: 'best schedule' },
              { id: 'out', label: 'swapped out' },
            ]}
            bars={bars}
            domain={DAY}
            axis
            size="md"
            labelWidth={110}
            unit=":00"
            className="gr-gantt"
            ariaLabel="Greedy's schedule above a best schedule being swapped into it"
          />
        </WideRegion>
        <Hint block>
          Nothing simulated: the swaps run on the meetings of the day picked below, and every schedule shown is checked for overlaps. The starting best
          schedule comes from scanning by latest start, which is also optimal.
        </Hint>
      </div>
    </StageFrame>
  );
}
