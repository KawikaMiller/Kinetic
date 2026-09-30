import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useCaption } from '../core/caption';
import type { Player } from '../core/usePlayer';
import type { Frame } from '../core/types';
import { Transport } from './Transport';
import { Controls } from './ui';

/**
 * Standard lesson layout, top to bottom:
 *   stats/legend row → the visual → caption strip → transport → lesson controls
 * Every lesson should render its visual inside one of these so they all feel
 * like the same app.
 */
export function StageFrame<F extends Frame>({
  children, player, controls, legend, stats, height = 420, minWidth, style,
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
        <WideStage style={stageStyle} minWidth={minWidth}>
          {children}
        </WideStage>
      ) : (
        <div className="stage" style={stageStyle}>
          {children}
        </div>
      )}
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

/** How long the "swipe" hint stays up if the learner doesn't scroll first. */
const SWIPE_HINT_MS = 5000;

/** A stage whose content keeps `minWidth` and scrolls sideways when the screen is narrower. */
function WideStage({ children, minWidth, style }: { children: ReactNode; minWidth: number; style: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const { overflows, atStart, atEnd } = useScrollEdges(ref);
  const [hintDismissed, setHintDismissed] = useState(false);
  useEffect(() => {
    if (!overflows) return;
    const t = setTimeout(() => setHintDismissed(true), SWIPE_HINT_MS);
    return () => clearTimeout(t);
  }, [overflows]);
  const edges = overflows ? `${atStart ? '' : ' more-left'}${atEnd ? '' : ' more-right'}` : '';
  return (
    <div className="stage-shell">
      <div
        ref={ref}
        className={`stage stage-wide${edges}`}
        style={style}
        onScroll={() => setHintDismissed(true)}
        tabIndex={overflows ? 0 : undefined}
        aria-label={overflows ? 'Diagram: scroll sideways to see all of it' : undefined}
      >
        <div className="stage-content" style={{ minWidth }}>
          {children}
        </div>
      </div>
      {overflows && !hintDismissed && (
        <span className="stage-swipe-hint" aria-hidden="true">
          ⇠ swipe to see the whole diagram ⇢
        </span>
      )}
    </div>
  );
}

/** Whether a scroll container overflows sideways, and whether it's scrolled to either end. */
function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ overflows: false, atStart: true, atEnd: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { overflows: max > 1, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 };
      setState((s) => (s.overflows === next.overflows && s.atStart === next.atStart && s.atEnd === next.atEnd ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [ref]);
  return state;
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
