import { describe, expect, it } from 'vitest';
import { DEFAULT_PICK, ORDER_COUNTS, queryFor, toggle, type Pick, type PickKey } from './picker';
import { costOf, printQuery, schemaError } from './schema';

const KEYS: PickKey[] = ['email', 'orders', 'total', 'status', 'product', 'productName', 'productPrice'];

const valid = (p: Pick) =>
  (p.orders ? p.total || p.status || p.product : !p.total && !p.status && !p.product) &&
  (p.product ? p.productName || p.productPrice : !p.productName && !p.productPrice);

/** Every combination of the seven switches that is a valid selection. */
const STATES: Pick[] = Array.from({ length: 1 << KEYS.length }, (_, mask) => {
  const p = { ...DEFAULT_PICK } as Pick;
  KEYS.forEach((k, i) => { p[k] = (mask & (1 << i)) !== 0; });
  return p;
}).filter(valid);

describe('the schema explorer', () => {
  it('has 32 valid states (hand count: email 2 × (orders off 1 + product off 3 + product on 4 × 3))', () => {
    expect(STATES).toHaveLength(32);
  });

  it('every state is a valid query, and every toggle from every state stays valid', () => {
    for (const p of STATES) {
      expect(schemaError(queryFor(p))).toBeNull();
      for (const key of KEYS) {
        const next = toggle(p, key);
        expect(valid(next), `${JSON.stringify(p)} toggling ${key}`).toBe(true);
        expect(schemaError(queryFor(next))).toBeNull();
      }
    }
  });

  it('ticking a field turns it on (with its parents), and un-ticking turns it off', () => {
    for (const p of STATES) for (const key of KEYS) expect(toggle(p, key)[key]).toBe(!p[key]);
  });

  it('toggling a field twice returns where it started when it had company', () => {
    const p = { ...DEFAULT_PICK, status: true };
    expect(toggle(toggle(p, 'status'), 'status')).toEqual(p);
    const q = { ...DEFAULT_PICK, email: true };
    expect(toggle(toggle(q, 'email'), 'email')).toEqual(q);
  });

  it('the default is the screen from the first scene: name, then each order\'s total and product name', () => {
    expect(printQuery(queryFor(DEFAULT_PICK)).join('\n')).toBe(
      ['query {', '  user(id: 1) {', '    name', '    orders(last: 3) {', '      total', '      product {', '        name', '      }', '    }', '  }', '}'].join('\n'),
    );
    expect(costOf(queryFor(DEFAULT_PICK))).toBe(12);
  });

  it('un-ticking orders drops everything under it, and ticking a product field alone brings the whole chain', () => {
    const off = toggle(DEFAULT_PICK, 'orders');
    expect(off).toMatchObject({ orders: false, total: false, product: false, productName: false });
    const on = toggle({ ...off }, 'productPrice');
    expect(on).toMatchObject({ orders: true, product: true, productPrice: true });
    expect(schemaError(queryFor(on))).toBeNull();
  });

  it('offers the list lengths the tests cover (0, 1, 3, 50 and 10)', () => {
    expect(ORDER_COUNTS).toEqual([0, 1, 3, 10, 50]);
  });
});
