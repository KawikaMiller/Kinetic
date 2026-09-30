import { motion, type Transition } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { clamp01 } from '../core/math';
import { toneVar, type Tone } from '../core/tone';

const DEFAULT_TRANSITION: Transition = { duration: 0.4, ease: 'easeOut' };

/**
 * A horizontal meter: load factor, capacity used, progress.
 * `marker` draws a threshold tick in the same units as `value`.
 */
export function Bar({
  value, max = 1, tone, color, track, height = 8, marker, markOpacity, markLabel, label, trailing,
  animate = true, transition = DEFAULT_TRANSITION, className = '',
}: {
  value: number;
  max?: number;
  tone?: Tone;
  /** Any CSS colour for the fill; overrides `tone`. */
  color?: string;
  /** Track colour (default --line). */
  track?: string;
  height?: number;
  marker?: number;
  markOpacity?: number;
  /** Tooltip on the marker. */
  markLabel?: string;
  label?: ReactNode;
  trailing?: ReactNode;
  /** Animate width changes with motion (default) or snap. */
  animate?: boolean;
  /** Motion transition for the fill; pass {} for motion's default tween. */
  transition?: Transition;
  className?: string;
}) {
  const width = `${clamp01(value / max) * 100}%`;
  const style = {
    '--meter-h': `${height}px`,
    ...(track ? { '--meter-track': track } : {}),
    ...(color ? { '--c': color } : tone ? { '--c': toneVar(tone) } : {}),
  } as CSSProperties;
  return (
    <div className={`meter ${className}`} style={style}>
      {label}
      <div className="meter-track">
        {animate ? (
          <motion.i className="meter-fill" initial={false} animate={{ width }} transition={transition} />
        ) : (
          <i className="meter-fill" style={{ width }} />
        )}
        {marker !== undefined && (
          <i className="meter-mark" title={markLabel} style={{ left: `${clamp01(marker / max) * 100}%`, opacity: markOpacity }} />
        )}
      </div>
      {trailing}
    </div>
  );
}
