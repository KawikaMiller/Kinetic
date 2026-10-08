import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { EXAMPLE_CUSTOMER, EXAMPLE_ORDER, PRODUCTS, money } from './canon';
import { MODELS, buildEngine, runQuery, type Params, type QueryId } from './engines';
import { QUERIES, newPriceFor, queryFrames, queryText, recordTones } from './frames';

const params = (product: string): Params => ({ order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product, newPrice: newPriceFor(product) });
const CASES = MODELS.flatMap((m) => (m.id === 'kv' ? [false, true] : [false]).map((indexed) => ({ model: m.id, indexed })));

describe('captions tell the truth about each run (every model x query x product)', () => {
  for (const c of CASES)
    for (const q of QUERIES)
      it(`${c.model}${c.indexed ? ' + index keys' : ''}: ${q.id}`, () => {
        for (const pr of PRODUCTS) {
          const p = params(pr.id);
          const r = runQuery(buildEngine(c.model, { indexed: c.indexed }), q.id, p);
          const frames = queryFrames(c.model, q.id, r, p);
          expect(frames.length).toBe(r.steps.length + 2);
          expect(frames.map((f) => f.step)).toEqual([-1, ...r.steps.map((_, i) => i), r.steps.length]);
          const last = text(frames.at(-1)!.say);
          expect(last).toContain(`${r.lookups} ${r.lookups === 1 ? 'lookup' : 'lookups'} in ${r.roundTrips} round ${r.roundTrips === 1 ? 'trip' : 'trips'}`);
          if (q.id === 'price') expect(last).toContain(`${r.copies} ${r.copies === 1 ? 'record' : 'records'} now hold the new price`);
          else expect(last).not.toContain('now hold');
          let sofar = 0;
          r.steps.forEach((s, i) => {
            sofar += s.count;
            expect(text(frames[i + 1].say)).toContain(`${sofar} so far`);
          });
          expect(sofar).toBe(r.lookups);
        }
      });
});

describe('record tones', () => {
  it('the step running now is hi, finished reads info, writes orange, untouched records none', () => {
    const p = params('P1');
    const r = runQuery(buildEngine('document'), 'price', p);
    expect(recordTones(r, -1).size).toBe(0);
    expect([...recordTones(r, 0).values()]).toEqual([]);
    const writing = recordTones(r, 1);
    expect(new Set(writing.values())).toEqual(new Set(['orange']));
    expect(writing.size).toBe(9);
    const read = runQuery(buildEngine('relational'), 'order', p);
    const at2 = recordTones(read, 2);
    expect(at2.get(`orders:${EXAMPLE_ORDER}`)).toBe('info');
    expect(at2.get('products:P1')).toBe('hi');
    expect(at2.get('products:P3')).toBeUndefined();
  });

  it('a record touched by a later step is not lit early', () => {
    const r = runQuery(buildEngine('wide'), 'also', params('P1'));
    expect(recordTones(r, 0).has('products_by_customer/C1')).toBe(false);
    expect(recordTones(r, 1).get('products_by_customer/C1')).toBe('hi');
  });
});

describe('query text', () => {
  it('names the parameters it was given', () => {
    const p = params('P2');
    const say = (q: QueryId) => queryText(q, p);
    expect(say('order')).toBe('get order 1042 with its items');
    expect(say('last10')).toBe("Ada's last 10 orders");
    expect(say('price')).toBe(`set the price of the ink to ${money(425)}`);
    expect(say('also')).toBe('who also bought the ink?');
  });
});
