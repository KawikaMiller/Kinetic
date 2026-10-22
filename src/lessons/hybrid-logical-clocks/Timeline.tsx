import { useMemo } from 'react';
import { plainTone, toneVar } from '../../core/tone';
import { NODES, eventLabels, hlcText, type Execution, type Stamped } from './hlc';

export const TIMELINE_W = 560;
const H = 230;
const PAD_X = 52;
const LANE_Y = [48, 118, 188];
const DOT_R = 7;
const LABEL_DY = -13;
const STAMP_DY = 20;
const STAMP_STEP = 11;
const MIN_STAMP_GAP = 48;

/** One drawing of an execution on a true-time axis: lanes per node, messages as arrows, the HLC stamp under each event. */
export function Timeline({ exec, stamps, inverted }: { exec: Execution; stamps: readonly Stamped[]; inverted: ReadonlySet<number> }) {
  const labels = useMemo(() => eventLabels(stamps.map((s) => s.event)), [stamps]);
  const times = stamps.map((s) => s.event.t);
  const lo = Math.min(...times, 100) - 6;
  const hi = Math.max(...times, 140) + 6;
  const x = (t: number) => PAD_X + ((t - lo) / (hi - lo)) * (TIMELINE_W - PAD_X - 16);
  // A stamp that would sit on its neighbour's drops one line, so close events on one lane stay readable.
  const lastOnLane: ({ at: number; level: number } | undefined)[] = [undefined, undefined, undefined];
  const stampLevels = stamps.map((s) => {
    const prev = lastOnLane[s.event.node];
    const level = prev && x(s.event.t) - prev.at < MIN_STAMP_GAP ? 1 - prev.level : 0;
    lastOnLane[s.event.node] = { at: x(s.event.t), level };
    return level;
  });
  const byMessage = new Map<number, { send?: Stamped; receive?: Stamped }>();
  for (const s of stamps) {
    if (s.event.msg === null) continue;
    const entry = byMessage.get(s.event.msg) ?? {};
    if (s.event.kind === 'send') entry.send = s;
    else entry.receive = s;
    byMessage.set(s.event.msg, entry);
  }
  return (
    <svg className="hl-timeline" viewBox={`0 0 ${TIMELINE_W} ${H}`} width={TIMELINE_W} role="img" aria-label="The execution on a true-time axis, with the hybrid stamp under each event">
      <defs>
        <marker id="hl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--info)" />
        </marker>
      </defs>
      {NODES.map((n, i) => (
        <g key={n}>
          <line x1={PAD_X - 8} x2={TIMELINE_W - 8} y1={LANE_Y[i]} y2={LANE_Y[i]} stroke="var(--line-2)" strokeWidth={1.5} />
          <text x={8} y={LANE_Y[i] + 4} className="hl-lane" fill={toneVar(plainTone(i))}>{n}</text>
          <text x={8} y={LANE_Y[i] + 17} className="hl-offset">{exec.offsets[i] >= 0 ? '+' : '-'}{Math.abs(exec.offsets[i])} ms</text>
        </g>
      ))}
      {[...byMessage.values()].map((m, k) =>
        m.send && m.receive ? (
          <line key={k} x1={x(m.send.event.t)} y1={LANE_Y[m.send.event.node]} x2={x(m.receive.event.t)} y2={LANE_Y[m.receive.event.node]} stroke="var(--info)" strokeWidth={1.6} markerEnd="url(#hl-arrow)" />
        ) : null,
      )}
      {stamps.map((s, i) => {
        const cx = x(s.event.t);
        const cy = LANE_Y[s.event.node];
        const level = stampLevels[i];
        return (
          <g key={s.event.id}>
            <circle cx={cx} cy={cy} r={DOT_R} fill={toneVar(plainTone(s.event.node))} stroke={inverted.has(i) ? 'var(--bad)' : 'none'} strokeWidth={inverted.has(i) ? 2.5 : 0} />
            <text x={cx} y={cy + LABEL_DY} textAnchor="middle" className="hl-event">{labels[i]}</text>
            <text x={cx} y={cy + STAMP_DY + level * STAMP_STEP} textAnchor="middle" className="hl-stamp">{hlcText(s.hlc)}</text>
          </g>
        );
      })}
    </svg>
  );
}
