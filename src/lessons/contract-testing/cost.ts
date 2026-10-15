/**
 * Scene 4's cost panel: with n services and e dependency edges, an end-to-end suite needs every
 * service deployed together (n environments' worth), while contract verification is one independent
 * check per edge (e). Both counts are computed from the same edge list the graph draws.
 */

export const SERVICES = { min: 3, max: 12 } as const;

export const maxEdges = (n: number) => (n * (n - 1)) / 2;

/** A fixed list of `e` distinct edges between `n` services (consumer to provider): a chain first, then chords. */
export function serviceEdges(n: number, e: number): { from: number; to: number }[] {
  const edges: { from: number; to: number }[] = [];
  for (let gap = 1; gap < n && edges.length < Math.min(e, maxEdges(n)); gap++) {
    for (let from = 0; from + gap < n && edges.length < Math.min(e, maxEdges(n)); from++) edges.push({ from, to: from + gap });
  }
  return edges;
}

export interface Cost {
  /** Services an end-to-end run needs deployed together. */
  e2eDeployed: number;
  /** Independent contract verifications, one per edge. */
  verifications: number;
}

export const costOf = (n: number, e: number): Cost => ({ e2eDeployed: n, verifications: Math.min(e, maxEdges(n)) });
