import type { Pt } from '../../core/graphLayout';
import { clauseVertex, literalVertex } from './model';

export const GRAPH_W = 560;
export const GRAPH_H = 300;
export const NODE_RADIUS = 19;
const LITERAL_ROW_Y = 46;
const PAIR_HALF_GAP = 34;
const TRIANGLE_TOP_Y = 168;
const TRIANGLE_BOTTOM_Y = 250;
const TRIANGLE_HALF_WIDTH = 32;

/** Fixed positions for a gadget graph: literal pairs in a row across the top, one clause triangle below each slot. */
export function gadgetPositions(n: number, m: number): Pt[] {
  const at: Pt[] = new Array<Pt>(2 * n + 3 * m);
  for (let i = 1; i <= n; i++) {
    const cx = (GRAPH_W * (i - 0.5)) / n;
    at[literalVertex(i)] = { x: cx - PAIR_HALF_GAP, y: LITERAL_ROW_Y };
    at[literalVertex(-i)] = { x: cx + PAIR_HALF_GAP, y: LITERAL_ROW_Y };
  }
  for (let j = 0; j < m; j++) {
    const cx = (GRAPH_W * (j + 0.5)) / m;
    at[clauseVertex(n, j, 0)] = { x: cx - TRIANGLE_HALF_WIDTH, y: TRIANGLE_BOTTOM_Y };
    at[clauseVertex(n, j, 1)] = { x: cx, y: TRIANGLE_TOP_Y };
    at[clauseVertex(n, j, 2)] = { x: cx + TRIANGLE_HALF_WIDTH, y: TRIANGLE_BOTTOM_Y };
  }
  return at;
}
