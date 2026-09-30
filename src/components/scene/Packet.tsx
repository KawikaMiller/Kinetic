import { motion } from 'motion/react';
import { pillWidth, pointAlong, type Pt } from '../../core/geometry';

/** Keyframe fractions for arrive="fade": travel until `travelEnd`, hold, fade out from `fadeStart`. */
export interface PacketTiming {
  travelEnd: number;
  fadeStart: number;
  /** When the pill has fully faded in. */
  fadeInEnd: number;
}

const DEFAULT_TIMING: PacketTiming = { travelEnd: 0.62, fadeStart: 0.8, fadeInEnd: 0.12 };

/**
 * A labelled message pill flying along `path` (from → [via…] → to) in an SVG scene.
 * Mount it with a new `key` per message so each one animates from the start.
 *
 * - arrive="fade": travel, pause, fade out (so the target stays readable).
 * - arrive="stay": travel and stay at the destination.
 * - stopAt: stop that fraction (0..1) of the way along the last leg (failed/denied).
 */
export function Packet({
  path, label, color, arrive = 'fade', duration = 1.3, delay, timing = DEFAULT_TIMING, stopAt,
  height = 24, charW = 6.5, pad = 20, variant = 'solid', trail = false,
}: {
  path: readonly Pt[];
  label: string;
  color: string;
  arrive?: 'fade' | 'stay';
  /** Seconds. */
  duration?: number;
  delay?: number;
  timing?: PacketTiming;
  stopAt?: number;
  height?: number;
  charW?: number;
  pad?: number;
  variant?: 'solid' | 'outline';
  /** Draw the route as a line that grows behind the pill (arrive="stay" scenes). */
  trail?: boolean;
}) {
  const n = path.length;
  const pts = stopAt === undefined ? path : [...path.slice(0, -1), pointAlong(path[n - 2], path[n - 1], stopAt)];
  const start = pts[0];
  const end = pts[pts.length - 1];
  const w = pillWidth(label, charW, pad);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  const motionProps =
    arrive === 'fade'
      ? {
          animate: { x: [...xs, end.x], y: [...ys, end.y], opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.4] },
          transition: {
            duration,
            delay,
            ease: 'easeInOut' as const,
            // one time per travel keyframe, then the hold and the fade
            times: [...xs.map((_, i) => (i / (xs.length - 1)) * timing.travelEnd), timing.fadeStart, 1],
            opacity: { times: [0, timing.fadeInEnd, timing.fadeStart, 1], duration, delay },
          },
        }
      : {
          animate: { x: n > 2 ? xs : end.x, y: n > 2 ? ys : end.y, opacity: 1, scale: 1 },
          transition: { duration, delay, ease: 'easeInOut' as const, opacity: { duration: 0.15 } },
        };

  const outline = variant === 'outline';
  return (
    <>
      {trail && (
        <motion.line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.8 }}
          animate={{ pathLength: 1, opacity: [0.8, 0.8, 0.25] }}
          transition={{ duration, delay, ease: 'easeInOut' }}
        />
      )}
      <motion.g initial={{ x: start.x, y: start.y, opacity: 0, scale: 0.6 }} {...motionProps}>
        <rect
          x={-w / 2}
          y={-height / 2}
          width={w}
          height={height}
          rx={height / 2}
          fill={outline ? undefined : color}
          stroke={outline ? color : undefined}
          className={`scene-packet ${outline ? 'is-outline' : ''}`}
        />
        <text x={0} y={4} textAnchor="middle" className="scene-packet-text" style={outline ? { fill: color } : undefined}>
          {label}
        </text>
      </motion.g>
    </>
  );
}
