import { motion } from 'motion/react';
import type { Pt } from '../../core/geometry';

/** A dot that travels along a path at constant speed, once or on a loop (steady traffic). */
export function TravelDot({
  path, color, r = 5, duration, delay = 0, repeat = false, className,
}: {
  path: readonly Pt[];
  color: string;
  r?: number;
  duration: number;
  delay?: number;
  repeat?: boolean;
  className?: string;
}) {
  return (
    <motion.circle
      r={r}
      fill={color}
      className={className}
      initial={{ cx: path[0].x, cy: path[0].y }}
      animate={{ cx: path.map((p) => p.x), cy: path.map((p) => p.y) }}
      transition={{ duration, delay, ease: 'linear', repeat: repeat ? Infinity : 0 }}
    />
  );
}
