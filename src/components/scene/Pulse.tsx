import { motion, useReducedMotion } from 'motion/react';
import type { Pt } from '../../core/geometry';

/**
 * A looping ring around a point, forever by default.
 * - mode="ripple": expands from `from` to `to` and fades out ("this node is working").
 * - mode="breathe": grows to `to` and back at a steady opacity ("this is a checkpoint").
 *
 * It's decoration rather than teaching motion, so with prefers-reduced-motion it
 * renders a still ring instead of looping.
 */
export function Pulse({
  at, from, to, color = 'var(--info)', duration = 1.1, opacity = 0.8, strokeWidth = 2, repeat = Infinity,
  mode = 'ripple', className,
}: {
  at: Pt;
  from: number;
  to: number;
  color?: string;
  duration?: number;
  opacity?: number;
  strokeWidth?: number;
  repeat?: number;
  mode?: 'ripple' | 'breathe';
  className?: string;
}) {
  const reduce = useReducedMotion();
  const common = { cx: at.x, cy: at.y, fill: 'none', stroke: color, strokeWidth, className };

  if (reduce) {
    // A ripple is only ever half-visible, so its still version sits midway and fainter.
    const still = mode === 'ripple' ? { r: (from + to) / 2, opacity: opacity / 2 } : { r: from, opacity };
    return <circle {...common} {...still} />;
  }
  const animate = mode === 'ripple' ? { r: [from, to], opacity: [opacity, 0] } : { r: [from, to, from] };
  return <motion.circle {...common} initial={{ r: from, opacity }} animate={animate} transition={{ duration, repeat }} />;
}
