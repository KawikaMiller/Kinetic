/**
 * Which packets enter the tunnel: a route list, as WireGuard's "allowed IPs" and an IPsec route or traffic
 * selector both amount to (the same idea as a route plus an access list; from memory: verify). Longest prefix wins;
 * two routes for the same block with different destinations are a conflict that the lookup alone cannot settle.
 */
import { contains, ipv4, longestPrefixMatch, type Route } from '../../core/ipv4';

export type Goes = 'tunnel' | 'direct';
export interface RouteRow extends Route {
  goes: Goes;
  label: string;
}
export type PresetId = 'full' | 'split' | 'overlap';
export type TiePolicy = 'direct' | 'tunnel';

const row = (net: string, prefix: number, goes: Goes, label: string): RouteRow => ({ net: ipv4(net), prefix, goes, label });

export const PRESETS: { id: PresetId; label: string; note: string; rows: RouteRow[] }[] = [
  {
    id: 'full',
    label: 'full tunnel',
    note: 'The peer is allowed 0.0.0.0/0, so everything except the home network goes through the tunnel.',
    rows: [row('192.168.1.0', 24, 'direct', 'home network'), row('0.0.0.0', 0, 'tunnel', 'peer: allowed IPs 0.0.0.0/0')],
  },
  {
    id: 'split',
    label: 'split tunnel',
    note: 'The peer is allowed only the two office ranges; everything else leaves directly.',
    rows: [
      row('192.168.1.0', 24, 'direct', 'home network'),
      row('10.20.0.0', 16, 'tunnel', 'peer: office range'),
      row('10.30.5.0', 24, 'tunnel', 'peer: office database'),
      row('0.0.0.0', 0, 'direct', 'default route'),
    ],
  },
  {
    id: 'overlap',
    label: 'overlapping private ranges',
    note: 'Home and office both use 192.168.1.0/24: the same block is listed twice, once for each side.',
    rows: [
      row('192.168.1.0', 24, 'direct', 'home network'),
      row('192.168.1.0', 24, 'tunnel', 'peer: office range'),
      row('10.20.0.0', 16, 'tunnel', 'peer: office range'),
      row('0.0.0.0', 0, 'direct', 'default route'),
    ],
  },
];

export const presetRows = (id: PresetId): RouteRow[] => (PRESETS.find((p) => p.id === id) ?? PRESETS[0]).rows;

export interface Lookup {
  matches: RouteRow[];
  /** The routes of the longest matching prefix: more than one is a tie. */
  ties: RouteRow[];
  conflict: boolean;
  /** The route that carries the packet, or null when nothing matches. */
  winner: RouteRow | null;
}

/** Longest prefix first; on a tie between a tunnel route and a direct one, `policy` says which side is preferred. */
export function lookup(rows: readonly RouteRow[], addr: number, policy: TiePolicy): Lookup {
  const matches = rows.filter((r) => contains(r.net, r.prefix, addr));
  const best = longestPrefixMatch(rows, addr);
  const ties = best ? matches.filter((r) => r.prefix === best.prefix) : [];
  const conflict = new Set(ties.map((r) => r.goes)).size > 1;
  const winner = ties.length === 0 ? null : conflict ? (ties.find((r) => r.goes === policy) ?? ties[0]) : ties[0];
  return { matches, ties, conflict, winner };
}

export interface Sample {
  name: string;
  addr: number;
}
export const SAMPLES: readonly Sample[] = [
  { name: 'office file server', addr: ipv4('10.20.4.9') },
  { name: 'office database', addr: ipv4('10.30.5.7') },
  { name: 'home printer', addr: ipv4('192.168.1.20') },
  { name: 'a public web server', addr: ipv4('203.0.113.50') },
  { name: 'a video service', addr: ipv4('198.51.100.77') },
  { name: 'a public DNS server', addr: ipv4('192.0.2.53') },
];

/** How many of the sample destinations each side carries under these routes. */
export function split(rows: readonly RouteRow[], policy: TiePolicy): { tunnel: number; direct: number; conflicts: number } {
  let tunnel = 0;
  let direct = 0;
  let conflicts = 0;
  for (const s of SAMPLES) {
    const l = lookup(rows, s.addr, policy);
    if (l.conflict) conflicts++;
    if (l.winner?.goes === 'tunnel') tunnel++;
    else direct++;
  }
  return { tunnel, direct, conflicts };
}
