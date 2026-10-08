import { describe, expect, it } from 'vitest';
import { lastOrders, productById, userById } from './data';
import { execute } from './exec';
import { DEFAULT_PICK, queryFor } from './picker';
import { RTT_MS, SCREEN_ORDERS, SCREEN_QUERY, SCREEN_USER, planGraphql, planRest } from './rest';
import { SHOWN_ITEMS, buildTree } from './resolverTree';

const json = (v: unknown) => JSON.stringify(v);
const failId = lastOrders(SCREEN_USER, SCREEN_ORDERS)[1].productId;

describe('REST: 1 + 1 + 3 requests', () => {
  const plan = planRest(null);

  it('fetches the user, the user\'s orders, then each order\'s product', () => {
    expect(plan.requests.map((r) => r.path)).toEqual([
      'GET /users/1', 'GET /users/1/orders?limit=3',
      ...lastOrders(1, 3).map((o) => `GET /products/${o.productId}`),
    ]);
    expect(plan.requests.map((r) => r.wave)).toEqual([1, 1, 2, 2, 2]);
  });

  it('response sizes are the real JSON of the fixture records', () => {
    const [user, orders, ...products] = plan.requests;
    expect(user.bytes).toBe(json(userById(1)).length);
    expect(orders.bytes).toBe(json(lastOrders(1, 3)).length);
    products.forEach((p, i) => expect(p.bytes).toBe(json(productById(lastOrders(1, 3)[i].productId)).length));
    expect(plan.bytes).toBe(plan.requests.reduce((s, r) => s + r.bytes, 0));
  });

  it('counts only what the screen uses as useful: {"name":"Ada Okafor"} is 21 bytes (hand count), the rest is unused', () => {
    expect(plan.requests[0].usefulBytes).toBe(21);
    expect(plan.requests[3].usefulBytes).toBe(json({ name: productById(lastOrders(1, 3)[1].productId)!.name }).length);
    for (const r of plan.requests) expect(r.usefulBytes).toBeLessThan(r.bytes);
    expect(plan.bytes - plan.usefulBytes).toBeGreaterThan(plan.usefulBytes);
  });

  it('takes two round trips: both waves of requests go out together (hand-worked 2 × (80 + 20) = 200 ms)', () => {
    expect(plan.totalMs).toBe(2 * (RTT_MS + 20));
    expect(plan.totalMs).toBe(200);
    expect(plan.requests.filter((r) => r.wave === 2).every((r) => r.start === 100 && r.end === 200)).toBe(true);
  });
});

describe('GraphQL: one request, exactly the requested shape', () => {
  const plan = planGraphql(null);

  it('the response is the screen\'s projection of the fixture and nothing more', () => {
    const orders = lastOrders(1, 3);
    expect(plan.body).toEqual({
      data: { user: { name: userById(1)!.name, orders: orders.map((o) => ({ total: o.total, product: { name: productById(o.productId)!.name } })) } },
    });
    expect(plan.responseBytes).toBe(json(plan.body).length);
  });

  it('is smaller than the REST responses together, and its query costs bytes the GETs don\'t', () => {
    expect(plan.responseBytes).toBeLessThan(planRest(null).bytes);
    expect(plan.requestBytes).toBeGreaterThan(json({ query: '' }).length);
  });

  it('takes one round trip plus the server\'s database time: 80 + 60 = 140 ms (user, orders, one batched product call)', () => {
    expect(plan.end).toBe(RTT_MS + 60);
    expect(plan.execution.dbCalls.map((c) => c.kind)).toEqual(['users', 'orders', 'products']);
  });
});

describe('when one product fails', () => {
  it('REST: that one request is a 503 with a tiny body and no useful bytes; the others are 200', () => {
    const plan = planRest(failId);
    const failed = plan.requests.filter((r) => r.status === 503);
    expect(failed).toHaveLength(1);
    expect(failed[0].path).toBe(`GET /products/${failId}`);
    expect(failed[0].usefulBytes).toBe(0);
    expect(failed[0].bytes).toBe(json({ error: 'service unavailable' }).length);
    expect(plan.requests.filter((r) => r.status === 200)).toHaveLength(4);
  });

  it('GraphQL: still HTTP 200, with that field null and an entry in errors', () => {
    const plan = planGraphql(failId);
    expect(plan.status).toBe(200);
    expect(plan.body.errors).toEqual([{ message: 'product service timed out', path: ['user', 'orders', 1, 'product'] }]);
    const orders = (plan.body.data as { user: { orders: { product: unknown }[] } }).user.orders;
    expect(orders.map((o) => o.product === null)).toEqual([false, true, false]);
    expect(planGraphql(null).body.errors).toBeUndefined();
  });
});

describe('the resolver tree', () => {
  const tree = (n: number, loader: boolean, fail: number | null = null) => buildTree(execute(queryFor({ ...DEFAULT_PICK, n }), { dataLoader: loader, failProductId: fail }));
  const titles = (t: ReturnType<typeof buildTree>) => [...t.nodes.values()].map((n) => n.title);
  const orders = (t: ReturnType<typeof buildTree>) => [...t.nodes.values()].find((n) => n.title === 'User.orders')!;

  it('N = 3: Query.user, User.orders, three orders each with Order.product (8 nodes over 3 levels)', () => {
    const t = tree(3, false);
    expect(titles(t)).toEqual(['Query.user', 'User.orders', 'Order 1', 'Order.product', 'Order 2', 'Order.product', 'Order 3', 'Order.product']);
    expect(t.nodes.get(t.root)!.sub).toBe('name');
    expect(t.maxLevel).toBe(2);
    expect(t.hidden).toBe(0);
    expect([...t.nodes.values()].map((n) => n.level)).toEqual([0, 1, 2, 2, 2, 2, 2, 2]);
    expect(orders(t).sub).toBe('3 items');
  });

  it('N = 50 draws the first 3 orders and says how many it left out', () => {
    const t = tree(50, true);
    expect(t.hidden).toBe(50 - SHOWN_ITEMS);
    expect(titles(t).filter((x) => x.startsWith('Order '))).toHaveLength(3);
    expect(titles(t)).toContain('+ 47 more');
    expect(orders(t).sub).toBe('50 items');
  });

  it('N = 0 has no order nodes at all', () => {
    const t = tree(0, false);
    expect(titles(t)).toEqual(['Query.user', 'User.orders']);
    expect(orders(t).sub).toBe('0 items');
  });

  it('marks which resolvers made a database call: separate calls naive, one shared batch with a DataLoader', () => {
    const products = (t: ReturnType<typeof buildTree>) => [...t.nodes.values()].filter((n) => n.title === 'Order.product');
    const naive = products(tree(3, false));
    expect(new Set(naive.map((n) => n.dbCall)).size).toBe(3);
    expect(naive.every((n) => !n.batched)).toBe(true);
    const loaded = products(tree(3, true));
    expect(new Set(loaded.map((n) => n.dbCall)).size).toBe(1);
    expect(loaded.every((n) => n.batched && n.dbCall !== null)).toBe(true);
  });

  it('carries a failed resolver\'s error on its node', () => {
    const t = tree(3, false, failId);
    const bad = [...t.nodes.values()].filter((n) => n.error);
    expect(bad.map((n) => [n.title, n.error])).toEqual([['Order.product', 'product service timed out']]);
    expect(bad[0].level).toBe(2);
  });
});

describe('the first scene\'s query', () => {
  it('is the same query the picker defaults to', () => {
    expect(SCREEN_QUERY).toEqual(queryFor(DEFAULT_PICK));
  });
});
