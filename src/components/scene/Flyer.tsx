import { motion } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import type { Pt } from '../../core/geometry';

type Fade = 'arrive' | 'lost' | 'none';

const FADES: Record<Fade, number | number[]> = {
  /** Fade in, travel, fade out on arrival. */
  arrive: [0, 1, 1, 0],
  /** Visible, then vanish partway (the message was lost). */
  lost: [1, 1, 0],
  none: 1,
};

/**
 * An HTML element flying between two points given in % of its positioned parent:
 * messages in div-based scenes. Style the pill with `className` (the lesson's kind
 * classes); wrap in <AnimatePresence> so it shrinks away when removed.
 * `onArrive` fires exactly once, when the trip finishes.
 */
export function Flyer({
  from, to, children, className = '', fade = 'arrive', arc = 0, duration, delay = 0, onArrive,
}: {
  from: Pt;
  to: Pt;
  children: ReactNode;
  className?: string;
  fade?: Fade;
  /** Px of upward lift at the midpoint (an arcing throw). */
  arc?: number;
  /** Seconds. */
  duration: number;
  delay?: number;
  onArrive?: () => void;
}) {
  const arrived = useRef(false);
  const transition = { duration, delay, ease: 'easeInOut' as const };
  return (
    <motion.span
      className={`flyer ${className}`}
      style={{ x: '-50%', y: '-50%' }}
      initial={{ left: `${from.x}%`, top: `${from.y}%`, opacity: 0, scale: 0.6 }}
      animate={{ left: `${to.x}%`, top: `${to.y}%`, opacity: FADES[fade], scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={transition}
      onAnimationComplete={(def) => {
        // Exit animations complete too: only the trip (which animates `left`) counts, once.
        const isTrip = typeof def === 'object' && def !== null && 'left' in def;
        if (arrived.current || !isTrip) return;
        arrived.current = true;
        onArrive?.();
      }}
    >
      {arc ? (
        <motion.span className="flyer-arc" animate={{ y: [0, -arc, 0] }} transition={transition}>
          {children}
        </motion.span>
      ) : (
        children
      )}
    </motion.span>
  );
}
