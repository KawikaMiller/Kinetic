/**
 * The eight fictional autonomous systems of the lesson (AS64496-AS64503, from the range reserved for
 * documentation, RFC 5398: verify), their business relationships and where they sit on the canvas.
 * An edge is customer-to-provider (`c2p`: `a` pays `b`) or peer-to-peer (`p2p`).
 */
export type Asn = number;
export type Rel = 'customer' | 'peer' | 'provider';
export type Tier = 'core' | 'regional' | 'edge';

export interface AsEdge {
  a: Asn;
  b: Asn;
  kind: 'c2p' | 'p2p';
}

export interface AsGraph {
  ases: readonly Asn[];
  edges: readonly AsEdge[];
}

export const ASES: readonly Asn[] = [64496, 64497, 64498, 64499, 64500, 64501, 64502, 64503];
/** The AS that owns 203.0.113.0/24 (a documentation prefix). */
export const ORIGIN: Asn = 64500;
export const ORIGIN_PREFIX = '203.0.113.0/24';
/** The small multihomed customer that leaks in scene 3. */
export const LEAKER: Asn = 64502;
/** The default second announcer of scene 4. */
export const DEFAULT_HIJACKER: Asn = 64501;

export const EDGES: readonly AsEdge[] = [
  { a: 64498, b: 64496, kind: 'c2p' },
  { a: 64499, b: 64497, kind: 'c2p' },
  { a: 64500, b: 64498, kind: 'c2p' },
  { a: 64502, b: 64498, kind: 'c2p' },
  { a: 64502, b: 64499, kind: 'c2p' },
  { a: 64501, b: 64499, kind: 'c2p' },
  { a: 64503, b: 64496, kind: 'c2p' },
  { a: 64496, b: 64497, kind: 'p2p' },
  { a: 64498, b: 64499, kind: 'p2p' },
];

export const GRAPH: AsGraph = { ases: ASES, edges: EDGES };

export const TIER: Record<Asn, Tier> = {
  64496: 'core', 64497: 'core', 64498: 'regional', 64499: 'regional', 64500: 'edge', 64501: 'edge', 64502: 'edge', 64503: 'edge',
};

export const CANVAS = { width: 560, height: 290 } as const;
export const POSITIONS: Record<Asn, { x: number; y: number }> = {
  64496: { x: 165, y: 52 },
  64497: { x: 395, y: 52 },
  64498: { x: 105, y: 150 },
  64499: { x: 455, y: 150 },
  64500: { x: 45, y: 247 },
  64503: { x: 175, y: 247 },
  64502: { x: 285, y: 247 },
  64501: { x: 515, y: 247 },
};

/** The tinted regions drawn under the graph: plain categories, never the verdict colours. */
export const REGIONS: readonly { tier: Tier; label: string; y: number; h: number; tint: 'sky' | 'amber' | 'pink' }[] = [
  { tier: 'core', label: 'tier-1 core', y: 6, h: 92, tint: 'sky' },
  { tier: 'regional', label: 'regional ISPs', y: 104, h: 92, tint: 'amber' },
  { tier: 'edge', label: 'edge networks', y: 202, h: 84, tint: 'pink' },
];

export const asName = (a: Asn) => `AS${a}`;
export const edgeId = (x: Asn, y: Asn) => (x < y ? `${x}-${y}` : `${y}-${x}`);

/** What `nbr` is to `me`: my customer, my peer or my provider; null when they are not neighbours. */
export function relOf(edges: readonly AsEdge[], me: Asn, nbr: Asn): Rel | null {
  for (const e of edges) {
    if (e.kind === 'p2p' && ((e.a === me && e.b === nbr) || (e.b === me && e.a === nbr))) return 'peer';
    if (e.kind === 'c2p' && e.a === me && e.b === nbr) return 'provider';
    if (e.kind === 'c2p' && e.b === me && e.a === nbr) return 'customer';
  }
  return null;
}

export function neighboursOf(edges: readonly AsEdge[], me: Asn): { asn: Asn; rel: Rel }[] {
  const out: { asn: Asn; rel: Rel }[] = [];
  for (const e of edges) {
    if (e.a === me || e.b === me) {
      const asn = e.a === me ? e.b : e.a;
      out.push({ asn, rel: relOf(edges, me, asn) as Rel });
    }
  }
  return out.sort((x, y) => x.asn - y.asn);
}

/** Flows each link can carry in the traffic picture of scene 3 (made up): the two access links of the small multihomed AS are thin. */
export const DEFAULT_CAPACITY = 8;
export const THIN_CAPACITY = 2;
export const capacityOf = (x: Asn, y: Asn): number => (x === LEAKER || y === LEAKER ? THIN_CAPACITY : DEFAULT_CAPACITY);

/** The ASes that do route origin validation first, as the share slider grows: a fixed order, edge networks first and the hijacker's own provider late. */
export const ROV_ORDER: readonly Asn[] = [64502, 64503, 64497, 64496, 64498, 64500, 64499, 64501];
