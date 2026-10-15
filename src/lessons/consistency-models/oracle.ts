/**
 * Test-only reference for the register-history checkers: tries EVERY permutation of the operations (n <= 7, at most
 * 5,040 orders), with no pruning and no memo, so it cannot share a bug with the pruned search in core/distSim.
 * The rules are written out here from the definitions, not read from the checkers.
 */
import type { Op, OrderModel } from './model';
import { INITIAL_VALUE } from './model';

const permutationCache = new Map<number, number[][]>();

/** Every ordering of 0..n-1, built once per n. */
export function permutations(n: number): number[][] {
  const cached = permutationCache.get(n);
  if (cached) return cached;
  const out: number[][] = [];
  const build = (rest: number[], prefix: number[]) => {
    if (rest.length === 0) {
      out.push(prefix);
      return;
    }
    rest.forEach((x, i) => build([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, x]));
  };
  build(Array.from({ length: n }, (_, i) => i), []);
  permutationCache.set(n, out);
  return out;
}

/** A read returns the latest write before it in the order, or the starting value when there is none. */
const legal = (order: readonly Op[]): boolean => {
  let current = INITIAL_VALUE;
  for (const o of order) {
    if (o.kind === 'write') current = o.value;
    else if (o.value !== current) return false;
  }
  return true;
};

/** Does some permutation of `ops` obey every pair in `mustPrecede` and keep reads legal? */
const someOrder = (ops: readonly Op[], mustPrecede: (a: Op, b: Op) => boolean): boolean =>
  permutations(ops.length).some((perm) => {
    const order = perm.map((i) => ops[i]);
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (mustPrecede(order[j], order[i])) return false;
    return legal(order);
  });

/** The causal order: program order plus "this read returned that write", closed under transitivity (repeated until nothing changes). */
function causalPairs(ops: readonly Op[]): boolean[][] {
  const n = ops.length;
  const rel = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (ops[i].client === ops[j].client && ops[i].invoke < ops[j].invoke) rel[i][j] = true;
      if (ops[i].kind === 'write' && ops[j].kind === 'read' && ops[i].value === ops[j].value) rel[i][j] = true;
    }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!rel[i][j]) continue;
        for (let k = 0; k < n; k++) {
          if (rel[j][k] && !rel[i][k]) {
            rel[i][k] = true;
            changed = true;
          }
        }
      }
    }
  }
  return rel;
}

export function oracleHolds(name: OrderModel, ops: readonly Op[]): boolean {
  if (name === 'linearizable') return someOrder(ops, (a, b) => a.response < b.invoke);
  if (name === 'sequential') return someOrder(ops, (a, b) => a.client === b.client && a.invoke < b.invoke);
  const rel = causalPairs(ops);
  if (ops.some((_, i) => rel[i][i])) return false;
  return [...new Set(ops.map((o) => o.client))].every((client) => {
    const view = ops.map((_, i) => i).filter((i) => ops[i].kind === 'write' || ops[i].client === client);
    return someOrder(
      view.map((i) => ops[i]),
      (a, b) => rel[ops.indexOf(a)][ops.indexOf(b)],
    );
  });
}

export const oracleProfile = (ops: readonly Op[]) => ({
  linearizable: oracleHolds('linearizable', ops),
  sequential: oracleHolds('sequential', ops),
  causal: oracleHolds('causal', ops),
});
