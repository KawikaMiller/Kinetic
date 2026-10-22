/**
 * paxos, scene 3: the counting models (a toy count of messages, not a measurement of any system) and the quorum
 * intersection table.
 */
import { ACCEPTOR_COUNT, majority } from './protocol';

/** One phase is a request to every acceptor and a reply from each. */
export const MESSAGES_PER_PHASE = 2 * ACCEPTOR_COUNT;
export const VALUES = { min: 1, max: 10, default: 5 } as const;
export const DEFAULT_CRASH_AFTER = 3;

/** Single-decree Paxos for each value: phase 1 (3 Prepare, 3 Promise) and phase 2 (3 Accept, 3 Accepted) every time. */
export const singleDecreeMessages = (values: number): number => 2 * MESSAGES_PER_PHASE * values;

/**
 * A stable proposer runs phase 1 once for every slot, then only phase 2 per value. If it crashes after value
 * `crashAfter`, the next proposer runs phase 1 again before the values that remain.
 */
export function stableProposerMessages(values: number, crashAfter: number | null): number {
  const rerun = crashAfter !== null && crashAfter >= 1 && crashAfter < values ? 1 : 0;
  return MESSAGES_PER_PHASE * (1 + rerun) + MESSAGES_PER_PHASE * values;
}

export interface Intersections {
  acceptors: number;
  /** Subsets of exactly a majority's size (every larger majority contains one of these). */
  majorities: number;
  pairs: number;
  /** The fewest acceptors two majorities share. */
  smallestOverlap: number;
  allIntersect: boolean;
}

function subsetsOfSize(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < n; i++) walk(i + 1, [...chosen, i]);
  };
  walk(0, []);
  return out;
}

/** Every pair of minimal majorities of `acceptors`, and whether each pair shares an acceptor: exhaustive. */
export function intersections(acceptors: number): Intersections {
  const need = majority(acceptors);
  const sets = subsetsOfSize(acceptors, need);
  let smallest = Infinity;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      pairs++;
      smallest = Math.min(smallest, sets[i].filter((x) => sets[j].includes(x)).length);
    }
  }
  return { acceptors, majorities: sets.length, pairs, smallestOverlap: smallest, allIntersect: smallest >= 1 };
}
