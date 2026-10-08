// Five simplified stores built from the one canonical dataset by pure transforms. Each answers
// the four shop queries over its own structures and reports what the access cost:
//   lookups     = keyed accesses. ONE lookup is: a record read or written by key, an index probe, a
//                 whole wide-column partition read in one go, or a graph node read together with its
//                 edge list. A scan counts every record it reads.
//   roundTrips  = separate requests the application sends (a batch, a multi-get or one SQL join is one).
//   copies      = for the price update only: how many records now hold that price.
// "Prepared" means each store has been given the structures it would add for these queries (a covering
// index, a maintained summary table, index keys). Wide-column and graph always carry theirs, because
// that is how their data is laid out; the toggle gives the other three the same kind of help, so the
// comparison is fair. A simplified model: real stores add planners, caches and batching.
import {
  CUSTOMERS, LIMIT, ORDERS, PRODUCTS, productName, sortAlso, sortLines,
  type Also, type Customer, type Line, type Product,
} from './canon';

export type ModelId = 'relational' | 'document' | 'kv' | 'wide' | 'graph';
export type QueryId = 'order' | 'last10' | 'price' | 'also';

export const MODELS: { id: ModelId; label: string }[] = [
  { id: 'relational', label: 'Relational' },
  { id: 'document', label: 'Document' },
  { id: 'kv', label: 'Key-value' },
  { id: 'wide', label: 'Wide-column' },
  { id: 'graph', label: 'Graph' },
];

export interface Step {
  /** Record ids (as the model's view names them) read or written in this step. */
  refs: string[];
  count: number;
  mode: 'read' | 'write' | 'scan';
  label: string;
}

export interface Result<A> {
  answer: A;
  steps: Step[];
  lookups: number;
  roundTrips: number;
  copies: number | null;
}
export interface PriceResult extends Result<null> {
  /** The same store after the write, to read back from. */
  after: Engine;
}

export interface RecordGroup {
  title: string;
  items: { id: string; label: string }[];
}

export interface Storage {
  lines: string[];
  /** Line numbers holding an embedded sub-document (document model). */
  embedded: number[];
}

export interface Engine {
  id: ModelId;
  order(id: number): Result<Line[]>;
  last10(customer: string): Result<number[]>;
  also(product: string): Result<Also[]>;
  price(product: string, newPrice: number): PriceResult;
  groups(): RecordGroup[];
  storage(orderId: number): Storage;
}

const done = <A>(answer: A, steps: Step[], roundTrips: number, copies: number | null = null): Result<A> => ({
  answer, steps, lookups: steps.reduce((s, x) => s + x.count, 0), roundTrips, copies,
});
const step = (mode: Step['mode'], label: string, refs: string[], count = refs.length): Step => ({ refs, count, mode, label });
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const byDateDesc = <T extends { date: string; id: number }>(xs: T[]) => [...xs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
const asLines = (items: { product: string; qty: number; price: number }[]): Line[] => sortLines(items.map((i) => ({ product: i.product, qty: i.qty, price: i.price })));

/** Customers who bought both `product` and each other product, from per-customer bought sets. */
function alsoFrom(bought: Map<string, Set<string>>, product: string): Also[] {
  const buyers = [...bought].filter(([, s]) => s.has(product)).map(([c]) => c);
  return sortAlso(PRODUCTS.filter((p) => p.id !== product)
    .map((p) => ({ product: p.id, customers: buyers.filter((c) => bought.get(c)!.has(p.id)).length }))
    .filter((r) => r.customers > 0));
}
const boughtBy = (rows: { customer: string; product: string }[]) => {
  const m = new Map<string, Set<string>>();
  for (const r of rows) m.set(r.customer, (m.get(r.customer) ?? new Set()).add(r.product));
  return m;
};

// ── Relational ──────────────────────────────────────────────────────────

interface RelRep {
  customers: Customer[];
  products: Product[];
  orders: { id: number; customer_id: string; date: string }[];
  items: { order_id: number; product_id: string; qty: number }[];
  /** A covering index on orders(customer_id, order_date, id) and a purchases(customer_id, product_id) summary table. */
  prepared: boolean;
}

function relational(rep: RelRep): Engine {
  const ordersOf = (c: string) => byDateDesc(rep.orders.filter((o) => o.customer_id === c));
  const price = (p: string) => rep.products.find((x) => x.id === p)!.price;
  const customerOf = (orderId: number) => rep.orders.find((o) => o.id === orderId)!.customer_id;
  const bought = (c: string) => uniq(rep.orders.filter((o) => o.customer_id === c).flatMap((o) => rep.items.filter((i) => i.order_id === o.id).map((i) => i.product_id)));
  return {
    id: 'relational',
    order(id) {
      const items = rep.items.filter((i) => i.order_id === id);
      return done(asLines(items.map((i) => ({ product: i.product_id, qty: i.qty, price: price(i.product_id) }))), [
        step('read', 'orders by primary key', [`orders:${id}`]),
        step('read', 'order_items by order_id (index)', [`items:${id}`]),
        step('read', 'products by primary key, one per line', items.map((i) => `products:${i.product_id}`)),
      ], 1);
    },
    last10(c) {
      const top = ordersOf(c).slice(0, LIMIT);
      if (rep.prepared)
        return done(top.map((o) => o.id), [step('read', 'covering index on orders(customer_id, order_date, id): the 10 newest entries are the answer', [], 1)], 1);
      return done(top.map((o) => o.id), [
        step('read', 'index on orders(customer_id, order_date)', [], 1),
        step('read', 'fetch the rows the index points at', top.map((o) => `orders:${o.id}`)),
      ], 1);
    },
    also(p) {
      const o1 = uniq(rep.items.filter((i) => i.product_id === p).map((i) => i.order_id));
      const buyers = uniq(o1.map(customerOf)).sort();
      if (rep.prepared) {
        const rows = buyers.flatMap((c) => bought(c).map((product) => ({ customer: c, product })));
        return done(alsoFrom(boughtBy(rows), p), [
          step('read', 'purchases(customer_id, product_id), a summary table kept up to date: who bought it (index on product_id)', [], 1),
          step('read', "purchases: each buyer's products", buyers.map((c) => `purchases:${c}`)),
        ], 1);
      }
      const o2 = rep.orders.filter((o) => buyers.includes(o.customer_id)).map((o) => o.id);
      const rows = o2.flatMap((id) => rep.items.filter((i) => i.order_id === id).map((i) => ({ customer: customerOf(id), product: i.product_id })));
      return done(alsoFrom(boughtBy(rows), p), [
        step('read', 'order_items by product_id (index)', [], 1),
        step('read', 'the orders those lines belong to, to learn the customer', o1.map((id) => `orders:${id}`)),
        step('read', "each buyer's orders (index on customer_id)", buyers.map((c) => `customers:${c}`)),
        step('read', 'the lines of every one of those orders (a nested-loop plan over indexes)', o2.map((id) => `items:${id}`)),
      ], 1);
    },
    price(p, newPrice) {
      const next = structuredClone(rep);
      next.products.find((x) => x.id === p)!.price = newPrice;
      return { ...done(null, [step('write', 'UPDATE products SET price … WHERE id = ?', [`products:${p}`])], 1, 1), after: relational(next) };
    },
    groups: () => [
      { title: 'customers', items: rep.customers.map((c) => ({ id: `customers:${c.id}`, label: c.id })) },
      { title: 'products', items: rep.products.map((p) => ({ id: `products:${p.id}`, label: p.id })) },
      { title: 'orders', items: rep.orders.map((o) => ({ id: `orders:${o.id}`, label: String(o.id) })) },
      { title: 'order_items, grouped by order', items: rep.orders.map((o) => ({ id: `items:${o.id}`, label: String(o.id) })) },
      ...(rep.prepared ? [{ title: 'purchases (summary table the app or a trigger keeps up to date), by customer', items: rep.customers.map((c) => ({ id: `purchases:${c.id}`, label: c.id })) }] : []),
    ],
    storage(id) {
      const o = rep.orders.find((x) => x.id === id)!;
      const items = rep.items.filter((i) => i.order_id === id);
      return {
        embedded: [],
        lines: [
          `orders        (${o.id}, ${o.customer_id}, ${o.date})`,
          ...items.map((i) => `order_items   (${i.order_id}, ${i.product_id}, qty ${i.qty})`),
          ...items.map((i) => `products      (${i.product_id}, ${productName(i.product_id)}, ${price(i.product_id)})   price lives here, once`),
        ],
      };
    },
  };
}

export function buildRelational(prepared: boolean): RelRep {
  return {
    prepared,
    customers: CUSTOMERS.map((c) => ({ ...c })),
    products: PRODUCTS.map((p) => ({ ...p })),
    orders: ORDERS.map((o) => ({ id: o.id, customer_id: o.customer, date: o.date })),
    items: ORDERS.flatMap((o) => o.lines.map((l) => ({ order_id: o.id, product_id: l.product, qty: l.qty }))),
  };
}

// ── Document ────────────────────────────────────────────────────────────

interface DocOrder {
  _id: number;
  customerId: string;
  orderDate: string;
  items: { productId: string; name: string; price: number; qty: number }[];
}
interface DocCustomer extends Customer {
  /** Products this customer bought, kept on the customer document when the store is prepared. */
  purchased?: string[];
}
interface DocRep {
  orders: DocOrder[];
  customers: DocCustomer[];
  products: Product[];
  /** A covering compound index (customerId, orderDate) and a multikey index on customers.purchased. */
  prepared: boolean;
}

function document(rep: DocRep): Engine {
  const docsOf = (c: string) => byDateDesc(rep.orders.filter((o) => o.customerId === c).map((o) => ({ ...o, id: o._id, date: o.orderDate })));
  const withProduct = (p: string) => rep.orders.filter((o) => o.items.some((i) => i.productId === p));
  return {
    id: 'document',
    order(id) {
      const d = rep.orders.find((o) => o._id === id)!;
      return done(asLines(d.items.map((i) => ({ product: i.productId, qty: i.qty, price: i.price }))), [
        step('read', 'one document: the items are inside it', [`orders:${id}`]),
      ], 1);
    },
    last10(c) {
      const top = docsOf(c).slice(0, LIMIT);
      if (rep.prepared)
        return done(top.map((d) => d._id), [step('read', 'covered query on the compound index (customerId, orderDate): answered from the index alone', [], 1)], 1);
      return done(top.map((d) => d._id), [
        step('read', 'secondary index on (customerId, orderDate)', [], 1),
        step('read', 'fetch the documents the index points at', top.map((d) => `orders:${d._id}`)),
      ], 1);
    },
    also(p) {
      if (rep.prepared) {
        const buyers = rep.customers.filter((c) => c.purchased!.includes(p));
        const rows = buyers.flatMap((c) => c.purchased!.map((product) => ({ customer: c.id, product })));
        return done(alsoFrom(boughtBy(rows), p), [
          step('read', 'multikey index on customers.purchased: who bought it', [], 1),
          step('read', "fetch those customers' documents: each lists what they bought", buyers.map((c) => `customers:${c.id}`)),
        ], 1);
      }
      const o1 = withProduct(p);
      const buyers = uniq(o1.map((o) => o.customerId)).sort();
      const o2 = rep.orders.filter((o) => buyers.includes(o.customerId));
      const rows = o2.flatMap((o) => o.items.map((i) => ({ customer: o.customerId, product: i.productId })));
      return done(alsoFrom(boughtBy(rows), p), [
        step('read', 'multikey index on items.productId', [], 1),
        step('read', 'the documents holding that product, to learn the customer', o1.map((o) => `orders:${o._id}`)),
        step('read', "each buyer's orders (index on customerId)", buyers.map((c) => `customers:${c}`)),
        step('read', 'those orders, with their items inside', o2.map((o) => `orders:${o._id}`)),
      ], 2);
    },
    price(p, newPrice) {
      const next = structuredClone(rep);
      const hit = next.orders.filter((o) => o.items.some((i) => i.productId === p));
      for (const o of hit) for (const i of o.items) if (i.productId === p) i.price = newPrice;
      next.products.find((x) => x.id === p)!.price = newPrice;
      return {
        ...done(null, [
          step('read', 'multikey index on items.productId', [], 1),
          step('write', 'rewrite the price embedded in each order document', hit.map((o) => `orders:${o._id}`)),
          step('write', 'the catalogue price in products', [`products:${p}`]),
        ], 2, 1 + hit.length),
        after: document(next),
      };
    },
    groups: () => [
      { title: rep.prepared ? 'customers (each lists what they bought)' : 'customers', items: rep.customers.map((c) => ({ id: `customers:${c.id}`, label: c.id })) },
      { title: 'products', items: rep.products.map((p) => ({ id: `products:${p.id}`, label: p.id })) },
      { title: 'orders (each with its items embedded)', items: rep.orders.map((o) => ({ id: `orders:${o._id}`, label: String(o._id) })) },
    ],
    storage(id) {
      const d = rep.orders.find((o) => o._id === id)!;
      const lines = ['{', `  "_id": ${d._id},`, `  "customerId": "${d.customerId}",`, `  "orderDate": "${d.orderDate}",`, '  "items": ['];
      const first = lines.length;
      d.items.forEach((i, k) => lines.push(`    { "productId": "${i.productId}", "name": "${i.name}", "price": ${i.price}, "qty": ${i.qty} }${k < d.items.length - 1 ? ',' : ''}`));
      lines.push('  ]', '}');
      return { lines, embedded: d.items.map((_, k) => first + k) };
    },
  };
}

export function buildDocument(prepared: boolean): DocRep {
  return {
    prepared,
    customers: CUSTOMERS.map((c) => ({
      ...c,
      ...(prepared ? { purchased: uniq(ORDERS.filter((o) => o.customer === c.id).flatMap((o) => o.lines.map((l) => l.product))).sort() } : {}),
    })),
    products: PRODUCTS.map((p) => ({ ...p })),
    orders: ORDERS.map((o) => ({
      _id: o.id,
      customerId: o.customer,
      orderDate: o.date,
      items: o.lines.map((l) => ({ productId: l.product, name: productName(l.product), price: PRODUCTS.find((p) => p.id === l.product)!.price, qty: l.qty })),
    })),
  };
}

// ── Key-value ───────────────────────────────────────────────────────────

interface KvRep {
  kv: Record<string, string>;
  /** Prepared: application-maintained index keys (customer:C1:orders, product:P1:orders, product:P1:customers, customer:C1:products). */
  indexed: boolean;
}
interface KvOrder {
  customer: string;
  date: string;
  items: { product: string; name: string; price: number; qty: number }[];
}

const ORDER_KEY = /^order:(\d+)$/;

function kvStore(rep: KvRep): Engine {
  const orderKeys = Object.keys(rep.kv).filter((k) => ORDER_KEY.test(k));
  const parse = (k: string): KvOrder => JSON.parse(rep.kv[k]) as KvOrder;
  const idOf = (k: string) => Number(ORDER_KEY.exec(k)![1]);
  const idList = (k: string) => JSON.parse(rep.kv[k]) as number[];
  const textList = (k: string) => JSON.parse(rep.kv[k]) as string[];
  const all = () => orderKeys.map((k) => ({ key: k, id: idOf(k), ...parse(k) }));
  return {
    id: 'kv',
    order(id) {
      const o = parse(`order:${id}`);
      return done(asLines(o.items), [step('read', 'GET one key: the value is an opaque blob', [`order:${id}`])], 1);
    },
    last10(c) {
      if (!rep.indexed) {
        const top = byDateDesc(all().filter((o) => o.customer === c)).slice(0, LIMIT);
        return done(top.map((o) => o.id), [step('scan', "no way to ask by customer: read every order's blob and look inside", orderKeys)], 1);
      }
      // The list is kept in date order by whoever writes an order, so the newest 10 are its last 10 entries.
      const ids = idList(`customer:${c}:orders`);
      return done(ids.slice(-LIMIT).reverse(), [step('read', 'GET the index key customer:<id>:orders: the newest ids are at its end', [`customer:${c}:orders`])], 1);
    },
    also(p) {
      const finish = (rows: { customer: string; product: string }[]) => alsoFrom(boughtBy(rows), p);
      if (!rep.indexed)
        return done(finish(all().flatMap((o) => o.items.map((i) => ({ customer: o.customer, product: i.product })))), [step('scan', 'read every order blob and work it out in the application', orderKeys)], 1);
      const buyers = textList(`product:${p}:customers`);
      return done(finish(buyers.flatMap((c) => textList(`customer:${c}:products`).map((product) => ({ customer: c, product })))), [
        step('read', 'GET product:<id>:customers', [`product:${p}:customers`]),
        step('read', "multi-GET each buyer's customer:<id>:products", buyers.map((c) => `customer:${c}:products`)),
      ], 2);
    },
    price(p, newPrice) {
      const next: KvRep = { ...rep, kv: { ...rep.kv } };
      const hit = rep.indexed ? idList(`product:${p}:orders`).map((id) => `order:${id}`) : all().filter((o) => o.items.some((i) => i.product === p)).map((o) => o.key);
      for (const k of hit) {
        const o = parse(k);
        for (const i of o.items) if (i.product === p) i.price = newPrice;
        next.kv[k] = JSON.stringify(o);
      }
      const pk = `product:${p}`;
      next.kv[pk] = JSON.stringify({ ...(JSON.parse(rep.kv[pk]) as Product), price: newPrice });
      const find = rep.indexed
        ? step('read', 'GET product:<id>:orders to find the copies', [`product:${p}:orders`])
        : step('scan', 'no way to ask "which blobs hold this product": read every order blob', orderKeys);
      return {
        ...done(null, [find, step('write', 'rewrite each blob that embeds the price (read, change, write back)', hit), step('write', 'the catalogue price', [pk])], 2, 1 + hit.length),
        after: kvStore(next),
      };
    },
    groups: () => [
      { title: 'order:<id> → blob', items: orderKeys.map((k) => ({ id: k, label: String(idOf(k)) })) },
      { title: 'product:<id> → blob', items: PRODUCTS.map((x) => ({ id: `product:${x.id}`, label: x.id })) },
      ...(rep.indexed ? [
        { title: 'customer:<id>:orders → list (index key the app keeps up to date)', items: CUSTOMERS.map((c) => ({ id: `customer:${c.id}:orders`, label: c.id })) },
        { title: 'product:<id>:orders → list (index key)', items: PRODUCTS.map((x) => ({ id: `product:${x.id}:orders`, label: x.id })) },
        { title: 'product:<id>:customers → list (index key)', items: PRODUCTS.map((x) => ({ id: `product:${x.id}:customers`, label: x.id })) },
        { title: 'customer:<id>:products → list (index key)', items: CUSTOMERS.map((c) => ({ id: `customer:${c.id}:products`, label: c.id })) },
      ] : []),
    ],
    storage(id) {
      return { embedded: [], lines: [`key    order:${id}`, 'value  (opaque bytes to the store)', `  ${rep.kv[`order:${id}`]}`] };
    },
  };
}

export function buildKv(indexed: boolean): KvRep {
  const kv: Record<string, string> = {};
  for (const o of ORDERS) {
    kv[`order:${o.id}`] = JSON.stringify({
      customer: o.customer,
      date: o.date,
      items: o.lines.map((l) => ({ product: l.product, name: productName(l.product), price: PRODUCTS.find((p) => p.id === l.product)!.price, qty: l.qty })),
    } satisfies KvOrder);
  }
  for (const p of PRODUCTS) kv[`product:${p.id}`] = JSON.stringify(p);
  if (indexed) {
    const purchases = (c: string) => uniq(ORDERS.filter((o) => o.customer === c).flatMap((o) => o.lines.map((l) => l.product))).sort();
    for (const c of CUSTOMERS) {
      kv[`customer:${c.id}:orders`] = JSON.stringify(ORDERS.filter((o) => o.customer === c.id).map((o) => o.id));
      kv[`customer:${c.id}:products`] = JSON.stringify(purchases(c.id));
    }
    for (const p of PRODUCTS) {
      kv[`product:${p.id}:orders`] = JSON.stringify(ORDERS.filter((o) => o.lines.some((l) => l.product === p.id)).map((o) => o.id));
      kv[`product:${p.id}:customers`] = JSON.stringify(CUSTOMERS.filter((c) => purchases(c.id).includes(p.id)).map((c) => c.id));
    }
  }
  return { kv, indexed };
}

// ── Wide-column ─────────────────────────────────────────────────────────

interface WideRep {
  /** PARTITION KEY order_id, CLUSTERING line_no: the whole order in one partition. */
  ordersById: { order_id: number; line_no: number; product_id: string; name: string; price: number; qty: number }[];
  /** PARTITION KEY customer_id, CLUSTERING order_date DESC: stored newest first. */
  ordersByCustomer: { customer_id: string; order_date: string; order_id: number }[];
  /** PARTITION KEY product_id, CLUSTERING order_id. */
  itemsByProduct: { product_id: string; order_id: number; customer_id: string }[];
  /** PARTITION KEY customer_id, CLUSTERING product_id. */
  productsByCustomer: { customer_id: string; product_id: string }[];
  products: Product[];
}

function wide(rep: WideRep): Engine {
  return {
    id: 'wide',
    order(id) {
      const rows = rep.ordersById.filter((r) => r.order_id === id);
      return done(asLines(rows.map((r) => ({ product: r.product_id, qty: r.qty, price: r.price }))), [
        step('read', 'one partition: the order and all its lines, stored together', [`orders_by_id/${id}`]),
      ], 1);
    },
    last10(c) {
      const rows = rep.ordersByCustomer.filter((r) => r.customer_id === c).slice(0, LIMIT);
      return done(rows.map((r) => r.order_id), [
        step('read', 'one partition, already sorted newest first: read the first 10 rows', [`orders_by_customer/${c}`]),
      ], 1);
    },
    also(p) {
      const buyers = uniq(rep.itemsByProduct.filter((r) => r.product_id === p).map((r) => r.customer_id)).sort();
      const rows = buyers.flatMap((c) => rep.productsByCustomer.filter((r) => r.customer_id === c).map((r) => ({ customer: c, product: r.product_id })));
      return done(alsoFrom(boughtBy(rows), p), [
        step('read', 'items_by_product: who bought this', [`items_by_product/${p}`]),
        step('read', 'products_by_customer: what each buyer bought', buyers.map((c) => `products_by_customer/${c}`)),
      ], 2);
    },
    price(p, newPrice) {
      const next = structuredClone(rep);
      const hit = next.ordersById.filter((r) => r.product_id === p);
      for (const r of hit) r.price = newPrice;
      next.products.find((x) => x.id === p)!.price = newPrice;
      return {
        ...done(null, [
          step('read', 'items_by_product: which orders hold it', [`items_by_product/${p}`]),
          step('write', 'rewrite the price in each orders_by_id row that copied it', hit.map((r) => `orders_by_id/${r.order_id}`)),
          step('write', 'the catalogue price', [`products/${p}`]),
        ], 2, 1 + hit.length),
        after: wide(next),
      };
    },
    groups: () => [
      { title: 'orders_by_id (partition: order_id)', items: uniq(rep.ordersById.map((r) => r.order_id)).map((id) => ({ id: `orders_by_id/${id}`, label: String(id) })) },
      { title: 'orders_by_customer (partition: customer_id)', items: CUSTOMERS.map((c) => ({ id: `orders_by_customer/${c.id}`, label: c.id })) },
      { title: 'items_by_product (partition: product_id)', items: PRODUCTS.map((x) => ({ id: `items_by_product/${x.id}`, label: x.id })) },
      { title: 'products_by_customer (partition: customer_id)', items: CUSTOMERS.map((c) => ({ id: `products_by_customer/${c.id}`, label: c.id })) },
      { title: 'products', items: PRODUCTS.map((x) => ({ id: `products/${x.id}`, label: x.id })) },
    ],
    storage(id) {
      const rows = rep.ordersById.filter((r) => r.order_id === id);
      const mine = rep.ordersByCustomer.find((r) => r.order_id === id)!;
      return {
        embedded: [],
        lines: [
          `orders_by_id  PARTITION order_id = ${id}`,
          ...rows.map((r) => `  line ${r.line_no} | ${r.product_id} | ${r.name} | ${r.price} | qty ${r.qty}`),
          `orders_by_customer  PARTITION customer_id = ${mine.customer_id}, CLUSTERING order_date DESC`,
          `  ${mine.order_date} | order ${id}`,
          `items_by_product  PARTITION product_id, one row per order line`,
          ...rows.map((r) => `  ${r.product_id} | order ${id}`),
        ],
      };
    },
  };
}

export function buildWide(): WideRep {
  const ordersByCustomer = ORDERS.map((o) => ({ customer_id: o.customer, order_date: o.date, order_id: o.id }))
    .sort((a, b) => a.customer_id.localeCompare(b.customer_id) || (a.order_date < b.order_date ? 1 : a.order_date > b.order_date ? -1 : b.order_id - a.order_id));
  return {
    ordersById: ORDERS.flatMap((o) => o.lines.map((l, k) => ({ order_id: o.id, line_no: k + 1, product_id: l.product, name: productName(l.product), price: PRODUCTS.find((p) => p.id === l.product)!.price, qty: l.qty }))),
    ordersByCustomer,
    itemsByProduct: ORDERS.flatMap((o) => o.lines.map((l) => ({ product_id: l.product, order_id: o.id, customer_id: o.customer }))),
    productsByCustomer: uniq(ORDERS.flatMap((o) => o.lines.map((l) => `${o.customer}|${l.product}`))).sort().map((s) => ({ customer_id: s.split('|')[0], product_id: s.split('|')[1] })),
    products: PRODUCTS.map((p) => ({ ...p })),
  };
}

// ── Graph ───────────────────────────────────────────────────────────────

export interface GNode {
  id: string;
  kind: 'customer' | 'order' | 'product';
  label: string;
  date?: string;
  price?: number;
}
export interface GEdge {
  from: string;
  to: string;
  kind: 'PLACED' | 'CONTAINS' | 'BOUGHT';
  qty?: number;
}
export interface GraphRep {
  nodes: GNode[];
  edges: GEdge[];
}

function graph(rep: GraphRep): Engine {
  const node = (id: string) => rep.nodes.find((n) => n.id === id)!;
  const out = (id: string, kind: GEdge['kind']) => rep.edges.filter((e) => e.from === id && e.kind === kind);
  const into = (id: string, kind: GEdge['kind']) => rep.edges.filter((e) => e.to === id && e.kind === kind);
  return {
    id: 'graph',
    order(id) {
      const hops = out(`o:${id}`, 'CONTAINS');
      return done(asLines(hops.map((e) => ({ product: e.to.slice(2), qty: e.qty!, price: node(e.to).price! }))), [
        step('read', 'find the order node', [`o:${id}`]),
        step('read', 'follow each CONTAINS edge to its product', hops.map((e) => e.to)),
      ], 1);
    },
    last10(c) {
      const placed = out(`c:${c}`, 'PLACED').map((e) => ({ id: Number(e.to.slice(2)), date: node(e.to).date! }));
      return done(byDateDesc(placed).slice(0, LIMIT).map((o) => o.id), [
        step('read', 'find the customer node', [`c:${c}`]),
        step('read', 'follow every PLACED edge (edges have no date order to exploit here), then sort', placed.map((o) => `o:${o.id}`)),
      ], 1);
    },
    also(p) {
      // A node is read together with its edge list, so a buyer's BOUGHT edges come with the buyer: no extra hop per product.
      const buyers = into(`p:${p}`, 'BOUGHT').map((e) => e.from).sort();
      const hops = buyers.flatMap((b) => out(b, 'BOUGHT').map((e) => ({ customer: b.slice(2), product: e.to.slice(2) })));
      return done(alsoFrom(boughtBy(hops), p), [
        step('read', 'find the product node: its edge list names the buyers (BOUGHT edges, followed backwards)', [`p:${p}`]),
        step('read', "read each buyer's node: its BOUGHT edges are the products they bought", buyers),
      ], 1);
    },
    price(p, newPrice) {
      const next = structuredClone(rep);
      next.nodes.find((n) => n.id === `p:${p}`)!.price = newPrice;
      return { ...done(null, [step('write', 'SET price on the one product node', [`p:${p}`])], 1, 1), after: graph(next) };
    },
    groups: () => [
      { title: 'customers', items: rep.nodes.filter((n) => n.kind === 'customer').map((n) => ({ id: n.id, label: n.label })) },
      { title: 'orders', items: rep.nodes.filter((n) => n.kind === 'order').map((n) => ({ id: n.id, label: n.label })) },
      { title: 'products', items: rep.nodes.filter((n) => n.kind === 'product').map((n) => ({ id: n.id, label: n.label })) },
    ],
    storage(id) {
      const o = node(`o:${id}`);
      const c = into(o.id, 'PLACED')[0].from;
      return {
        embedded: [],
        lines: [
          `(${node(c).label})-[:PLACED]->(order ${id}, ${o.date})`,
          ...out(o.id, 'CONTAINS').map((e) => `(order ${id})-[:CONTAINS {qty: ${e.qty}}]->(${node(e.to).label}, price ${node(e.to).price})`),
          `(${node(c).label})-[:BOUGHT]->(each product above)   a shortcut edge, kept up to date by the app`,
        ],
      };
    },
  };
}

export function buildGraph(): GraphRep {
  const nodes: GNode[] = [
    ...CUSTOMERS.map((c) => ({ id: `c:${c.id}`, kind: 'customer' as const, label: `${c.id} ${c.name}` })),
    ...ORDERS.map((o) => ({ id: `o:${o.id}`, kind: 'order' as const, label: String(o.id), date: o.date })),
    ...PRODUCTS.map((p) => ({ id: `p:${p.id}`, kind: 'product' as const, label: `${p.id} ${p.name}`, price: p.price })),
  ];
  const edges: GEdge[] = [
    ...ORDERS.map((o) => ({ from: `c:${o.customer}`, to: `o:${o.id}`, kind: 'PLACED' as const })),
    ...ORDERS.flatMap((o) => o.lines.map((l) => ({ from: `o:${o.id}`, to: `p:${l.product}`, kind: 'CONTAINS' as const, qty: l.qty }))),
    ...uniq(ORDERS.flatMap((o) => o.lines.map((l) => `${o.customer}|${l.product}`))).sort().map((s) => ({ from: `c:${s.split('|')[0]}`, to: `p:${s.split('|')[1]}`, kind: 'BOUGHT' as const })),
  ];
  return { nodes, edges };
}

// ── Building and running ────────────────────────────────────────────────

export function buildEngine(model: ModelId, opts: { prepared?: boolean } = {}): Engine {
  const prepared = opts.prepared ?? false;
  switch (model) {
    case 'relational':
      return relational(buildRelational(prepared));
    case 'document':
      return document(buildDocument(prepared));
    case 'kv':
      return kvStore(buildKv(prepared));
    case 'wide':
      return wide(buildWide());
    case 'graph':
      return graph(buildGraph());
  }
}

export interface Params {
  order: number;
  customer: string;
  product: string;
  newPrice: number;
}

export function runQuery(e: Engine, q: QueryId, p: Params): Result<unknown> {
  switch (q) {
    case 'order':
      return e.order(p.order);
    case 'last10':
      return e.last10(p.customer);
    case 'also':
      return e.also(p.product);
    case 'price':
      return e.price(p.product, p.newPrice);
  }
}

/** Cheapest first: the price update ranks by copies, then lookups; the reads by lookups. */
export const costKey = (q: QueryId, r: Result<unknown>): number => (q === 'price' ? (r.copies ?? 0) * 1000 + r.lookups : r.lookups);

export function extremes(q: QueryId, runs: Record<ModelId, Result<unknown>>): { cheapest: ModelId[]; costliest: ModelId[] } {
  const ids = MODELS.map((m) => m.id);
  const keys = ids.map((id) => costKey(q, runs[id]));
  const lo = Math.min(...keys);
  const hi = Math.max(...keys);
  if (lo === hi) return { cheapest: [], costliest: [] };
  return { cheapest: ids.filter((_, i) => keys[i] === lo), costliest: ids.filter((_, i) => keys[i] === hi) };
}
