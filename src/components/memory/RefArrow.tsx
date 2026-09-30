import { motion, useReducedMotion } from 'motion/react';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { toneVar } from '../../core/tone';
import { useArrowMarker } from '../ArrowMarker';
import { rectEdgeToward, type Rect } from './geometry';

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

/**
 * A reference: an arrow from a slot or field (`from`, e.g. `slotPort(at)`) to a
 * point or a box (`to`; a Rect ends on its border facing `from`, e.g. `heapRect(…)`).
 *
 * - `dangling` draws it dashed in --bad: it points at a popped frame or freed block.
 * - `bend` bows it sideways to keep two arrows to one box apart.
 * - It draws itself in when it appears and glides when its target moves, unless
 *   the viewer prefers reduced motion.
 */
export function RefArrow({
  from, to, tone = 'violet', dangling = false, bend = 0, className = '',
}: {
  from: Pt;
  to: Pt | Rect;
  tone?: Tone;
  dangling?: boolean;
  bend?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const color = toneVar(dangling ? 'bad' : tone);
  const arrow = useArrowMarker(color, { size: 6, refX: 9 });
  const end = isRect(to) ? rectEdgeToward(to, from) : to;
  const d = arrowPath(from, end, bend);

  return (
    <g className={`ref-arrow ${dangling ? 'is-dangling' : ''} ${className}`}>
      {arrow.def}
      <motion.path
        d={d}
        stroke={color}
        markerEnd={arrow.url}
        // `d` must be in `initial` too, or motion interpolates it from undefined.
        initial={reduce ? false : { pathLength: 0, d }}
        animate={{ d, pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: 'easeOut' }}
      />
    </g>
  );
}
