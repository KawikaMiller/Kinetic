/**
 * PageRank as a random surfer, pure: the page matrix M (each page spreads its rank over its out-links),
 * the damped iteration r <- d M r + (1 - d)/n, the direct solve it converges to, what happens at a dead
 * end (rank dropped, or spread uniformly) and in a spider trap, and the editing rules of the web.
 */
import type { Pt } from '../../components/GraphView';
import type { Result } from '../../core/result';
import { stronglyConnectedComponents } from '../../core/scc';
import { identity, solve } from '../../core/vec';

export const MAX_PAGES = 8;
export const DEFAULT_DAMPING = 0.85;
/** How many iterations the stepped view offers. */
export const MAX_ITERATIONS = 60;

export type Link = [number, number];
export interface Web {
  names: string[];
  at: Pt[];
  /** Unique links from a page to another (no self-links). */
  edges: Link[];
}

export type DeadEnds = 'drop' | 'spread';

const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const WIDTH = 520;
const HEIGHT = 250;

/** Positions on an ellipse for n pages, first at the top. */
export function ringPositions(n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(WIDTH / 2 + 200 * Math.sin((2 * Math.PI * i) / n)),
    y: Math.round(HEIGHT / 2 - 95 * Math.cos((2 * Math.PI * i) / n)),
  }));
}
export const WEB_SIZE = { width: WIDTH, height: HEIGHT } as const;

const web = (n: number, edges: Link[], names = letters(n)): Web => ({ names, at: ringPositions(n), edges });

export type PresetId = 'web6' | 'example' | 'deadend' | 'chain' | 'trap';
export interface Preset {
  id: PresetId;
  label: string;
  web: Web;
}

const WEB6_EDGES: Link[] = [[0, 1], [0, 2], [1, 2], [2, 0], [2, 3], [3, 2], [3, 4], [4, 5], [5, 2], [5, 3]];

export const PRESETS: readonly Preset[] = [
  { id: 'web6', label: 'A web of 6 pages', web: web(6, WEB6_EDGES) },
  { id: 'example', label: 'A, B, C → D, D → A', web: web(4, [[0, 3], [1, 3], [2, 3], [3, 0]]) },
  { id: 'deadend', label: '6 pages, F a dead end', web: web(6, WEB6_EDGES.filter(([from]) => from !== 5)) },
  { id: 'chain', label: 'A → B → C', web: web(3, [[0, 1], [1, 2]]) },
  { id: 'trap', label: 'A spider trap {B, C}', web: web(4, [[0, 1], [0, 3], [3, 0], [1, 2], [2, 1]]) },
];
export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

// ── Editing the web ──────────────────────────────────────────────────

export function addLink(w: Web, from: number, to: number): Result<Web> {
  if (from === to) return { ok: false, error: `A page linking to itself is refused (${w.names[from]} to ${w.names[to]}): a self-link only adds to its own rank and is not part of this lesson's web.` };
  if (w.edges.some(([a, b]) => a === from && b === to)) return { ok: false, error: `${w.names[from]} already links to ${w.names[to]}: a second copy of a link is refused.` };
  return { ok: true, value: { ...w, edges: [...w.edges, [from, to]] } };
}

export function addPage(w: Web): Result<Web> {
  if (w.names.length >= MAX_PAGES) return { ok: false, error: `The web is full at ${MAX_PAGES} pages.` };
  const n = w.names.length + 1;
  return { ok: true, value: { names: letters(n), at: ringPositions(n), edges: w.edges } };
}

export const removeLastLink = (w: Web, keep: number): Web => (w.edges.length > keep ? { ...w, edges: w.edges.slice(0, -1) } : w);

// ── The math ─────────────────────────────────────────────────────────

export const outDegree = (w: Web): number[] => w.names.map((_, i) => w.edges.filter(([a]) => a === i).length);
export const deadEndsOf = (w: Web): number[] => outDegree(w).flatMap((k, i) => (k === 0 ? [i] : []));

/** M[i][j] is the share of page j's rank that goes to page i. A dead end's column is zero (`drop`) or 1/n (`spread`). */
export function linkMatrix(w: Web, dead: DeadEnds): number[][] {
  const n = w.names.length;
  const k = outDegree(w);
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (k[j] === 0) return dead === 'spread' ? 1 / n : 0;
      return w.edges.some(([a, b]) => a === j && b === i) ? 1 / k[j] : 0;
    }),
  );
}

/** The Google matrix d M + (1 - d)/n of a web whose dead ends are spread: column-stochastic, with dominant eigenvalue 1. */
export function googleMatrix(w: Web, d: number): number[][] {
  const n = w.names.length;
  return linkMatrix(w, 'spread').map((row) => row.map((m) => d * m + (1 - d) / n));
}

export interface RankStep {
  r: number[];
  /** Sum of the ranks: 1 unless a dead end dropped some. */
  total: number;
  /** L1 distance to the step before (0 at step 0). */
  change: number;
}

const sum = (v: readonly number[]) => v.reduce((s, x) => s + x, 0);

/** Power iteration r <- d M r + (1 - d)/n from the uniform start, step 0 first. */
export function rankSteps(w: Web, d: number, dead: DeadEnds, iters: number): RankStep[] {
  const n = w.names.length;
  const M = linkMatrix(w, dead);
  let r = new Array<number>(n).fill(1 / n);
  const steps: RankStep[] = [{ r, total: 1, change: 0 }];
  for (let t = 0; t < iters; t++) {
    const next = M.map((row) => d * row.reduce((s, m, j) => s + m * r[j], 0) + (1 - d) / n);
    steps.push({ r: next, total: sum(next), change: next.reduce((s, x, i) => s + Math.abs(x - r[i]), 0) });
    r = next;
  }
  return steps;
}

/** The fixed point by a direct solve of (I - d M) x = (1 - d)/n; null when that is singular (d = 1 with nothing leaking). */
export function rankSolve(w: Web, d: number, dead: DeadEnds): number[] | null {
  const n = w.names.length;
  const M = linkMatrix(w, dead);
  const A = identity(n).map((row, i) => row.map((x, j) => x - d * M[i][j]));
  return solve(A, new Array<number>(n).fill((1 - d) / n));
}

/** Groups of pages that only link among themselves (closed classes) in a web with more than one class. */
export function trapsOf(w: Web): number[][] {
  const n = w.names.length;
  const { components, comp } = stronglyConnectedComponents(n, w.edges);
  if (components.length === 1) return [];
  return components.filter((c, k) => c.length > 1 && !w.edges.some(([a, b]) => comp[a] === k && comp[b] !== k)).map((c) => [...c].sort((a, b) => a - b));
}

/** Rank held inside the traps. */
export const trapMass = (w: Web, r: readonly number[]): number => trapsOf(w).flat().reduce((s, i) => s + r[i], 0);
