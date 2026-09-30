import { motion, useReducedMotion } from 'motion/react';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { toneVar } from '../../core/tone';
import { useArrowMarker } from '../ArrowMarker';
import { rectCenter, rectEdgeToward, type Rect } from './geometry';

const isRect = (t: Pt | Rect): t is Rect => 'w' in t;

/** Quadratic path from a to b, bowed `bend` px to the left of the direction of travel. */
function arrowPath(a: Pt, b: Pt, bend: number): string {
  if (bend === 0) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = mx + (-(b.y - a.y) / len) * bend;
  const cy = my + ((b.x - a.x) / len) * bend;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

const center = (t: Pt | Rect): Pt => (isRect(t) ? rectCenter(t) : t);

/**
 * A reference: an arrow from a slot or field (`from`, e.g. `slotPort(at)`) to a
 * point or a box (`to`; a Rect ends on its border facing `from`, e.g. `heapRect(…)`).
 * `from` may be a box too: the arrow then leaves its border facing `to`, for links
 * between whole boxes (an environment to its parent).
 *
 * - `dangling` draws it dashed in --bad: it points at a popped frame or freed block.
 * - `dashed` + `thin` + `color` draw a structural link rather than a reference
 *   (e.g. a faint dashed "outer" link: `color="var(--faint)" dashed thin`).
 * - `bend` bows it sideways to keep two arrows to one box apart (see `fanBend`).
 * - It draws itself in when it appears and glides when its target moves, unless
 *   the viewer prefers reduced motion.
 */
export function RefArrow({
  from, to, tone = 'violet', color, dashed = false, thin = false, dangling = false, bend = 0, className = '',
}: {
  from: Pt | Rect;
  to: Pt | Rect;
  tone?: Tone;
  /** Any CSS colour, overriding `tone` (e.g. 'var(--faint)'). */
  color?: string;
  dashed?: boolean;
  thin?: boolean;
  dangling?: boolean;
  bend?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const stroke = dangling ? toneVar('bad') : (color ?? toneVar(tone));
  const arrow = useArrowMarker(stroke, { size: 6, refX: 9 });
  const start = isRect(from) ? rectEdgeToward(from, center(to)) : from;
  const end = isRect(to) ? rectEdgeToward(to, isRect(from) ? rectCenter(from) : from) : to;
  const d = arrowPath(start, end, bend);
  const broken = dashed || dangling;
  const classes = ['ref-arrow', dangling && 'is-dangling', dashed && 'is-dashed', thin && 'is-thin', className].filter(Boolean).join(' ');
  // motion draws `pathLength` by writing its own stroke-dasharray, which would erase the CSS
  // dashes, so a dashed arrow fades in instead of drawing itself in.
  const reveal = broken ? { opacity: 0 } : { pathLength: 0 };
  const shown = broken ? { opacity: 1 } : { pathLength: 1 };

  return (
    <g className={classes}>
      {arrow.def}
      <motion.path
        // Remount when it turns dashed (a pointer going dangling), dropping motion's inline dasharray.
        key={broken ? 'dashed' : 'solid'}
        d={d}
        stroke={stroke}
        markerEnd={arrow.url}
        // `d` must be in `initial` too, or motion interpolates it from undefined.
        initial={reduce ? false : { ...reveal, d }}
        animate={{ d, ...shown }}
        transition={{ duration: reduce ? 0 : 0.35, ease: 'easeOut' }}
      />
    </g>
  );
}
