/** Pure scroll maths behind WideRegion's `reveal` (kept apart so WideRegion.tsx exports only components). */

/** A stretch of a WideRegion's content to keep on screen, as fractions (0..1) of the content's width. */
export interface RevealSpan {
  from: number;
  to: number;
}

/** Room kept beside a revealed span, px, so it doesn't sit flush against the edge fade. */
export const REVEAL_MARGIN = 24;

/**
 * The scrollLeft that brings [left, right] (px from the scroller's scroll origin) into the
 * visible width, moving as little as possible, or null if it's already in view. A span wider
 * than the view lines its left edge up with the view's. The result stays in 0..max.
 */
export function revealScrollLeft(
  view: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  left: number,
  right: number,
  margin: number = REVEAL_MARGIN,
): number | null {
  const max = Math.max(0, view.scrollWidth - view.clientWidth);
  const lo = left - margin;
  const hi = right + margin;
  const viewEnd = view.scrollLeft + view.clientWidth;
  let next: number;
  if (hi - lo > view.clientWidth || lo < view.scrollLeft) next = lo;
  else if (hi > viewEnd) next = hi - view.clientWidth;
  else return null;
  const clamped = Math.min(max, Math.max(0, next));
  return Math.abs(clamped - view.scrollLeft) < 1 ? null : clamped;
}
