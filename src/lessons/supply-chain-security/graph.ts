/** Graph queries over a dependency map (dependent to its dependencies). Pure and generic: the tests run them on random DAGs. */

export type Adjacency = ReadonlyMap<string, readonly string[]>;

/** Everything reachable from the roots by following dependencies, the roots excluded unless something reaches them. */
export function reachableFrom(adj: Adjacency, roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adj.get(queue[i]) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Every node from which `target` can be reached: the dependents, direct and indirect (reverse reachability). */
export function ancestorsOf(adj: Adjacency, target: string): Set<string> {
  const parents = new Map<string, string[]>();
  for (const [from, tos] of adj) for (const to of tos) parents.set(to, [...(parents.get(to) ?? []), from]);
  const seen = new Set<string>();
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    for (const p of parents.get(queue[i]) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  return seen;
}
