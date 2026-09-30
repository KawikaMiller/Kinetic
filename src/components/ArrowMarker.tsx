import { useId, type ReactElement } from 'react';

/**
 * An SVG arrowhead marker with a per-instance id, so two copies of a lesson (or two
 * lessons) on one page never share a marker. Render `def` inside the <svg>, then use
 * `url` as the path's markerEnd:
 *
 *   const arrow = useArrowMarker('var(--violet)');
 *   <svg>{arrow.def}<path d={...} markerEnd={arrow.url} /></svg>
 */
export function useArrowMarker(color: string, size = 7): { id: string; url: string; def: ReactElement } {
  const id = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const def = (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={size} markerHeight={size} orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill={color} />
      </marker>
    </defs>
  );
  return { id, url: `url(#${id})`, def };
}
