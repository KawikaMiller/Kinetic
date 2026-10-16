import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { useCaption, useIntroCaption, type IntroKey } from '../core/caption';
import type { Player } from '../core/usePlayer';
import type { Frame } from '../core/types';
import { Transport } from './Transport';
import { Controls } from './ui';
import { WideRegion } from './WideRegion';

/**
 * Standard lesson layout, top to bottom:
 *   stats/legend row → the visual → caption strip → transport → lesson controls
 * Every lesson should render its visual inside one of these so they all feel
 * like the same app.
 */
export function StageFrame<F extends Frame>({
  children, player, controls, legend, stats, height = 420, minWidth, style, intro, introKey,
}: {
  children: ReactNode;
  player?: Player<F>;
  /** One <Controls> row, or an array of row contents: each is wrapped in <Controls> and stacked. */
  controls?: ReactNode | ReactNode[];
  legend?: ReactNode;
  stats?: ReactNode;
  /** Minimum height of the visual area in px. */
  height?: number;
  /**
   * Narrowest width (px) at which the visual stays readable. On a narrower screen the
   * stage scrolls sideways inside itself instead of shrinking the drawing, with edge
   * fades and a one-time "swipe" hint. Wide screens are unaffected.
   */
  minWidth?: number;
  style?: CSSProperties;
  /**
   * The caption a player-less stage opens with: set when the stage mounts (a scene switch no longer
   * leaves the previous scene's caption behind) and again whenever `introKey` changes. Leave `introKey`
   * out for a fixed sentence; pass the values a computed sentence depends on otherwise. Ignored when
   * there is a `player`: its frames own the caption.
   */
  intro?: ReactNode;
  introKey?: IntroKey;
}) {
  const stageStyle = { minHeight: height, ...style };
  return (
    <div className="stage-frame">
      {(stats || legend) && (
        <div className="stage-top">
          {stats}
          {legend}
        </div>
      )}
      {minWidth ? (
        <WideRegion className="stage" style={stageStyle} minWidth={minWidth}>
          {children}
        </WideRegion>
      ) : (
        <div className="stage" style={stageStyle}>
          {children}
        </div>
      )}
      {!player && intro != null && <IntroCaption node={intro} deps={introKey} />}
      <Caption />
      {player && <Transport player={player} />}
      {Array.isArray(controls) ? (
        <div className="controls-stack">
          {controls.map((row, i) => (
            <Controls key={i}>{row}</Controls>
          ))}
        </div>
      ) : (
        controls
      )}
    </div>
  );
}

/** Sets the intro caption from inside the frame, so only a player-less stage that asked for one does. */
function IntroCaption({ node, deps }: { node: ReactNode; deps?: IntroKey }) {
  useIntroCaption(node, deps);
  return null;
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
