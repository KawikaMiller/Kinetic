import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { ipToString } from '../../core/ipv4';
import type { Carve } from './planner';
import { cidrText, ipOf, asIntended, type Flow, type FlowEnd, type Hop, type Trace, type VpcConfig, OUTSIDE_IP, FLOWS, traceFlow } from './vpc';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface TraceFrame extends Frame {
  /** How many hops have happened when this frame is on screen. */
  shown: number;
}

export const endText = (cfg: VpcConfig, e: FlowEnd): string => (e === 'internet' || e === 'updates' ? ipToString(OUTSIDE_IP[e]) : ipToString(ipOf(cfg, e)));

/** The one-line outcome of a trace, from the trace itself. */
export function outcomeText(t: Trace): string {
  const d = t.hops.find((h) => h.verdict === 'drop');
  return d ? `dropped at ${d.title}` : 'delivered, and the reply came back';
}

const hopClass = (h: Hop) => (h.verdict === 'drop' ? 'hl bad' : h.verdict === 'pass' ? 'hl ok' : 'hl');
const hopWord = (h: Hop) => (h.verdict === 'drop' ? 'Dropped' : h.verdict === 'pass' ? 'Passed' : 'Note');

export function hopCaption(h: Hop): ReactNode {
  return (
    <>
      {h.leg === 'reply' ? 'Reply: ' : ''}
      <span className={hopClass(h)}>{hopWord(h)}</span> at {h.title}. {h.text}
    </>
  );
}

export function summaryCaption(flow: Flow, t: Trace): ReactNode {
  const wanted = flow.intended === 'reach' ? 'This flow is meant to get through' : 'This flow is meant to be stopped';
  const ok = asIntended(flow, t);
  const d = t.hops.find((h) => h.verdict === 'drop');
  return (
    <>
      {d ? (
        <>
          <span className="hl bad">Dropped</span> at {d.title}.{' '}
        </>
      ) : (
        <>
          <span className="hl ok">Delivered</span>: the request and its reply both got through, after {plural(t.hops.filter((h) => h.verdict !== 'info').length, 'check')}.{' '}
        </>
      )}
      {wanted}, so the design is <span className={ok ? 'hl ok' : 'hl bad'}>{ok ? 'as intended' : 'not as intended'}</span> here.
    </>
  );
}

/** One frame for the start, one per hop, one for the summary. */
export function traceFrames(cfg: VpcConfig, flow: Flow, t: Trace): TraceFrame[] {
  const frames: TraceFrame[] = [
    {
      shown: 0,
      say: (
        <>
          <span className="hl info">{flow.label}</span>: a packet for tcp {flow.port} leaves {endText(cfg, flow.from)} for {endText(cfg, flow.to)}. Each check below is made in the order the model makes it, request first and then the reply.
        </>
      ),
    },
  ];
  t.hops.forEach((h, i) => frames.push({ shown: i + 1, say: hopCaption(h) }));
  frames.push({ shown: t.hops.length, say: summaryCaption(flow, t) });
  return frames;
}

/** A sentence for the rules scene, from the six flows under the config. */
export function rulesIntro(cfg: VpcConfig): ReactNode {
  const results = FLOWS.map((f) => ({ f, t: traceFlow(cfg, f) }));
  const bad = results.filter((r) => !asIntended(r.f, r.t));
  if (bad.length === 0) {
    return (
      <>
        All {FLOWS.length} flows do what the design wants: <span className="hl ok">{results.filter((r) => r.f.intended === 'reach').length} get through</span> and <span className="hl ok">{results.filter((r) => r.f.intended === 'blocked').length} are stopped</span>.
      </>
    );
  }
  const first = bad[0];
  return (
    <>
      <span className="hl bad">{plural(bad.length, 'flow')}</span> {bad.length === 1 ? 'is' : 'are'} not as intended. First: {first.f.label}, which is {outcomeText(first.t)} when it {first.f.intended === 'reach' ? 'should get through' : 'should be stopped'}.
    </>
  );
}

/** The planner's headline sentence, from the carve. */
export function carveCaption(c: Carve): ReactNode {
  const counted = c.accepted.length;
  const refused = c.rows.length - counted;
  return (
    <>
      {plural(counted, 'subnet')} counted, giving <span className="hl ok">{c.usable.toLocaleString('en-US')} usable addresses</span>
      {refused > 0 ? <>; {plural(refused, 'row')} not counted (see the messages)</> : null}. The unused part of {cidrText(c.vpc)} is {c.freeAddresses.toLocaleString('en-US')} addresses
      {c.largestFree ? <>, the largest free block being {cidrText(c.largestFree)}</> : null}.
    </>
  );
}
