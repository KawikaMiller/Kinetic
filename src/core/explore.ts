/**
 * explore: a breadth-first state-space explorer (K4-2). Generic, with no distributed assumptions:
 * give it a start state, the actions each state allows and a canonical key, and it visits every
 * reachable state once, checking an invariant on each.
 *
 * Why BFS: the first violation it finds is at the smallest depth, so the counterexample path is
 * the SHORTEST one, which is the one a learner can read.
 *
 * What the result may be used to claim (AC-0/T4 #27/#28): `truncated: false` means the whole
 * reachable space under the stated bounds was visited, so "holds in all N states" is true of
 * the model. `truncated: true` means a budget stopped the search, and the only honest sentence
 * is "no violation in the first N states, not exhaustive".
 *
 * Actions carry a label chosen by the caller. The convention for concurrent systems is an
 * `ActionLabel` (`{ actor, text }`: which thread or node acted, and what it did), which is what
 * `TracePlayer` shows ("T1: load head").
 */

/** The label convention for an action in a system with several threads or nodes. */
export interface ActionLabel {
  /** The thread or node that acted ("T1", "a2", "network"). */
  actor: string;
  /** What it did, in words ("load head"). */
  text: string;
}

export interface Transition<S, A> {
  label: A;
  next: S;
}

export interface PathStep<S, A> {
  label: A;
  /** The state after this action. */
  state: S;
}

/** A visited state, as handed to `onVisit`. */
export interface Visit<S> {
  state: S;
  /** Index in discovery order (0 is the initial state). */
  index: number;
  /** Length of the shortest path from the initial state. */
  depth: number;
}

/** The explored state graph, when asked for with `graph: true`. Indices are discovery order. */
export interface StateGraph<S, A> {
  states: S[];
  /** `edges[i]` are the transitions out of state i that were expanded (none for states past a budget). */
  edges: { to: number; label: A }[][];
}

export interface ExploreSpec<S, A> {
  init: S;
  /** The transitions out of `s`, in a deterministic order. */
  actions: (s: S) => readonly Transition<S, A>[];
  /** Canonical form of a state; two states with the same key are the same state. */
  key: (s: S) => string;
  /** null while the property holds, else what is wrong. Checked on every state, the initial one included. */
  invariant?: (s: S) => string | null;
  /** Stop after this many distinct states (default 250,000). */
  maxStates?: number;
  /** Do not expand states at this depth (default unlimited). */
  maxDepth?: number;
  /** Called once per state, in discovery order. */
  onVisit?: (v: Visit<S>) => void;
  /** Also return the state graph (every expanded transition), for analyses such as valency. */
  graph?: boolean;
}

export interface ExploreResult<S, A> {
  /** Distinct states visited. */
  states: number;
  /** The greatest depth of any visited state. */
  depth: number;
  /** True when a budget stopped the search with states left unexplored. */
  truncated: boolean;
  /** The shortest path to a state breaking the invariant, or null. */
  violation: { message: string; path: PathStep<S, A>[] } | null;
  /** Present only when `graph: true`. */
  graph?: StateGraph<S, A>;
}

/** The default budget: the ceiling the exhaustive Paxos run is held to. */
export const DEFAULT_MAX_STATES = 250_000;

export function explore<S, A = ActionLabel>(spec: ExploreSpec<S, A>): ExploreResult<S, A> {
  const maxStates = spec.maxStates ?? DEFAULT_MAX_STATES;
  const maxDepth = spec.maxDepth ?? Infinity;
  const seen = new Map<string, number>([[spec.key(spec.init), 0]]);
  const states: S[] = [spec.init];
  const depths: number[] = [0];
  const parent: number[] = [-1];
  const via: (A | undefined)[] = [undefined];
  const edges: { to: number; label: A }[][] | null = spec.graph ? [] : null;
  let truncated = false;
  let deepest = 0;

  const pathTo = (index: number): PathStep<S, A>[] => {
    const path: PathStep<S, A>[] = [];
    for (let i = index; parent[i] >= 0; i = parent[i]) path.push({ label: via[i] as A, state: states[i] });
    return path.reverse();
  };
  const breaks = (index: number): ExploreResult<S, A> | null => {
    const message = spec.invariant?.(states[index]) ?? null;
    if (message === null) return null;
    return finish({ message, path: pathTo(index) });
  };
  const finish = (violation: ExploreResult<S, A>['violation']): ExploreResult<S, A> => ({
    states: states.length,
    depth: deepest,
    truncated,
    violation,
    ...(edges ? { graph: { states, edges } } : {}),
  });

  spec.onVisit?.({ state: spec.init, index: 0, depth: 0 });
  const first = breaks(0);
  if (first) return first;

  for (let head = 0; head < states.length; head++) {
    const out: { to: number; label: A }[] = [];
    if (edges) edges[head] = out;
    const depth = depths[head];
    for (const { label, next } of spec.actions(states[head])) {
      const k = spec.key(next);
      const known = seen.get(k);
      if (known !== undefined) {
        out.push({ to: known, label });
        continue;
      }
      if (depth >= maxDepth || states.length >= maxStates) {
        truncated = true;
        continue;
      }
      const index = states.length;
      seen.set(k, index);
      states.push(next);
      depths.push(depth + 1);
      parent.push(head);
      via.push(label);
      deepest = Math.max(deepest, depth + 1);
      out.push({ to: index, label });
      spec.onVisit?.({ state: next, index, depth: depth + 1 });
      const bad = breaks(index);
      if (bad) return bad;
    }
  }
  return finish(null);
}
