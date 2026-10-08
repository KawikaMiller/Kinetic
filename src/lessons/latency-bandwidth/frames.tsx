import type { ReactNode } from 'react';
import {
  CHATTY_CALLS, CHATTY_EACH, NEW_CONNECTION_RTTS, SIZES, bdp, chattyVsBatched, fillFraction, rateText, sizeText, throughput, timeText,
  transferTime, verdictOf, windowLimited, type Link,
} from './model';

/** A share as a whole percent, rounded down so a caption never claims more than the model has. */
export function shareText(part: number, whole: number): string {
  const pct = Math.floor((part / whole) * 100);
  return pct < 1 && part > 0 ? 'under 1%' : `${pct}%`;
}

/** "only 20%", but plain "under 1%" (never "only under 1%"). */
const fullText = (share: string) => (share.startsWith('under') ? share : `only ${share}`);

export function pipeCaption(l: Link): ReactNode {
  const b = bdp(l.bandwidth, l.rtt);
  const sum = <>{rateText(l.bandwidth)} × {timeText(l.rtt)} = <span className="hl">{sizeText(b)}</span></>;
  if (!windowLimited(l))
    return <>The window ({sizeText(l.window)}) covers the bandwidth-delay product ({sum}), so the sender never runs dry: the pipe stays full
      and throughput is the link's <span className="hl ok">{rateText(l.bandwidth)}</span>.</>;
  return <>The window ({sizeText(l.window)}) is smaller than the bandwidth-delay product ({sum}). The sender sends a window, then sits idle
    until ACKs come back, so the pipe is {fullText(shareText(fillFraction(l), 1))} full and throughput is {rateText(throughput(l))}, not{' '}
    {rateText(l.bandwidth)}. To fill this pipe you need a window of at least {sizeText(b)}.</>;
}


export function transferCaption(l: Link, newConnection: boolean): ReactNode {
  const hs = newConnection ? NEW_CONNECTION_RTTS : 0;
  const small = transferTime(SIZES[0].bytes, l, hs);
  const big = transferTime(SIZES.at(-1)!.bytes, l, hs);
  const faster = transferTime(SIZES[0].bytes, { ...l, bandwidth: l.bandwidth * 2 }, hs);
  return <>{SIZES[0].label} takes {timeText(small.total)}, {shareText(small.latency, small.total)} of it round trips:{' '}
    <b>{verdictOf(small)}</b>. Doubling the bandwidth would make it {timeText(faster.total)}. {SIZES.at(-1)!.label} takes{' '}
    {timeText(big.total)}, {shareText(big.latency, big.total)} round trips: <b>{verdictOf(big)}</b>
    {big.stalls > 0 ? <>, because the window stalls it {big.stalls.toLocaleString('en-US')} times</> : ''}.</>;
}

export function chattyCaption(l: Link): ReactNode {
  const r = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, l);
  const doubled = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, { ...l, bandwidth: l.bandwidth * 2 });
  const ratio = Math.floor((r.chatty / r.batched) * 10) / 10;
  return <>{CHATTY_CALLS} calls of {sizeText(CHATTY_EACH)}, one after another, take <span className="hl bad">{timeText(r.chatty)}</span>,{' '}
    {shareText(r.waiting, r.chatty)} of it waiting on round trips. One batched call for the same {sizeText(CHATTY_CALLS * CHATTY_EACH)} takes{' '}
    <span className="hl ok">{timeText(r.batched)}</span>: {ratio > 1 ? `about ${ratio}× faster` : 'about the same'}. Doubling the bandwidth would
    save the chatty version only {timeText(r.chatty - doubled.chatty)}.</>;
}
