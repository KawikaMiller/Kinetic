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
/** arrive="absorb": fade in, travel, then fade and shrink into the target (as fractions of the trip). */
const ABSORB_TIMES = [0, 0.1, 0.75, 1];
const ABSORB_END_SCALE = 0.5;
const BOUNCE_SCALE = 1.18;
const QUICK_FADE_S = 0.15;

const ones = (n: number) => Array.from({ length: n }, () => 1);

/**
 * A labelled message pill flying along `path` (from → [via…] → to) in an SVG scene.
 * Mount it with a new `key` per message so each one animates from the start.
 *
 * - arrive="fade": travel, pause, fade out (so the target stays readable).
 *   keyframes="even" instead spaces every hop evenly and fades out on the last one.
 * - arrive="stay": travel and stay at the destination.
 * - arrive="absorb": travel, then dissolve into the target (a port, a slot).
 * - arrive="bounce": hop up by `lift` above the destination and pulse (being rewritten in place).
 * - stopAt: stop that fraction (0..1) of the way along the last leg (failed/denied).
 */
export function Packet({
  path, label, color, arrive = 'fade', keyframes = 'timed', duration = 1.3, delay, timing = DEFAULT_TIMING,
  stopAt, height = 24, charW = 6.5, pad = 20, variant = 'solid', trail = false, scaleIn = 0.6,
  fadeIn = QUICK_FADE_S, lift = 34, classes,
}: {
  path: readonly Pt[];
  label: string;
  color: string;
  arrive?: 'fade' | 'stay' | 'absorb' | 'bounce';
  /** For arrive="fade": 'timed' uses `timing`; 'even' spaces all hops evenly. */
  keyframes?: 'timed' | 'even';
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
  /** Scale the pill grows from; null = no scale animation. */
  scaleIn?: number | null;
  /** For arrive="stay": fade-in seconds, over the whole trip ('full'), or over the first hop ('first-hop'). */
  fadeIn?: number | 'full' | 'first-hop';
  /** For arrive="bounce": px above the destination. */
  lift?: number;
  /** Replace the default `scene-packet` / `scene-packet-text` classes (lesson-styled pills). */
  classes?: { pill?: string; text?: string };
}) {
  const n = path.length;
  const pts = stopAt === undefined ? path : [...path.slice(0, -1), pointAlong(path[n - 2], path[n - 1], stopAt)];
  const start = pts[0];
  const end = pts[pts.length - 1];
  const w = pillWidth(label, charW, pad);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const scaled = scaleIn !== null;
  const base = { duration, delay, ease: 'easeInOut' as const };

  let motionProps;
  if (arrive === 'fade' && keyframes === 'even') {
    motionProps = {
      animate: {
        x: [...xs, end.x],
        y: [...ys, end.y],
        opacity: [0, ...ones(xs.length - 1), 0],
        ...(scaled ? { scale: [scaleIn, ...ones(xs.length)] } : {}),
      },
      transition: base,
    };
  } else if (arrive === 'fade') {
    motionProps = {
      animate: { x: [...xs, end.x], y: [...ys, end.y], opacity: [0, 1, 1, 0], ...(scaled ? { scale: [scaleIn, 1, 1, 0.4] } : {}) },
      transition: {
        ...base,
        // one time per travel keyframe, then the hold and the fade
        times: [...xs.map((_, i) => (i / (xs.length - 1)) * timing.travelEnd), timing.fadeStart, 1],
        opacity: { times: [0, timing.fadeInEnd, timing.fadeStart, 1], duration, delay },
      },
    };
  } else if (arrive === 'absorb') {
    motionProps = {
      animate: { x: end.x, y: end.y, opacity: [0, 1, 1, 0], scale: [scaleIn ?? 1, 1, 1, ABSORB_END_SCALE] },
      transition: { ...base, opacity: { duration, times: ABSORB_TIMES }, scale: { duration, times: ABSORB_TIMES } },
    };
  } else if (arrive === 'bounce') {
    motionProps = {
      animate: { x: end.x, y: end.y - lift, opacity: 1, scale: [1, BOUNCE_SCALE, 1] },
      transition: { ...base, opacity: { duration: QUICK_FADE_S } },
    };
  } else {
    const multi = n > 2;
    motionProps = {
      animate: {
        x: multi ? xs : end.x,
        y: multi ? ys : end.y,
        opacity: fadeIn === 'first-hop' && multi ? [0, ...ones(xs.length - 1)] : 1,
        ...(scaled ? { scale: 1 } : {}),
      },
      transition: { ...base, ...(typeof fadeIn === 'number' ? { opacity: { duration: fadeIn } } : {}) },
    };
  }

  const outline = variant === 'outline';
  const pillClass = classes?.pill ?? `scene-packet ${outline ? 'is-outline' : ''}`;
  const textClass = classes?.text ?? 'scene-packet-text';
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
      <motion.g initial={{ x: start.x, y: start.y, opacity: 0, ...(scaled ? { scale: scaleIn } : {}) }} {...motionProps}>
        <rect
          x={-w / 2}
          y={-height / 2}
          width={w}
          height={height}
          rx={height / 2}
          fill={outline ? undefined : color}
          style={outline ? { stroke: color } : undefined}
          className={pillClass}
        />
        <text x={0} y={4} textAnchor="middle" className={textClass} style={outline ? { fill: color } : undefined}>
          {label}
        </text>
      </motion.g>
    </>
  );
}
