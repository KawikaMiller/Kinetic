import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { mismatches, type Delivery } from './model';

export const HONESTY = 'Real HMAC-SHA-256 (and SHA-256) in your browser, with a key made when the lesson opened. Length extension is described, not demonstrated.';

/** 0 sender tags · 1 to the channel · 2 in the channel · 3 to the receiver · 4 checked. */
export interface TripFrame extends Frame {
  phase: number;
}

const tagName = (d: Delivery) => (d.kind === 'hmac' ? 'HMAC-SHA-256(key, order)' : 'SHA-256(order)');

export function verdictCaption(d: Delivery, tamper: boolean): ReactNode {
  const n = mismatches(d.tagReceived, d.expected).length;
  if (d.verdict === 'caught') {
    return <>The receiver computes {tagName(d)} over what arrived and compares: <span className="hl bad">{n} of {d.expected.length} bytes
      differ</span>. <span className="hl ok">Rejected</span>: the edit is caught, because nobody without the key can make a matching
      tag.</>;
  }
  if (d.verdict === 'forged') {
    return <>The tags match, so the receiver accepts it, but the amount was changed: <span className="hl bad">forged</span>. A plain hash
      proves nothing, because anyone can recompute it. A MAC needs a key.</>;
  }
  if (tamper && !d.edit) {
    return <>The editor couldn't find a top-level amount written as a plain number, so nothing was changed and the tags match:{' '}
      <span className="hl ok">accepted</span>.</>;
  }
  return <>The receiver recomputes {tagName(d)} over the order and it matches all {d.expected.length} bytes:{' '}
    <span className="hl ok">accepted</span>.{d.kind === 'hash' ? " (With a plain hash that only shows it wasn't corrupted by accident.)" : ''}</>;
}

export function tripFrames(d: Delivery, tamper: boolean): TripFrame[] {
  const r = createRecorder<TripFrame>({ phase: 0 });
  r.snap(d.kind === 'hmac'
    ? <>The sender computes <span className="hl violet">{tagName(d)}</span> with the shared key 🔒 and sends the tag with the order.</>
    : <>The sender computes a plain <span className="hl violet">{tagName(d)}</span>. No key goes into it.</>);
  r.snap(<>The order and its tag travel through the channel.</>, 1, { phase: 1 });
  let inChannel: ReactNode = <>Nobody in the channel touches it.</>;
  if (tamper && d.edit) {
    inChannel = d.kind === 'hmac'
      ? <>The editor in the channel changes the amount to <span className="hl">{d.edit.amount}</span>. It has no key, so it can't make
          a matching HMAC: the old tag rides along.</>
      : <>The editor changes the amount to <span className="hl">{d.edit.amount}</span>, then simply recomputes SHA-256 of the new
          order. No key needed.</>;
  } else if (tamper) {
    inChannel = <>The editor looks for a top-level "amount" written as a plain number and can't find one, so it changes nothing.</>;
  }
  r.snap(inChannel, 1.4, { phase: 2 });
  r.snap(d.kind === 'hmac' ? <>The order and tag reach the receiver, who shares the key.</> : <>The order and tag reach the receiver.</>, 1, { phase: 3 });
  r.set({ phase: 4 });
  r.close(verdictCaption(d, tamper), 2.4);
  return r.frames;
}
