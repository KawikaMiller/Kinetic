/**
 * A dependency graph of packages, as plain data. `deps[p]` lists what `p` depends on. Everything
 * here is pure: the affected set a monorepo's CI would run, and the order a polyrepo's
 * version bumps must follow.
 */

export interface Graph {
  nodes: readonly string[];
  /** What each package depends on. */
  deps: Readonly<Record<string, readonly string[]>>;
}

/** Who depends on each package, directly. */
export function dependants(g: Graph): Record<string, string[]> {
  const out: Record<string, string[]> = Object.fromEntries(g.nodes.map((n) => [n, []]));
  for (const n of g.nodes) for (const d of g.deps[n] ?? []) out[d].push(n);
  return out;
}

/**
 * The affected set of a change to `changed`: the package itself and every package that can
 * reach it through dependencies, so everything whose build or tests could be broken by it.
 */
export function affectedSet(g: Graph, changed: string): Set<string> {
  const rev = dependants(g);
  const seen = new Set<string>([changed]);
  const queue = [changed];
  for (let head = 0; head < queue.length; head++) {
    for (const next of rev[queue[head]]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export interface Slot {
  start: number;
  finish: number;
}

/**
 * The cascade of version bumps after a breaking release of `lib`: each affected package needs its
 * own change, and cannot start until every affected package it depends on (other than `lib`) has
 * finished, because it consumes their releases. `days[p]` is how long p's own change takes.
 * Packages are scheduled in dependency order, the first at day 0.
 */
export function cascade(g: Graph, lib: string, days: Readonly<Record<string, number>>): Record<string, Slot> {
  const affected = affectedSet(g, lib);
  affected.delete(lib);
  const slots: Record<string, Slot> = {};
  const schedule = (p: string): Slot => {
    if (slots[p]) return slots[p];
    const start = Math.max(0, ...(g.deps[p] ?? []).filter((d) => affected.has(d)).map((d) => schedule(d).finish));
    return (slots[p] = { start, finish: start + days[p] });
  };
  for (const p of g.nodes) if (affected.has(p)) schedule(p);
  return slots;
}

/** Calendar days until the last package has moved: the longest chain of waiting. */
export const cascadeDays = (slots: Readonly<Record<string, Slot>>): number => Math.max(0, ...Object.values(slots).map((s) => s.finish));
