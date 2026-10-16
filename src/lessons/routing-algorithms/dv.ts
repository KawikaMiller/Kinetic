/**
 * Distance-vector routing in synchronous rounds, the Bellman-Ford idea. In each round every
 * router reads the vectors its neighbours advertised at the START of the round and recomputes
 * its whole table from them: cost to d = min over neighbours of (link cost + advertised cost).
 * A cost of INFINITY_COST or more means unreachable. Synchronous rounds are a teaching
 * simplification; real routers send updates on timers.
 */
import { INFINITY_COST, adjacency, type Topo } from './topology';

export type SplitMode = 'plain' | 'split' | 'poison';
export const SPLIT_MODES: readonly SplitMode[] = ['plain', 'split', 'poison'];
export const SPLIT_LABEL: Record<SplitMode, string> = { plain: 'plain', split: 'split horizon', poison: 'poisoned reverse' };

export interface Entry {
  cost: number;
  /** The neighbour packets go to (smallest id among equal costs); null for itself or unreachable. */
  next: string | null;
  /** Every neighbour that gives the same best cost (equal-cost paths), in id order. */
  alts: string[];
}
export type Tables = Record<string, Record<string, Entry>>;

/** Safety valve: the count-to-infinity rounds of the biggest preset stay far below this. */
export const MAX_ROUNDS = 80;

export const cellKey = (router: string, dest: string) => `${router}>${dest}`;

/** Every router knows only itself. */
export function coldTables(routers: readonly string[]): Tables {
  const t: Tables = {};
  for (const r of routers) {
    t[r] = {};
    for (const d of routers) t[r][d] = { cost: d === r ? 0 : INFINITY_COST, next: null, alts: [] };
  }
  return t;
}

/**
 * What `from` tells `to` about `dest`: its cost, except that under split horizon (route omitted) or
 * poisoned reverse (route sent as 16) a route that goes through `to` is not passed back to it.
 * Both read as unreachable at the receiver, so the tables they build are the same; what differs is
 * what is on the wire, which `sentBack` reports.
 */
export function advertised(tables: Tables, from: string, to: string, dest: string, mode: SplitMode): number {
  const e = tables[from][dest];
  if (e.next === to && mode !== 'plain') return INFINITY_COST;
  return e.cost;
}

/** How `from` treats a route through `to` when it advertises to `to`: sent as it is, left out, or sent as 16. */
export function sentBack(mode: SplitMode): 'as-is' | 'omitted' | 'poisoned' {
  return mode === 'plain' ? 'as-is' : mode === 'split' ? 'omitted' : 'poisoned';
}

/** One synchronous round. */
export function dvRound(topo: Topo, tables: Tables, mode: SplitMode): { tables: Tables; changed: Set<string> } {
  const adj = adjacency(topo);
  const next: Tables = {};
  const changed = new Set<string>();
  for (const r of topo.routers) {
    next[r] = {};
    for (const d of topo.routers) {
      let entry: Entry = { cost: d === r ? 0 : INFINITY_COST, next: null, alts: [] };
      if (d !== r) {
        let best = INFINITY_COST;
        const ties: string[] = [];
        for (const n of Object.keys(adj[r]).sort()) {
          const cost = Math.min(INFINITY_COST, adj[r][n] + advertised(tables, n, r, d, mode));
          if (cost < best) {
            best = cost;
            ties.length = 0;
          }
          if (cost === best && cost < INFINITY_COST) ties.push(n);
        }
        if (best < INFINITY_COST) entry = { cost: best, next: ties[0], alts: ties };
      }
      next[r][d] = entry;
      const old = tables[r][d];
      if (old.cost !== entry.cost || old.next !== entry.next) changed.add(cellKey(r, d));
    }
  }
  return { tables: next, changed };
}

export interface DvRun {
  /** tables[0] is the start; tables[k] is the state after round k. */
  tables: Tables[];
  /** changed[k - 1] is the cells that changed in round k. */
  changed: Set<string>[];
  /** Rounds in which at least one cell changed: the rounds to converge. */
  rounds: number;
  hitCap: boolean;
}

/** Run rounds from `start` on `topo` until a round changes nothing. */
export function dvRun(start: Tables, topo: Topo, mode: SplitMode, maxRounds = MAX_ROUNDS): DvRun {
  const tables = [start];
  const changed: Set<string>[] = [];
  let hitCap = false;
  for (;;) {
    const r = dvRound(topo, tables[tables.length - 1], mode);
    if (r.changed.size === 0) break;
    if (changed.length >= maxRounds) {
      hitCap = true;
      break;
    }
    tables.push(r.tables);
    changed.push(r.changed);
  }
  return { tables, changed, rounds: changed.length, hitCap };
}

/** The tables of a network that has settled: plain DV from a cold start (the learner never sees these rounds). */
export function settled(topo: Topo): Tables {
  const run = dvRun(coldTables(topo.routers), topo, 'plain');
  return run.tables[run.tables.length - 1];
}

/**
 * The run a scene shows: from a link change (tables settled on the intact network, then the edited
 * network is what the routers now see) or from a cold boot of the edited network.
 */
export function sceneRun(intact: Topo, current: Topo, start: 'change' | 'boot', mode: SplitMode): DvRun {
  return dvRun(start === 'change' ? settled(intact) : coldTables(current.routers), current, mode);
}

/** The cost of the cell as the table prints it: "∞ (16)" for an unreachable destination. */
export const costText = (e: Entry): string => (e.cost >= INFINITY_COST ? `∞ (${INFINITY_COST})` : String(e.cost));

/** Rounds to settle under each of the three modes for the same network and change. */
export function roundsByMode(baseline: Topo, current: Topo, start: 'change' | 'boot'): Record<SplitMode, number> {
  return Object.fromEntries(SPLIT_MODES.map((m) => [m, sceneRun(baseline, current, start, m).rounds])) as Record<SplitMode, number>;
}

/** How many table entries read unreachable in the tables after `round`. */
export const unreachableCount = (run: DvRun, round: number): number =>
  Object.values(run.tables[round]).reduce((n, row) => n + Object.values(row).filter((e) => e.cost >= INFINITY_COST).length, 0);
