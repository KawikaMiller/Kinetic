/**
 * Valency by backward propagation over an explored state graph. A configuration is 0-valent when only the value 0
 * can still be decided from it, 1-valent when only 1 can, bivalent when both can (within the explored bound).
 * Every move in this lesson's models strictly progresses (a message is consumed, a take is counted), so
 * a state is always found after its predecessors: walking the discovery order backwards visits successors first.
 */
import type { StateGraph } from '../../core/explore';
import type { Bit } from './onePhase';

export const REACH_ZERO = 1;
export const REACH_ONE = 2;
export const REACH_DISAGREEMENT = 4;

export type Valency = 'undecided' | '0-valent' | '1-valent' | 'bivalent';

export interface ValencyResult {
  /** What can still be decided from the start of the graph. */
  valency: Valency;
  /** A state with two different decisions is reachable. */
  disagreementReachable: boolean;
  /** Per state: the reachable-values mask. */
  masks: number[];
}

const own = (decided: readonly Bit[]): number => {
  let mask = 0;
  if (decided.includes(0)) mask |= REACH_ZERO;
  if (decided.includes(1)) mask |= REACH_ONE;
  if (mask === (REACH_ZERO | REACH_ONE)) mask |= REACH_DISAGREEMENT;
  return mask;
};

export const valencyOfMask = (mask: number): Valency => {
  const zero = (mask & REACH_ZERO) !== 0;
  const one = (mask & REACH_ONE) !== 0;
  if (zero && one) return 'bivalent';
  return zero ? '0-valent' : one ? '1-valent' : 'undecided';
};

/** `decided(state)` lists the decisions made so far in that state. */
export function propagateValency<S>(graph: StateGraph<S, unknown>, decided: (s: S) => readonly Bit[]): ValencyResult {
  const masks = graph.states.map((s) => own(decided(s)));
  for (let i = graph.states.length - 1; i >= 0; i--) {
    for (const edge of graph.edges[i] ?? []) masks[i] |= masks[edge.to];
  }
  return { valency: valencyOfMask(masks[0]), disagreementReachable: (masks[0] & REACH_DISAGREEMENT) !== 0, masks };
}
