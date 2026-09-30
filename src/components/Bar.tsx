import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { clamp01 } from '../core/math';
import { toneVar, type Tone } from '../core/tone';

/**
 * A horizontal meter: load factor, capacity used, progress.
 * `marker` draws a threshold tick in the same units as `value`.
 */
export function Bar({
  value, max = 1, tone, color, height = 8, marker, label, trailing, animate = true, className = '',
}: {
  value: number;
  max?: number;
  tone?: Tone;
  /** Any CSS colour; overrides `tone`. */
  color?: string;
  height?: number;
  marker?: number;
  label?: ReactNode;
  trailing?: ReactNode;
  /** Animate width changes with motion (default) or snap. */
  animate?: boolean;
  className?: string;
}) {
  const width = `${clamp01(value / max) * 100}%`;
  const style = {
    '--meter-h': `${height}px`,
    ...(color ? { '--c': color } : tone ? { '--c': toneVar(tone) } : {}),
  } as CSSProperties;
  return (
    <div className={`meter ${className}`} style={style}>
      {label}
      <div className="meter-track">
        {animate ? (
          <motion.i className="meter-fill" initial={false} animate={{ width }} transition={{ duration: 0.4, ease: 'easeOut' }} />
        ) : (
          <i className="meter-fill" style={{ width }} />
        )}
        {marker !== undefined && <i className="meter-mark" style={{ left: `${clamp01(marker / max) * 100}%` }} />}
      </div>
      {trailing}
    </div>
  );
}
