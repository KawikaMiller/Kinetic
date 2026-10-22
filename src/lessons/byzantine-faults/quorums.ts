/**
 * byzantine-faults, scene 2: why 3f + 1. Quorums of size n - f among n nodes, every pair enumerated: the fewest nodes two
 * quorums share, and whether all of them could be traitors (there are f traitors at most).
 */
export const F_RANGE = { min: 1, max: 3, default: 1 } as const;
/** The enumeration cap: all pairs of quorums are listed, so n stays at 10 or below. */
export const MAX_NODES = 10;

/** The cluster sizes offered for `f`: from 3f up to 3f + 2, never above the cap. */
export const nodeRange = (f: number): { min: number; max: number } => ({ min: 3 * f, max: Math.min(3 * f + 2, MAX_NODES) });

/** Every subset of size `k` of 0..n-1 as a bitmask, ascending. */
export function subsetMasks(n: number, k: number): number[] {
  const out: number[] = [];
  for (let mask = 0; mask < 2 ** n; mask++) if (popcount(mask) === k) out.push(mask);
  return out;
}

export const popcount = (x: number): number => {
  let c = 0;
  for (let v = x; v > 0; v &= v - 1) c++;
  return c;
};

export interface QuorumOverlap {
  n: number;
  f: number;
  quorumSize: number;
  quorums: number;
  /** Unordered pairs of distinct quorums. */
  pairs: number;
  smallestOverlap: number;
  /** A pair of quorums that share the fewest nodes (the first found), as node lists. */
  example: { a: number[]; b: number[]; shared: number[] };
  /** The shared nodes outnumber the traitors, so at least one is loyal. */
  loyalWitness: boolean;
}

const nodesOf = (mask: number, n: number): number[] => Array.from({ length: n }, (_, i) => i).filter((i) => (mask >> i) & 1);

/** Enumerate every pair of quorums of size n - f and report the smallest overlap. */
export function quorumOverlap(n: number, f: number): QuorumOverlap {
  if (n < 1 || n > MAX_NODES) throw new RangeError(`n must be between 1 and ${MAX_NODES}`);
  const quorumSize = n - f;
  const masks = subsetMasks(n, quorumSize);
  let smallest = Infinity;
  let best: [number, number] = [0, 0];
  let pairs = 0;
  for (let i = 0; i < masks.length; i++) {
    for (let j = i + 1; j < masks.length; j++) {
      pairs++;
      const shared = popcount(masks[i] & masks[j]);
      if (shared < smallest) {
        smallest = shared;
        best = [masks[i], masks[j]];
      }
    }
  }
  if (masks.length < 2) smallest = quorumSize;
  const [a, b] = best;
  return {
    n, f, quorumSize, quorums: masks.length, pairs, smallestOverlap: smallest,
    example: { a: nodesOf(a, n), b: nodesOf(b, n), shared: nodesOf(a & b, n) },
    loyalWitness: smallest > f,
  };
}
