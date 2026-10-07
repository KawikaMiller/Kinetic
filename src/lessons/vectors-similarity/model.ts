/**
 * vectors-similarity: the numbers behind both scenes. Every readout and caption is
 * computed here from the vectors on screen, using core/vec.
 */
import { cosine, distance, dot, norm, scale } from '../../core/vec';

export type V2 = readonly [number, number];

/** Dragged tips snap to tenths, so the arithmetic on screen is exact to two decimals. */
const SNAP_PER_UNIT = 10;
// Dividing (not multiplying by 0.1) lands on the double nearest the decimal; + 0 turns −0 into 0.
export const snap = (v: number) => Math.round(v * SNAP_PER_UNIT) / SNAP_PER_UNIT + 0;
export const snapV = ([x, y]: V2): V2 => [snap(x), snap(y)];

/** The dot-product plot is at least ±BASE_EXTENT, and grows to keep every arrow inside. */
export const BASE_EXTENT = 5;

export function plotExtent(vectors: readonly V2[]): number {
  const biggest = Math.max(0, ...vectors.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  return Math.max(BASE_EXTENT, Math.ceil(biggest + 0.5));
}

export const isZero = (v: V2) => v[0] === 0 && v[1] === 0;

export interface Reading {
  dot: number;
  normA: number;
  normB: number;
  /** null when either vector is zero: there is no angle. */
  cos: number | null;
  /** θ in degrees, null with cos. */
  angle: number | null;
  /** The shadow of b on a's line, (a·b / ‖a‖²)·a; null when a is zero. */
  shadow: V2 | null;
  /** Signed length of that shadow, a·b / ‖a‖ (negative = it falls behind a). */
  shadowLength: number | null;
}

export function read(a: V2, b: V2): Reading {
  const d = dot(a, b);
  const normA = norm(a);
  const normB = norm(b);
  const c = cosine(a, b);
  const cos = Number.isNaN(c) ? null : Math.min(1, Math.max(-1, c));
  const shadow = normA === 0 ? null : (scale(a, d / (normA * normA)) as unknown as V2);
  return {
    dot: d,
    normA,
    normB,
    cos,
    angle: cos === null ? null : (Math.acos(cos) * 180) / Math.PI,
    shadow,
    shadowLength: normA === 0 ? null : d / normA,
  };
}

/** How cos θ reads in words. Exact 1 / 0 / −1 come from the snapped presets; drags land near them. */
export type Direction = 'same' | 'similar' | 'perpendicular' | 'apart' | 'opposite' | 'undefined';

const NEAR = 0.0005;

export function direction(cos: number | null): Direction {
  if (cos === null) return 'undefined';
  if (cos >= 1 - NEAR) return 'same';
  if (cos <= -1 + NEAR) return 'opposite';
  if (Math.abs(cos) <= NEAR) return 'perpendicular';
  return cos > 0 ? 'similar' : 'apart';
}

/** Which of two candidates each score prefers, for the "long vs short" comparison. */
export interface Comparison {
  dotPrefers: 'pinned' | 'current' | 'tie';
  cosPrefers: 'pinned' | 'current' | 'tie' | 'undefined';
  disagree: boolean;
}

export function compare(a: V2, pinned: V2, current: V2): Comparison {
  const p = read(a, pinned);
  const c = read(a, current);
  const pick = (x: number, y: number): Comparison['dotPrefers'] => (x > y ? 'pinned' : y > x ? 'current' : 'tie');
  const dotPrefers = pick(p.dot, c.dot);
  const cosPrefers = p.cos === null || c.cos === null ? 'undefined' : pick(p.cos, c.cos);
  return { dotPrefers, cosPrefers, disagree: cosPrefers !== 'undefined' && dotPrefers !== 'tie' && cosPrefers !== 'tie' && dotPrefers !== cosPrefers };
}

export interface VectorPreset {
  id: string;
  label: string;
  a: V2;
  b: V2;
  /** A second candidate to compare b with (shown as b′). */
  pinned?: V2;
}

export const VECTOR_PRESETS: readonly VectorPreset[] = [
  { id: 'same', label: 'Same direction', a: [3, 1], b: [4.5, 1.5] },
  { id: 'perpendicular', label: 'Perpendicular', a: [3, 1], b: [-1, 3] },
  { id: 'opposite', label: 'Opposite', a: [3, 1], b: [-3, -1] },
  { id: 'long-short', label: 'Long but off-angle vs short and aligned', a: [3, 1], b: [1.2, 0.4], pinned: [1, 4.5] },
];

// ── Nearest neighbours ─────────────────────────────────────────────

export interface Doc {
  id: string;
  title: string;
  /** How often it says "cat" (x) and "dog" (y): a hand-picked 2D word-count vector. */
  at: V2;
}

/** Lesson-authored documents. Not from any real corpus. */
export const DOCS: readonly Doc[] = [
  { id: 'A', title: 'Cat care guide', at: [9, 1.5] },
  { id: 'B', title: 'Cat tweet', at: [1.6, 0.2] },
  { id: 'C', title: 'Dog training manual', at: [1, 9] },
  { id: 'D', title: 'Dog tweet', at: [0.3, 1.4] },
  { id: 'E', title: 'Pets FAQ', at: [6, 6.2] },
  { id: 'F', title: 'Pet shop ad', at: [1.2, 1.4] },
  { id: 'G', title: 'Kitten adoption post', at: [4, 1] },
  { id: 'H', title: 'Puppy blog', at: [0.8, 4.5] },
  { id: 'I', title: 'Vet newsletter', at: [4.5, 3.5] },
  { id: 'J', title: 'Cat vs dog debate', at: [3.6, 3.6] },
  { id: 'K', title: 'Cat show report', at: [8, 2.2] },
  { id: 'L', title: 'Dog park review', at: [2.5, 6.5] },
];

export const DOC_EXTENT = 10;
export const TOP_K = 3;

export type Metric = 'cosine' | 'euclidean';

export interface Ranked {
  doc: Doc;
  /** Cosine similarity (higher = closer) or distance (lower = closer). */
  score: number;
}

/** Scores this close are a tie (float noise between equal distances). */
const TIE_EPS = 1e-12;

/**
 * Every document, best first. Null for cosine when the query is the zero vector (no
 * direction to compare). Ties break alphabetically by id, so the order is stable.
 */
export function rank(query: V2, metric: Metric, docs: readonly Doc[] = DOCS): Ranked[] | null {
  if (metric === 'cosine' && isZero(query)) return null;
  const scored = docs.map((doc) => ({ doc, score: metric === 'cosine' ? cosine(query, doc.at) : distance(query, doc.at) }));
  const better = (x: Ranked, y: Ranked) => {
    const d = metric === 'cosine' ? y.score - x.score : x.score - y.score;
    return Math.abs(d) > TIE_EPS ? d : x.doc.id.localeCompare(y.doc.id);
  };
  return scored.sort(better);
}

export const topIds = (ranked: Ranked[] | null, k = TOP_K) => (ranked ? ranked.slice(0, k).map((r) => r.doc.id) : []);

/** True when the two metrics pick different top-k sets. */
export function metricsDisagree(query: V2): boolean {
  const c = topIds(rank(query, 'cosine'));
  const e = topIds(rank(query, 'euclidean'));
  return c.length > 0 && [...c].sort().join() !== [...e].sort().join();
}

export interface QueryPreset {
  id: string;
  label: string;
  at: V2;
}

export const QUERY_PRESETS: readonly QueryPreset[] = [
  { id: 'short-cat', label: 'Short cat question', at: [2, 0.4] },
  { id: 'balanced', label: 'Long, balanced question', at: [6, 5] },
  { id: 'zero', label: 'Empty query (0, 0)', at: [0, 0] },
];
