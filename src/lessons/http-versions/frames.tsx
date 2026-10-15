import type { ReactNode } from 'react';
import { ms } from '../../core/format';
import { timeFrames } from '../../core/frames';
import type { Frame } from '../../core/types';
import { LOST_RESOURCE, SETUP_RTTS, SLOW_THINK_MS, VERSION_NAME, type Params, type Run, type Version } from './model';

export interface HvFrame extends Frame {
  /** Browser time shown, ms. */
  now: number;
}

export interface Milestone {
  t: number;
  say: ReactNode;
}

/** Plain time steps between milestones. */
export const TIME_STEPS = 40;
const MILESTONE_HOLD = 2.5;

const VERSIONS: Version[] = ['h1', 'h2', 'h3'];

export function intro(p: Params): ReactNode {
  return <>The browser wants <b>index.html</b>. All three versions start together with the same illustrative RTT ({ms(p.rtt)}) and
    bandwidth, and HTTP/1.1 may open {p.conns === 1 ? 'only 1 connection' : `up to ${p.conns} connections`}. Press play.</>;
}

/** What happened, version by version, at the moments that matter. Each caption is in the past tense, so it stays true until the next. */
export function milestones(runs: Record<Version, Run>, p: Params): Milestone[] {
  const out: Milestone[] = [];
  for (const v of VERSIONS) {
    const run = runs[v];
    const name = VERSION_NAME[v];
    const ready = run.connReady[0];
    out.push({
      t: ready,
      say: v === 'h3'
        ? <><b>{name}</b> finished its one combined QUIC + TLS 1.3 handshake after {SETUP_RTTS.h3} RTT ({ms(ready)}) and sent the HTML request.</>
        : <><b>{name}</b> finished TCP + TLS 1.3 after {SETUP_RTTS[v]} RTT ({ms(ready)}) and sent the HTML request.</>,
    });
    const html = run.timings[0].done;
    const rest = run.timings.length - 1;
    if (v === 'h1') {
      out.push({
        t: html,
        say: p.conns === 1
          ? <><b>{name}</b> got the HTML at {ms(html)} and queued {rest} requests on its single connection: one request, one response, then the next.</>
          : <><b>{name}</b> got the HTML at {ms(html)}, queued {rest} requests and started {p.conns - 1} more connections, each paying its own{' '}
            {SETUP_RTTS.h1} RTT handshake before it can carry one request at a time.</>,
      });
      if (p.conns > 1) {
        const extra = run.connReady[1];
        out.push({
          t: extra,
          say: <><b>{name}</b>: the {p.conns - 1} new connections finished their handshakes at {ms(extra)}, {ms(extra - html)} after the HTML, and each
            took one queued request. Until then connection 1 worked through the queue alone.</>,
        });
      }
      const slow = run.timings.find((x) => x.id === 'config.js')!;
      const behind = run.timings.find((x) => x.conn === slow.conn && Math.abs(x.sent - slow.done) < 1e-6);
      if (behind) {
        out.push({
          t: behind.sent,
          say: <><b>{name}</b>: <b>{behind.id}</b> waited {ms(behind.sent - behind.need)} for a free connection. It got connection {slow.conn + 1} only when
            config.js's slow response ({SLOW_THINK_MS} ms of server time) finished: head-of-line blocking at the HTTP layer.</>,
        });
      }
    } else {
      out.push({
        t: html,
        say: <><b>{name}</b> got the HTML at {ms(html)} and sent all {rest} requests at once as streams on the same connection; their frames
          interleave on the wire.</>,
      });
    }
    if (run.loss) {
      const l = run.loss;
      out.push({
        t: l.at,
        say: v === 'h2'
          ? <><span className="hl bad">✕ A packet of {LOST_RESOURCE} was lost</span>. TCP delivers bytes strictly in order, so <b>all {l.stalled} streams</b>{' '}
            still in flight on {name} stalled until the retransmission arrived at {ms(l.until)}: head-of-line blocking at the transport layer.</>
          : v === 'h3'
            ? <><span className="hl bad">✕ The same loss</span> on {name} stalled only the stream whose data was in the lost packet, {LOST_RESOURCE} (QUIC recovers each stream separately, though one packet can carry
              several streams' data); the other streams kept using the link.</>
            : <><span className="hl bad">✕ The same loss</span> on {name} stalled only connection {runs.h1.timings.find((x) => x.id === LOST_RESOURCE)!.conn + 1},
              the one carrying {LOST_RESOURCE}.
              {p.conns === 1 ? ' With a single connection, everything queued behind it waits anyway.' : p.conns === 2 ? ' The other connection is a separate TCP stream and keeps going.' : ` The other ${p.conns - 1} connections are separate TCP streams and keep going.`}</>,
      });
    }
    out.push({ t: run.total, say: <><span className="hl ok">{name} finished</span>: all {run.timings.length} resources in at {ms(run.total)}.</> });
  }
  return mergeSameTime(out);
}

/** Milestones at the same moment become one caption, so none flashes past unseen. */
function mergeSameTime(list: Milestone[]): Milestone[] {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const out: Milestone[] = [];
  for (const m of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.t - m.t) < 1e-6) last.say = <>{last.say} {m.say}</>;
    else out.push({ ...m });
  }
  return out;
}

export function summary(runs: Record<Version, Run>, p: Params): ReactNode {
  const order = [...VERSIONS].sort((a, b) => runs[a].total - runs[b].total);
  return <>Done. Fastest to slowest: {order.map((v, i) => <span key={v}>{i ? ', ' : ''}<b>{VERSION_NAME[v]}</b> {ms(runs[v].total)}</span>)}
    {p.loss ? ' (with the one lost packet)' : ''}. Illustrative model: fixed RTT, sizes and loss; real browsers and servers prioritise and
    pace differently.</>;
}

/** Evenly spaced time steps plus one captioned frame per milestone, then the summary. */
export function buildFrames(runs: Record<Version, Run>, p: Params, end: number): HvFrame[] {
  return timeFrames({ end, steps: TIME_STEPS, milestones: milestones(runs, p), intro: intro(p), summary: summary(runs, p), hold: MILESTONE_HOLD });
}
