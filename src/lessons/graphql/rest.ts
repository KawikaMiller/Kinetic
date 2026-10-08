/**
 * One mobile screen, two ways: a user's name and the last 3 orders with their product names.
 * REST fetches the resources a typical API has (a user, a list of the user's orders, each product)
 * and the client picks out what it needs; GraphQL sends one query and gets that shape back.
 * Sizes are the real JSON of the fixture's records; timings are illustrative (a fixed round
 * trip, and the executor's database time for GraphQL).
 */
import { lastOrders, productById, userById, type Order } from './data';
import { DB_CALL_MS, execute, type Execution, type ExecError, type Json } from './exec';
import { printQuery, type Sel } from './schema';

export const SCREEN_USER = 1;
export const SCREEN_ORDERS = 3;
/** Illustrative round-trip time, ms. */
export const RTT_MS = 80;

/** What the screen needs, as a query. */
export const SCREEN_QUERY: Sel[] = [
  {
    field: 'user', args: { id: SCREEN_USER },
    children: [{ field: 'name' }, { field: 'orders', args: { last: SCREEN_ORDERS }, children: [{ field: 'total' }, { field: 'product', children: [{ field: 'name' }] }] }],
  },
];

const bytesOf = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

export interface RestRequest {
  id: string;
  path: string;
  status: 200 | 503;
  /** Response body bytes. */
  bytes: number;
  /** The part of it the screen uses: its name, an order's total and product id, a product's name. */
  usefulBytes: number;
  /** When it left, ms. */
  start: number;
  end: number;
  /** Requests in a wave go out together. */
  wave: 1 | 2;
}

export interface RestPlan {
  requests: RestRequest[];
  totalMs: number;
  bytes: number;
  usefulBytes: number;
}

const ERROR_BODY = { error: 'service unavailable' };

/** REST: the user and their latest orders in parallel, then each order's product in parallel. */
export function planRest(failProductId: number | null): RestPlan {
  const user = userById(SCREEN_USER)!;
  const orders: Order[] = lastOrders(SCREEN_USER, SCREEN_ORDERS);
  const round = RTT_MS + DB_CALL_MS;
  const requests: RestRequest[] = [
    { id: 'user', path: `GET /users/${SCREEN_USER}`, status: 200, bytes: bytesOf(user), usefulBytes: bytesOf({ name: user.name }), start: 0, end: round, wave: 1 },
    {
      id: 'orders', path: `GET /users/${SCREEN_USER}/orders?limit=${SCREEN_ORDERS}`, status: 200, bytes: bytesOf(orders),
      usefulBytes: bytesOf(orders.map((o) => ({ total: o.total, productId: o.productId }))), start: 0, end: round, wave: 1,
    },
    ...orders.map((o, i): RestRequest => {
      const product = productById(o.productId)!;
      const failed = failProductId === o.productId;
      return {
        id: `product-${i}`, path: `GET /products/${o.productId}`, status: failed ? 503 : 200, bytes: bytesOf(failed ? ERROR_BODY : product),
        usefulBytes: failed ? 0 : bytesOf({ name: product.name }), start: round, end: 2 * round, wave: 2,
      };
    }),
  ];
  return { requests, totalMs: 2 * round, bytes: requests.reduce((s, r) => s + r.bytes, 0), usefulBytes: requests.reduce((s, r) => s + r.usefulBytes, 0) };
}

export interface GraphqlPlan {
  /** The POST body: {"query": "..."}. */
  requestBytes: number;
  responseBytes: number;
  /** HTTP status of the one response: 200 even when a field failed. */
  status: 200;
  start: number;
  end: number;
  execution: Execution;
  body: { data: Json; errors?: ExecError[] };
}

/** GraphQL: one POST; the server resolves the whole tree (DataLoader on, as a production server would). */
export function planGraphql(failProductId: number | null): GraphqlPlan {
  const execution = execute(SCREEN_QUERY, { dataLoader: true, failProductId });
  const body: GraphqlPlan['body'] = execution.errors.length ? { data: execution.data, errors: execution.errors } : { data: execution.data };
  return {
    requestBytes: bytesOf({ query: printQuery(SCREEN_QUERY).join('\n') }),
    responseBytes: bytesOf(body),
    status: 200,
    start: 0,
    end: RTT_MS + execution.totalMs,
    execution,
    body,
  };
}
