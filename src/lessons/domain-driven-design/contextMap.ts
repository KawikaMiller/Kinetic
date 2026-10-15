/**
 * Scene 2 of domain-driven-design: nine invented concepts of a small shop, weighted usage edges between
 * them, and three contexts to assign them to. Everything shown is computed from the assignment:
 * which edges stay inside a context, which cross it, which cross it by reaching into the other side's
 * own objects, and which pass through a Customer that has been split into one model per context.
 */

export type Context = 'billing' | 'fulfilment' | 'support';
export const CONTEXTS: { id: Context; label: string; key: string }[] = [
  { id: 'billing', label: 'Billing', key: '1' },
  { id: 'fulfilment', label: 'Fulfilment', key: '2' },
  { id: 'support', label: 'Support', key: '3' },
];

export type ConceptId = 'Customer' | 'Order' | 'Invoice' | 'Payment' | 'Shipment' | 'Address' | 'Ticket' | 'Product' | 'LoyaltyAccount';
export const CONCEPTS: readonly ConceptId[] = ['Customer', 'Order', 'Invoice', 'Payment', 'Shipment', 'Address', 'Ticket', 'Product', 'LoyaltyAccount'];

/** What a split Customer becomes: one model per context, joined only by a shared customer id. */
export type PartId = 'Payer' | 'Recipient' | 'Requester';
export const PART_CONTEXT: Record<PartId, Context> = { Payer: 'billing', Recipient: 'fulfilment', Requester: 'support' };
export const PARTS: readonly PartId[] = ['Payer', 'Recipient', 'Requester'];
export type NodeId = ConceptId | PartId;

/** Customer means a different thing in each context: why one shared model strains. */
export const CUSTOMER_MEANINGS: Record<PartId, string> = {
  Payer: 'Payer: who is invoiced and how they pay',
  Recipient: 'Recipient: where a parcel goes and who signs',
  Requester: 'Requester: who asks for help and at what priority',
};

export interface UsageEdge {
  a: ConceptId;
  b: ConceptId;
  weight: number;
  /** `object`: one side holds the other's own object. `id`: it keeps only an identifier. */
  ref: 'id' | 'object';
  /** For an edge that touches Customer: which per-context model it belongs to after the split. */
  part?: PartId;
}

export const EDGES: UsageEdge[] = [
  { a: 'Customer', b: 'Invoice', weight: 4, ref: 'object', part: 'Payer' },
  { a: 'Customer', b: 'Payment', weight: 3, ref: 'object', part: 'Payer' },
  { a: 'Customer', b: 'LoyaltyAccount', weight: 2, ref: 'object', part: 'Payer' },
  { a: 'Customer', b: 'Order', weight: 5, ref: 'object', part: 'Payer' },
  { a: 'Customer', b: 'Shipment', weight: 3, ref: 'object', part: 'Recipient' },
  { a: 'Customer', b: 'Address', weight: 3, ref: 'object', part: 'Recipient' },
  { a: 'Customer', b: 'Ticket', weight: 4, ref: 'object', part: 'Requester' },
  { a: 'Order', b: 'Invoice', weight: 4, ref: 'object' },
  { a: 'Order', b: 'Payment', weight: 2, ref: 'id' },
  { a: 'Order', b: 'Shipment', weight: 5, ref: 'object' },
  { a: 'Order', b: 'Product', weight: 4, ref: 'id' },
  { a: 'Invoice', b: 'Payment', weight: 5, ref: 'object' },
  { a: 'Shipment', b: 'Address', weight: 4, ref: 'object' },
  { a: 'Shipment', b: 'Product', weight: 2, ref: 'id' },
  { a: 'Ticket', b: 'Order', weight: 3, ref: 'id' },
  { a: 'Ticket', b: 'Product', weight: 2, ref: 'id' },
  { a: 'LoyaltyAccount', b: 'Order', weight: 2, ref: 'id' },
];

export type Assignment = Partial<Record<ConceptId, Context>>;

/** One reasonable answer, not the answer: the partition with the fewest edges crossing a boundary (contextMap.test.ts checks every other one). */
export const SUGGESTED: Assignment = {
  Order: 'billing', Invoice: 'billing', Payment: 'billing', LoyaltyAccount: 'billing',
  Shipment: 'fulfilment', Address: 'fulfilment',
  Ticket: 'support', Product: 'support',
  Customer: 'billing',
};

export const ALL_IN_ONE: Assignment = Object.fromEntries(CONCEPTS.map((c) => [c, 'billing' as Context]));

export type RelationshipId = 'customer-supplier' | 'conformist' | 'anticorruption' | 'shared-kernel' | 'published-language';

/** Evans's context-map patterns as recalled here (from memory: check the book); cost is an invented 1 to 5 of ongoing coordination. */
export const RELATIONSHIPS: { id: RelationshipId; label: string; consequence: string; cost: number }[] = [
  { id: 'customer-supplier', label: 'Customer / supplier', consequence: 'The upstream team plans around the downstream team\'s needs; it takes regular negotiation.', cost: 3 },
  { id: 'conformist', label: 'Conformist', consequence: 'The downstream team adopts the upstream model as it is: cheap now, but its own model bends to the other\'s.', cost: 2 },
  { id: 'anticorruption', label: 'Anticorruption layer', consequence: 'A translation layer keeps the downstream model clean; it is code to write and to keep in step.', cost: 4 },
  { id: 'shared-kernel', label: 'Shared kernel', consequence: 'Both teams own a small shared model and change it together; any change needs both teams.', cost: 5 },
  { id: 'published-language', label: 'Published language', consequence: 'A documented exchange format both sides translate to and from; stable, and slow to change.', cost: 1 },
];

export interface MapState {
  assign: Assignment;
  split: boolean;
  /** The pattern the learner gave each cross-context edge, by edge index. */
  patterns: Record<number, RelationshipId>;
}

export const START_STATE: MapState = { assign: {}, split: false, patterns: {} };

export type EdgeKind = 'pending' | 'inside' | 'raw' | 'internals' | 'translated';

export interface ResolvedEdge {
  index: number;
  from: NodeId;
  to: NodeId;
  weight: number;
  kind: EdgeKind;
}

/** The context a node sits in, or undefined if the learner has not placed it. */
export function contextOf(node: NodeId, assign: Assignment): Context | undefined {
  return (PARTS as readonly string[]).includes(node) ? PART_CONTEXT[node as PartId] : assign[node as ConceptId];
}

/** Customer's edges name the per-context model they belong to once it is split; an edge without one is left dangling. */
export const danglingEdges = (edges: readonly UsageEdge[] = EDGES): UsageEdge[] => edges.filter((e) => (e.a === 'Customer' || e.b === 'Customer') && !e.part);

/** The edges as drawn: a split replaces Customer by the part each edge belongs to, then each edge is sorted by where its ends sit. */
export function resolveEdges(state: MapState, edges: readonly UsageEdge[] = EDGES): ResolvedEdge[] {
  return edges.map((e, index) => {
    const swap = (n: ConceptId): NodeId => (state.split && n === 'Customer' && e.part ? e.part : n);
    const from = swap(e.a);
    const to = swap(e.b);
    const [x, y] = [contextOf(from, state.assign), contextOf(to, state.assign)];
    const throughPart = from !== e.a || to !== e.b;
    const kind: EdgeKind = !x || !y ? 'pending' : x === y ? 'inside' : throughPart ? 'translated' : e.ref === 'object' ? 'internals' : 'raw';
    return { index, from, to, weight: e.weight, kind };
  });
}

export interface MapStats {
  /** Edges whose two ends are both placed. */
  placed: number;
  inside: number;
  /** Cross-context edges of every kind. */
  crossing: number;
  /** Crossing edges that reach into the other side's own objects, or keep only an id, with no model of their own in between. */
  raw: number;
  /** Crossing edges that reach into the other side's own objects (a subset of `raw`). */
  internals: number;
  translated: number;
  /** inside / placed, or null with nothing placed. */
  cohesion: number | null;
  /** Concepts that mean different things in different contexts and have not been split. */
  unsplitMeanings: ConceptId[];
}

export function statsOf(state: MapState, edges: readonly UsageEdge[] = EDGES): MapStats {
  const resolved = resolveEdges(state, edges);
  const count = (k: EdgeKind) => resolved.filter((e) => e.kind === k).length;
  const [inside, raw, internals, translated] = [count('inside'), count('raw'), count('internals'), count('translated')];
  const placed = inside + raw + internals + translated;
  return {
    placed,
    inside,
    crossing: raw + internals + translated,
    raw: raw + internals,
    internals,
    translated,
    cohesion: placed ? inside / placed : null,
    unsplitMeanings: state.split ? [] : (['Customer'] as ConceptId[]),
  };
}

/** After a split the per-context models are joined only by the customer's id: the links that keep them one person. */
export const IDENTITY_KEY = 'customerId';
export const identityLinks = (state: MapState): [PartId, PartId][] => (state.split ? [['Payer', 'Recipient'], ['Recipient', 'Requester']] : []);

/** The coordination cost of the patterns the learner has chosen. */
export const patternCost = (patterns: MapState['patterns']): number =>
  Object.values(patterns).reduce((sum, id) => sum + RELATIONSHIPS.find((r) => r.id === id)!.cost, 0);

// ── Drawing positions ───────────────────────────────────────────────────

export const VIEW = { width: 640, height: 430 } as const;
export const REGION = { top: 112, width: 200, gap: 10, left: 10, bottom: 420 } as const;
const COLUMN_OFFSET = 48;
const ROW_PITCH = 52;
const ROWS_PER_COLUMN = 5;
const FIRST_ROW_Y = 152;
const POOL = { top: 30, rowPitch: 44, perRow: 5, pitch: 124, left: 76 } as const;
export const NODE_BOX = { w: 84, h: 28 } as const;

export const regionX = (c: Context) => REGION.left + CONTEXTS.findIndex((x) => x.id === c) * (REGION.width + REGION.gap);

/** Where each node sits: placed nodes stack inside their region (two columns when it fills up), unplaced ones wait in a pool on top. */
export function layout(state: MapState): { id: NodeId; at: { x: number; y: number } }[] {
  const ids: NodeId[] = [...CONCEPTS.filter((c) => !(state.split && c === 'Customer')), ...(state.split ? PARTS : [])];
  const contexts = ids.map((id) => contextOf(id, state.assign));
  const totals = new Map<Context, number>();
  for (const c of contexts) if (c) totals.set(c, (totals.get(c) ?? 0) + 1);
  const seen = new Map<Context, number>();
  let pooled = 0;
  return ids.map((id, i) => {
    const ctx = contexts[i];
    if (!ctx) {
      const slot = pooled++;
      return { id, at: { x: POOL.left + (slot % POOL.perRow) * POOL.pitch, y: POOL.top + Math.floor(slot / POOL.perRow) * POOL.rowPitch } };
    }
    const n = seen.get(ctx) ?? 0;
    seen.set(ctx, n + 1);
    const twoColumns = (totals.get(ctx) ?? 0) > ROWS_PER_COLUMN;
    const side = Math.floor(n / ROWS_PER_COLUMN) === 0 ? -1 : 1;
    const x = regionX(ctx) + REGION.width / 2 + (twoColumns ? side * COLUMN_OFFSET : 0);
    return { id, at: { x, y: FIRST_ROW_Y + (n % ROWS_PER_COLUMN) * ROW_PITCH } };
  });
}
