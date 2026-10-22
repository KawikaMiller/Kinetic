import { DEFAULT_CONSTRAINTS, DEFAULT_OBJECTIVE, TOL, constraintText, expression, round, solve, vertexText, type Constraint, type Vertex } from './lp2d';

/**
 * One simplex step, geometrically: stand on a vertex of the feasible polygon, look along each edge, and walk only along
 * an edge that improves the objective, as far as the nearest constraint allows (the ratio test). No tableau.
 */

const AXIS_CONSTRAINTS: readonly Constraint[] = [{ a: -1, b: 0, c: 0 }, { a: 0, b: -1, c: 0 }];

/** The vertices of the finite feasible polygon in counter-clockwise order, starting from the one nearest the origin. */
export function polygon(constraints: readonly Constraint[], cx: number, cy: number): Vertex[] {
  const vertices = solve(constraints, cx, cy).vertices;
  if (vertices.length === 0) return [];
  const centre = { x: vertices.reduce((s, v) => s + v.x, 0) / vertices.length, y: vertices.reduce((s, v) => s + v.y, 0) / vertices.length };
  const ordered = [...vertices].sort((p, q) => Math.atan2(p.y - centre.y, p.x - centre.x) - Math.atan2(q.y - centre.y, q.x - centre.x));
  const first = ordered.reduce((best, v, i) => (v.x * v.x + v.y * v.y < ordered[best].x ** 2 + ordered[best].y ** 2 - TOL ? i : best), 0);
  return [...ordered.slice(first), ...ordered.slice(0, first)];
}

export interface RatioRow {
  constraint: string;
  /** How far along the edge (in the edge's own length) the constraint is met. */
  at: number;
}

export interface EdgeInfo {
  to: Vertex;
  /** Unit direction of the edge. */
  direction: readonly [number, number];
  /** Objective at the far end minus objective here. */
  change: number;
  improves: boolean;
  ratio: RatioRow[];
  /** The nearest constraint: how far the walk goes. */
  step: number;
}

/** The two polygon edges that leave `from` (its neighbours in the polygon order). */
export function edgesAt(constraints: readonly Constraint[], cx: number, cy: number, from: Vertex): EdgeInfo[] {
  const poly = polygon(constraints, cx, cy);
  const i = poly.findIndex((v) => Math.abs(v.x - from.x) < TOL && Math.abs(v.y - from.y) < TOL);
  if (i < 0 || poly.length < 2) return [];
  const neighbours = poly.length === 2 ? [poly[(i + 1) % 2]] : [poly[(i + 1) % poly.length], poly[(i + poly.length - 1) % poly.length]];
  const all = [...constraints, ...AXIS_CONSTRAINTS];
  return neighbours.map((to) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const direction: [number, number] = [(to.x - from.x) / length, (to.y - from.y) / length];
    const ratio: RatioRow[] = all.flatMap((k) => {
      const slope = k.a * direction[0] + k.b * direction[1];
      return slope > TOL ? [{ constraint: constraintText(k), at: (k.c - k.a * from.x - k.b * from.y) / slope }] : [];
    });
    const change = to.value - from.value;
    return { to, direction, change, improves: change > TOL, ratio, step: Math.min(...ratio.map((r) => r.at)) };
  });
}

export type Walk = { ok: true; to: Vertex } | { ok: false; text: string };

/** Walk along one of the edges at `from`: refused unless it improves the objective. */
export function walkEdge(cx: number, cy: number, from: Vertex, edge: EdgeInfo): Walk {
  if (edge.improves) return { ok: true, to: edge.to };
  const word = edge.change < -TOL ? 'lowers' : 'leaves';
  const toValue = round(edge.to.value);
  const target = word === 'lowers' ? `from ${round(from.value)} to ${toValue}` : `at ${round(from.value)}`;
  return { ok: false, text: `That edge ${word} ${expression(cx, cy)} ${target}: a simplex step only follows an edge that improves the objective.` };
}

export const START_VERTEX: Vertex = { x: 0, y: 0, value: 0 };

export function stepCaption(from: Vertex, edges: readonly EdgeInfo[], cx: number, cy: number): string {
  const improving = edges.filter((e) => e.improves);
  if (improving.length === 0) {
    return `At ${vertexText(from)} worth ${round(from.value)}: no edge improves ${expression(cx, cy)}, so this vertex is optimal, because a linear objective over a convex region has no other kind of peak.`;
  }
  return `At ${vertexText(from)} worth ${round(from.value)}: ${improving.length} of ${edges.length} edges improve ${expression(cx, cy)}. Pick one to walk.`;
}

export const SCENE_REGION = DEFAULT_CONSTRAINTS;
export const SCENE_OBJECTIVE = DEFAULT_OBJECTIVE;
