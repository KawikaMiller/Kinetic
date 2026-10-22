import type { ReactNode } from 'react';
import type { Projected } from '../../core/raster3d';
import { EDGES, VIEW_H, VIEW_W, edgeStateOf } from './model';

/** The cube as lines on the 200 by 150 picture. Edges with a corner behind the camera cannot be drawn; `mark` rings one corner. */
export function Wireframe({ projected, mark, ariaLabel, children }: { projected: readonly Projected[]; mark?: number | null; ariaLabel: string; children?: ReactNode }) {
  const marked = mark != null ? projected[mark]?.screen : null;
  return (
    <svg className="td-view" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel}>
      {EDGES.map(([a, b]) => {
        const state = edgeStateOf(projected[a], projected[b]);
        const pa = projected[a].screen;
        const pb = projected[b].screen;
        if (state === 'hidden' || !pa || !pb) return null;
        return <line key={`${a}-${b}`} className={`td-edge is-${state}`} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} />;
      })}
      {marked && (
        <>
          <circle className="td-mark" cx={marked[0]} cy={marked[1]} r={6} />
          <circle className="td-mark-dot" cx={marked[0]} cy={marked[1]} r={2.2} />
        </>
      )}
      {children}
    </svg>
  );
}
