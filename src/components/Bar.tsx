import { motion, type Transition } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { clamp01 } from '../core/math';
import { toneVar, type Tone } from '../core/tone';
import { stackShares } from './barSegments';

const DEFAULT_TRANSITION: Transition = { duration: 0.4, ease: 'easeOut' };

/** A labelled tick on a Bar, in the same units as its `value`. */
export interface BarMarker {
  at: number;
  /** Shown under the track (and as the tick's tooltip). */
  label?: string;
  tone: Tone;
}

/** One part of a stacked Bar, in the same units as `max`. */
export interface BarSegment {
  value: number;
  tone?: Tone;
  /** Any CSS colour; overrides `tone`. */
  color?: string;
}

/**
 * A horizontal meter: load factor, capacity used, progress.
 * `marker` draws a threshold tick in the same units as `value`; `markers` draws several
 * tone-coloured ticks with small labels under the track (T1, T2, a quota).
 * `segments` stacks several fills end to end instead of one `value` (a frame budget: update,
 * then render); the stack is cut at `max` and drawn as square-edged parts inside the rounded track.
 * `ariaLabel` names the bar as one image for screen readers.
 */
export function Bar({
  value = 0, max = 1, tone, color, track, height = 8, marker, markOpacity, markLabel, markers = [], segments, label, trailing,
  animate = true, transition = DEFAULT_TRANSITION, ariaLabel, className = '',
}: {
  /** The fill, in units of `max`. Leave it out with `segments`. */
  value?: number;
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
  /** Stacked fills, left to right, instead of `value`. */
  segments?: readonly BarSegment[];
  label?: ReactNode;
  trailing?: ReactNode;
  /** Animate width changes with motion (default) or snap. */
  animate?: boolean;
  /** Motion transition for the fill; pass {} for motion's default tween. */
  transition?: Transition;
  /** Accessible name; makes the bar one `img`. */
  ariaLabel?: string;
  className?: string;
}) {
  const width = `${clamp01(value / max) * 100}%`;
  const style = {
    '--meter-h': `${height}px`,
    ...(track ? { '--meter-track': track } : {}),
    ...(color ? { '--c': color } : tone ? { '--c': toneVar(tone) } : {}),
  } as CSSProperties;
  return (
    <div
      className={`meter ${markers.some((m) => m.label) ? 'has-mark-labels' : ''} ${className}`}
      style={style}
      {...(ariaLabel && { role: 'img', 'aria-label': ariaLabel })}
    >
      {label}
      <div className={`meter-track${segments ? ' is-stacked' : ''}`}>
        {segments ? (
          <StackedFill segments={segments} max={max} animate={animate} transition={transition} />
        ) : animate ? (
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

function StackedFill({ segments, max, animate, transition }: { segments: readonly BarSegment[]; max: number; animate: boolean; transition: Transition }) {
  const shares = stackShares(segments.map((s) => s.value), max);
  return segments.map((s, i) => {
    const width = `${shares[i]}%`;
    const fill = { '--c': s.color ?? (s.tone ? toneVar(s.tone) : undefined) } as CSSProperties;
    return animate ? (
      <motion.i key={i} className="meter-seg" style={fill} initial={false} animate={{ width }} transition={transition} />
    ) : (
      <i key={i} className="meter-seg" style={{ ...fill, width }} />
    );
  });
}
