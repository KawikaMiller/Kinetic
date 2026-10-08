/**
 * The schema explorer's state: which fields of user { orders { product } } are ticked. Ticking a
 * field switches its parents on, and un-ticking the last field of a selection switches that
 * selection off, so the query is always valid (a GraphQL selection can't be empty).
 */
import type { Sel } from './schema';

export interface Pick {
  email: boolean;
  orders: boolean;
  /** The `last: n` argument of orders. */
  n: number;
  total: boolean;
  status: boolean;
  product: boolean;
  productName: boolean;
  productPrice: boolean;
}

export type PickKey = 'email' | 'orders' | 'total' | 'status' | 'product' | 'productName' | 'productPrice';

/** The screen from the first scene, all it needs: name, then each order's total and product name. */
export const DEFAULT_PICK: Pick = { email: false, orders: true, n: 3, total: true, status: false, product: true, productName: true, productPrice: false };

/** List lengths the learner can pick for orders(last: n). */
export const ORDER_COUNTS = [0, 1, 3, 10, 50];

/** Flip one field, keeping the selection valid. `name` is always selected. */
export function toggle(p: Pick, key: PickKey): Pick {
  const next = { ...p, [key]: !p[key] };
  if (next[key]) {
    // Ticking a field brings its parents with it, and a parent with nothing under it gets its first field.
    if (key === 'productName' || key === 'productPrice') next.product = true;
    if (key === 'total' || key === 'status' || key === 'product') next.orders = true;
    if (key === 'orders' && !next.total && !next.status && !next.product) next.total = true;
    if (key === 'product' && !next.productName && !next.productPrice) next.productName = true;
    if (next.product && !next.productName && !next.productPrice) next.productName = true;
    if (key === 'productName' || key === 'productPrice') next.orders = true;
  } else {
    if (key === 'orders') return { ...p, orders: false, total: false, status: false, product: false, productName: false, productPrice: false };
    if (key === 'product') return { ...next, productName: false, productPrice: false, ...(!next.total && !next.status ? { orders: false } : {}) };
    if ((key === 'productName' || key === 'productPrice') && !next.productName && !next.productPrice) {
      next.product = false;
      if (!next.total && !next.status) next.orders = false;
    }
    if ((key === 'total' || key === 'status') && !next.total && !next.status && !next.product) next.orders = false;
  }
  return next;
}

/** The query the ticks stand for. */
export function queryFor(p: Pick): Sel[] {
  const product: Sel[] = [...(p.productName ? [{ field: 'name' }] : []), ...(p.productPrice ? [{ field: 'price' }] : [])];
  const orderFields: Sel[] = [
    ...(p.total ? [{ field: 'total' }] : []),
    ...(p.status ? [{ field: 'status' }] : []),
    ...(p.product ? [{ field: 'product', children: product }] : []),
  ];
  const userFields: Sel[] = [
    { field: 'name' },
    ...(p.email ? [{ field: 'email' }] : []),
    ...(p.orders ? [{ field: 'orders', args: { last: p.n }, children: orderFields }] : []),
  ];
  return [{ field: 'user', args: { id: 1 }, children: userFields }];
}
