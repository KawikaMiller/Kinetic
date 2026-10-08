// The access-pattern-first exercise: two required queries, a model, and for wide-column a
// partition key and clustering order. The rules say which queries one partition can serve, what
// a scatter costs, and when a key makes a hot partition.
import { ORDERS } from './canon';
import { MODELS, buildEngine, runQuery, type ModelId, type Params, type QueryId } from './engines';

export type PartitionKey = 'order_id' | 'customer_id' | 'product_id' | 'constant';
export type Clustering = 'date-desc' | 'none';

export const PARTITION_KEYS: { id: PartitionKey; label: string }[] = [
  { id: 'order_id', label: 'order_id' },
  { id: 'customer_id', label: 'customer_id' },
  { id: 'product_id', label: 'product_id' },
  { id: 'constant', label: "a constant ('all')" },
];
export const CLUSTERINGS: { id: Clustering; label: string }[] = [
  { id: 'date-desc', label: 'order_date, newest first' },
  { id: 'none', label: 'nothing' },
];

/** One row per order line: the rows a wide-column table here would hold. */
const LINES = ORDERS.flatMap((o) => o.lines.map((l) => ({ order: o.id, customer: o.customer, product: l.product })));
const keyOf = (key: PartitionKey, l: (typeof LINES)[number]) => ({ order_id: String(l.order), customer_id: l.customer, product_id: l.product, constant: 'all' })[key];

/** How many rows each partition would hold, biggest first. */
export function partitionSizes(key: PartitionKey): number[] {
  const m = new Map<string, number>();
  for (const l of LINES) m.set(keyOf(key, l), (m.get(keyOf(key, l)) ?? 0) + 1);
  return [...m.values()].sort((a, b) => b - a);
}
export const partitionCount = (key: PartitionKey) => partitionSizes(key).length;

export interface Hot {
  level: 'ok' | 'warn' | 'bad';
  reason: string;
}

/**
 * A partition key is hot when too much traffic lands on too few partitions. This rule is about
 * the key's nature (how many distinct values a real shop would have, and how evenly they are
 * used), not this toy data: with 16 orders any key looks lumpy.
 */
export function hotPartition(key: PartitionKey): Hot {
  switch (key) {
    case 'constant':
      return { level: 'bad', reason: 'every read and every write lands on one partition, so one node takes all the traffic and the partition grows without limit' };
    case 'product_id':
      return { level: 'warn', reason: 'a catalogue is small and a few bestsellers draw most of the orders, so those partitions run hot' };
    case 'customer_id':
      return { level: 'ok', reason: 'one partition per customer: plenty of values, and a customer places orders slowly' };
    case 'order_id':
      return { level: 'ok', reason: 'one partition per order: the most even spread there is' };
  }
}

export type Serve =
  | { kind: 'one'; partitions: 1; note: string }
  /** One partition, but the rows come back in storage order and the application sorts them. */
  | { kind: 'one-sorted-in-app'; partitions: 1; note: string }
  | { kind: 'scatter'; partitions: number; note: string };

/** Can one table with this key and clustering answer the query from one partition? */
export function serves(key: PartitionKey, clustering: Clustering, q: QueryId): Serve {
  const scatter = (why: string): Serve => ({ kind: 'scatter', partitions: partitionCount(key), note: `${why}, so every partition must be read (${partitionCount(key)})` });
  const whole: Serve = { kind: 'one', partitions: 1, note: 'everything is in the one partition, so this reads the whole table' };
  switch (q) {
    case 'order':
      return key === 'order_id' ? { kind: 'one', partitions: 1, note: 'the order is one partition' } : key === 'constant' ? whole : scatter('the order id is not the partition key');
    case 'last10':
      if (key === 'customer_id')
        return clustering === 'date-desc'
          ? { kind: 'one', partitions: 1, note: "one customer's partition, already newest first" }
          : { kind: 'one-sorted-in-app', partitions: 1, note: "one customer's partition, but with no clustering order the whole partition is read and sorted in the app" };
      return key === 'constant' ? { ...whole, kind: 'one-sorted-in-app' } : scatter('orders are not grouped by customer');
    case 'price':
      return key === 'product_id' ? { kind: 'one', partitions: 1, note: "the product's partition lists every line to rewrite" } : key === 'constant' ? whole : scatter('lines are not grouped by product');
    case 'also':
      return key === 'constant' ? whole : scatter('"who also bought" needs product to customers and then customer to products, two different groupings');
  }
}

export const REQUIREMENT_SETS: { id: string; label: string; queries: [QueryId, QueryId] }[] = [
  { id: 'page', label: 'Order page + order history', queries: ['order', 'last10'] },
  { id: 'reco', label: 'Order history + "also bought"', queries: ['last10', 'also'] },
  { id: 'catalogue', label: 'Price changes + order page', queries: ['price', 'order'] },
];

export interface Design {
  key: PartitionKey;
  clustering: Clustering;
}

export interface Verdict {
  perQuery: { query: QueryId; serve: Serve }[];
  /** Partitions read across both queries. */
  total: number;
  /** Queries served from one partition. */
  served: number;
  hot: Hot;
}

export function evaluateDesign(set: (typeof REQUIREMENT_SETS)[number], design: Design): Verdict {
  const perQuery = set.queries.map((query) => ({ query, serve: serves(design.key, design.clustering, query) }));
  return {
    perQuery,
    total: perQuery.reduce((s, x) => s + x.serve.partitions, 0),
    served: perQuery.filter((x) => x.serve.kind !== 'scatter').length,
    hot: hotPartition(design.key),
  };
}

/** Lookups each model needs for the two required queries (key-value with no index keys; wide-column per the design). */
export function totalsFor(set: (typeof REQUIREMENT_SETS)[number], design: Design, p: Params): Record<ModelId, number> {
  const out = {} as Record<ModelId, number>;
  for (const m of MODELS) {
    out[m.id] = m.id === 'wide'
      ? evaluateDesign(set, design).total
      : set.queries.reduce((s, q) => s + runQuery(buildEngine(m.id), q, p).lookups, 0);
  }
  return out;
}
