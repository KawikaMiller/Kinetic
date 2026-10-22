import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { revealScrollLeft, wideRegionWords, type RevealSpan } from './wideReveal';

export type { RevealSpan } from './wideReveal';

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
 *
 * `reveal` keeps a stretch of the content on screen while it overflows: when it changes,
 * the region scrolls sideways just enough to show it (a sliding window that would otherwise
 * run off a phone). It's given as fractions of the content's width, or of the first element
 * matching `within` (an ArrayStrip's `.array-cells`), so it's exact even while the thing it
 * points at is still gliding there. Smooth, or instant under prefers-reduced-motion.
 */
export function WideRegion({
  children, minWidth, gutter, className = '', style, noun, label = wideRegionWords(noun).label,
  hint = wideRegionWords(noun).hint, reveal,
}: {
  children: ReactNode;
  minWidth: number;
  gutter?: Gutter;
  /** Extra classes on the scroller, e.g. `stage` when this is the stage itself. */
  className?: string;
  style?: CSSProperties;
  /** What the content is called in the default label and hint: "table" gives "Table: scroll sideways..." and "swipe to see the whole table" (default "diagram"). */
  noun?: string;
  /** Accessible name while it overflows (default built from `noun`). */
  label?: string;
  /** The one-time hint's wording in full, when `noun` is not enough (default built from `noun`). */
  hint?: string;
  /** Scroll this stretch into view when it changes: `{ from, to }` in 0..1, `within` a selector to measure against. */
  reveal?: (RevealSpan & { within?: string }) | null;
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
  const { from, to: until, within } = reveal ?? {};
  useEffect(() => {
    const el = ref.current;
    if (!el || from === undefined || until === undefined || !overflows) return;
    const scope = (within && el.querySelector<HTMLElement>(within)) || el.firstElementChild;
    if (!scope) return;
    const box = scope.getBoundingClientRect();
    const origin = el.getBoundingClientRect().left - el.scrollLeft;
    const left = box.left - origin + from * box.width;
    const right = box.left - origin + until * box.width;
    const to = revealScrollLeft(el, left, right);
    if (to === null) return;
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: to, behavior: instant ? 'auto' : 'smooth' });
  }, [from, until, within, overflows]);
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
      {/* The hint gets its own row under the scroller so it never covers content. The row
          stays while the region overflows, so dismissing the hint doesn't shift the page. */}
      {overflows && (
        <div className="stage-swipe-row" aria-hidden="true">
          <span className={`stage-swipe-hint${hintDismissed ? ' is-dismissed' : ''}`}>⇠ {hint} ⇢</span>
        </div>
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
