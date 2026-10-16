import { Plot2D, Points, Polygon, VLine } from '../../components/Plot2D';
import { WideRegion } from '../../components/WideRegion';
import type { Tone } from '../../core/tone';
import { NAMES } from './frames';
import type { Interval } from './intervals';
import { TIME_MAX } from './presets';

const LANE_PX = 30;
const PLOT_PAD_PX = 64;
const BAR_HALF = 0.3;
const MIN_HEIGHT = 150;
/** Wide enough that a one-hour bar is still a readable block; a phone scrolls sideways inside the stage. */
const TIMELINE_W = 680;

/**
 * Intervals as bars on a time axis, one lane each (or lanes given by `lanes`), with a draggable handle on each end and an optional
 * sweep line. `extra` is a row of output bars drawn in the last lane. Handles only exist when `onDrag` is given.
 */
export function Timeline({
  intervals, lanes, laneCount, tone, now, onDrag, extra, extraTone = 'ok', ariaLabel,
}: {
  intervals: readonly Interval[];
  /** Lane of each interval (default: its own position). */
  lanes?: readonly number[];
  laneCount?: number;
  tone: (i: number) => Tone;
  now?: number | null;
  onDrag?: (index: number, end: 'start' | 'end', time: number) => void;
  extra?: readonly Interval[];
  extraTone?: Tone;
  ariaLabel: string;
}) {
  const count = (laneCount ?? intervals.length) + (extra ? 1 : 0);
  const y = (lane: number) => count - lane;
  const bar = (x: Interval, lane: number): [number, number][] => [
    [x.start, y(lane) - BAR_HALF], [x.end, y(lane) - BAR_HALF], [x.end, y(lane) + BAR_HALF], [x.start, y(lane) + BAR_HALF],
  ];
  return (
    <WideRegion minWidth={TIMELINE_W} label="Timeline: scroll sideways to see all of it">
    <Plot2D
      width={TIMELINE_W}
      x={{ domain: [0, TIME_MAX], label: 'time (hours)', ticks: 6 }}
      y={{ domain: [0.4, count + 0.6], tickValues: [] }}
      height={Math.max(MIN_HEIGHT, count * LANE_PX + PLOT_PAD_PX)}
      grid={false}
      ariaLabel={ariaLabel}
    >
      {intervals.map((x, i) => <Polygon key={`b${i}`} points={bar(x, lanes ? lanes[i] : i)} tone={tone(i)} />)}
      {extra?.map((x, i) => <Polygon key={`e${i}`} points={bar(x, count - 1)} tone={extraTone} />)}
      {now !== null && now !== undefined && <VLine at={now} label={`sweep ${now}`} tone="hi" dashed={false} />}
      <Points
        data={intervals.flatMap((x, i) => [
          { x: x.start, y: y(lanes ? lanes[i] : i), tone: 'muted' as Tone, r: 4 },
          { x: x.end, y: y(lanes ? lanes[i] : i), tone: 'muted' as Tone, r: 4 },
        ])}
        labels={(k) => (k % 2 === 0 ? NAMES[k >> 1] : null)}
        onDrag={onDrag ? (k, [px]) => onDrag(k >> 1, k % 2 === 0 ? 'start' : 'end', px) : undefined}
        pointLabel={(k) => `${k % 2 === 0 ? 'Start' : 'End'} of ${NAMES[k >> 1]}`}
        roving
      />
    </Plot2D>
    </WideRegion>
  );
}
