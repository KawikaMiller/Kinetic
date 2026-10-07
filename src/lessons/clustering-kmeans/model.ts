/**
 * k-means (Lloyd's algorithm) on 2-D points: random (Forgy) and k-means++ starts, the
 * assign / update half-steps as frames, empty-cluster reseeding, inertia, silhouette and
 * a best-of-restarts elbow curve. Pure and seeded: same seed, same run.
 */
import { blobs, moons } from '../../core/fixtures/datasets';
import { stdDev } from '../../core/stats';
import { mean } from '../../core/sim';
import { mulberry32, type Rnd } from '../../core/random';

export type P = readonly [number, number];

export const sqDist = (a: P, b: P) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Index of the nearest centroid; a tie goes to the lower index. */
export function nearest(p: P, centroids: readonly P[]): number {
  let best = 0;
  for (let j = 1; j < centroids.length; j++) if (sqDist(p, centroids[j]) < sqDist(p, centroids[best])) best = j;
  return best;
}

export const assignAll = (points: readonly P[], centroids: readonly P[]) => points.map((p) => nearest(p, centroids));

/** Sum of squared distances from each point to the centroid of its cluster. */
export const inertia = (points: readonly P[], centroids: readonly P[], assign: readonly number[]) =>
  points.reduce((s, p, i) => s + sqDist(p, centroids[assign[i]]), 0);

// ── Starts ───────────────────────────────────────────────────────────

export type InitMethod = 'random' | 'plusplus' | 'fixed';

/** Forgy: k distinct points picked uniformly at random. */
export function initRandom(points: readonly P[], k: number, rnd: Rnd): P[] {
  const idx = points.map((_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rnd() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k).map((i) => points[i]);
}

/**
 * k-means++: the first centre uniformly at random, then each next one with probability
 * proportional to D², its squared distance to the nearest centre chosen so far. If every
 * remaining D² is 0 (fewer distinct points than k), it falls back to a uniform pick.
 */
export function initPlusPlus(points: readonly P[], k: number, rnd: Rnd): P[] {
  const centres: P[] = [points[Math.floor(rnd() * points.length)]];
  while (centres.length < k) {
    const d2 = points.map((p) => Math.min(...centres.map((c) => sqDist(p, c))));
    const total = d2.reduce((s, v) => s + v, 0);
    if (total === 0) { centres.push(points[Math.floor(rnd() * points.length)]); continue; }
    let r = rnd() * total;
    let pick = d2.length - 1;
    for (let i = 0; i < d2.length; i++) {
      r -= d2[i];
      if (r < 0) { pick = i; break; }
    }
    centres.push(points[pick]);
  }
  return centres;
}

export function initCentroids(points: readonly P[], k: number, method: Exclude<InitMethod, 'fixed'>, seed: number): P[] {
  const rnd = mulberry32(seed);
  return method === 'random' ? initRandom(points, k, rnd) : initPlusPlus(points, k, rnd);
}

// ── Lloyd's algorithm ────────────────────────────────────────────────

/** The update half-step: each centroid moves to the mean of its points; an empty one is reseeded. */
export function updateCentroids(points: readonly P[], assign: readonly number[], centroids: readonly P[]): { centroids: P[]; reseeded: { cluster: number; point: number }[] } {
  const k = centroids.length;
  const sums = Array.from({ length: k }, () => [0, 0, 0]);
  points.forEach((p, i) => {
    const s = sums[assign[i]];
    s[0] += p[0];
    s[1] += p[1];
    s[2]++;
  });
  const next: P[] = sums.map(([x, y, n], j) => (n ? [x / n, y / n] : centroids[j]));
  const reseeded: { cluster: number; point: number }[] = [];
  const used = new Set<number>();
  sums.forEach(([, , n], j) => {
    if (n) return;
    // Reseed to the point farthest from its own cluster's centre (each point used at most once).
    let far = -1;
    points.forEach((p, i) => {
      if (used.has(i)) return;
      if (far < 0 || sqDist(p, next[assign[i]]) > sqDist(points[far], next[assign[far]])) far = i;
    });
    if (far < 0) return;
    used.add(far);
    next[j] = points[far];
    reseeded.push({ cluster: j, point: far });
  });
  return { centroids: next, reseeded };
}

export type Phase = 'init' | 'assign' | 'update' | 'done';

export interface Step {
  phase: Phase;
  /** Lloyd iteration this step belongs to (0 for the start). */
  iteration: number;
  centroids: P[];
  /** Centroids before this step moved them (update steps only). */
  previous: P[] | null;
  /** null before the first assignment. */
  assign: number[] | null;
  /** Inertia with these centroids and assignments (null before any assignment). */
  inertia: number | null;
  /** Points whose cluster changed in this assign step. */
  changed: number;
  reseeded: { cluster: number; point: number }[];
}

export const MAX_ITERATIONS = 100;

/** Runs Lloyd's algorithm from the given centres until an assign step changes nothing. */
export function lloyd(points: readonly P[], start: readonly P[]): Step[] {
  const steps: Step[] = [{ phase: 'init', iteration: 0, centroids: [...start], previous: null, assign: null, inertia: null, changed: points.length, reseeded: [] }];
  let centroids: P[] = [...start];
  let assign: number[] | null = null;
  for (let it = 1; it <= MAX_ITERATIONS && points.length; it++) {
    const next = assignAll(points, centroids);
    const changed = assign ? next.filter((c, i) => c !== assign![i]).length : points.length;
    assign = next;
    if (changed === 0) {
      steps.push({ phase: 'done', iteration: it - 1, centroids, previous: null, assign, inertia: inertia(points, centroids, assign), changed: 0, reseeded: [] });
      return steps;
    }
    steps.push({ phase: 'assign', iteration: it, centroids, previous: null, assign, inertia: inertia(points, centroids, assign), changed, reseeded: [] });
    const u = updateCentroids(points, assign, centroids);
    steps.push({ phase: 'update', iteration: it, centroids: u.centroids, previous: centroids, assign, inertia: inertia(points, u.centroids, assign), changed: 0, reseeded: u.reseeded });
    centroids = u.centroids;
  }
  return steps;
}

export const finalStep = (steps: readonly Step[]) => steps[steps.length - 1];

// ── Restarts, elbow, silhouette ──────────────────────────────────────

export const RESTARTS = 5;
export const ELBOW_MAX_K = 8;

export interface Restart {
  seed: number;
  inertia: number;
  steps: Step[];
}

/** k-means++ from `RESTARTS` seeds; the run with the lowest final inertia wins. */
export function bestOfRestarts(points: readonly P[], k: number, firstSeed: number): Restart {
  let best: Restart | null = null;
  for (let s = 0; s < RESTARTS; s++) {
    const seed = firstSeed + s;
    const steps = lloyd(points, initCentroids(points, k, 'plusplus', seed));
    const run = { seed, inertia: finalStep(steps).inertia!, steps };
    if (!best || run.inertia < best.inertia) best = run;
  }
  return best!;
}

export interface ElbowPoint {
  k: number;
  inertia: number;
  /** Mean silhouette of the best run (null for k = 1, where it isn't defined). */
  silhouette: number | null;
}

export function elbowCurve(points: readonly P[], firstSeed: number, maxK = ELBOW_MAX_K): ElbowPoint[] {
  const top = Math.min(maxK, points.length);
  return Array.from({ length: top }, (_, i) => {
    const k = i + 1;
    const best = bestOfRestarts(points, k, firstSeed);
    return { k, inertia: best.inertia, silhouette: k > 1 ? silhouette(points, finalStep(best.steps).assign!) : null };
  });
}

/**
 * The bend: the k whose point sits farthest below the straight line from the first to the
 * last point of the curve (both axes scaled to 0..1). A heuristic, not an answer.
 */
export function elbowK(curve: readonly ElbowPoint[]): number | null {
  if (curve.length < 3) return null;
  const [first, last] = [curve[0], curve[curve.length - 1]];
  const span = first.inertia - last.inertia;
  if (span <= 0) return null;
  let best: { k: number; gap: number } | null = null;
  for (const c of curve.slice(1, -1)) {
    const t = (c.k - first.k) / (last.k - first.k);
    const onLine = 1 - t;
    const gap = onLine - (c.inertia - last.inertia) / span;
    if (!best || gap > best.gap) best = { k: c.k, gap };
  }
  return best && best.gap > 0 ? best.k : null;
}

/**
 * Mean silhouette: for each point, a = mean distance to its own cluster, b = the lowest mean
 * distance to another cluster, s = (b − a) / max(a, b); a point alone in its cluster scores 0.
 */
export function silhouette(points: readonly P[], assign: readonly number[]): number {
  const clusters = [...new Set(assign)];
  if (clusters.length < 2) return 0;
  const d = (i: number, j: number) => Math.sqrt(sqDist(points[i], points[j]));
  const scores = points.map((_, i) => {
    const own = points.map((__, j) => j).filter((j) => j !== i && assign[j] === assign[i]);
    if (!own.length) return 0;
    const a = mean(own.map((j) => d(i, j)));
    const b = Math.min(...clusters.filter((c) => c !== assign[i]).map((c) => mean(points.map((__, j) => j).filter((j) => assign[j] === c).map((j) => d(i, j)))));
    return (b - a) / Math.max(a, b);
  });
  return mean(scores);
}

// ── Features ─────────────────────────────────────────────────────────

/** z-scores per feature (population s.d.); a constant feature becomes all zeros. */
export function standardise(points: readonly P[]): P[] {
  const cols = [points.map((p) => p[0]), points.map((p) => p[1])];
  const m = cols.map((c) => mean(c));
  const s = cols.map((c) => stdDev(c));
  return points.map((p) => [s[0] ? (p[0] - m[0]) / s[0] : 0, s[1] ? (p[1] - m[1]) / s[1] : 0] as P);
}

/**
 * Share of points whose cluster matches their generating group, under the best one-to-one
 * matching of clusters to groups (only when there are as many clusters as groups).
 */
export function agreement(assign: readonly number[], groups: readonly number[], k: number): number | null {
  const g = Math.max(...groups) + 1;
  if (g !== k) return null;
  let best = 0;
  const perm = (rest: number[], chosen: number[]) => {
    if (!rest.length) {
      best = Math.max(best, assign.filter((c, i) => chosen[c] === groups[i]).length / assign.length);
      return;
    }
    rest.forEach((v, i) => perm([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, v]));
  };
  perm(Array.from({ length: k }, (_, i) => i), []);
  return best;
}

// ── Presets ──────────────────────────────────────────────────────────

export type PresetId = 'three' | 'badinit' | 'moons' | 'scales' | 'stranded';
export const PRESET_IDS: readonly PresetId[] = ['three', 'badinit', 'moons', 'scales', 'stranded'];

export interface Preset {
  id: PresetId;
  label: string;
  points: P[];
  /** The group each point was generated from: hidden from k-means, used only to report agreement. */
  groups: number[];
  k: number;
  /** A deliberately chosen start, for the presets about starts. */
  fixedStart?: P[];
  /** The y feature's units in the caption, when they matter. */
  yUnits?: string;
}

const THREE_CENTRES: [number, number][] = [[-2.6, 0.2], [1.8, 1.7], [1.8, -1.7]];
const SEED = 4;

function fromLabelled(pts: { x: number; y: number; label: number }[]) {
  return { points: pts.map((p) => [p.x, p.y] as P), groups: pts.map((p) => p.label) };
}

export function preset(id: PresetId): Preset {
  if (id === 'three') return { id, label: 'Three clear blobs', k: 3, ...fromLabelled(blobs({ seed: SEED, centers: THREE_CENTRES, n: 30, spread: 0.7 })) };
  if (id === 'badinit') {
    // Two starts inside the left blob and one between the two right-hand blobs.
    return { id, label: 'Bad start', k: 3, ...fromLabelled(blobs({ seed: SEED, centers: THREE_CENTRES, n: 30, spread: 0.7 })), fixedStart: [[-3, -0.1], [-2.2, 0.5], [1.8, 0]] };
  }
  if (id === 'moons') {
    const m = moons({ seed: SEED, n: 60, noise: 0.08 });
    return { id, label: 'Moons', k: 2, ...fromLabelled(m.map((p) => ({ ...p, x: p.x * 2 - 1, y: p.y * 2 }))) };
  }
  if (id === 'stranded') {
    // One start far from every point: it wins no points on the first assign, and is reseeded.
    return { id, label: 'Stranded centroid', k: 3, ...fromLabelled(blobs({ seed: SEED, centers: THREE_CENTRES, n: 30, spread: 0.7 })), fixedStart: [[-2.6, 0.2], [1.8, 1.7], [-4.6, 3.8]] };
  }
  // Two groups that differ only in x; y is pure noise, measured in units 100× smaller.
  const pts = blobs({ seed: SEED, centers: [[2, 0], [6, 0]], n: 40, spread: 0.6 });
  const noise = mulberry32(SEED + 1);
  return {
    id, label: 'Different scales', k: 2, yUnits: 'cm',
    points: pts.map((p) => [p.x, Math.round((5 + (noise() - 0.5) * 6) * 100)] as P),
    groups: pts.map((p) => p.label),
  };
}
