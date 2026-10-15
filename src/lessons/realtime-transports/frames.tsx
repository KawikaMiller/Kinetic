import type { ReactNode } from 'react';
import { ms } from '../../core/format';
import { timeFrames } from '../../core/frames';
import type { Frame } from '../../core/types';
import {
  BACK, CLIENT_SENDS, DROP, DURATION, LONG_POLL_TIMEOUT, TRANSPORTS, TRANSPORT_NAME, counters, type HandshakeLine, type Lane, type Params, type ServerEvent,
  type Transport,
} from './model';

export interface RtFrame extends Frame {
  now: number;
}

export const sec = (t: number) => `${t.toFixed(1)} s`;
/** A delivery delay: milliseconds under a second, seconds above. */
export const delayText = (seconds: number) => (seconds < 1 ? ms(seconds * 1000) : sec(seconds));
/** A rate: one decimal below 10 per second, so 0.2/s doesn't read as 0/s. */
export const rateText = (perSecond: number) => `${perSecond < 10 ? (Math.round(perSecond * 10) / 10).toString() : Math.round(perSecond).toLocaleString('en-US')}/s`;

interface Milestone {
  t: number;
  say: ReactNode;
}

export function intro(p: Params): ReactNode {
  return <>The same chat messages reach the server at the same moments (seeded), and four browsers each use a different way to hear about
    them. Short polling asks every {p.interval} s. Press play: 60 simulated seconds.</>;
}

/** Second reconnect handshake = when a long-lived connection came back. */
const reconnectAt = (lane: Lane) => lane.bars.filter((b) => b.kind === 'handshake')[1]?.to ?? null;

export function milestones(events: ServerEvent[], lanes: Record<Transport, Lane>, p: Params): Milestone[] {
  const out: Milestone[] = [];
  const first = events[0];
  if (first) {
    const got = TRANSPORTS.map((t) => ({ t, d: lanes[t].deliveries.find((d) => d.id === first.id) }));
    const last = Math.max(...got.map((g) => g.d?.delivered ?? 0));
    out.push({
      t: last,
      say: <>Message #1 reached the server at {sec(first.t)}. It took{' '}
        {got.map((g, i) => <span key={g.t}>{i ? (i === got.length - 1 ? ' and ' : ', ') : ''}{g.d ? delayText(g.d.delivered - g.d.at) : 'forever'} on {TRANSPORT_NAME[g.t]}</span>)}
        : short polling waits for its next poll; the others are already listening.</>,
    });
  }
  const timeout = lanes.long.bars.find((b) => b.kind === 'timeout');
  if (timeout) {
    out.push({
      t: timeout.to,
      say: <>Long polling: the server held one request for {LONG_POLL_TIMEOUT} s with nothing to say, so it answered with an empty 200 and the
        browser asked again at once. Proxies and load balancers often cut idle requests sooner, which is why timeouts stay short.</>,
    });
  }
  if (p.disconnect) {
    out.push({
      t: DROP,
      say: <><span className="hl bad">The network dropped</span> at {sec(DROP)} for {BACK - DROP} s. The SSE and WebSocket connections died with it (noticed at
        once here; really, a missed heartbeat or a timeout can take much longer), and polls fail until it's back.</>,
    });
    const sse = reconnectAt(lanes.sse);
    if (sse !== null) {
      const lastSeen = Math.max(0, ...lanes.sse.deliveries.filter((d) => d.delivered < DROP).map((d) => d.id));
      out.push({
        t: sse,
        say: <>EventSource reconnected by itself at {sec(sse)}, sending <b>Last-Event-ID: {lastSeen}</b>, and the server replayed{' '}
          <span className="hl ok">{lanes.sse.replayed} missed {lanes.sse.replayed === 1 ? 'event' : 'events'}</span>: no gap. (Only because this server keeps recent events to replay.)</>,
      });
    }
    const ws = reconnectAt(lanes.ws);
    if (ws !== null) {
      out.push({
        t: ws,
        say: p.resync
          ? <>The app reconnected its WebSocket at {sec(ws)} (the API has no auto-reconnect) and sent its own "resync since #…" message:{' '}
            <span className="hl ok">{lanes.ws.replayed} {lanes.ws.replayed === 1 ? 'event' : 'events'}</span> came back a round trip later.</>
          : <>The app reconnected its WebSocket at {sec(ws)}, but nothing in the protocol resends what it missed:{' '}
            <span className="hl bad">{lanes.ws.missed.length} {lanes.ws.missed.length === 1 ? 'event is' : 'events are'} gone</span> unless the app resyncs.</>,
      });
    }
  }
  for (const at of TALLY_AT) out.push({ t: at, say: tally(events, lanes, at) });
  if (p.clientSends) {
    const t = CLIENT_SENDS[0];
    out.push({
      t,
      say: <>At {sec(t)} the browser sends a message of its own (sky blue). Only the WebSocket carries it on the connection it already has;
        polling, long polling and SSE each need a separate HTTP request.</>,
    });
  }
  return out;
}

/** Running totals shown during the run. */
export const TALLY_AT = [15, 30, 45];

/** What each lane had cost by time `at`: HTTP requests started and empty answers received. */
export function tallyAt(lane: Lane, at: number): { requests: number; empty: number } {
  const started = lane.bars.filter((b) => b.from <= at && ['request', 'empty', 'failed', 'hanging', 'handshake'].includes(b.kind));
  const sends = lane.transport === 'ws' ? [] : lane.bars.filter((b) => b.kind === 'send' && b.from <= at);
  const empty = lane.bars.filter((b) => (b.kind === 'empty' || b.kind === 'timeout') && b.to <= at).length;
  return { requests: started.length + sends.length, empty };
}

function tally(events: ServerEvent[], lanes: Record<Transport, Lane>, at: number): ReactNode {
  const happened = events.filter((e) => e.t <= at).length;
  const poll = tallyAt(lanes.poll, at);
  const long = tallyAt(lanes.long, at);
  return <>By {sec(at)}: {happened} {happened === 1 ? 'message' : 'messages'} so far. Short polling has made {poll.requests} requests ({poll.empty} came back
    empty), long polling {long.requests}, while SSE and WebSocket have used {tallyAt(lanes.sse, at).requests} and {tallyAt(lanes.ws, at).requests}.</>;
}

export function summary(lanes: Record<Transport, Lane>): ReactNode {
  const c = Object.fromEntries(TRANSPORTS.map((t) => [t, counters(lanes[t], 1)])) as Record<Transport, ReturnType<typeof counters>>;
  return <>After {DURATION} s: short polling made {c.poll.requests} requests ({c.poll.wasted} came back empty), long polling {c.long.requests},
    SSE {c.sse.requests} and WebSocket {c.ws.requests}. Simulated server and network; latencies and byte counts are illustrative.</>;
}

const MILESTONE_HOLD = 3;

/** One frame per simulated second, plus a captioned frame at each milestone, then the summary. */
export function buildFrames(events: ServerEvent[], lanes: Record<Transport, Lane>, p: Params): RtFrame[] {
  return timeFrames({ end: DURATION, steps: DURATION, milestones: milestones(events, lanes, p), intro: intro(p), summary: summary(lanes), hold: MILESTONE_HOLD });
}

// ── Handshake scene ─────────────────────────────────────────────────────

export interface HsFrame extends Frame {
  step: number;
}

const HS_SAY: Record<'ws' | 'sse', ReactNode[]> = {
  ws: [
    <>An ordinary HTTP/1.1 GET, asking to <b>Upgrade: websocket</b>. The random Sec-WebSocket-Key proves the server really speaks WebSocket.</>,
    <><span className="hl ok">101 Switching Protocols</span>: the server hashes the key with a fixed GUID (SHA-1, base64) into Sec-WebSocket-Accept. From
      here the TCP connection carries WebSocket frames, not HTTP.</>,
    <>The server pushes a frame whenever it likes: a 2-byte header for a short message, far less than a fresh HTTP request's headers.</>,
    <>The browser sends on the same connection; client-to-server frames are masked (a 4-byte key), so a reply costs 6 bytes of header.</>,
    <>Both directions, any time, one connection. The catch: no built-in reconnect or replay; the app has to handle both.</>,
  ],
  sse: [
    <>SSE is plain HTTP: a GET that accepts <b>text/event-stream</b>. After a drop, the browser repeats it by itself with a <b>Last-Event-ID</b> header.</>,
    <><span className="hl ok">200 OK</span>, and the response simply never ends. <code>retry: 3000</code> sets the reconnection delay.</>,
    <>Each event is a few lines of text ending in a blank line; its <code>id</code> is what Last-Event-ID repeats after a drop.</>,
    <>SSE is one-way, server to client: to talk back, the browser makes a normal request.</>,
    <>More events on the same open response. Simpler than WebSocket and plain HTTP, though proxies that buffer or time out idle responses can still break a stream; the browser reconnects by itself.</>,
  ],
};

export function handshakeFrames(kind: 'ws' | 'sse', steps: readonly HandshakeLine[]): HsFrame[] {
  return [
    { step: -1, say: kind === 'ws' ? <>How a WebSocket starts: as HTTP. Press play.</> : <>How an SSE stream starts. Press play.</> },
    ...steps.map((_, i) => ({ step: i, say: HS_SAY[kind][i], hold: 1.4 })),
  ];
}
