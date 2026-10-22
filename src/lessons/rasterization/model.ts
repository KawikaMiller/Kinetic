// A software rasterizer for one 24 × 16 pixel grid: edge functions, the top-left fill rule,
// supersampled coverage and a z-buffer. Screen space, y pointing down, pixel (x, y) covers the
// square [x, x + 1) × [y, y + 1) and is tested at its centre (x + 0.5, y + 0.5).
import { EDGE_VERTICES as EDGES, area2, barycentric, edgeFunction as edge, isTopLeft, wind } from '../../core/raster';

export const GRID_W = 24;
export const GRID_H = 16;
/** Vertices snap to a quarter of a pixel, so every edge value below is exact in floating point. */
export const SNAP = 4;

export interface Vertex {
  x: number;
  y: number;
  /** Depth: smaller is nearer. Only the depth scene uses it. */
  z?: number;
}
export type Tri = readonly [Vertex, Vertex, Vertex];
export type FillRule = 'inclusive' | 'exclusive' | 'topLeft';

export const snap = (v: number) => Math.round(v * SNAP) / SNAP;
export const clampVertex = (v: Vertex): Vertex => ({
  ...v,
  x: snap(Math.min(GRID_W, Math.max(0, v.x))),
  y: snap(Math.min(GRID_H, Math.max(0, v.y))),
});

// The edge function, winding, top-left rule and barycentric weights live in core/raster (shared with gpu-rendering-pipeline).
export { area2, barycentric, edge, isTopLeft, wind };

export interface EdgeTest {
  /** w0, w1, w2 at the point (twice the signed areas). */
  w: [number, number, number];
  /** Whether each edge lets the point through under the rule. */
  pass: [boolean, boolean, boolean];
  inside: boolean;
}

/** All three edge tests at a point, for a wound triangle. */
export function testPoint(t: Tri, px: number, py: number, rule: FillRule): EdgeTest {
  const w = EDGES.map(([i, j]) => edge(t[i], t[j], px, py)) as [number, number, number];
  const pass = EDGES.map(([i, j], k) => {
    if (w[k] > 0) return true;
    if (w[k] < 0) return false;
    return rule === 'inclusive' || (rule === 'topLeft' && isTopLeft(t[i], t[j]));
  }) as [boolean, boolean, boolean];
  return { w, pass, inside: pass[0] && pass[1] && pass[2] };
}

/** Depth at a point, interpolated linearly in screen space from the vertices' z. */
export function depthAt(t: Tri, px: number, py: number): number {
  const [l0, l1, l2] = barycentric(t, px, py);
  return l0 * (t[0].z ?? 0) + l1 * (t[1].z ?? 0) + l2 * (t[2].z ?? 0);
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Sample offsets inside a pixel for n × n samples: n = 1 is the centre. */
export const sampleOffsets = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

/**
 * The pixels whose sample points could fall inside the triangle, clamped to the grid
 * (inclusive bounds). Pixels outside this box are never tested. Null when it's empty.
 */
export function boundingBox(t: Tri, n = 1): Box | null {
  const xs = t.map((v) => v.x);
  const ys = t.map((v) => v.y);
  const first = 0.5 / n;
  const last = 1 - 0.5 / n;
  const box = {
    x0: Math.max(0, Math.ceil(Math.min(...xs) - last)),
    y0: Math.max(0, Math.ceil(Math.min(...ys) - last)),
    x1: Math.min(GRID_W - 1, Math.floor(Math.max(...xs) - first)),
    y1: Math.min(GRID_H - 1, Math.floor(Math.max(...ys) - first)),
  };
  return box.x0 > box.x1 || box.y0 > box.y1 ? null : box;
}

export const inBox = (b: Box | null, x: number, y: number) => !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** Share of a pixel's n × n sample points inside the triangle (0..1). */
export function coverage(t: Tri, x: number, y: number, n: number, rule: FillRule = 'topLeft'): number {
  const offs = sampleOffsets(n);
  let hits = 0;
  for (const oy of offs) for (const ox of offs) if (testPoint(t, x + ox, y + oy, rule).inside) hits++;
  return hits / (n * n);
}

export interface PixelResult {
  x: number;
  y: number;
  /** The centre's edge test. */
  centre: EdgeTest;
  /** Share of samples inside (1 sample per pixel: 0 or 1). */
  cover: number;
}

export interface Raster {
  /** Null for a triangle with no area. */
  tri: Tri | null;
  box: Box | null;
  /** Every tested pixel, row by row inside the bounding box. */
  tested: PixelResult[];
  covered: number;
  samples: number;
}

/** Rasterize one triangle: walk its bounding box row by row and test every pixel. */
export function rasterize(input: Tri, n = 1, rule: FillRule = 'topLeft'): Raster {
  const tri = wind(input);
  const box = tri ? boundingBox(tri, n) : null;
  const tested: PixelResult[] = [];
  if (tri && box) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        tested.push({ x, y, centre: testPoint(tri, x + 0.5, y + 0.5, rule), cover: coverage(tri, x, y, n, rule) });
      }
    }
  }
  return { tri, box, tested, covered: tested.filter((p) => p.cover > 0).length, samples: n * n };
}

export const pixelKey = (x: number, y: number) => y * GRID_W + x;

/** Pixels whose centre a triangle covers, as a set of pixel keys. */
export function coveredSet(input: Tri, rule: FillRule): Set<number> {
  const r = rasterize(input, 1, rule);
  return new Set(r.tested.filter((p) => p.cover > 0).map((p) => pixelKey(p.x, p.y)));
}

// ── Two triangles sharing an edge ─────────────────────────────────────

export interface SharedResult {
  a: Set<number>;
  b: Set<number>;
  /** Covered by both. */
  overdraw: number[];
  /** Centres on the shared edge (between its ends) that neither triangle covers. */
  gaps: number[];
  /** False when the two far vertices sit on the same side of the shared edge, so the triangles overlap. */
  proper: boolean;
}

/** A = (s0, s1, pa) and B = (s1, s0, pb): both contain the edge s0–s1. */
export function sharedEdge(s0: Vertex, s1: Vertex, pa: Vertex, pb: Vertex, rule: FillRule): SharedResult {
  const a = coveredSet([s0, s1, pa], rule);
  const b = coveredSet([s1, s0, pb], rule);
  const overdraw = [...a].filter((k) => b.has(k));
  const gaps: number[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const k = pixelKey(x, y);
      if (!a.has(k) && !b.has(k) && onOpenSegment(s0, s1, x + 0.5, y + 0.5)) gaps.push(k);
    }
  }
  const sa = Math.sign(edge(s0, s1, pa.x, pa.y));
  const sb = Math.sign(edge(s0, s1, pb.x, pb.y));
  return { a, b, overdraw, gaps, proper: sa !== 0 && sb !== 0 && sa !== sb };
}

/** Whether (px, py) lies on the segment a–b, strictly between its ends. */
export function onOpenSegment(a: Vertex, b: Vertex, px: number, py: number): boolean {
  if (edge(a, b, px, py) !== 0) return false;
  const t = (px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y);
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return t > 0 && t < len2;
}

// ── Depth ─────────────────────────────────────────────────────────────

export interface DepthPixel {
  /** Index of the triangle that ends up in the pixel, or -1. */
  shown: number;
  /** Index of the nearest covering triangle (the right answer), -1 if none covers it, TIE if two are exactly as near. */
  nearest: number;
}

/** Two covering triangles at exactly the same depth: either answer is "right" (z-fighting). */
export const TIE = -2;

/** Depth of every covering triangle at each pixel centre, order-independent. */
function coverDepths(tris: readonly Tri[]): { i: number; z: number }[][] {
  const out: { i: number; z: number }[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  tris.forEach((t, i) => {
    const r = rasterize(t);
    if (!r.tri) return;
    for (const p of r.tested) if (p.cover) out[pixelKey(p.x, p.y)].push({ i, z: depthAt(r.tri, p.x + 0.5, p.y + 0.5) });
  });
  return out;
}

/** The nearest covering triangle per pixel, worked out on its own: no draw order, no depth buffer. */
export function nearestPerPixel(tris: readonly Tri[]): number[] {
  return coverDepths(tris).map((cs) => {
    if (!cs.length) return -1;
    const zMin = Math.min(...cs.map((c) => c.z));
    const at = cs.filter((c) => c.z === zMin);
    return at.length > 1 ? TIE : at[0].i;
  });
}

/**
 * Draw the triangles in `order`. With the z-buffer, a pixel is only written when it is nearer
 * than what's there (depth test "less"); without it, the last triangle drawn wins (painter's).
 */
export function drawDepth(tris: readonly Tri[], order: readonly number[], zBuffer: boolean): DepthPixel[] {
  const shown = new Array<number>(GRID_W * GRID_H).fill(-1);
  const depth = new Array<number>(GRID_W * GRID_H).fill(Infinity);
  for (const i of order) {
    const r = rasterize(tris[i]);
    for (const p of r.tested) {
      if (!p.cover || !r.tri) continue;
      const k = pixelKey(p.x, p.y);
      const z = depthAt(r.tri, p.x + 0.5, p.y + 0.5);
      if (!zBuffer || z < depth[k]) {
        depth[k] = z;
        shown[k] = i;
      }
    }
  }
  const nearest = nearestPerPixel(tris);
  return shown.map((s, k) => ({ shown: s, nearest: nearest[k] }));
}

/** Pixels where the triangle on screen isn't the nearest one (exact ties never count as wrong). */
export const isWrong = (p: DepthPixel) => p.nearest !== TIE && p.shown !== p.nearest;
export const wrongPixels = (px: readonly DepthPixel[]) => px.filter(isWrong).length;

// ── Presets ───────────────────────────────────────────────────────────

const v = (x: number, y: number, z?: number): Vertex => (z === undefined ? { x, y } : { x, y, z });

export const COVERAGE_PRESET: Tri = [v(3.25, 2.5), v(20.5, 5.75), v(8.75, 14.25)];
/** Thin sliver: most of its bounding box is wasted tests. */
export const SLIVER_PRESET: Tri = [v(1.5, 1.25), v(22.75, 14.5), v(20, 15)];
/** A small triangle round the corner of four pixels: it touches all four and covers none of their centres. */
export const TINY_PRESET: Tri = [v(10.75, 6.75), v(11.25, 6.75), v(11, 7.25)];

/** The shared edge runs from (2.5, 13.5) to (20.5, 1.5): slope −2/3, straight through seven pixel centres. */
export const SHARED_PRESET = {
  s0: v(2.5, 13.5),
  s1: v(20.5, 1.5),
  pa: v(4.5, 2.25),
  pb: v(21.75, 14.5),
};

/** Two triangles whose depths cross inside their overlap: each is nearer over part of it. */
export const DEPTH_PRESET: readonly Tri[] = [
  [v(2, 2, 0.2), v(19, 4, 0.9), v(5, 14.5, 0.2)],
  [v(21.5, 2.5, 0.2), v(22, 14, 0.2), v(4.5, 8.5, 0.9)],
];
