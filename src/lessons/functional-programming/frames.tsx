import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { STATION_CALLS, STATIONS, totalCalls, tracePipeline, type Order, type Plan, type Step, type StationKind } from './model';

/** Where a card is, and how the pipeline has treated it so far. */
export type CardStatus = 'waiting' | 'current' | 'kept' | 'dropped' | 'reduced';

export interface CardView {
  /** Column: 0 = the input array, 1-2 = after a station, 3 = the reduce bin. */
  col: number;
  status: CardStatus;
  /** Set once `map(addTotal)` has priced the order. */
  total?: number;
}

export interface FpFrame extends Frame {
  cards: Record<number, CardView>;
  acc: number | null;
  calls: Record<StationKind, number>;
  /** The station calling its callback right now. */
  station: number | null;
}

const settle = (c: CardView): CardView => (c.status === 'current' ? { ...c, status: c.col === 3 ? 'reduced' : 'kept' } : c);

function caption(step: Step, o: Order, acc: number | null): ReactNode {
  if (step.kind === 'map') {
    return <>addTotal({o.item}): {o.qty} × ${o.price} = <span className="hl">${step.total}</span>. map turns every item into a new one: 1 in, 1 out.</>;
  }
  if (step.kind === 'filter') {
    return step.kept ? (
      <>isPaid({o.item}) is <span className="hl ok">true</span>: it passes the gate.</>
    ) : (
      <>isPaid({o.item}) is <span className="hl">false</span>: filter drops it. It stays behind, dimmed.</>
    );
  }
  return (
    <>sumTotals: {acc} + {step.total} = <span className="hl violet">{step.acc}</span>. reduce folds the array into one value.</>
  );
}

function stationDone(kind: StationKind, left: number): ReactNode {
  if (kind === 'map') return <>map is done: a <b>brand-new array</b> of {left} priced orders. <code>orders</code> itself is untouched.</>;
  if (kind === 'filter') return <>filter is done: a new array with the {left} that passed. Nothing was deleted from the original.</>;
  return null;
}

export function pipelineFrames(orders: readonly Order[], plan: Plan): FpFrame[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const trace = tracePipeline(orders, plan);
  const cards: Record<number, CardView> = Object.fromEntries(orders.map((o) => [o.id, { col: 0, status: 'waiting' }]));
  const rec = createRecorder<FpFrame>({ cards, acc: null, calls: { map: 0, filter: 0, reduce: 0 }, station: null });
  const now = rec.get;
  const settleAll = () => Object.fromEntries(Object.entries(now().cards).map(([id, c]) => [id, settle(c)]));

  rec.snap(<>Six orders go in at the left. Three stations, <code>{STATIONS[plan].map((k) => STATION_CALLS[k]).join(' ')}</code>, each run over the whole array. Press play.</>);
  trace.steps.forEach((step, i) => {
    const o = byId.get(step.itemId)!;
    const moved: CardView =
      step.kind === 'filter' && !step.kept
        ? { col: now().cards[o.id].col, status: 'dropped', total: now().cards[o.id].total }
        : { col: step.kind === 'reduce' ? 3 : step.station + 1, status: 'current', total: step.kind === 'map' ? step.total : now().cards[o.id].total };
    const calls = { ...now().calls, [step.kind]: now().calls[step.kind] + 1 };
    rec.snap(caption(step, o, now().acc ?? 0), undefined, {
      cards: { ...settleAll(), [o.id]: moved },
      calls,
      station: step.station,
      acc: step.kind === 'reduce' ? step.acc! : now().acc,
    });
    const next = trace.steps[i + 1];
    if (step.kind !== 'reduce' && (!next || next.station !== step.station)) {
      const left = Object.values(now().cards).filter((c) => c.col === step.station + 1).length;
      rec.snap(stationDone(step.kind, left), undefined, { cards: settleAll(), station: null });
    }
  });
  const saved = totalCalls(tracePipeline(orders, 'map-first')) - totalCalls(trace);
  rec.snap(
    <>
      Revenue from paid orders: <span className="hl violet">${trace.result}</span>, in <b>{totalCalls(trace)}</b> callback calls.
      {plan === 'map-first'
        ? ' Try Filter first: same answer, fewer map calls.'
        : ` Filtering first skipped pricing the unpaid orders: same answer, ${saved} fewer calls.`}
    </>,
    2,
    { cards: settleAll(), station: null },
  );
  return rec.frames;
}
