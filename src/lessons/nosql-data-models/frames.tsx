import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { CUSTOMERS, PRODUCTS, money, productName, type Customer } from './canon';
import type { Design, Verdict } from './design';
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
    {q === 'price' && r.copies !== null ? <>, and <span className="hl orange">{plural(r.copies, 'record')}</span> now {r.copies === 1 ? 'holds' : 'hold'} the new price</> : ''}.
  </>;
}

/** The record being read now, then every step in order, then the totals. All from the model's own steps. */
export function queryFrames(model: ModelId, q: QueryId, r: Result<unknown>, p: Params, prepared = true): QueryFrame[] {
  const state = model === 'wide' || model === 'graph' ? '' : prepared ? ' (prepared with the indexes it would add)' : ' (unprepared: no extra indexes)';
  const frames: QueryFrame[] = [{
    step: -1,
    say: <>{modelLabel(model)}{state}: {queryText(q, p)}. Press play to follow every lookup it makes: a keyed read or write, an index probe, a partition, or a scan.</>,
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

/** The design scene's caption: what the learner's wide-column table serves, where it is hot, and who is cheapest (from the verdict and totals). */
export function designCaption(model: ModelId, design: Design, verdict: Verdict, totals: Record<ModelId, number>): ReactNode {
  const lo = Math.min(...Object.values(totals));
  const best = MODELS.filter((m) => totals[m.id] === lo).map((m) => m.label).join(' and ');
  const hot = verdict.hot.level === 'bad';
  const scatter = verdict.perQuery.filter((x) => x.serve.kind === 'scatter');
  if (model !== 'wide')
    return <>{modelLabel(model)} needs {totals[model]} lookups for these two queries; the fewest is {lo}, by {best}. The wide-column column follows the table design below
      (partition key <code>{design.key}</code>{hot ? ', a hot partition' : ''}). No model is best at every pair of queries: change the required set.</>;
  const rest = scatter.length === 0 ? '' : scatter.length === 2
    ? `; both have to read every partition (${scatter[0].serve.partitions} each)`
    : `; the other has to read ${plural(scatter[0].serve.partitions, 'partition')}`;
  return <>Your wide-column table, partitioned by <code>{design.key}</code>, serves {verdict.served} of the 2 required queries from one partition{rest}
    {scatter.length > 0 ? '. One table per query is how wide-column stores are designed, at the price of a copy to keep in sync' : ''}.
    {hot ? ' But that one partition takes all the traffic and data: a hot partition, so the low count is no bargain.' : ''}
    {' '}Fewest lookups for this pair: {best} ({lo}).</>;
}
