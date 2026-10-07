import { useMemo, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { scheduleFrames, type MeetingStatus } from './frames';
import { bruteForceBest, DAY, greedySchedule, RULE_LABEL, scanOrder, span, type Meeting, type Rule } from './model';

const STEP_MS = 1000;
/** Below this the hour bars get too thin to read: the timeline scrolls sideways instead. */
const TIMELINE_MIN_W = 560;
const BOOKED = 'booked';
const BEST = 'best';

const RULES: { value: Rule; label: string }[] = [
  { value: 'start', label: 'Earliest start' },
  { value: 'shortest', label: 'Shortest first' },
  { value: 'finish', label: 'Earliest finish' },
];

const STATUS_TONE: Record<MeetingStatus, Tone> = { pending: 'muted', now: 'hi', booked: 'ok', rejected: 'dim' };
const STATUS_CELL: Record<MeetingStatus, ArrayCellState> = { pending: 'idle', now: 'active', booked: 'done', rejected: 'dim' };

export function MeetingsScene({ picker, presets, meetings: ms, rule, onRule }: {
  picker: ReactNode;
  presets: ReactNode;
  meetings: Meeting[];
  rule: Rule;
  onRule: (r: Rule) => void;
}) {
  const frames = useMemo(() => scheduleFrames(ms, rule), [ms, rule]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const best = useMemo(() => bruteForceBest(ms, greedySchedule(ms, rule).booked), [ms, rule]);
  const order = useMemo(() => scanOrder(ms, rule), [ms, rule]);
  const inBest = new Set(best.best.map((m) => m.id));
  const wrong = (id: string) => f.done && !inBest.has(id);

  const bars: GanttBar[] = [
    ...ms.map((m) => ({ id: m.id, lane: m.id, start: m.start, end: m.end, tone: STATUS_TONE[f.status[m.id]], label: m.id, ring: wrong(m.id) && f.status[m.id] === 'booked' ? ('bad' as const) : undefined })),
    ...ms.filter((m) => f.booked.includes(m.id)).map((m) => ({ id: `${BOOKED}-${m.id}`, lane: BOOKED, start: m.start, end: m.end, tone: 'ok' as const, label: m.id, ring: wrong(m.id) ? ('bad' as const) : undefined })),
    ...best.best.map((m) => ({ id: `${BEST}-${m.id}`, lane: BEST, start: m.start, end: m.end, tone: 'violet' as const, label: m.id })),
  ];
  const lanes = [
    ...ms.map((m) => ({ id: m.id, label: `${m.id}  ${span(m)}` })),
    { id: BOOKED, label: 'booked' },
    { id: BEST, label: 'best possible' },
  ];

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Greedy booked" value={<AnimatedValue value={f.booked.length} />} color="var(--ok)" sub={RULE_LABEL[rule]} />
          <Stat label="Best possible" value={best.size} color="var(--violet)" sub={`brute force, ${best.tried.toLocaleString('en-US')} subsets`} />
          <Stat label="Looked at" value={`${f.seen}/${ms.length}`} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'not looked at yet' },
            { color: 'var(--hi)', label: 'looking at now' },
            { color: 'var(--ok)', label: 'booked' },
            { color: 'var(--dim)', label: 'rejected: overlaps' },
            { color: 'var(--violet)', label: 'a best schedule' },
            { color: 'var(--bad)', label: 'outline: a pick the best one avoids', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Greedy rule" value={rule} onChange={onRule} options={RULES} />
        </>,
        presets,
      ]}
    >
      <div className="gr stage-pad">
        <div className="gr-order">
          <span className="gr-order-label">Scan order ({RULE_LABEL[rule]})</span>
          <ArrayStrip values={order.map((m) => m.id)} cellMax={40} cellState={(i) => STATUS_CELL[f.status[order[i].id]]} cellTitle={(i) => `${order[i].id}: ${span(order[i])}`} />
        </div>
        <WideRegion minWidth={TIMELINE_MIN_W} label="Meeting timeline: scroll sideways to see all of it">
          <GanttLanes lanes={lanes} bars={bars} domain={DAY} axis size="md" labelWidth={96} unit=":00" className="gr-gantt" ariaLabel={`Meetings from ${DAY[0]}:00 to ${DAY[1]}:00`} />
        </WideRegion>
        <Hint block>
          Nothing simulated: computed live. The "best possible" count comes from trying every subset (fine for 12 meetings, hopeless for 1,000).
          Meetings that only touch, one ending at 10 and the next starting at 10, don't overlap.
        </Hint>
      </div>
    </StageFrame>
  );
}
