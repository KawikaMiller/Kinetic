import type { ReactNode } from 'react';
import { capacity, headSlot, size, tailSlot, type Event, type Policy, type Ring, type Strategy } from './model';

export const STRATEGY_LABEL: Record<Strategy, string> = { sentinel: 'Keep one slot empty', count: 'Separate count', masked: 'Masked counters' };
export const POLICY_LABEL: Record<Policy, string> = { block: 'Block', drop: 'Drop newest', overwrite: 'Overwrite oldest' };

/** How the tail (or head) got to where it is now, in this strategy's own arithmetic. */
function moved(r: Ring, which: 'head' | 'tail', before: Ring): ReactNode {
  const n = r.n;
  if (r.strategy === 'count' && which === 'tail') return <>count goes up to {r.count}, so the next write goes to (head + count) % {n} = {tailSlot(r)}</>;
  if (r.strategy === 'masked') {
    const from = before[which];
    const to = r[which];
    const wrapped = to < from;
    return (
      <>
        the {which} counter goes {from} → {to}
        {wrapped && <> (it wrapped past 2³², and <code>&gt;&gt;&gt; 0</code> keeps the maths right)</>}; its slot is {to} &amp; {n - 1} = {to & (n - 1)}
      </>
    );
  }
  const from = which === 'head' ? headSlot(before) : tailSlot(before);
  const to = which === 'head' ? headSlot(r) : tailSlot(r);
  return (
    <>
      {which} moves ({from} + 1) % {n} = {to}
      {to === 0 && <>: it <b>wraps</b> from the last slot back to slot 0</>}
    </>
  );
}

export function eventCaption(e: Event, r: Ring, before: Ring): ReactNode {
  const fill = <>({size(r)} of {capacity(r)} used)</>;
  switch (e.kind) {
    case 'enqueued':
      return <>Enqueued <b>{e.value}</b> into slot {e.slot}; {moved(r, 'tail', before)} {fill}.</>;
    case 'dequeued':
      return <>Dequeued <b>{e.value}</b> from slot {e.slot}; {moved(r, 'head', before)} {fill}.</>;
    case 'empty':
      return <>Empty: nothing to dequeue.</>;
    case 'blocked':
      return <>Full ({capacity(r)} of {capacity(r)}). With <b>Block</b>, the producer has to wait until something is dequeued; {e.value} isn't written yet.</>;
    case 'dropped':
      return <>Full. With <b>Drop newest</b>, <span className="hl bad">{e.value} is thrown away</span>; the buffer is unchanged.</>;
    case 'overwrote':
      return (
        <>
          Full. With <b>Overwrite oldest</b>, <span className="hl orange">{e.lost} is lost</span>: head moves past it, and {e.value} goes into slot {e.slot}.
        </>
      );
  }
}

export const INTRO: Record<Strategy, ReactNode> = {
  sentinel: (
    <>
      <b>Keep one slot empty</b>: head == tail means empty, and the buffer counts as full one slot early, when (tail + 1) % N == head. The cost: it
      holds N − 1 items.
    </>
  ),
  count: (
    <>
      <b>Separate count</b>: head == tail happens both when it's empty and when it's full, so a count settles it. All N slots are usable; the
      cost is one more variable that both sides update.
    </>
  ),
  masked: (
    <>
      <b>Masked counters</b>: head and tail only ever go up (as unsigned 32-bit numbers), and the slot is the counter <code>&amp; (N − 1)</code>.
      tail − head is the size, so full (N) and empty (0) never look alike. N must be a power of two.
    </>
  ),
};
