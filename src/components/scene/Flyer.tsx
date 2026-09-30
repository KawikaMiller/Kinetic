import { motion } from 'motion/react';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { Pt } from '../../core/geometry';

type Fade = 'arrive' | 'lost' | 'in' | 'none';

const FADES: Record<Fade, number | number[]> = {
  /** Fade in, travel, fade out on arrival. */
  arrive: [0, 1, 1, 0],
  /** Visible, then vanish partway (the message was lost). */
  lost: [1, 1, 0],
  /** Fade in and stay. */
  in: 1,
  none: 1,
};

/**
 * An HTML element flying between two points given in % of its positioned parent:
 * messages in div-based scenes. Style the pill with `className` (the lesson's kind
 * classes); wrap in <AnimatePresence> so it animates out when removed.
 * `onArrive` fires exactly once, when the trip finishes (not on the exit animation).
 *
 * axis="both" (default) moves left+top and centres the element on the point.
 * axis="x" moves `left` only (a horizontal wire), with no vertical centring; pass
 * `center` to centre it horizontally, and `arc` to lift it on the way.
 */
export function Flyer({
  from, to, children, className = '', style, axis = 'both', center = axis === 'both', fade = 'arrive',
  startScale = 0.6, exitScale = 0.6, arc = 0, duration, delay = 0, opacityDuration, onArrive,
}: {
  from: Pt;
  to: Pt;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  axis?: 'both' | 'x';
  /** Translate by -50% so the element's centre sits on the point. */
  center?: boolean;
  /** A named fade, or explicit opacity keyframes. */
  fade?: Fade | number[];
  /** Scale to grow from; null = don't animate scale. */
  startScale?: number | null;
  /** Scale to shrink to on exit; null = fade out only. */
  exitScale?: number | null;
  /** Px of upward lift at the midpoint (an arcing throw). */
  arc?: number;
  /** Seconds. */
  duration: number;
  delay?: number;
  /** Seconds for the opacity change alone (e.g. a quick fade-in on a slow trip). */
  opacityDuration?: number;
  onArrive?: () => void;
}) {
  const arrived = useRef(false);
  const vertical = axis === 'both';
  const transition = {
    duration,
    delay,
    ease: 'easeInOut' as const,
    ...(opacityDuration !== undefined ? { opacity: { duration: opacityDuration } } : {}),
  };
  const arcOnSelf = arc && !vertical; // axis="x" is free to use y for the lift

  const initial = {
    left: `${from.x}%`,
    ...(vertical ? { top: `${from.y}%` } : {}),
    ...(arcOnSelf ? { y: 0 } : {}),
    opacity: 0,
    ...(startScale !== null ? { scale: startScale } : {}),
  };
  const animate = {
    left: `${to.x}%`,
    ...(vertical ? { top: `${to.y}%` } : {}),
    ...(arcOnSelf ? { y: [0, -arc, 0] } : {}),
    opacity: typeof fade === 'string' ? FADES[fade] : fade,
    ...(startScale !== null ? { scale: 1 } : {}),
  };
  const centring = center ? (vertical ? { x: '-50%', y: '-50%' } : { x: '-50%' }) : {};

  return (
    <motion.span
      className={`flyer ${className}`}
      style={{ ...centring, ...style }}
      initial={initial}
      animate={animate}
      exit={{ opacity: 0, ...(exitScale !== null ? { scale: exitScale } : {}) }}
      transition={transition}
      onAnimationComplete={(def) => {
        // Exit animations complete too: only the trip (which animates `left`) counts, once.
        const isTrip = typeof def === 'object' && def !== null && 'left' in def;
        if (arrived.current || !isTrip) return;
        arrived.current = true;
        onArrive?.();
      }}
    >
      {arc && vertical ? (
        <motion.span className="flyer-arc" animate={{ y: [0, -arc, 0] }} transition={transition}>
          {children}
        </motion.span>
      ) : (
        children
      )}
    </motion.span>
  );
}
