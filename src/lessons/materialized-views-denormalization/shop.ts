import { mulberry32 } from '../../core/random';

/**
 * A toy shop and four ways to answer one dashboard question ("revenue per customer, units per product"):
 * a live join, a materialized view refreshed in full, a materialized view maintained incrementally, and a
 * denormalised copy of the product name stored in each order item. Every row a read or write touches is counted
 * where it happens (a plain counter in the loops below), in one unit: rows read plus rows written.
 */

export interface Product { id: number; name: string; price: number }
export interface Order { id: number; customerId: number }
export interface Item { id: number; orderId: number; productId: number; qty: number; unitPrice: number; nameCopy: string }

export interface World {
  customers: readonly string[];
  products: readonly Product[];
  orders: readonly Order[];
  items: readonly Item[];
  nextOrder: number;
  nextItem: number;
}

export const CUSTOMERS = ['Ada', 'Ben', 'Cy', 'Dee', 'Eli'] as const;
export const PRODUCTS: readonly Product[] = [
  { id: 1, name: 'Widget', price: 5 }, { id: 2, name: 'Gadget', price: 12 }, { id: 3, name: 'Gizmo', price: 8 },
  { id: 4, name: 'Doohickey', price: 20 }, { id: 5, name: 'Sprocket', price: 3 }, { id: 6, name: 'Flange', price: 15 },
];
export const SEED_ORDERS = 12;
export const MAX_QTY = 4;

/** Seeded world: 5 customers, 6 products and 12 orders of one or two items each. */
export function seededWorld(seed: number): World {
  const rnd = mulberry32(seed);
  const pick = (n: number) => 1 + Math.floor(rnd() * n);
  const orders: Order[] = [];
  const items: Item[] = [];
  for (let o = 1; o <= SEED_ORDERS; o++) {
    orders.push({ id: o, customerId: pick(CUSTOMERS.length) });
    for (let k = 0; k < pick(2); k++) {
      const product = PRODUCTS[pick(PRODUCTS.length) - 1];
      items.push({ id: items.length + 1, orderId: o, productId: product.id, qty: pick(MAX_QTY), unitPrice: product.price, nameCopy: product.name });
    }
  }
  return { customers: CUSTOMERS, products: PRODUCTS, orders, items, nextOrder: SEED_ORDERS + 1, nextItem: items.length + 1 };
}

export type Write =
  | { kind: 'place'; customerId: number; productId: number; qty: number }
  | { kind: 'refund'; itemId: number }
  | { kind: 'rename'; productId: number; name: string };

export type Strategy = 'live' | 'full' | 'incremental' | 'copy';
/** What a rename does to the copied names: nothing, update every copy in the same transaction, or recompute from the source on read. */
export type CopyFix = 'none' | 'update' | 'recompute';

export const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'live', label: 'Live join' }, { value: 'full', label: 'View, full refresh' }, { value: 'incremental', label: 'View, incremental' }, { value: 'copy', label: 'Denormalised copy' },
];

export interface Config {
  /** Operations (reads and writes alike) between full refreshes. */
  refreshEvery: number;
  fix: CopyFix;
  /** The planted bug: the incremental rule forgets to subtract refunds. */
  brokenRefund?: boolean;
}

/** What the dashboard shows: revenue per customer id, and units per product name (the name as that strategy knows it). */
export interface Dashboard {
  revenue: Readonly<Record<number, number>>;
  units: Readonly<Record<string, number>>;
}

/** The aggregate rows of a materialized view. */
export interface Aggregates {
  revenue: Readonly<Record<number, number>>;
  units: Readonly<Record<number, { name: string; units: number }>>;
}

/** Counts rows read or written, where the loops below do it. */
export class Counter {
  n = 0;
}

export interface State {
  world: World;
  /** The materialized view's rows (full refresh and incremental), else null. */
  mv: Aggregates | null;
  /** Writes since the view was last rebuilt, for the staleness readout. */
  writesSince: number;
  /** Operations so far: the refresh clock. */
  ops: number;
}

// ── Reads ─────────────────────────────────────────────────────────────

/** The live join: scan each table once, then join in memory. Touches |items| + |orders| + |products| rows. */
export function liveDashboard(w: World, c: Counter): Dashboard {
  const price = new Map<number, string>();
  const customerOf = new Map<number, number>();
  c.n += w.items.length;
  c.n += w.orders.length;
  for (const o of w.orders) customerOf.set(o.id, o.customerId);
  c.n += w.products.length;
  for (const p of w.products) price.set(p.id, p.name);
  return summarise(w, (it) => price.get(it.productId)!, customerOf);
}

function summarise(w: World, nameOf: (it: Item) => string, customerOf: ReadonlyMap<number, number>): Dashboard {
  const revenue: Record<number, number> = {};
  w.customers.forEach((_, i) => (revenue[i + 1] = 0));
  const units: Record<string, number> = {};
  w.products.forEach((p) => (units[p.name] = 0));
  for (const it of w.items) {
    const cust = customerOf.get(it.orderId)!;
    revenue[cust] += it.qty * it.unitPrice;
    const name = nameOf(it);
    units[name] = (units[name] ?? 0) + it.qty;
  }
  return { revenue, units };
}

/** The copied-name read: scan items and orders only; units are grouped by the name stored in each item. */
function copyDashboard(w: World, c: Counter): Dashboard {
  const customerOf = new Map<number, number>();
  c.n += w.items.length;
  c.n += w.orders.length;
  for (const o of w.orders) customerOf.set(o.id, o.customerId);
  return summarise(w, (it) => it.nameCopy, customerOf);
}

/** Aggregates from the base tables, by a full recomputation (what a refresh does). Counts the reads; the view's row writes are counted by the caller. */
export function aggregatesOf(w: World, c: Counter): Aggregates {
  const customerOf = new Map<number, number>();
  c.n += w.items.length;
  c.n += w.orders.length;
  for (const o of w.orders) customerOf.set(o.id, o.customerId);
  c.n += w.products.length;
  const revenue: Record<number, number> = {};
  w.customers.forEach((_, i) => (revenue[i + 1] = 0));
  const units: Record<number, { name: string; units: number }> = {};
  w.products.forEach((p) => (units[p.id] = { name: p.name, units: 0 }));
  for (const it of w.items) {
    revenue[customerOf.get(it.orderId)!] += it.qty * it.unitPrice;
    units[it.productId].units += it.qty;
  }
  return { revenue, units };
}

export const dashboardOf = (a: Aggregates): Dashboard => ({
  revenue: a.revenue,
  units: Object.fromEntries(Object.values(a.units).map((u) => [u.name, u.units])),
});

/** Rows in the materialized view: one per customer and one per product. */
export const viewRows = (w: World): number => w.customers.length + w.products.length;

export interface ReadResult {
  dashboard: Dashboard;
  touched: number;
  state: State;
}

/** One dashboard read. A read is an operation too: it can trigger the full refresh. */
export function read(strategy: Strategy, cfg: Config, s: State): ReadResult {
  const c = new Counter();
  let dashboard: Dashboard;
  if (strategy === 'live' || (strategy === 'copy' && cfg.fix === 'recompute')) dashboard = liveDashboard(s.world, c);
  else if (strategy === 'copy') dashboard = copyDashboard(s.world, c);
  else {
    c.n += viewRows(s.world);
    dashboard = dashboardOf(s.mv!);
  }
  const after = tick(strategy, cfg, s, c);
  return { dashboard, touched: c.n, state: after };
}

// ── Writes and refreshes ──────────────────────────────────────────────

/** Advance the refresh clock; every `refreshEvery` operations a full-refresh view is rebuilt (reads the tables, writes every view row). */
function tick(strategy: Strategy, cfg: Config, s: State, c: Counter): State {
  const ops = s.ops + 1;
  if (strategy === 'full' && ops % cfg.refreshEvery === 0) {
    const mv = aggregatesOf(s.world, c);
    c.n += viewRows(s.world);
    return { ...s, ops, mv, writesSince: 0 };
  }
  return { ...s, ops };
}

export function initState(strategy: Strategy, w: World): State {
  return { world: w, mv: strategy === 'full' || strategy === 'incremental' ? aggregatesOf(w, new Counter()) : null, writesSince: 0, ops: 0 };
}

export interface WriteResult {
  touched: number;
  state: State;
}

/** One write. Base rows are counted as the engine writes them; the view or copy maintenance adds its own rows. */
export function write(strategy: Strategy, cfg: Config, s: State, op: Write): WriteResult {
  const c = new Counter();
  const w = s.world;
  let world: World = w;
  let mv = s.mv;
  const touchAggregate = (rows: number) => (c.n += 2 * rows);
  if (op.kind === 'place') {
    const product = w.products.find((p) => p.id === op.productId)!;
    c.n += 2;
    world = {
      ...w,
      orders: [...w.orders, { id: w.nextOrder, customerId: op.customerId }],
      items: [...w.items, { id: w.nextItem, orderId: w.nextOrder, productId: op.productId, qty: op.qty, unitPrice: product.price, nameCopy: product.name }],
      nextOrder: w.nextOrder + 1,
      nextItem: w.nextItem + 1,
    };
    if (strategy === 'incremental') {
      touchAggregate(2);
      mv = { revenue: { ...mv!.revenue, [op.customerId]: mv!.revenue[op.customerId] + op.qty * product.price }, units: { ...mv!.units, [op.productId]: { ...mv!.units[op.productId], units: mv!.units[op.productId].units + op.qty } } };
    }
  } else if (op.kind === 'refund') {
    const item = w.items.find((i) => i.id === op.itemId)!;
    c.n += 2;
    world = { ...w, items: w.items.filter((i) => i.id !== op.itemId) };
    if (strategy === 'incremental') {
      c.n += 1;
      touchAggregate(2);
      if (!cfg.brokenRefund) {
        const customerId = w.orders.find((o) => o.id === item.orderId)!.customerId;
        mv = { revenue: { ...mv!.revenue, [customerId]: mv!.revenue[customerId] - item.qty * item.unitPrice }, units: { ...mv!.units, [item.productId]: { ...mv!.units[item.productId], units: mv!.units[item.productId].units - item.qty } } };
      }
    }
  } else {
    c.n += 1;
    const copies = w.items.filter((i) => i.productId === op.productId).length;
    const fixCopies = strategy === 'copy' && cfg.fix === 'update';
    world = {
      ...w,
      products: w.products.map((p) => (p.id === op.productId ? { ...p, name: op.name } : p)),
      items: fixCopies ? w.items.map((i) => (i.productId === op.productId ? { ...i, nameCopy: op.name } : i)) : w.items,
    };
    if (fixCopies) c.n += w.items.length + copies;
    if (strategy === 'incremental') {
      touchAggregate(1);
      mv = { ...mv!, units: { ...mv!.units, [op.productId]: { ...mv!.units[op.productId], name: op.name } } };
    }
  }
  const next = tick(strategy, cfg, { world, mv, writesSince: s.writesSince + 1, ops: s.ops }, c);
  return { touched: c.n, state: next };
}

// ── Staleness ─────────────────────────────────────────────────────────

/** The dashboard a strategy would show right now, without reading (no clock tick, no counting). */
export function shown(strategy: Strategy, cfg: Config, s: State): Dashboard {
  const c = new Counter();
  if (strategy === 'live' || (strategy === 'copy' && cfg.fix === 'recompute')) return liveDashboard(s.world, c);
  if (strategy === 'copy') return copyDashboard(s.world, c);
  return dashboardOf(s.mv!);
}

export interface Difference {
  what: string;
  shown: number | null;
  live: number | null;
}

/** Where what is shown differs from the live query: rows of either answer that are missing from the other or disagree. */
export function differences(strategy: Strategy, cfg: Config, s: State): Difference[] {
  const live = liveDashboard(s.world, new Counter());
  const view = shown(strategy, cfg, s);
  const out: Difference[] = [];
  const names = (rec: Readonly<Record<string, number>>) => Object.keys(rec);
  for (const k of new Set([...Object.keys(live.revenue), ...Object.keys(view.revenue)])) {
    const a = view.revenue[Number(k)] ?? null;
    const b = live.revenue[Number(k)] ?? null;
    if (a !== b) out.push({ what: `revenue of ${s.world.customers[Number(k) - 1]}`, shown: a, live: b });
  }
  for (const k of new Set([...names(live.units), ...names(view.units)])) {
    const a = view.units[k] ?? null;
    const b = live.units[k] ?? null;
    if (a !== b) out.push({ what: `units of ${k}`, shown: a, live: b });
  }
  return out;
}

/** Items whose copied product name no longer matches the product: the update anomaly, counted. */
export const inconsistentCopies = (w: World): number => w.items.filter((i) => w.products.find((p) => p.id === i.productId)!.name !== i.nameCopy).length;
