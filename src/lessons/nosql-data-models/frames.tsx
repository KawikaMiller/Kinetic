import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { CUSTOMERS, PRODUCTS, money, productName, type Customer } from './canon';
import { MODELS, type ModelId, type Params, type QueryId, type Result } from './engines';

export interface QueryFrame extends Frame {
  /** The step being shown (-1 before the first); steps.length once every step is done. */
  step: number;
}

export const QUERIES: { id: QueryId; label: string }[] = [
  { id: 'order', label: 'get order 1042 with its items' },
  { id: 'last10', label: "a customer's last 10 orders" },
  { id: 'price', label: "update a product's price everywhere" },
  { id: 'also', label: 'who also bought this?' },
];

export const modelLabel = (m: ModelId) => MODELS.find((x) => x.id === m)!.label;
const customerName = (id: string): Customer['name'] => CUSTOMERS.find((c) => c.id === id)!.name;

/** What the query asks, in this lesson's words and with its parameters. */
export function queryText(q: QueryId, p: Params): string {
  switch (q) {
    case 'order':
      return `get order ${p.order} with its items`;
    case 'last10':
      return `${customerName(p.customer)}'s last 10 orders`;
    case 'price':
      return `set the price of the ${productName(p.product)} to ${money(p.newPrice)}`;
    case 'also':
      return `who also bought the ${productName(p.product)}?`;
  }
}

export const newPriceFor = (product: string) => PRODUCTS.find((p) => p.id === product)!.price + 25;

function totals(r: Result<unknown>, q: QueryId): ReactNode {
  return <>
    <b>{plural(r.lookups, 'lookup')}</b> in {plural(r.roundTrips, 'round trip')}
    {q === 'price' && r.copies !== null ? <>, and <span className="hl orange">{plural(r.copies, 'record')}</span> now hold the new price</> : ''}.
  </>;
}

/** The record being read now, then every step in order, then the totals. All from the model's own steps. */
export function queryFrames(model: ModelId, q: QueryId, r: Result<unknown>, p: Params): QueryFrame[] {
  const frames: QueryFrame[] = [{
    step: -1,
    say: <>{modelLabel(model)}: {queryText(q, p)}. Press play to follow every lookup it makes; each is one read or write by key.</>,
  }];
  let sofar = 0;
  r.steps.forEach((s, i) => {
    sofar += s.count;
    const what = s.mode === 'write' ? plural(s.count, 'write') : s.mode === 'scan' ? `a scan of ${plural(s.count, 'record')}` : plural(s.count, 'lookup');
    frames.push({
      step: i,
      say: <>Step {i + 1} of {r.steps.length}: {s.label}. That's {what}; {sofar} so far.</>,
    });
  });
  const asked = queryText(q, p);
  frames.push({ step: r.steps.length, hold: 2, say: <>{asked[0].toUpperCase() + asked.slice(1)}: {totals(r, q)}</> });
  return frames;
}

/** Record-chip tones at a frame: the step running now, steps already done, writes. */
export function recordTones(r: Result<unknown>, step: number): Map<string, Tone> {
  const out = new Map<string, Tone>();
  r.steps.forEach((s, i) => {
    if (i > step) return;
    for (const ref of s.refs) out.set(ref, s.mode === 'write' ? 'orange' : i === step ? 'hi' : 'info');
  });
  return out;
}
