import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { deserCaption } from './captions';
import {
  ALLOWED_TYPES, MAX_ITEMS, MAX_QTY, PRESETS, REGISTRY, SAVED_BLOB, TYPE_NAMES, parseBlob, ranUnexpectedType, readDataOnly, readTypeNaming, validateCart,
  type TypeDefences,
} from './loader';
import { computeSigning, sameTag, tagFor } from './signing';

describe('the schema', () => {
  const good = { items: [{ sku: 'mug', qty: 2 }], coupon: 'SPRING10' };

  it('accepts a valid cart, with or without a coupon', () => {
    expect(validateCart(good)).toEqual([]);
    expect(validateCart({ items: [{ sku: 'tea', qty: 1 }] })).toEqual([]);
  });

  it('rejects unknown fields at the top and inside items, and unknown types of value', () => {
    expect(validateCart({ ...good, type: 'CacheWiper' })).toEqual(['unknown field "type"']);
    expect(validateCart({ ...good, discount: 99 })).toEqual(['unknown field "discount"']);
    expect(validateCart({ items: [{ sku: 'mug', qty: 1, note: 'x' }] })).toEqual(['unknown field "note" in items[0]']);
    expect(validateCart({ items: 'mug' })).toEqual(['"items" must be a list']);
    expect(validateCart({ items: [{ sku: 5, qty: 1 }] })).toEqual(['items[0].sku must be a short lowercase name']);
    expect(validateCart({ items: [{ sku: 'mug', qty: '2' }] })).toEqual(['items[0].qty must be a whole number from 1 to 99']);
    expect(validateCart({ items: [{ sku: 'mug', qty: 1.5 }] }).length).toBe(1);
    expect(validateCart({ items: [{ sku: 'mug', qty: 0 }] }).length).toBe(1);
    expect(validateCart({ items: [{ sku: 'mug', qty: MAX_QTY + 1 }] }).length).toBe(1);
    expect(validateCart({ items: [] }).length).toBe(1);
    expect(validateCart({ items: Array.from({ length: MAX_ITEMS + 1 }, () => ({ sku: 'a', qty: 1 })) }).length).toBe(1);
    expect(validateCart({ items: [{ sku: 'mug', qty: 1 }], coupon: 'spring10' }).length).toBe(1);
    expect(validateCart({ items: [{ sku: 'mug', qty: 1 }], coupon: 7 }).length).toBe(1);
    for (const v of [null, 3, 'x', [], undefined]) expect(validateCart(v)).toEqual(['expected an object']);
  });

  it('agrees with an independent predicate on 3000 seeded random values', () => {
    const rnd = mulberry32(8080);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const skus = ['mug', 'tea', 'Tea', '', 5, 'a-b', 'x'.repeat(30)];
    const qtys = [1, 2, 99, 100, 0, -1, 1.5, '2', null];
    const coupons = [undefined, 'SPRING10', 'spring', 'AB', 7, 'ABCDEFGHIJKLM'];
    const extras = [undefined, undefined, undefined, 'discount', 'type'];
    const refOk = (cart: Record<string, unknown>) => {
      const items = cart.items as { sku: unknown; qty: unknown }[];
      const itemOk = items.every((it) => typeof it.sku === 'string' && /^[a-z][a-z0-9-]{0,19}$/.test(it.sku) && typeof it.qty === 'number' && Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 99 && Object.keys(it).length === 2);
      const couponOk = cart.coupon === undefined || (typeof cart.coupon === 'string' && /^[A-Z0-9]{3,12}$/.test(cart.coupon));
      const known = Object.keys(cart).every((k) => k === 'items' || k === 'coupon');
      return items.length >= 1 && items.length <= 10 && itemOk && couponOk && known;
    };
    for (let i = 0; i < 3000; i++) {
      const cart: Record<string, unknown> = {
        items: Array.from({ length: Math.floor(rnd() * 12) }, () => ({ sku: pick(skus), qty: pick(qtys) })),
        coupon: pick(coupons),
      };
      const extra = pick(extras);
      if (extra) cart[extra] = 1;
      if (cart.coupon === undefined) delete cart.coupon;
      expect(validateCart(cart).length === 0).toBe(refOk(cart));
    }
  });

  it('the data-only reader refuses text that is not JSON, and never builds a type', () => {
    expect(readDataOnly('not json')).toEqual({ parsed: false, errors: ['not valid JSON'], accepted: false });
    const results = Object.fromEntries(PRESETS.map((p) => [p.id, readDataOnly(p.json)]));
    expect(results.own.accepted).toBe(true);
    expect(results.swapped).toMatchObject({ accepted: false, errors: ['unknown field "type"'] });
    expect(results.extra).toMatchObject({ accepted: false, errors: ['unknown field "discount"'] });
  });
});

describe('the type-naming loader', () => {
  const combos: TypeDefences[] = [false, true].flatMap((allowList) => [false, true].map((signed) => ({ allowList, signed })));

  it('parses the header and the fields', () => {
    expect(parseBlob(PRESETS[0].typed)).toEqual({ type: 'Cart', fields: { items: 'mug x2, tea x1', coupon: 'SPRING10' } });
    expect(parseBlob('nothing here').type).toBeNull();
  });

  it('a constructor of an unexpected type runs only when the allow-list is off and the signature (if required) passes, for every preset and defence', () => {
    for (const p of PRESETS) {
      for (const d of combos) {
        for (const signatureValid of [false, true]) {
          const r = readTypeNaming(p.typed, d, signatureValid);
          const named = parseBlob(p.typed).type!;
          const unexpected = !ALLOWED_TYPES.includes(named);
          const expected = unexpected && !d.allowList && (!d.signed || signatureValid);
          expect(ranUnexpectedType(r)).toBe(expected);
        }
      }
    }
  });

  it('with no defence, the input chooses any class in the registry', () => {
    for (const type of TYPE_NAMES) {
      const r = readTypeNaming(`type: ${type}\nitems: mug x1`, { allowList: false, signed: false }, false);
      expect(r.constructed).toBe(type);
      expect(r.accepted).toBe(true);
    }
    const unknown = readTypeNaming('type: NoSuchThing\nitems: mug x1', { allowList: false, signed: false }, false);
    expect(unknown).toMatchObject({ constructed: null, accepted: false, stage: 'lookup' });
  });

  it('with the allow-list on, only the allowed type is ever built, whatever the blob names', () => {
    for (const type of [...TYPE_NAMES, 'NoSuchThing', '']) {
      const r = readTypeNaming(`type: ${type}\nitems: mug x1`, { allowList: true, signed: false }, false);
      if (r.constructed !== null) expect(ALLOWED_TYPES).toContain(r.constructed);
    }
    expect(readTypeNaming(PRESETS[0].typed, { allowList: true, signed: false }, false).constructed).toBe('Cart');
  });

  it('an unsigned edit is refused before anything is looked up, with signing on', () => {
    const r = readTypeNaming(PRESETS[1].typed, { allowList: false, signed: true }, false);
    expect(r).toMatchObject({ stage: 'signature', constructed: null, accepted: false });
  });

  it('an extra field is copied onto the object unchecked, which the allow-list and the signature can stop or not', () => {
    expect(readTypeNaming(PRESETS[2].typed, { allowList: true, signed: false }, false).keptFields).toEqual(['discount']);
    expect(readTypeNaming(PRESETS[2].typed, { allowList: true, signed: true }, false).accepted).toBe(false);
  });

  it('every registered class has a description and nothing in the registry is code', () => {
    for (const c of Object.values(REGISTRY)) expect(typeof c.effect).toBe('string');
  });
});

describe('signing', () => {
  it('only the original blob matches the tag stored at save time (real HMAC-SHA-256)', async () => {
    const s = (await computeSigning())!;
    expect(s.valid).toEqual({ own: true, swapped: false, extra: false });
    expect(s.saved).toBe((await tagFor(SAVED_BLOB))!);
    expect(s.saved.length).toBe(64);
  });

  it('changing any single character of the blob changes the tag', async () => {
    const saved = (await tagFor(SAVED_BLOB))!;
    for (let i = 0; i < SAVED_BLOB.length; i += 3) {
      const edited = SAVED_BLOB.slice(0, i) + (SAVED_BLOB[i] === 'x' ? 'y' : 'x') + SAVED_BLOB.slice(i + 1);
      expect(sameTag((await tagFor(edited))!, saved)).toBe(false);
    }
  });

  it('sameTag agrees with === including different lengths', () => {
    expect(sameTag('abc', 'abc')).toBe(true);
    expect(sameTag('abc', 'abd')).toBe(false);
    expect(sameTag('abc', 'abcd')).toBe(false);
  });
});

describe('captions across every preset and defence combination', () => {
  it('say what the model computed', async () => {
    const signing = (await computeSigning())!;
    for (const p of PRESETS) {
      for (const allowList of [false, true]) {
        for (const signed of [false, true]) {
          const text = expectCaption(deserCaption(p.id, { allowList, signed }, signing.valid[p.id]));
          const typed = readTypeNaming(p.typed, { allowList, signed }, signing.valid[p.id]);
          const json = readDataOnly(p.json);
          expect(text.includes('constructor ran')).toBe(typed.constructed !== null && ranUnexpectedType(typed));
          expect(text.includes('data-only reader accepted it')).toBe(json.accepted);
          expect(text.includes('data-only reader refused it')).toBe(!json.accepted);
        }
      }
    }
  });
});
