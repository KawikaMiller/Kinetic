import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { useCaption } from '../core/caption';
import type { Player } from '../core/usePlayer';
import type { Frame } from '../core/types';
import { Transport } from './Transport';

/**
 * Standard lesson layout, top to bottom:
 *   stats/legend row → the visual → caption strip → transport → lesson controls
 * Every lesson should render its visual inside one of these so they all feel
 * like the same app.
 */
export function StageFrame<F extends Frame>({
  children, player, controls, legend, stats, height = 420, style,
}: {
  children: ReactNode;
  player?: Player<F>;
  controls?: ReactNode;
  legend?: ReactNode;
  stats?: ReactNode;
  /** Minimum height of the visual area in px. */
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <div className="stage-frame">
      {(stats || legend) && (
        <div className="stage-top">
          {stats}
          {legend}
        </div>
      )}
      <div className="stage" style={{ minHeight: height, ...style }}>
        {children}
      </div>
      <Caption />
      {player && <Transport player={player} />}
      {controls}
    </div>
  );
}

function Caption() {
  const { node, version } = useCaption();
  return (
    <div className="caption" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={version}
          className="caption-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.12 }}
        >
          {node ?? <span className="muted">Press play, or poke at the visual.</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
