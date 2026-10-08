// The one shop dataset every model is built from (pure transforms in engines.ts), plus an
// independent brute-force reference for each query's answer. Prices are in pence.

export interface Product {
  id: string;
  name: string;
  price: number;
}
export interface Customer {
  id: string;
  name: string;
}
export interface CanonOrder {
  id: number;
  customer: string;
  date: string;
  /** Each product at most once per order. */
  lines: { product: string; qty: number }[];
}

export const PRODUCTS: readonly Product[] = [
  { id: 'P1', name: 'pen', price: 150 },
  { id: 'P2', name: 'ink', price: 400 },
  { id: 'P3', name: 'paper', price: 600 },
  { id: 'P4', name: 'stapler', price: 900 },
];

export const CUSTOMERS: readonly Customer[] = [
  { id: 'C1', name: 'Ada' },
  { id: 'C2', name: 'Linus' },
  { id: 'C3', name: 'Grace' },
];

const order = (id: number, customer: string, date: string, ...lines: [string, number][]): CanonOrder => ({
  id, customer, date, lines: lines.map(([product, qty]) => ({ product, qty })),
});

/** Sorted by id and by date together. Ada has 12 orders: more than the 10 "last orders" ask for. */
export const ORDERS: readonly CanonOrder[] = [
  order(1031, 'C1', '2026-01-05', ['P1', 1]),
  order(1032, 'C1', '2026-01-19', ['P2', 1], ['P1', 2]),
  order(1033, 'C2', '2026-01-22', ['P1', 1], ['P3', 1]),
  order(1034, 'C1', '2026-02-02', ['P3', 1]),
  order(1035, 'C1', '2026-02-14', ['P1', 1]),
  order(1036, 'C3', '2026-02-20', ['P4', 1], ['P2', 1]),
  order(1037, 'C1', '2026-03-03', ['P2', 2]),
  order(1038, 'C1', '2026-03-17', ['P1', 1], ['P3', 1]),
  order(1039, 'C2', '2026-03-25', ['P2', 1]),
  order(1040, 'C1', '2026-04-01', ['P1', 3]),
  order(1041, 'C1', '2026-04-15', ['P4', 1]),
  order(1042, 'C1', '2026-04-28', ['P1', 1], ['P2', 1]),
  order(1043, 'C1', '2026-05-09', ['P3', 2]),
  order(1044, 'C1', '2026-05-21', ['P1', 1]),
  order(1045, 'C2', '2026-05-30', ['P1', 2]),
  order(1046, 'C1', '2026-06-10', ['P2', 1]),
];

export const LIMIT = 10;
export const EXAMPLE_ORDER = 1042;
export const EXAMPLE_CUSTOMER = 'C1';

export interface Line {
  product: string;
  qty: number;
  price: number;
}
export interface Also {
  product: string;
  customers: number;
}

export const money = (p: number) => `£${(p / 100).toFixed(2)}`;
export const productName = (id: string) => PRODUCTS.find((p) => p.id === id)!.name;
export const sortLines = (lines: Line[]) => [...lines].sort((a, b) => a.product.localeCompare(b.product));
export const sortAlso = (rows: Also[]) => [...rows].sort((a, b) => b.customers - a.customers || a.product.localeCompare(b.product));

// ── The reference answers, straight off the canonical lists (no model's data structures) ──

export function refOrder(id: number, prices: Record<string, number> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]))): Line[] {
  const o = ORDERS.find((x) => x.id === id)!;
  return sortLines(o.lines.map((l) => ({ product: l.product, qty: l.qty, price: prices[l.product] })));
}

export function refLast(customer: string): number[] {
  return ORDERS.filter((o) => o.customer === customer)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, LIMIT)
    .map((o) => o.id);
}

/** For each other product: how many distinct customers bought both it and `product`. */
export function refAlso(product: string): Also[] {
  const bought = (c: string) => new Set(ORDERS.filter((o) => o.customer === c).flatMap((o) => o.lines.map((l) => l.product)));
  const buyers = CUSTOMERS.filter((c) => bought(c.id).has(product));
  return sortAlso(PRODUCTS.filter((p) => p.id !== product)
    .map((p) => ({ product: p.id, customers: buyers.filter((c) => bought(c.id).has(p.id)).length }))
    .filter((r) => r.customers > 0));
}
