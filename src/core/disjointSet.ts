/**
 * Union-find (disjoint set union) for the union-find and minimum-spanning-trees lessons.
 * Both optimisations are switchable so the lesson can show what each one buys, and an
 * optional trace records every step for the animation.
 */

export type DsuEvent =
  /** find(node) walked `path` (node first, root last). */
  | { kind: 'find'; node: number; path: number[] }
  /** Path compression pointed `node` at `to` instead of `from`. */
  | { kind: 'reparent'; node: number; from: number; to: number }
  /** union(a, b): `merged` false when they were already in one set; `child` now points at `root`. */
  | { kind: 'union'; a: number; b: number; merged: boolean; root: number; child: number | null }
  /** Union by rank raised `root`'s rank. */
  | { kind: 'rank'; root: number; rank: number };

export interface DisjointSet {
  readonly size: number;
  /** The set representative (root) of x. */
  find(x: number): number;
  /** Merge the sets of a and b; returns whether they were separate. */
  union(a: number, b: number): boolean;
  connected(a: number, b: number): boolean;
  /** How many separate sets there are. */
  readonly count: number;
  /** A copy of the parent array (parent[i] === i for a root). */
  parents(): number[];
  ranks(): number[];
  /** Depth of the deepest tree (a lone root has height 0). */
  height(): number;
  /** Every event so far, when created with `trace: true`. */
  readonly events: readonly DsuEvent[];
}

export function createDisjointSet(
  n: number,
  opts: { compress?: boolean; byRank?: boolean; trace?: boolean } = {},
): DisjointSet {
  const { compress = true, byRank = true, trace = false } = opts;
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array<number>(n).fill(0);
  const events: DsuEvent[] = [];
  let count = n;

  const check = (x: number) => {
    if (!Number.isInteger(x) || x < 0 || x >= n) throw new RangeError(`no element ${x} in a set of ${n}`);
  };

  function find(x: number): number {
    check(x);
    const path = [x];
    let root = x;
    while (parent[root] !== root) {
      root = parent[root];
      path.push(root);
    }
    if (trace) events.push({ kind: 'find', node: x, path });
    if (compress) {
      for (const node of path) {
        if (node !== root && parent[node] !== root) {
          if (trace) events.push({ kind: 'reparent', node, from: parent[node], to: root });
          parent[node] = root;
        }
      }
    }
    return root;
  }

  function union(a: number, b: number): boolean {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) {
      if (trace) events.push({ kind: 'union', a, b, merged: false, root: ra, child: null });
      return false;
    }
    // By rank: hang the shorter tree under the taller. Without it, b's root goes under a's.
    if (byRank && rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    if (byRank && rank[ra] === rank[rb]) {
      rank[ra]++;
      if (trace) events.push({ kind: 'rank', root: ra, rank: rank[ra] });
    }
    count--;
    if (trace) events.push({ kind: 'union', a, b, merged: true, root: ra, child: rb });
    return true;
  }

  function height(): number {
    let max = 0;
    for (let i = 0; i < n; i++) {
      let d = 0;
      for (let x = i; parent[x] !== x; x = parent[x]) d++;
      max = Math.max(max, d);
    }
    return max;
  }

  return {
    size: n,
    find,
    union,
    connected: (a, b) => find(a) === find(b),
    get count() {
      return count;
    },
    parents: () => parent.slice(),
    ranks: () => rank.slice(),
    height,
    events,
  };
}
