/**
 * Scene 1: the data plane. A packet is carried hop by hop; each router looks only at its own
 * table. The tables are the settled distance-vector tables (the control plane built them). The
 * longest-prefix match panel is a separate teaching table of one router, labelled as such.
 */
import { contains, ipToString, ipv4, longestPrefixMatch } from '../../core/ipv4';
import { settled, type Entry, type Tables } from './dv';
import { FORWARDING_PRESET, adjacency, presetTopo, type Topo } from './topology';

export const FORWARDING_TOPO: Topo = presetTopo(FORWARDING_PRESET);
export const FORWARDING_TABLES: Tables = settled(FORWARDING_TOPO);
export const ROUTERS = FORWARDING_PRESET.routers;

export interface Walk {
  /** Routers the packet visits, source first. */
  hops: string[];
  delivered: boolean;
  /** Sum of the link costs along the hops walked (read from the links, not from a table). */
  cost: number;
  /** Why it stopped short: no route at some router, or a loop. */
  stuckAt: string | null;
}

const linkCost = (topo: Topo, a: string, b: string): number => topo.links.find((l) => l.up && ((l.a === a && l.b === b) || (l.a === b && l.b === a)))?.cost ?? Infinity;

/** Carry a packet from `src` to `dst`: each hop reads only the table of the router it is at. */
export function walk(tables: Tables, topo: Topo, src: string, dst: string): Walk {
  const hops = [src];
  let cost = 0;
  let at = src;
  while (at !== dst) {
    const next = tables[at][dst].next;
    if (next === null || hops.length > topo.routers.length) return { hops, delivered: false, cost, stuckAt: at };
    cost += linkCost(topo, at, next);
    hops.push(next);
    at = next;
  }
  return { hops, delivered: true, cost, stuckAt: null };
}

/** A path with the fewest hops (breadth-first, smallest id first), ignoring costs; null when unreachable. */
export function fewestHopsPath(topo: Topo, src: string, dst: string): string[] | null {
  const adj = adjacency(topo);
  const parent = new Map<string, string | null>([[src, null]]);
  const queue = [src];
  for (let i = 0; i < queue.length; i++) {
    for (const n of Object.keys(adj[queue[i]]).sort()) {
      if (parent.has(n)) continue;
      parent.set(n, queue[i]);
      queue.push(n);
    }
  }
  if (!parent.has(dst)) return null;
  const path = [dst];
  while (parent.get(path[0]) !== null) path.unshift(parent.get(path[0]) as string);
  return path;
}

/** A router's table as rows, destinations in id order, itself left out. */
export interface TableRow {
  dest: string;
  next: string;
  cost: number;
}
export function tableRows(tables: Tables, router: string): TableRow[] {
  return Object.entries(tables[router])
    .filter(([d, e]: [string, Entry]) => d !== router && e.next !== null)
    .map(([dest, e]) => ({ dest, next: e.next as string, cost: e.cost }))
    .sort((a, b) => (a.dest < b.dest ? -1 : 1));
}

/** One row of the longest-prefix teaching table. */
export interface PrefixRoute {
  net: number;
  prefix: number;
  via: string;
  text: string;
}
const route = (cidr: string, via: string): PrefixRoute => {
  const [addr, len] = cidr.split('/');
  return { net: ipv4(addr), prefix: Number(len), via, text: cidr };
};

/** Router A's forwarding table in the teaching panel: documentation prefixes, overlapping on purpose. A default route is the /0. */
export const TEACH_ROUTES: readonly PrefixRoute[] = [
  route('198.51.100.0/24', 'B'),
  route('198.51.100.128/25', 'C'),
  route('198.51.100.200/32', 'B'),
  route('203.0.113.0/24', 'B'),
  route('0.0.0.0/0', 'C'),
];

export const TEACH_DESTINATIONS: readonly string[] = ['198.51.100.7', '198.51.100.130', '198.51.100.200', '203.0.113.9', '192.0.2.1'];

export interface PrefixLookup {
  /** Every row whose block contains the address, in table order. */
  matches: PrefixRoute[];
  winner: PrefixRoute | null;
}
export function lookup(destination: string): PrefixLookup {
  const addr = ipv4(destination);
  return {
    matches: TEACH_ROUTES.filter((r) => contains(r.net, r.prefix, addr)),
    winner: longestPrefixMatch(TEACH_ROUTES, addr),
  };
}

export const addressText = (n: number) => ipToString(n);
