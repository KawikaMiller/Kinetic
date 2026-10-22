import { minWidthForText } from '../../core/scale';
import { WideRegion } from '../../components/WideRegion';
import { suspicionBars, type Detector } from './model';

const WIDTH = 640;
const HEIGHT = 112;
const PAD_X = 14;
const AXIS_FONT = 11;
const LANE_MIN_WIDTH = minWidthForText(WIDTH, AXIS_FONT);
const TICK_TOP = 40;
const TICK_BOTTOM = 62;
const BAR_TOP = 70;
const BAR_HEIGHT = 14;
const PAUSE_TOP = 18;
const PAUSE_HEIGHT = 14;
const AXIS_Y = 106;
const DECIDE_LABEL_Y = 30;

interface LaneProps {
  d: Detector;
  /** The window of true time drawn, ms. */
  from: number;
  to: number;
  /** A vertical rule with a label, e.g. the moment two runs part. */
  mark?: { at: number; label: string };
  /** The learner's chosen decision time, drawn as a second rule under the first label. */
  decide?: number;
  label: string;
}

/** Heartbeat arrivals (blue), M's suspicion bars (red for a live peer, green once P is really down) and P's pause or crash, on one time axis. */
export function Lane({ d, from, to, mark, decide, label }: LaneProps) {
  const x = (t: number) => PAD_X + ((t - from) / (to - from)) * (WIDTH - 2 * PAD_X);
  const inView = (t: number) => t >= from && t <= to;
  const bars = suspicionBars(d, to).filter((b) => b.to > from && b.from < to);
  const seconds: number[] = [];
  for (let t = Math.ceil(from / 1000) * 1000; t <= to; t += 1000) seconds.push(t);
  const { crashAt, pause } = d.setup;
  return (
    <WideRegion minWidth={LANE_MIN_WIDTH} label="Heartbeat timeline: scroll sideways to see all of it">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="fd-lane">
        <line x1={PAD_X} x2={WIDTH - PAD_X} y1={AXIS_Y - 10} y2={AXIS_Y - 10} className="fd-axis" />
        {seconds.map((t) => (
          <text key={t} x={x(t)} y={AXIS_Y + 2} textAnchor="middle" className="fd-axis-text">{`${t / 1000} s`}</text>
        ))}
        {pause && (
          <rect x={x(Math.max(from, pause.from))} y={PAUSE_TOP} width={Math.max(0, x(Math.min(to, pause.to)) - x(Math.max(from, pause.from)))} height={PAUSE_HEIGHT} className="fd-pause" />
        )}
        {d.monitor.arrivals.filter(inView).map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={TICK_TOP} y2={TICK_BOTTOM} className="fd-arrival" />
        ))}
        {bars.map((b) => (
          <rect key={b.from} x={x(Math.max(from, b.from))} y={BAR_TOP} width={Math.max(2, x(Math.min(to, b.to)) - x(Math.max(from, b.from)))} height={BAR_HEIGHT} className={b.falseAlarm ? 'fd-bar-false' : 'fd-bar-true'} />
        ))}
        {crashAt !== null && inView(crashAt) && (
          <g>
            <line x1={x(crashAt)} x2={x(crashAt)} y1={TICK_TOP - 8} y2={BAR_TOP + BAR_HEIGHT + 4} className="fd-crash" />
            <text x={x(crashAt) + 4} y={TICK_TOP - 12} className="fd-lane-text">P crashes</text>
          </g>
        )}
        {pause && pause.from >= from && pause.from <= to && (
          <text x={x(pause.from) + 4} y={PAUSE_TOP - 4} className="fd-lane-text">P paused</text>
        )}
        {mark && inView(mark.at) && (
          <g>
            <line x1={x(mark.at)} x2={x(mark.at)} y1={6} y2={AXIS_Y - 10} className="fd-mark" />
            <text x={x(mark.at) + 4} y={14} className="fd-lane-text">{mark.label}</text>
          </g>
        )}
        {decide !== undefined && inView(decide) && (
          <g>
            <line x1={x(decide)} x2={x(decide)} y1={6} y2={AXIS_Y - 10} className="fd-mark" strokeDasharray="3 3" />
            <text x={x(decide) + 4} y={DECIDE_LABEL_Y} className="fd-lane-text">decide</text>
          </g>
        )}
      </svg>
    </WideRegion>
  );
}
