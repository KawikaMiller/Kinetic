/**
 * Four ways to get server events to a browser, over one seeded event stream: short polling,
 * long polling, Server-Sent Events and WebSocket. A simulated server and network: fixed
 * illustrative RTT and header sizes, one optional network outage. Pure: the lanes, the
 * counters and the captions all come from `simulate`.
 */
import { mulberry32 } from '../../core/random';

export type Transport = 'poll' | 'long' | 'sse' | 'ws';
export const TRANSPORTS: Transport[] = ['poll', 'long', 'sse', 'ws'];
export const TRANSPORT_NAME: Record<Transport, string> = {
  poll: 'Short polling',
  long: 'Long polling',
  sse: 'Server-Sent Events',
  ws: 'WebSocket',
};

/** Simulated seconds shown. */
export const DURATION = 60;
/** Events only arrive before this, so every transport can deliver them inside the window. */
export const EVENTS_UNTIL = 58;
/** Illustrative round-trip time, s. */
export const RTT = 0.1;
export const ONE_WAY = RTT / 2;
/** A long-poll request the server holds this long with no event comes back empty. */
export const LONG_POLL_TIMEOUT = 30;
/** EventSource's reconnection delay (browser-defined; about 3 s is typical). */
export const SSE_RETRY = 3;
/** The app's own WebSocket reconnect interval (the API has no auto-reconnect). */
export const WS_RETRY = 2;
/** How often a long-polling client retries while its requests fail. */
export const LONG_POLL_RETRY = 2;
/** Illustrative HTTP request + response header bytes per exchange. */
export const HTTP_HEADER_BYTES = 800;
/** RFC 6455 §5.2: a server→client frame with under 126 payload bytes has a 2-byte header; client frames add a 4-byte mask key. */
export const WS_SERVER_FRAME_HEADER = 2;
/** What an SSE event adds around its payload: `id: N`, `data: ` and the blank line that ends it (WHATWG HTML, server-sent events). */
export const sseFramingBytes = (id: number): number => `id: ${id}
data: `.length + 2;
export const WS_CLIENT_FRAME_HEADER = 6;
/** The outage when "disconnect" is on: the network is down from DROP to BACK. */
export const DROP = 20;
export const BACK = 25;
/** When the client sends its own messages (the "client sends too" toggle). */
export const CLIENT_SENDS = [12, 41];
/** Polling intervals that divide the duration, so the request count is exact. */
export const POLL_INTERVALS = [1, 2, 3, 5, 10, 15, 20, 30];

export type Rate = 'rare' | 'normal' | 'chatty';
export const MEAN_GAP: Record<Rate, number> = { rare: 12, normal: 5, chatty: 1.5 };
const SEED: Record<Rate, number> = { rare: 12, normal: 7, chatty: 3 };

export interface ServerEvent {
  id: number;
  t: number;
}

/** Chat messages arriving at the server: exponential gaps from a fixed seed, so every run is the same. */
export function eventStream(rate: Rate): ServerEvent[] {
  const rnd = mulberry32(SEED[rate]);
  const out: ServerEvent[] = [];
  let t = 0;
  for (;;) {
    t += -Math.log(1 - rnd()) * MEAN_GAP[rate];
    if (t >= EVENTS_UNTIL) return out;
    out.push({ id: out.length + 1, t: Math.round(t * 1000) / 1000 });
  }
}

export interface Params {
  interval: number;
  rate: Rate;
  disconnect: boolean;
  /** WebSocket only: after reconnecting, ask the server for what was missed (app-level). */
  resync: boolean;
  clientSends: boolean;
}

export type BarKind = 'request' | 'empty' | 'failed' | 'hanging' | 'stream' | 'handshake' | 'send' | 'timeout';

export interface LaneBar {
  kind: BarKind;
  from: number;
  to: number;
}

export interface Delivery {
  id: number;
  /** When the event reached the server. */
  at: number;
  /** When the browser had it. */
  delivered: number;
}

export interface Lane {
  transport: Transport;
  bars: LaneBar[];
  deliveries: Delivery[];
  /** Events that never reached the browser. */
  missed: ServerEvent[];
  /** HTTP requests the client made (WebSocket: its handshakes). */
  requests: number;
  /** Responses that carried no event. */
  wasted: number;
  failed: number;
  /** HTTP header bytes plus per-message framing (WebSocket frame headers, SSE `id:`/`data:` lines) for the whole run. */
  headerBytes: number;
  /** Seconds a connection was busy with a request or a held-open stream (idle keep-alive sockets between polls are not counted). */
  openSeconds: number;
  /** Extra requests the client needed to send its own messages. */
  sendRequests: number;
  /** SSE / WebSocket: events replayed after a reconnect. */
  replayed: number;
}

const down = (p: Params, from: number, to: number) => p.disconnect && from < BACK && to > DROP;
const inOutage = (p: Params, t: number) => p.disconnect && t >= DROP && t < BACK;

function emptyLane(transport: Transport): Lane {
  return { transport, bars: [], deliveries: [], missed: [], requests: 0, wasted: 0, failed: 0, headerBytes: 0, openSeconds: 0, sendRequests: 0, replayed: 0 };
}

/** The client's own messages: one extra HTTP request each, except over a WebSocket. */
function addSends(lane: Lane, p: Params) {
  if (!p.clientSends) return;
  for (const t of CLIENT_SENDS) {
    if (lane.transport === 'ws') {
      lane.bars.push({ kind: 'send', from: t, to: t + ONE_WAY });
      lane.headerBytes += WS_CLIENT_FRAME_HEADER;
    } else {
      lane.bars.push({ kind: 'send', from: t, to: t + RTT });
      lane.requests++;
      lane.sendRequests++;
      lane.headerBytes += HTTP_HEADER_BYTES;
      lane.openSeconds += RTT;
    }
  }
}

/** Short polling: after the page's first load at t = 0, a request every `interval` s, each asking for events since the last one it saw. */
function shortPoll(events: ServerEvent[], p: Params): Lane {
  const lane = emptyLane('poll');
  let seen = 0;
  for (let k = 1; k * p.interval <= DURATION + 1e-9; k++) {
    const s = k * p.interval;
    lane.requests++;
    lane.headerBytes += HTTP_HEADER_BYTES;
    lane.openSeconds += RTT;
    if (down(p, s, s + RTT)) {
      lane.failed++;
      lane.bars.push({ kind: 'failed', from: s, to: s + RTT });
      continue;
    }
    const serverAt = s + ONE_WAY;
    const batch = events.filter((e) => e.id > seen && e.t <= serverAt);
    for (const e of batch) lane.deliveries.push({ id: e.id, at: e.t, delivered: s + RTT });
    if (batch.length) seen = batch.at(-1)!.id;
    else lane.wasted++;
    lane.bars.push({ kind: batch.length ? 'request' : 'empty', from: s, to: s + RTT });
  }
  return lane;
}

/** Long polling: the server holds each request until there is an event or the timeout, then the client asks again at once. */
function longPoll(events: ServerEvent[], p: Params): Lane {
  const lane = emptyLane('long');
  let seen = 0;
  let s = 0;
  while (s < DURATION) {
    if (inOutage(p, s)) {
      // Each try fails while the network is down; retry until it is back.
      lane.requests++;
      lane.failed++;
      lane.headerBytes += HTTP_HEADER_BYTES;
      lane.bars.push({ kind: 'failed', from: s, to: s + RTT });
      s += LONG_POLL_RETRY;
      continue;
    }
    lane.requests++;
    lane.headerBytes += HTTP_HEADER_BYTES;
    const arrive = s + ONE_WAY;
    const pending = events.filter((e) => e.id > seen && e.t <= arrive);
    const next = events.find((e) => e.id > seen && e.t > arrive);
    let respond = pending.length ? arrive : Math.min(next ? next.t : Infinity, arrive + LONG_POLL_TIMEOUT);
    if (p.disconnect && arrive < DROP && respond + ONE_WAY > DROP) {
      // The held request dies with the network; noticed at once here (really: a timeout or a TCP reset).
      lane.bars.push({ kind: 'hanging', from: s, to: DROP });
      lane.openSeconds += DROP - s;
      lane.failed++;
      s = DROP;
      continue;
    }
    if (respond > DURATION + ONE_WAY) respond = DURATION + ONE_WAY;
    const batch = events.filter((e) => e.id > seen && e.t <= respond);
    // The run ends at DURATION: a request still held then is cut there, so it can't count time past the run.
    const got = Math.min(respond + ONE_WAY, DURATION);
    lane.bars.push({ kind: 'hanging', from: s, to: got });
    lane.openSeconds += got - s;
    if (batch.length) {
      for (const e of batch) lane.deliveries.push({ id: e.id, at: e.t, delivered: got });
      seen = batch.at(-1)!.id;
    } else if (respond < DURATION) {
      lane.wasted++;
      lane.bars.push({ kind: 'timeout', from: got - 0.2, to: got });
    }
    s = got;
  }
  return lane;
}

/**
 * A long-lived connection (SSE or WebSocket): open at t = 0 after one round trip, events pushed
 * as they happen. A drop is noticed at once (really: a missed heartbeat or a TCP reset); the
 * client reconnects every `retry` s until the network is back. `replay` decides whether the
 * events sent while it was gone come back.
 */
function persistent(transport: 'sse' | 'ws', events: ServerEvent[], p: Params): Lane {
  const lane = emptyLane(transport);
  const retry = transport === 'sse' ? SSE_RETRY : WS_RETRY;
  const replay = transport === 'sse' || p.resync;
  const handshake = (at: number) => {
    lane.requests++;
    lane.headerBytes += HTTP_HEADER_BYTES;
    lane.bars.push({ kind: 'handshake', from: at, to: at + RTT });
  };
  const push = (e: ServerEvent, delivered: number) => {
    lane.deliveries.push({ id: e.id, at: e.t, delivered });
    lane.headerBytes += transport === 'ws' ? WS_SERVER_FRAME_HEADER : sseFramingBytes(e.id);
  };
  handshake(0);
  const open = RTT;
  if (!p.disconnect) {
    lane.bars.push({ kind: 'stream', from: open, to: DURATION });
    lane.openSeconds = DURATION;
    for (const e of events) push(e, Math.max(e.t, open - ONE_WAY) + ONE_WAY);
    return lane;
  }
  lane.bars.push({ kind: 'stream', from: open, to: DROP });
  let tryAt = DROP + retry;
  while (inOutage(p, tryAt)) {
    lane.requests++;
    lane.failed++;
    lane.headerBytes += HTTP_HEADER_BYTES;
    lane.bars.push({ kind: 'failed', from: tryAt, to: tryAt + RTT });
    tryAt += retry;
  }
  handshake(tryAt);
  const reopened = tryAt + RTT;
  /** WebSocket resync is an app message after the socket opens: one more round trip. */
  const replayAt = transport === 'sse' ? reopened : reopened + RTT;
  if (transport === 'ws' && p.resync) lane.headerBytes += WS_CLIENT_FRAME_HEADER;
  lane.bars.push({ kind: 'stream', from: reopened, to: DURATION });
  lane.openSeconds = DROP + (DURATION - tryAt);
  for (const e of events) {
    if (e.t < DROP - ONE_WAY) push(e, Math.max(e.t, open - ONE_WAY) + ONE_WAY);
    else if (e.t < reopened - ONE_WAY) {
      if (replay) {
        push(e, replayAt);
        lane.replayed++;
      } else lane.missed.push(e);
    } else push(e, e.t + ONE_WAY);
  }
  lane.deliveries.sort((a, b) => a.delivered - b.delivered || a.id - b.id);
  return lane;
}

export function simulate(p: Params): { events: ServerEvent[]; lanes: Record<Transport, Lane> } {
  const events = eventStream(p.rate);
  const lanes: Record<Transport, Lane> = {
    poll: shortPoll(events, p),
    long: longPoll(events, p),
    sse: persistent('sse', events, p),
    ws: persistent('ws', events, p),
  };
  for (const t of TRANSPORTS) addSends(lanes[t], p);
  return { events, lanes };
}

// ── Counters ────────────────────────────────────────────────────────────

export interface Counters {
  requests: number;
  wasted: number;
  failed: number;
  meanDelay: number | null;
  maxDelay: number | null;
  missed: number;
  headerBytes: number;
  /** Connections busy with a request (or holding a stream open), averaged over the run, for `clients` clients. */
  openConnections: number;
  /** Steady-state HTTP requests per second at the server for `clients` clients: SSE and WebSocket connection setup isn't counted. */
  requestsPerSec: number;
}

export const delays = (lane: Lane) => lane.deliveries.map((d) => d.delivered - d.at);

export function counters(lane: Lane, clients: number): Counters {
  const ds = delays(lane);
  return {
    requests: lane.requests,
    wasted: lane.wasted,
    failed: lane.failed,
    meanDelay: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null,
    maxDelay: ds.length ? Math.max(...ds) : null,
    missed: lane.missed.length,
    headerBytes: lane.headerBytes,
    openConnections: (lane.openSeconds / DURATION) * clients,
    requestsPerSec: ((lane.transport === 'sse' || lane.transport === 'ws' ? lane.sendRequests : lane.requests) / DURATION) * clients,
  };
}

/** Client counts on the slider: 1 to 10,000 in roughly ×3 steps. */
export const CLIENT_STOPS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10_000];

// ── The WebSocket upgrade (RFC 6455 §1.3, §4) and an SSE stream (WHATWG HTML) ─────

/** RFC 6455 §1.3's sample key and the accept value it gives. */
export const WS_KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
export const WS_ACCEPT = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
/** The GUID the server appends to the key before hashing (RFC 6455 §1.3). */
export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface HandshakeLine {
  from: 'client' | 'server';
  label: string;
  note?: string;
  lines: string[];
}

const MSG_HI = '{"from":"Ada","text":"hi all"}';
const MSG_HEY = '{"from":"Ben","text":"hey"}';
const MSG_LUNCH = '{"from":"Ada","text":"lunch?"}';
/** UTF-8 payload length, as a frame header would carry it. */
export const payloadBytes = (s: string) => new TextEncoder().encode(s).length;

export const WS_HANDSHAKE: HandshakeLine[] = [
  {
    from: 'client', label: 'GET /chat HTTP/1.1', note: 'Upgrade: websocket',
    lines: ['GET /chat HTTP/1.1', 'Host: chat.example', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${WS_KEY}`, 'Sec-WebSocket-Version: 13'],
  },
  {
    from: 'server', label: '101 Switching Protocols', note: 'same TCP connection, now WebSocket',
    lines: ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${WS_ACCEPT}`],
  },
  { from: 'server', label: 'text frame: new message', note: '2-byte header, unmasked', lines: [`[frame] FIN text, ${payloadBytes(MSG_HI)} bytes: ${MSG_HI}`] },
  { from: 'client', label: 'text frame: reply', note: '6-byte header: client frames are masked', lines: [`[frame] FIN text, masked, ${payloadBytes(MSG_HEY)} bytes (shown unmasked here): ${MSG_HEY}`] },
  { from: 'server', label: 'text frame: new message', note: 'either side can send at any time', lines: [`[frame] FIN text, ${payloadBytes(MSG_LUNCH)} bytes: ${MSG_LUNCH}`] },
];

export const SSE_HANDSHAKE: HandshakeLine[] = [
  {
    from: 'client', label: 'GET /events HTTP/1.1', note: 'Accept: text/event-stream',
    lines: ['GET /events HTTP/1.1', 'Host: chat.example', 'Accept: text/event-stream'],
  },
  {
    from: 'server', label: '200 OK, text/event-stream', note: 'the response never ends',
    lines: ['HTTP/1.1 200 OK', 'Content-Type: text/event-stream', 'Cache-Control: no-cache', '', 'retry: 3000'],
  },
  { from: 'server', label: 'id: 1, data: …', note: 'an event is lines of text and a blank line', lines: ['id: 1', `data: ${MSG_HI}`, ''] },
  { from: 'client', label: 'POST /messages', note: 'the client talks back with a normal request', lines: ['POST /messages HTTP/1.1', 'Content-Type: application/json', '', MSG_HEY] },
  { from: 'server', label: 'id: 2, data: …', note: 'on the same open response', lines: ['id: 2', `data: ${MSG_LUNCH}`, ''] },
];
