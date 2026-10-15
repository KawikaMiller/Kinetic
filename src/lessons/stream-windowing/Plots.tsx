/**
 * stream-windowing: the three timelines. Drawn in one 720-unit-wide coordinate space, so each sits in a WideRegion on a phone.
 */
import type { Tone } from '../../core/tone';
import { MINUTE, type Evt } from './events';
import { LABEL_W, PLOT_W, clockLabel, lanesFor, xScale } from './layout';
import { keyTone, type DotSpec, type DrawnWindow } from './plotModel';
import type { WindowSpec } from './windows';

const DOT_R = 3.5;
const AXIS_TOP = 14;
function MinuteGrid({ horizon, y0, y1 }: { horizon: number; y0: number; y1: number }) {
  const x = xScale(horizon).map;
  const marks = Array.from({ length: Math.floor(horizon / MINUTE) + 1 }, (_, i) => i * MINUTE);
  return (
    <g>
      {marks.map((m) => (
        <g key={m}>
          <line className="sw-minute" x1={x(m)} x2={x(m)} y1={y0} y2={y1} />
          <text className="sw-tick" x={x(m)} y={AXIS_TOP - 3} textAnchor="middle">{clockLabel(m)}</text>
        </g>
      ))}
    </g>
  );
}

const Dot = ({ cx, cy, tone, hollow }: { cx: number; cy: number; tone: Tone; hollow?: boolean }) => (
  <circle className={`sw-dot tone-${tone} ${hollow ? 'is-hollow' : ''}`} cx={cx} cy={cy} r={DOT_R} />
);

/** Scene 1: when each click happened (top) joined to when it arrived (bottom); a crossing line is disorder. */
export function DisorderPlot({ events, horizon }: { events: readonly Evt[]; horizon: number }) {
  const x = xScale(horizon).map;
  const [y0, y1] = [44, 124];
  const crossings = events.filter((e) => Math.floor(e.time / MINUTE) !== Math.floor(e.arrival / MINUTE)).length;
  return (
    <svg className="sw-plot" viewBox={`0 0 ${PLOT_W} ${y1 + 22}`} role="img" aria-label={`${events.length} clicks drawn by when they happened and when they arrived; ${crossings} cross a minute boundary on the way`}>
      <MinuteGrid horizon={horizon} y0={y0 - 10} y1={y1 + 10} />
      <line className="sw-axis" x1={LABEL_W} x2={PLOT_W - 14} y1={y0} y2={y0} />
      <line className="sw-axis" x1={LABEL_W} x2={PLOT_W - 14} y1={y1} y2={y1} />
      <text className="sw-lane" x={4} y={y0 + 3.5}>happened</text>
      <text className="sw-lane" x={4} y={y1 + 3.5}>arrived</text>
      {events.map((e) => (
        <line key={`l${e.id}`} className={`sw-link ${Math.floor(e.time / MINUTE) !== Math.floor(e.arrival / MINUTE) ? 'is-bad' : ''}`} x1={x(e.time)} y1={y0} x2={x(e.arrival)} y2={y1} />
      ))}
      {events.map((e) => (
        <g key={e.id}>
          <Dot cx={x(e.time)} cy={y0} tone={keyTone(e.key)} />
          <Dot cx={x(e.arrival)} cy={y1} tone={keyTone(e.key)} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Windows as bars in rows (overlapping ones never share a row), the events as dots on their key's row (session windows) or on a
 * bottom lane, and, when given, the watermark as a vertical line.
 */
export function WindowPlot({ spec, windows, dots, horizon, watermark, ariaLabel }: { spec: WindowSpec; windows: readonly DrawnWindow[]; dots: readonly DotSpec[]; horizon: number; watermark?: number; ariaLabel: string }) {
  const sx = xScale(horizon);
  const x = sx.map;
  const lanes = lanesFor(spec);
  const rowH = 26;
  const top = AXIS_TOP + 8;
  const bottom = top + lanes.labels.length * rowH;
  const eventLane = spec.kind !== 'session';
  const height = bottom + (eventLane ? 30 : 8);
  const clampX = (t: number) => Math.max(LABEL_W, Math.min(PLOT_W - 14, x(t)));
  const rowY = (row: number) => top + row * rowH;
  return (
    <svg className="sw-plot" viewBox={`0 0 ${PLOT_W} ${height}`} role="img" aria-label={ariaLabel}>
      <MinuteGrid horizon={horizon} y0={top - 4} y1={height - 4} />
      {lanes.labels.map((label, i) => (
        <text key={label} className="sw-lane" x={4} y={rowY(i) + rowH / 2 + 3}>{label}</text>
      ))}
      {windows.map((w) => {
        const row = lanes.rowOf(w);
        const x0 = clampX(w.start);
        const x1 = clampX(w.end);
        return (
          <g key={`${w.key}:${w.start}:${w.end}`} className={`sw-window tone-${w.tone} ${w.fired ? 'is-fired' : ''} ${w.late ? 'is-late' : ''}`}>
            <rect x={x0} y={rowY(row) + 3} width={Math.max(2, x1 - x0)} height={rowH - 8} rx={4}>
              <title>{`${w.key === '*' ? '' : `${w.key} `}[${w.start}, ${w.end}): ${w.count}`}</title>
            </rect>
          </g>
        );
      })}
      {eventLane && <line className="sw-axis" x1={LABEL_W} x2={PLOT_W - 14} y1={bottom + 14} y2={bottom + 14} />}
      {eventLane && <text className="sw-lane" x={4} y={bottom + 17.5}>events</text>}
      {dots.map((d) => (
        <Dot key={d.event.id} cx={x(d.event.time)} cy={eventLane ? bottom + 14 : rowY(lanes.rowOf({ key: d.event.key, start: 0, end: 0 })) + rowH / 2} tone={d.tone} hollow={d.hollow} />
      ))}
      {windows.map((w) => {
        const x0 = clampX(w.start);
        const x1 = clampX(w.end);
        return x1 - x0 >= 20 ? (
          <text key={`t${w.key}:${w.start}:${w.end}`} className="sw-count" x={(x0 + x1) / 2} y={rowY(lanes.rowOf(w)) + rowH / 2 + 3} textAnchor="middle">{w.count}</text>
        ) : null;
      })}
      {watermark !== undefined && Number.isFinite(watermark) && (
        <g>
          <line className="sw-watermark" x1={x(watermark)} x2={x(watermark)} y1={top - 6} y2={height - 6} />
          <text className="sw-watermark-label" x={Math.min(x(watermark) + 4, PLOT_W - 96)} y={height - 2}>watermark {watermark}</text>
        </g>
      )}
    </svg>
  );
}
