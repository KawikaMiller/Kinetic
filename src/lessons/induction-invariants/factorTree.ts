/**
 * Scene 3: strong induction. Claim: every integer n ≥ 2 is a product of primes.
 * If n is prime, it is its own product. Otherwise n = a × b with 2 ≤ a, b < n, and the
 * claim for a and for b (both smaller, but not necessarily n − 1) gives the factorisation.
 * That reliance on *all* smaller cases is what makes it strong induction.
 */

export const FACTOR_MIN = 2;
export const FACTOR_MAX = 100_000;

export interface FactorNode {
  id: string;
  value: number;
  /** Empty for a prime, else [a, b] with a ≤ b and a × b = value. */
  children: string[];
}

/** The largest divisor d with 2 ≤ d ≤ √n, or null when n is prime. */
export function splitOf(n: number): [number, number] | null {
  for (let d = Math.floor(Math.sqrt(n)); d >= 2; d--) if (n % d === 0) return [d, n / d];
  return null;
}

/** The factor tree, keyed by path ids ('r', 'r0', 'r01' …). */
export function factorTree(n: number): Map<string, FactorNode> {
  const nodes = new Map<string, FactorNode>();
  const build = (id: string, value: number) => {
    const split = splitOf(value);
    const children = split ? [`${id}0`, `${id}1`] : [];
    nodes.set(id, { id, value, children });
    if (split) split.forEach((v, i) => build(children[i], v));
  };
  build('r', n);
  return nodes;
}

/** Children before parents: the order strong induction establishes the nodes in. */
export function proofOrder(nodes: Map<string, FactorNode>, id = 'r'): string[] {
  const node = nodes.get(id)!;
  return [...node.children.flatMap((c) => proofOrder(nodes, c)), id];
}

/** The primes at the leaves, smallest first. */
export function leafPrimes(nodes: Map<string, FactorNode>): number[] {
  return [...nodes.values()].filter((x) => x.children.length === 0).map((x) => x.value).sort((a, b) => a - b);
}

export const FACTOR_PRESETS = [360, 84, 97, 1001, 1024] as const;
