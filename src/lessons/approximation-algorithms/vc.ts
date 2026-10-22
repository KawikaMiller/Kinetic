import type { Pt } from '../../core/graphLayout';
import { canAddToMatching, isMaximalMatching, matchedVertices, minVertexCover, uncoveredEdges, type Edge } from '../../core/vertexCover';

/** Vertex cover by maximal matching: the pure logic of scene 1. */

export const VC_LIMITS = { maxVertices: 8, maxEdges: 12 } as const;

export interface VcGraph {
  names: readonly string[];
  at: readonly Pt[];
  edges: readonly Edge[];
}

const column = (n: number, x: number, top: number, gap: number): Pt[] => Array.from({ length: n }, (_, i) => ({ x, y: top + i * gap }));

const K33_EDGES: readonly Edge[] = [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];

export const VC_PRESETS: readonly { id: string; label: string; graph: VcGraph }[] = [
  { id: 'k33', label: 'K3,3', graph: { names: ['0', '1', '2', '3', '4', '5'], at: [...column(3, 130, 50, 90), ...column(3, 430, 50, 90)], edges: K33_EDGES } },
  {
    id: 'path4',
    label: 'Path of 4',
    graph: { names: ['0', '1', '2', '3'], at: [{ x: 70, y: 140 }, { x: 210, y: 140 }, { x: 350, y: 140 }, { x: 490, y: 140 }], edges: [[0, 1], [1, 2], [2, 3]] },
  },
  {
    id: 'triangle',
    label: 'Triangle',
    graph: { names: ['0', '1', '2'], at: [{ x: 150, y: 230 }, { x: 280, y: 50 }, { x: 410, y: 230 }], edges: [[0, 1], [1, 2], [0, 2]] },
  },
  {
    id: 'star',
    label: 'Star',
    graph: { names: ['0', '1', '2', '3', '4'], at: [{ x: 280, y: 140 }, { x: 280, y: 30 }, { x: 440, y: 140 }, { x: 280, y: 250 }, { x: 120, y: 140 }], edges: [[0, 1], [0, 2], [0, 3], [0, 4]] },
  },
  {
    id: 'path3',
    label: 'Path of 3',
    graph: { names: ['0', '1', '2'], at: [{ x: 110, y: 140 }, { x: 280, y: 140 }, { x: 450, y: 140 }], edges: [[0, 1], [1, 2]] },
  },
];

export const presetGraph = (id: string): VcGraph => (VC_PRESETS.find((p) => p.id === id) ?? VC_PRESETS[0]).graph;

const edgeText = (e: Edge) => `(${e[0]}, ${e[1]})`;

export type Move = { ok: true; matching: number[] } | { ok: false; text: string };

/** Press an edge: add it to the matching, take it out again, or be refused with the rule it would break. */
export function toggleMatchingEdge(edges: readonly Edge[], matching: readonly number[], edge: number): Move {
  if (matching.includes(edge)) return { ok: true, matching: matching.filter((i) => i !== edge) };
  const r = canAddToMatching(edges, matching, edge);
  if (r.ok) return { ok: true, matching: [...matching, edge] };
  return {
    ok: false,
    text: `Edge ${edgeText(edges[edge])} shares vertex ${r.vertex} with a matching edge you already picked. A matching may not reuse a vertex, which is exactly why its edges are disjoint.`,
  };
}

export type Finish = { ok: true } | { ok: false; text: string };

/** Press Done: only a maximal matching is accepted; otherwise name an edge that could still be added. */
export function finishMatching(edges: readonly Edge[], matching: readonly number[]): Finish {
  if (isMaximalMatching(edges, matching)) return { ok: true };
  const taken = new Set(matchedVertices(edges, matching));
  const free = edges.findIndex(([a, b]) => !taken.has(a) && !taken.has(b));
  return { ok: false, text: `Not maximal yet: edge ${edgeText(edges[free])} still has both endpoints free, so it could be added.` };
}

export type Keep = 'both' | 'one';

/** What the matching's cover keeps: both endpoints of each matching edge (correct), or only the first endpoint (the broken variant). */
export const coverOf = (edges: readonly Edge[], matching: readonly number[], keep: Keep): number[] =>
  keep === 'both' ? matchedVertices(edges, matching) : [...new Set(matching.map((i) => edges[i][0]))].sort((a, b) => a - b);

export interface CoverResult {
  cover: number[];
  optimum: { size: number; cover: number[] };
  /** cover size over optimum size; null when there is nothing to cover. */
  ratio: number | null;
  uncovered: number[];
  valid: boolean;
}

export function coverResult(n: number, edges: readonly Edge[], matching: readonly number[], keep: Keep): CoverResult {
  const cover = coverOf(edges, matching, keep);
  const optimum = minVertexCover(n, edges);
  const uncovered = uncoveredEdges(edges, cover);
  return { cover, optimum, ratio: optimum.size === 0 ? null : cover.length / optimum.size, uncovered, valid: uncovered.length === 0 };
}

export const ratioText = (r: number | null): string => (r === null ? 'no edges' : r.toFixed(2));

export function coverCaption(r: CoverResult, keep: Keep, edges: readonly Edge[]): string {
  if (!r.valid) {
    return `This is not a vertex cover: edge ${edgeText(edges[r.uncovered[0]])} is left uncovered (${r.uncovered.length} in all) because only one endpoint of each matching edge was kept. It breaks the rule "the result covers every edge".`;
  }
  const both = keep === 'both' ? 'both endpoints of each matching edge' : 'one endpoint of each matching edge';
  if (r.ratio === null) return 'The graph has no edges, so the empty set covers it and there is nothing to approximate.';
  return `The cover keeps ${both}: ${r.cover.length} vertices against an exact optimum of ${r.optimum.size}, a ratio of ${ratioText(r.ratio)}. The proved bound is 2.`;
}

/**
 * The shortest witness that keeping one endpoint breaks the cover: the path 0-1-2, matching edge (0, 1), kept vertex 0,
 * so edge (1, 2) is uncovered. (With at most one edge any one endpoint covers it, so no smaller graph can fail.)
 */
export const ONE_ENDPOINT_WITNESS = { n: 3, edges: [[0, 1], [1, 2]] as readonly Edge[], matching: [0], kept: [0], uncovered: [1] } as const;
