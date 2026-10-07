/**
 * matrices-transformations: 2×2 matrices as maps of the plane, composition, and the
 * homogeneous 3×3 that adds translation (and how CSS writes it). Built on core/vec.
 *
 * Matrices are row-major, [[a, b], [c, d]], applied as M·v, so x′ = a·x + b·y and
 * y′ = c·x + d·y. The first column (a, c) is where î = (1, 0) lands; the second (b, d)
 * is where ĵ = (0, 1) lands.
 */
import { apply, det, inverse, matMul, type Mat } from '../../core/vec';

export type M2 = readonly [readonly [number, number], readonly [number, number]];
export type P2 = readonly [number, number];

export const IDENTITY: M2 = [[1, 0], [0, 1]];

/** Below this |det| the plane is treated as collapsed (slider and typed values can leave float dust). */
export const DET_EPS = 1e-9;

export const applyM = (m: M2, p: P2): P2 => apply(m as Mat, p) as unknown as P2;

/** The images of î and ĵ: the matrix's columns. */
export const columns = (m: M2): [P2, P2] => [[m[0][0], m[1][0]], [m[0][1], m[1][1]]];

export const det2 = (m: M2) => det(m as Mat);

export const isSingular = (m: M2) => Math.abs(det2(m)) < DET_EPS || inverse(m as Mat) === null;

export function inverse2(m: M2): M2 | null {
  if (isSingular(m)) return null;
  const inv = inverse(m as Mat)!;
  return [[inv[0][0], inv[0][1]], [inv[1][0], inv[1][1]]];
}

/** What the transform does to the plane, from the determinant and the columns. */
export type Collapse = 'none' | 'line' | 'point';

export function collapse(m: M2): Collapse {
  if (!isSingular(m)) return 'none';
  return m.every((row) => row.every((v) => Math.abs(v) < DET_EPS)) ? 'point' : 'line';
}

/** p first, then q: the single matrix q·p. */
export const thenApply = (p: M2, q: M2): M2 => {
  const r = matMul(q as Mat, p as Mat);
  return [[r[0][0], r[0][1]], [r[1][0], r[1][1]]];
};

/** True when two matrices are equal entry by entry (to float noise). */
export const sameMatrix = (p: M2, q: M2, eps = 1e-12) => p.every((row, i) => row.every((v, j) => Math.abs(v - q[i][j]) <= eps));

/** Entrywise blend, for animating a preset change. The in-between matrices are real too. */
export const lerpM = (p: M2, q: M2, t: number): M2 => [
  [p[0][0] + (q[0][0] - p[0][0]) * t, p[0][1] + (q[0][1] - p[0][1]) * t],
  [p[1][0] + (q[1][0] - p[1][0]) * t, p[1][1] + (q[1][1] - p[1][1]) * t],
];

const COS30 = Math.sqrt(3) / 2;

export interface Preset {
  id: string;
  label: string;
  m: M2;
}

export const PRESETS = {
  identity: { id: 'identity', label: 'Identity', m: IDENTITY },
  rotate: { id: 'rotate', label: 'Rotate 30°', m: [[COS30, -0.5], [0.5, COS30]] },
  scale: { id: 'scale', label: 'Scale ×2', m: [[2, 0], [0, 2]] },
  stretch: { id: 'stretch', label: 'Stretch x ×2', m: [[2, 0], [0, 1]] },
  shear: { id: 'shear', label: 'Shear', m: [[1, 1], [0, 1]] },
  reflect: { id: 'reflect', label: 'Reflect', m: [[-1, 0], [0, 1]] },
  project: { id: 'project', label: 'Project onto x', m: [[1, 0], [0, 0]] },
  singular: { id: 'singular', label: 'Singular', m: [[1, 2], [0.5, 1]] },
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof PRESETS;

/** The transform scene's preset chips (the spec's six, plus identity to start over). */
export const TRANSFORM_PRESETS: PresetId[] = ['identity', 'rotate', 'scale', 'shear', 'reflect', 'project', 'singular'];
/** What compose can chain. */
export const COMPOSE_PRESETS: PresetId[] = ['rotate', 'stretch', 'scale', 'shear', 'reflect', 'project'];

/** A lesson-authored "F": not symmetric in any direction, so a mirror image looks wrong. */
export const F_SHAPE: readonly P2[] = [
  [0.2, 0.2], [0.55, 0.2], [0.55, 1], [1.05, 1], [1.05, 1.3], [0.55, 1.3], [0.55, 1.7], [1.25, 1.7], [1.25, 2], [0.2, 2],
];

export const UNIT_SQUARE: readonly P2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Grid lines x = k and y = k for |k| ≤ GRID_REACH, as segments; transformed, they stay straight. */
export const GRID_REACH = 4;

export function gridSegments(m: M2): { from: P2; to: P2 }[] {
  const out: { from: P2; to: P2 }[] = [];
  for (let k = -GRID_REACH; k <= GRID_REACH; k++) {
    out.push({ from: applyM(m, [k, -GRID_REACH]), to: applyM(m, [k, GRID_REACH]) });
    out.push({ from: applyM(m, [-GRID_REACH, k]), to: applyM(m, [GRID_REACH, k]) });
  }
  return out;
}

// ── Typed entries ────────────────────────────────────────────────────

export const ENTRY_MAX = 3;

export type Parsed = { ok: true; value: number } | { ok: false; error: string };

const DECIMAL = /^[-−]?(?:\d+(?:\.\d*)?|\.\d+)$/;
/** More digits than this can't change what's drawn; refuse instead of rounding silently. */
const MAX_CHARS = 12;

/**
 * One matrix entry as typed: a plain decimal in [−ENTRY_MAX, ENTRY_MAX]. Empty, exponents,
 * fractions, lists, markup and anything out of range are refused with the sentence to show.
 */
export function parseEntry(text: string): Parsed {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Type a number.' };
  if (t.length > MAX_CHARS) return { ok: false, error: `That's more digits than a drawing can show: use at most ${MAX_CHARS} characters.` };
  if (!DECIMAL.test(t)) return { ok: false, error: 'Type a plain number like −1.5 (no exponents, fractions or lists).' };
  const value = Number(t.replace('−', '-')) + 0;
  if (Math.abs(value) > ENTRY_MAX) return { ok: false, error: `Keep it between −${ENTRY_MAX} and ${ENTRY_MAX}.` };
  return { ok: true, value };
}

// ── Homogeneous 3×3 and CSS ──────────────────────────────────────────

export type M3 = readonly (readonly [number, number, number])[];

/** [[a, b, tx], [c, d, ty], [0, 0, 1]]: the linear part plus a translation, as one matrix. */
export const homogeneous = (m: M2, t: P2): M3 => [
  [m[0][0], m[0][1], t[0]],
  [m[1][0], m[1][1], t[1]],
  [0, 0, 1],
];

/** Apply a 3×3 to a point by giving it a third coordinate of 1. */
export function applyH(h: M3, p: P2): P2 {
  const [x, y, w] = apply(h as Mat, [p[0], p[1], 1]);
  return [x / w, y / w];
}

/** A 2×2 can't move the origin: M·(0, 0) = (0, 0) for every M. */
export const movesOrigin = (h: M3) => applyH(h, [0, 0]).some((v) => v !== 0);

/** CSS pixels per plot unit in the "real CSS" box. */
export const CSS_UNIT_PX = 24;

/**
 * CSS's matrix(a, b, c, d, e, f) maps (x, y) to (a·x + c·y + e, b·x + d·y + f): its six
 * numbers are the 3×3's columns read top to bottom. Translation is in px.
 */
export function cssMatrixArgs(h: M3, unitPx = CSS_UNIT_PX): number[] {
  return [h[0][0], h[1][0], h[0][1], h[1][1], h[0][2] * unitPx, h[1][2] * unitPx];
}

const cssNum = (v: number) => String(Number(v.toFixed(4)) + 0);

export const cssMatrix = (h: M3, unitPx = CSS_UNIT_PX) => `matrix(${cssMatrixArgs(h, unitPx).map(cssNum).join(', ')})`;

/** The six numbers of a computed `matrix(…)` string (what getComputedStyle reports), or null. */
export function parseCssMatrix(s: string): number[] | null {
  const m = /^matrix\(([^)]*)\)$/.exec(s.trim());
  if (!m) return null;
  const nums = m[1].split(',').map((x) => Number(x.trim()));
  return nums.length === 6 && nums.every(Number.isFinite) ? nums : null;
}

/** Does the browser's matrix equal ours, to the 4 decimals we wrote? */
export function cssMatches(ours: readonly number[], browser: readonly number[] | null, eps = 1e-3): boolean {
  return browser !== null && ours.length === browser.length && ours.every((v, i) => Math.abs(v - browser[i]) <= eps);
}

export const LINEAR_CHOICES: PresetId[] = ['identity', 'rotate', 'scale', 'shear', 'reflect'];
