/**
 * A simplified BGP for one prefix, in synchronous rounds. Each AS keeps the best route it has heard
 * from its neighbours, and passes its best on to the neighbours its export policy allows, putting its own
 * number in front of the AS_PATH. A router that sees its own number in a received path discards it.
 *
 * The decision process is a SIMPLIFIED one: (1) highest local preference, set by business relationship
 * (customer over peer over provider) unless the learner edits it, (2) shortest AS_PATH, (3) lowest
 * neighbour AS number as a stand-in tie-break. The real process continues with origin type, MED, eBGP over iBGP,
 * IGP cost and router ID (from memory: verify against RFC 4271 section 9.1.2). There is no latency anywhere in it.
 */
import { neighboursOf, relOf, type Asn, type AsGraph, type Rel } from './asgraph';

export type Policy = 'valley-free' | 'leak';
export type Pref = number;

export interface Route {
  /** The AS_PATH as this AS holds it: the neighbour it came from first, the origin last; empty for the origin itself. */
  path: Asn[];
  via: Asn | null;
  rel: Rel | 'origin';
  pref: Pref;
}

export interface Origin {
  asn: Asn;
  /** The path this origin claims beyond itself: empty for an honest origin, [true origin] for a forged one. */
  tail?: Asn[];
}

export interface Config {
  graph: AsGraph;
  origins: readonly Origin[];
  policy: Policy;
  /** The AS that exports every route to every neighbour in `leak` policy. */
  leaker: Asn | null;
  /** Local preference overrides, keyed `me>neighbour`. */
  prefs: Record<string, Pref>;
  /** Route origin validation: true when `me` drops a received AS_PATH. */
  rejects?: (me: Asn, fullPath: readonly Asn[]) => boolean;
}

export const DEFAULT_PREF: Record<Rel, Pref> = { customer: 300, peer: 200, provider: 100 };
export const ORIGIN_PREF: Pref = 1000;
export const PREF_RANGE = { min: 50, max: 350, step: 50 } as const;
export const MAX_ROUNDS = 40;

export const prefKey = (me: Asn, nbr: Asn) => `${me}>${nbr}`;

export const prefOf = (cfg: Pick<Config, 'prefs'>, me: Asn, nbr: Asn, rel: Rel): Pref => cfg.prefs[prefKey(me, nbr)] ?? DEFAULT_PREF[rel];

/** True when `a` beats `b` in the simplified decision process. */
export function better(a: Route, b: Route): boolean {
  if (a.pref !== b.pref) return a.pref > b.pref;
  if (a.path.length !== b.path.length) return a.path.length < b.path.length;
  return (a.via ?? 0) < (b.via ?? 0);
}

export type DecidedBy = 'local-pref' | 'path-length' | 'neighbour';
/** The first step of the decision process that separates `a` from `b`. */
export function decidedBy(a: Route, b: Route): DecidedBy {
  if (a.pref !== b.pref) return 'local-pref';
  if (a.path.length !== b.path.length) return 'path-length';
  return 'neighbour';
}
export const DECIDED_TEXT: Record<DecidedBy, string> = {
  'local-pref': 'higher local preference',
  'path-length': 'shorter AS_PATH',
  neighbour: 'lower neighbour AS number',
};

/**
 * Whether `from` passes `route` to `to`. Valley-free: its own and customer routes go to everyone,
 * peer and provider routes go to customers only. Leak: the leaker passes everything to every neighbour
 * except the one it came from.
 */
export function exportsTo(cfg: Config, from: Asn, route: Route, to: Asn): boolean {
  if (cfg.policy === 'leak' && from === cfg.leaker) return route.via !== to;
  if (route.rel === 'origin' || route.rel === 'customer') return true;
  return relOf(cfg.graph.edges, from, to) === 'customer';
}

export type CandidateStatus = 'chosen' | 'candidate' | 'loop' | 'invalid';
export interface Candidate {
  from: Asn;
  /** The path as received: the sender first. */
  path: Asn[];
  rel: Rel;
  pref: Pref;
  status: CandidateStatus;
}

export interface Update {
  from: Asn;
  to: Asn;
  path: Asn[];
}

export interface Round {
  best: Record<Asn, Route | null>;
  candidates: Record<Asn, Candidate[]>;
  /** UPDATEs sent while this round was computed: by the ASes whose best route changed in the round before. */
  updates: Update[];
  changed: Asn[];
}

export interface BgpRun {
  rounds: Round[];
  /** The last round changed nothing. */
  settled: boolean;
  /** Rounds in which some best route changed. */
  roundsToConverge: number;
}

const sameRoute = (a: Route | null, b: Route | null) =>
  a === null || b === null ? a === b : a.via === b.via && a.pref === b.pref && a.path.length === b.path.length && a.path.every((x, i) => x === b.path[i]);

function initialRound(cfg: Config): Round {
  const best: Record<Asn, Route | null> = {};
  for (const a of cfg.graph.ases) best[a] = null;
  for (const o of cfg.origins) best[o.asn] = { path: [...(o.tail ?? [])], via: null, rel: 'origin', pref: ORIGIN_PREF };
  return { best, candidates: Object.fromEntries(cfg.graph.ases.map((a) => [a, []])), updates: [], changed: cfg.origins.map((o) => o.asn) };
}

function nextRound(cfg: Config, prev: Round): Round {
  const best: Record<Asn, Route | null> = {};
  const candidates: Record<Asn, Candidate[]> = {};
  const isOrigin = new Set(cfg.origins.map((o) => o.asn));
  for (const me of cfg.graph.ases) {
    if (isOrigin.has(me)) {
      best[me] = prev.best[me];
      candidates[me] = [];
      continue;
    }
    const list: Candidate[] = [];
    let chosen: Route | null = null;
    let chosenIndex = -1;
    for (const { asn: n, rel } of neighboursOf(cfg.graph.edges, me)) {
      const r = prev.best[n];
      if (!r || !exportsTo(cfg, n, r, me)) continue;
      const path = [n, ...r.path];
      const pref = prefOf(cfg, me, n, rel);
      if (path.includes(me)) {
        list.push({ from: n, path, rel, pref, status: 'loop' });
        continue;
      }
      if (cfg.rejects?.(me, path)) {
        list.push({ from: n, path, rel, pref, status: 'invalid' });
        continue;
      }
      const route: Route = { path, via: n, rel, pref };
      list.push({ from: n, path, rel, pref, status: 'candidate' });
      if (chosen === null || better(route, chosen)) {
        chosen = route;
        chosenIndex = list.length - 1;
      }
    }
    if (chosenIndex >= 0) list[chosenIndex].status = 'chosen';
    best[me] = chosen;
    candidates[me] = list;
  }
  const changed = cfg.graph.ases.filter((a) => !sameRoute(best[a], prev.best[a]));
  const updates: Update[] = [];
  for (const s of prev.changed) {
    const r = prev.best[s];
    if (!r) continue;
    for (const { asn: to } of neighboursOf(cfg.graph.edges, s)) if (exportsTo(cfg, s, r, to)) updates.push({ from: s, to, path: [s, ...r.path] });
  }
  return { best, candidates, updates, changed };
}

/** Propagate until a round changes nothing, or MAX_ROUNDS (a policy that never settles). */
export function propagate(cfg: Config): BgpRun {
  const rounds: Round[] = [initialRound(cfg)];
  for (;;) {
    const next = nextRound(cfg, rounds[rounds.length - 1]);
    rounds.push(next);
    if (next.changed.length === 0) return { rounds, settled: true, roundsToConverge: rounds.length - 2 };
    if (rounds.length > MAX_ROUNDS) return { rounds, settled: false, roundsToConverge: rounds.length - 1 };
  }
}

export const finalRound = (run: BgpRun): Round => run.rounds[run.rounds.length - 1];

/** The links a route's path crosses starting from `me`: me to path[0], path[0] to path[1], and so on. */
export function pathLinks(me: Asn, route: Route | null): [Asn, Asn][] {
  if (!route) return [];
  const hops = [me, ...route.path];
  return hops.slice(1).map((h, i) => [hops[i], h] as [Asn, Asn]);
}

/** Flows crossing each link when every AS sends one flow to the prefix along its best route. */
export function linkLoads(cfg: Pick<Config, 'graph'>, best: Record<Asn, Route | null>): Map<string, number> {
  const loads = new Map<string, number>();
  for (const me of cfg.graph.ases) {
    for (const [x, y] of pathLinks(me, best[me])) {
      const id = x < y ? `${x}-${y}` : `${y}-${x}`;
      loads.set(id, (loads.get(id) ?? 0) + 1);
    }
  }
  return loads;
}

/** Valley-free means a path climbs to providers, crosses at most one peer link, then only descends. `path` starts at `me`. */
export function isValleyFree(graph: AsGraph, path: readonly Asn[]): boolean {
  let phase: 'up' | 'down' = 'up';
  for (let i = 0; i + 1 < path.length; i++) {
    const rel = relOf(graph.edges, path[i], path[i + 1]);
    if (rel === null) return false;
    if (phase === 'down') {
      if (rel !== 'customer') return false;
    } else if (rel === 'peer') phase = 'down';
    else if (rel === 'customer') phase = 'down';
  }
  return true;
}
