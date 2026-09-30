import { useId, type ReactElement } from 'react';

/**
 * An SVG arrowhead marker with a per-instance id, so two copies of a lesson (or two
 * lessons) on one page never share a marker. Render `def` inside the <svg>, then use
 * `url` as the path's markerEnd:
 *
 *   const arrow = useArrowMarker('var(--violet)');
 *   <svg>{arrow.def}<path d={...} markerEnd={arrow.url} /></svg>
 *
 * `refX` (in the 10×10 marker box) sets how far the tip sits past the line's end:
 * 8 tucks it in slightly, 9-10 puts it right at the end.
 */
export function useArrowMarker(
  color: string,
  o: { size?: number; refX?: number } = {},
): { id: string; url: string; def: ReactElement } {
  const { size = 7, refX = 8 } = o;
  const id = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const def = (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX={refX} refY="5" markerWidth={size} markerHeight={size} orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={color} />
      </marker>
    </defs>
  );
  return { id, url: `url(#${id})`, def };
}
