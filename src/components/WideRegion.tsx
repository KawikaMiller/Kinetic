import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

/** How long the "swipe" hint stays up if the learner doesn't scroll first. */
const SWIPE_HINT_MS = 5000;

/** Room reserved inside the scroller, in px, for content that hangs outside its box. */
export interface Gutter {
  top?: number;
  bottom?: number;
  x?: number;
}

/**
 * Content that keeps `minWidth` and scrolls sideways inside itself when the screen is
 * narrower, with edge fades, keyboard focus and a one-time "swipe" hint. Wide screens see
 * no difference. StageFrame's `minWidth` wraps the whole stage in one; a lesson can also
 * wrap just its wide part (a pipeline diagram) so the rest of the stage reflows instead.
 *
 * A sideways scroller always clips vertically too (CSS forces overflow-y off `visible`
 * once overflow-x scrolls), so anything drawn above or below the children (ArrayStrip
 * range labels, pointers) is cut off unless `gutter` reserves room for it.
 */
export function WideRegion({
  children, minWidth, gutter, className = '', style, label = 'Diagram: scroll sideways to see all of it',
}: {
  children: ReactNode;
  minWidth: number;
  gutter?: Gutter;
  /** Extra classes on the scroller, e.g. `stage` when this is the stage itself. */
  className?: string;
  style?: CSSProperties;
  /** Accessible name while it overflows. */
  label?: string;
}) {
  const padding = gutter
    ? { paddingTop: gutter.top, paddingBottom: gutter.bottom, paddingLeft: gutter.x, paddingRight: gutter.x }
    : undefined;
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
        className={`${className} stage-wide${edges}`}
        style={{ ...padding, ...style }}
        onScroll={() => setHintDismissed(true)}
        tabIndex={overflows ? 0 : undefined}
        aria-label={overflows ? label : undefined}
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
