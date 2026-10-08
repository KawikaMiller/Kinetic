import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { friendsOf, lastOrders, userById, MAX_LIST, productById } from './data';
import { DB_CALL_MS, FAILURE_MESSAGE, POOL_SIZE, RESOLVERS, execute, runQuery, type Json, type Resolvers } from './exec';
import { DEFAULT_PICK, queryFor } from './picker';
import { LIMITS, SCHEMA, costOf, depthOf, friendsQuery, printQuery, schemaError, validate, type Sel, type TypeName } from './schema';

const ordersQuery = (n: number): Sel[] => queryFor({ ...DEFAULT_PICK, n });
const run = (q: Sel[], dataLoader = false, failProductId: number | null = null) => execute(q, { dataLoader, failProductId });

/** Independent reference: the response built straight from the fixture, with no resolvers, errors or levels. */
function reference(type: TypeName, obj: unknown, sels: readonly Sel[]): Json {
  const out: { [k: string]: Json } = {};
  for (const s of sels) {
    const def = SCHEMA[type].find((f) => f.name === s.field)!;
    if (def.type === 'scalar') {
      out[s.field] = (obj as Record<string, Json>)[s.field];
      continue;
    }
    let value: unknown;
    if (type === 'Query') value = userById(s.args!.id!);
    else if (s.field === 'orders') value = lastOrders((obj as { id: number }).id, s.args!.last!);
    else if (s.field === 'friends') value = friendsOf((obj as { id: number }).id, s.args!.first!).map(userById);
    else value = productById((obj as { productId: number }).productId);
    out[s.field] = def.list ? (value as unknown[]).map((v) => reference(def.type as TypeName, v, s.children!)) : reference(def.type as TypeName, value, s.children!);
  }
  return out;
}

/** A random valid selection, kept small (lists of at most 4, depth at most 5). */
function randomSel(rnd: Rnd, type: TypeName, depth: number): Sel[] {
  const defs = SCHEMA[type];
  const picked = defs.filter(() => rnd() < 0.45);
  if (!picked.length) picked.push(defs[Math.floor(rnd() * defs.length)]);
  return picked.map((def): Sel => {
    const args: Sel['args'] = type === 'Query' ? { id: 1 + Math.floor(rnd() * 60) } : def.list ? { [def.list]: Math.floor(rnd() * 5) } : undefined;
    if (def.type === 'scalar') return { field: def.name };
    const children = depth <= 1 ? SCHEMA[def.type].filter((f) => f.type === 'scalar').slice(0, 2).map((f) => ({ field: f.name })) : randomSel(rnd, def.type, depth - 1);
    return { field: def.name, ...(args ? { args } : {}), children };
  });
}

describe('database calls: the N + 1 problem and DataLoader (N = 0, 1, 3, 50)', () => {
  it.each([0, 1, 3, 50])('N = %i orders', (n) => {
    const naive = run(ordersQuery(n));
    const loaded = run(ordersQuery(n), true);
    const of = (e: typeof naive, kind: string) => e.dbCalls.filter((c) => c.kind === kind);
    // The orders list is 1 call, and each order's product is one more call: 1 + N
    expect(of(naive, 'orders')).toHaveLength(1);
    expect(of(naive, 'products')).toHaveLength(n);
    expect(naive.dbCalls.filter((c) => c.kind !== 'users')).toHaveLength(1 + n);
    // A DataLoader turns the N product calls into one batched call (none at all for 0 orders).
    expect(of(loaded, 'products')).toHaveLength(n > 0 ? 1 : 0);
    expect(loaded.dbCalls.filter((c) => c.kind !== 'users')).toHaveLength(1 + (n > 0 ? 1 : 0));
    // The user lookup is one more call either way.
    expect(naive.dbCalls).toHaveLength(2 + n);
    expect(loaded.dbCalls).toHaveLength(n > 0 ? 3 : 2);
    expect(loaded.data).toEqual(naive.data);
  });

  it('the batched call asks for the distinct product ids, once each (DataLoader dedupes)', () => {
    const e = run(ordersQuery(50), true);
    const batch = e.dbCalls.find((c) => c.kind === 'products')!;
    const ids = lastOrders(1, 50).map((o) => o.productId);
    expect(batch.keys).toEqual([...new Set(ids)]);
    expect(batch.keys.length).toBeLessThan(ids.length);
    expect(batch.invocations).toHaveLength(50);
    expect(batch.sql).toBe(`SELECT * FROM products WHERE id IN (${batch.keys.join(', ')})`);
  });

  it('naive calls are one per order, even when two orders want the same product', () => {
    const e = run(ordersQuery(50));
    expect(e.dbCalls.filter((c) => c.kind === 'products').map((c) => c.keys[0])).toEqual(lastOrders(1, 50).map((o) => o.productId));
    expect(e.dbCalls.find((c) => c.kind === 'products')!.sql).toMatch(/^SELECT \* FROM products WHERE id = \d$/);
  });
});

describe('timing on a pool of 4 connections, 20 ms per call (hand-worked)', () => {
  it('N = 3: user 0–20, orders 20–40, the 3 product calls in parallel 40–60', () => {
    const e = run(ordersQuery(3));
    expect(e.dbCalls.map((c) => [c.kind, c.start, c.end])).toEqual([['users', 0, 20], ['orders', 20, 40], ['products', 40, 60], ['products', 40, 60], ['products', 40, 60]]);
    expect(e.levelEnds).toEqual([20, 40, 60, 60]);
    expect(e.totalMs).toBe(60);
  });
  it('N = 50 naive: 50 calls on 4 connections take ceil(50 / 4) = 13 rounds, so 40 + 260 = 300 ms; batched, 60 ms', () => {
    expect(run(ordersQuery(50)).totalMs).toBe(40 + Math.ceil(50 / POOL_SIZE) * DB_CALL_MS);
    expect(run(ordersQuery(50)).totalMs).toBe(300);
    expect(run(ordersQuery(50), true).totalMs).toBe(60);
  });
  it('no connection runs two calls at once, and at most 4 connections are used', () => {
    for (const n of [1, 3, 10, 50]) {
      for (const loader of [false, true]) {
        const calls = run(ordersQuery(n), loader).dbCalls;
        expect(Math.max(...calls.map((c) => c.conn))).toBeLessThan(POOL_SIZE);
        for (const a of calls) for (const b of calls) if (a !== b && a.conn === b.conn) expect(a.end <= b.start || b.end <= a.start).toBe(true);
      }
    }
  });
  it('a level cannot start before the one above it has finished', () => {
    const e = run(ordersQuery(10));
    for (const c of e.dbCalls) if (c.level > 0) expect(c.start).toBeGreaterThanOrEqual(e.levelEnds[c.level - 1]);
  });
});

describe('the response shape equals the selection exactly (seeded random selections)', () => {
  it('matches an independent reference built from the fixture, key for key, for 300 selections', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const sel = randomSel(rnd, 'Query', 5);
      expect(schemaError(sel)).toBeNull();
      for (const loader of [false, true]) expect(run(sel, loader).data).toEqual(reference('Query', {}, sel));
    }
  });

  it('has exactly the selected keys at every level and no others', () => {
    const rnd = mulberry32(5);
    const keysMatch = (data: Json, sels: readonly Sel[]): boolean => {
      const obj = data as { [k: string]: Json };
      if (Object.keys(obj).join() !== sels.map((s) => s.field).join()) return false;
      return sels.every((s) => {
        const v = obj[s.field];
        if (!s.children) return typeof v !== 'object' || v === null;
        return Array.isArray(v) ? v.every((x) => keysMatch(x, s.children!)) : keysMatch(v, s.children);
      });
    };
    for (let i = 0; i < 300; i++) {
      const sel = randomSel(rnd, 'Query', 5);
      expect(keysMatch(run(sel).data, sel)).toBe(true);
    }
  });
});

describe('cost = the number of resolvers a query can run', () => {
  it('equals the executor\'s resolver-call count for 300 seeded random selections (lists are always full here)', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const sel = randomSel(rnd, 'Query', 5);
      expect(costOf(sel)).toBe(run(sel).invocations.length);
    }
  });
  it('matches the closed form for the nested-friends query: 1 + (f^k - 1) / (f - 1) + f^k', () => {
    for (const f of [2, 5, 10]) {
      for (let k = 1; k <= 4; k++) {
        const closed = 1 + (f ** k - 1) / (f - 1) + f ** k;
        expect(costOf(friendsQuery(k, f))).toBe(closed);
        if (f ** k < 2000) expect(run(friendsQuery(k, f)).invocations).toHaveLength(closed);
      }
    }
    expect(costOf(friendsQuery(2, 10))).toBe(112);
    expect(costOf(friendsQuery(3, 10))).toBe(1112);
  });
  it('is the sum of list sizes products, worked by hand: orders(last: 3) { total product { name } } under user', () => {
    // user 1, name 1, orders 1, total 3, product 3, name 3 = 12
    expect(costOf(ordersQuery(3))).toBe(12);
    expect(costOf(ordersQuery(0))).toBe(3);
  });
});

describe('limits are checked before any resolver runs', () => {
  const counting = () => {
    const calls: string[] = [];
    const table: Resolvers = new Proxy({} as Resolvers, {
      get: (_t, key: string) => (...a: Parameters<Resolvers[string]>) => {
        calls.push(key);
        return RESOLVERS[key]?.(...a) ?? (a[0] as Record<string, unknown>)[key.split('.')[1]];
      },
    });
    return { table, calls };
  };

  it('depth and cost: friends nested k deep is depth k + 2', () => {
    for (let k = 0; k <= 6; k++) expect(depthOf(friendsQuery(k, 10))).toBe(k + 2);
  });

  it('with the limits at 4 deep and cost 1,000: 2 levels pass, 3 are rejected on both counts', () => {
    expect(validate(friendsQuery(2, 10))).toEqual({ ok: true, depth: 4, cost: 112 });
    const v = validate(friendsQuery(3, 10));
    expect(v).toMatchObject({ ok: false, depth: 5, cost: 1112 });
    expect(!v.ok && v.problems).toEqual(['depth 5 is over the limit of 4', 'cost 1,112 is over the limit of 1,000']);
  });

  it('a long list can trip the cost limit alone: 50 friends of 50 friends is depth 4 and cost 2,552', () => {
    const v = validate(friendsQuery(2, 50));
    expect(v).toMatchObject({ ok: false, depth: 4, cost: 2552 });
    expect(!v.ok && v.problems).toEqual(['cost 2,552 is over the limit of 1,000']);
  });

  it('a rejected query never reaches a resolver, however the resolvers are wired', () => {
    for (const q of [friendsQuery(3, 10), friendsQuery(2, 50), friendsQuery(6, 50)]) {
      const { table, calls } = counting();
      const out = runQuery(q, { dataLoader: false, failProductId: null, resolvers: table });
      expect(out.status).toBe('rejected');
      expect(calls).toEqual([]);
    }
  });

  it('an accepted query runs exactly as many resolvers as its cost, and a bad one is refused as invalid first', () => {
    const { table, calls } = counting();
    const out = runQuery(friendsQuery(2, 10), { dataLoader: false, failProductId: null, resolvers: table });
    expect(out.status).toBe('executed');
    expect(calls).toHaveLength(112);
    const bad = counting();
    expect(runQuery([{ field: 'nope' }], { dataLoader: false, failProductId: null, resolvers: bad.table }).status).toBe('invalid');
    expect(bad.calls).toEqual([]);
  });

  it('with limits off the query runs', () => {
    expect(runQuery(friendsQuery(3, 10), { dataLoader: false, failProductId: null }, null).status).toBe('executed');
  });
});

describe('a failing resolver gives partial data and an errors array', () => {
  const failId = lastOrders(1, 3)[1].productId;
  it('N = 3: that order\'s product is null, the others are fine, and the error names its path', () => {
    for (const loader of [false, true]) {
      const e = run(ordersQuery(3), loader, failId);
      const orders = (e.data as { user: { orders: { product: Json }[] } }).user.orders;
      expect(orders.map((o) => o.product === null)).toEqual([false, true, false]);
      expect(e.errors).toEqual([{ message: FAILURE_MESSAGE, path: ['user', 'orders', 1, 'product'] }]);
    }
  });
  it('N = 50: one error per order that wanted the failing product, and nothing else changes', () => {
    const wanting = lastOrders(1, 50).filter((o) => o.productId === failId).length;
    const e = run(ordersQuery(50), true, failId);
    expect(e.errors).toHaveLength(wanting);
    expect(wanting).toBeGreaterThan(1);
    const ok = run(ordersQuery(50), true).data as { user: { orders: { total: Json; product: Json }[] } };
    const got = e.data as typeof ok;
    const wantsFailing = lastOrders(1, 50).map((o) => o.productId === failId);
    got.user.orders.forEach((order, i) => {
      expect(order.total).toBe(ok.user.orders[i].total);
      expect(order.product).toEqual(wantsFailing[i] ? null : ok.user.orders[i].product);
    });
  });
  it('the request still executes (HTTP 200); no failing product means no errors', () => {
    expect(runQuery(ordersQuery(3), { dataLoader: false, failProductId: failId }).status).toBe('executed');
    expect(run(ordersQuery(3)).errors).toEqual([]);
  });
});

describe('schema checks and printing', () => {
  it('refuses a missing selection, an unknown field, a selection on a scalar and an empty one', () => {
    expect(schemaError([{ field: 'user', args: { id: 1 } }])).toBe('Query.user returns User, so it needs a selection.');
    expect(schemaError([{ field: 'user', args: { id: 1 }, children: [{ field: 'nope' }] }])).toBe('User has no field "nope".');
    expect(schemaError([{ field: 'user', args: { id: 1 }, children: [{ field: 'name', children: [{ field: 'x' }] }] }])).toBe("User.name is a scalar and can't have a selection.");
    expect(schemaError([{ field: 'user', args: { id: 1 }, children: [] }])).toBe('Query.user returns User, so it needs a selection.');
    expect(schemaError([])).toBe("A selection on Query can't be empty.");
    expect(schemaError(ordersQuery(3))).toBeNull();
  });
  it('prints the query as source lines', () => {
    expect(printQuery(ordersQuery(3)).join('\n')).toBe(
      ['query {', '  user(id: 1) {', '    name', '    orders(last: 3) {', '      total', '      product {', '        name', '      }', '    }', '  }', '}'].join('\n'),
    );
  });
  it('lists never exceed MAX_LIST', () => {
    expect(lastOrders(1, 500)).toHaveLength(MAX_LIST);
    expect(friendsOf(1, 500)).toHaveLength(MAX_LIST);
    expect(friendsOf(7, 59).includes(7)).toBe(false);
    expect(LIMITS).toEqual({ maxDepth: 4, maxCost: 1000 });
  });
});
