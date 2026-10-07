import { motion, type Transition } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { clamp01 } from '../core/math';
import { toneVar, type Tone } from '../core/tone';

const DEFAULT_TRANSITION: Transition = { duration: 0.4, ease: 'easeOut' };

/** A labelled tick on a Bar, in the same units as its `value`. */
export interface BarMarker {
  at: number;
  /** Shown under the track (and as the tick's tooltip). */
  label?: string;
  tone: Tone;
}

/**
 * A horizontal meter: load factor, capacity used, progress.
 * `marker` draws a threshold tick in the same units as `value`; `markers` draws several
 * tone-coloured ticks with small labels under the track (T1, T2, a quota).
 */
export function Bar({
  value, max = 1, tone, color, track, height = 8, marker, markOpacity, markLabel, markers = [], label, trailing,
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
  markers?: readonly BarMarker[];
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
    <div className={`meter ${markers.some((m) => m.label) ? 'has-mark-labels' : ''} ${className}`} style={style}>
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
        {markers.map((m, i) => (
          <i key={i} className={`meter-mark tone-${m.tone}`} title={m.label} style={{ left: `${clamp01(m.at / max) * 100}%` }}>
            {m.label && <span className="meter-mark-label">{m.label}</span>}
          </i>
        ))}
      </div>
      {trailing}
    </div>
  );
}
