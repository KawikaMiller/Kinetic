import type { EthicsCase } from './cases';
import { startWalk, type Walk } from './walk';

/** A learner's place in one case, plus every node and branch they have seen in any run. */
export interface Progress {
  walk: Walk;
  seenNodes: string[];
  seenEdges: string[];
}

export const freshProgress = (c: EthicsCase): Progress => ({ walk: startWalk(c), seenNodes: [c.start], seenEdges: [] });

const withItem = (xs: readonly string[], x: string) => (xs.includes(x) ? [...xs] : [...xs, x]);

export const markNode = (p: Progress, id: string): Progress => ({ ...p, seenNodes: withItem(p.seenNodes, id) });
export const markEdge = (p: Progress, key: string): Progress => ({ ...p, seenEdges: withItem(p.seenEdges, key) });
