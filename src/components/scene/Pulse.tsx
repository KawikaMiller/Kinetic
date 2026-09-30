import { motion } from 'motion/react';
import type { Pt } from '../../core/geometry';

/** An expanding, fading ring: "this node is working". Repeats forever by default. */
export function Pulse({
  at, from, to, color = 'var(--info)', duration = 1.1, opacity = 0.8, strokeWidth = 2, repeat = Infinity,
}: {
  at: Pt;
  from: number;
  to: number;
  color?: string;
  duration?: number;
  opacity?: number;
  strokeWidth?: number;
  repeat?: number;
}) {
  return (
    <motion.circle
      cx={at.x}
      cy={at.y}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      initial={{ r: from, opacity }}
      animate={{ r: [from, to], opacity: [opacity, 0] }}
      transition={{ duration, repeat }}
    />
  );
}
