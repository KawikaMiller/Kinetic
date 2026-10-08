import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { EXAMPLE_CUSTOMER, EXAMPLE_ORDER, PRODUCTS, money } from './canon';
import { MODELS, buildEngine, runQuery, type Params, type QueryId } from './engines';
import { CLUSTERINGS, PARTITION_KEYS, REQUIREMENT_SETS, evaluateDesign, totalsFor } from './design';
import { QUERIES, designCaption, newPriceFor, queryFrames, queryText, recordTones } from './frames';

const params = (product: string): Params => ({ order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product, newPrice: newPriceFor(product) });
const CASES = MODELS.flatMap((m) => [false, true].map((prepared) => ({ model: m.id, prepared })));

describe('captions tell the truth about each run (every model x query x product)', () => {
  for (const c of CASES)
    for (const q of QUERIES)
      it(`${c.model}${c.prepared ? ' (prepared)' : ' (unprepared)'}: ${q.id}`, () => {
        for (const pr of PRODUCTS) {
          const p = params(pr.id);
          const r = runQuery(buildEngine(c.model, { prepared: c.prepared }), q.id, p);
          const frames = queryFrames(c.model, q.id, r, p, c.prepared);
          expect(frames.length).toBe(r.steps.length + 2);
          expect(frames.map((f) => f.step)).toEqual([-1, ...r.steps.map((_, i) => i), r.steps.length]);
          const last = text(frames.at(-1)!.say);
          expect(last).toContain(`${r.lookups} ${r.lookups === 1 ? 'lookup' : 'lookups'} in ${r.roundTrips} round ${r.roundTrips === 1 ? 'trip' : 'trips'}`);
          if (q.id === 'price') expect(last).toContain(`${r.copies} ${r.copies === 1 ? 'record now holds' : 'records now hold'} the new price`);
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

describe('design captions, every model x required set x key x clustering', () => {
  const P = params('P1');
  it('state how many queries one partition serves, how the rest read, hot keys, and the fewest lookups, from the verdict', () => {
    for (const m of MODELS)
      for (const set of REQUIREMENT_SETS)
        for (const k of PARTITION_KEYS)
          for (const c of CLUSTERINGS) {
            const design = { key: k.id, clustering: c.id };
            const verdict = evaluateDesign(set, design);
            const totals = totalsFor(set, design, P);
            const say = text(designCaption(m.id, design, verdict, totals));
            const lo = Math.min(...Object.values(totals));
            const label = `${m.id} ${set.id} ${k.id} ${c.id}`;
            if (m.id === 'wide') {
              expect(say, label).toContain(`serves ${verdict.served} of the 2 required queries from one partition`);
              const scatter = verdict.perQuery.filter((x) => x.serve.kind === 'scatter').length;
              expect(say.includes('both have to read every partition'), label).toBe(scatter === 2);
              expect(say.includes('the other has to read'), label).toBe(scatter === 1);
              expect(say.includes('One table per query'), label).toBe(scatter > 0);
              expect(say.includes('a hot partition'), label).toBe(k.id === 'constant');
              expect(say).toContain(`(${lo}).`);
            } else {
              expect(say, label).toContain(`needs ${totals[m.id]} lookups`);
              expect(say.includes('a hot partition'), label).toBe(k.id === 'constant');
            }
          }
  });

  it('neither query served names both, not "the other" (review repro)', () => {
    const set = REQUIREMENT_SETS.find((s) => s.id === 'catalogue')!;
    const design = { key: 'customer_id', clustering: 'date-desc' } as const;
    const say = text(designCaption('wide', design, evaluateDesign(set, design), totalsFor(set, design, P)));
    expect(say).toContain('serves 0 of the 2 required queries');
    expect(say).toContain('both have to read every partition (3 each)');
    expect(say).not.toContain('the other');
  });

  it('1 record now holds the new price; 10 records now hold it', () => {
    const one = runQuery(buildEngine('relational'), 'price', P);
    const ten = runQuery(buildEngine('document'), 'price', P);
    expect(text(queryFrames('relational', 'price', one, P).at(-1)!.say)).toContain('1 record now holds the new price');
    expect(text(queryFrames('document', 'price', ten, P).at(-1)!.say)).toContain('10 records now hold the new price');
  });
});
