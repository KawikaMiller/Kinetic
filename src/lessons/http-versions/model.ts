/**
 * An illustrative page-load model for HTTP/1.1, HTTP/2 and HTTP/3: fixed RTT, a fixed
 * bottleneck bandwidth shared fairly by every response that is sending at the same moment
 * (a fluid model: no slow start, no congestion control, no prioritisation), and at most one
 * lost packet. Pure: the waterfalls, the frame strip, the stats and every caption come
 * from `simulate`.
 */

export type Version = 'h1' | 'h2' | 'h3';
export type Kind = 'html' | 'css' | 'js' | 'img';
export type ConnCount = 1 | 2 | 6;

export interface Resource {
  id: string;
  kind: Kind;
  /** Response body size in bytes. */
  size: number;
  /** Server time to produce the response, ms. */
  think: number;
}

/** Illustrative bottleneck bandwidth: 10 Mbit/s = 1,250 bytes per ms. */
export const BANDWIDTH_BYTES_PER_MS = 1250;
/** Round trips before the first request can go out: TCP (1) + TLS 1.3 (1), or QUIC with TLS 1.3 built in (1). */
export const SETUP_RTTS: Record<Version, number> = { h1: 2, h2: 2, h3: 1 };
/** Illustrative recovery time for the one lost packet: about one round trip to notice and resend it. */
export const LOSS_RECOVERY_RTTS = 1;
/** HTTP/2's default maximum DATA frame payload (SETTINGS_MAX_FRAME_SIZE, RFC 9113). */
export const DATA_FRAME_BYTES = 16_384;
/** The resource whose packet is lost, early in its own transfer, while most of the page is still arriving. */
export const LOST_RESOURCE = 'hero.jpg';
/** Share of the lost resource already sent when its packet is lost. */
export const LOSS_AT_FRACTION = 0.1;
/** Server think time that makes config.js the slow response. */
export const SLOW_THINK_MS = 150;

const kb = (n: number) => n * 1000;

/** The preset page: 12 resources (HTML, 2 CSS, 4 JS, 5 images), discovered when the HTML arrives. */
export const PAGE: readonly Resource[] = [
  { id: 'index.html', kind: 'html', size: kb(30), think: 40 },
  { id: 'main.css', kind: 'css', size: kb(40), think: 5 },
  { id: 'theme.css', kind: 'css', size: kb(20), think: 5 },
  { id: 'config.js', kind: 'js', size: kb(10), think: SLOW_THINK_MS },
  { id: 'vendor.js', kind: 'js', size: kb(120), think: 5 },
  { id: 'app.js', kind: 'js', size: kb(80), think: 5 },
  { id: 'analytics.js', kind: 'js', size: kb(30), think: 5 },
  { id: 'hero.jpg', kind: 'img', size: kb(200), think: 5 },
  { id: 'card-1.jpg', kind: 'img', size: kb(60), think: 5 },
  { id: 'card-2.jpg', kind: 'img', size: kb(60), think: 5 },
  { id: 'card-3.jpg', kind: 'img', size: kb(60), think: 5 },
  { id: 'logo.png', kind: 'img', size: kb(10), think: 5 },
];

export interface Params {
  /** Round-trip time, ms. */
  rtt: number;
  /** HTTP/1.1 connections per origin (ignored by HTTP/2 and HTTP/3, which use one). */
  conns: ConnCount;
  loss: boolean;
}

export interface Interval {
  from: number;
  to: number;
}

/** One response, in browser time (ms since the navigation started). */
export interface Timing {
  id: string;
  kind: Kind;
  size: number;
  /** Connection index (HTTP/1.1); always 0 for HTTP/2 and HTTP/3. */
  conn: number;
  /** HTTP/2/3 stream ID: client-initiated streams are odd (1, 3, 5, …), and on HTTP/3 multiples of 4 (0, 4, 8, …). */
  stream: number;
  /** When the browser wanted it. */
  need: number;
  /** When its request left the browser. */
  sent: number;
  /** When the server started sending it. */
  serverStart: number;
  /** When the server sent its last byte. */
  lastSent: number;
  /** First response byte reaches the browser. */
  firstByte: number;
  /** Last byte reaches the browser. */
  done: number;
  /** Browser-time window in which this response couldn't progress because of the lost packet. */
  stall: Interval | null;
  /** Server times at which each DATA frame's last byte was sent (HTTP/2 framing). */
  frames: number[];
}

export interface LossInfo {
  resource: string;
  /** Server time the packet was sent (and lost). */
  sentAt: number;
  /** Browser time the gap is noticed (when the packet should have arrived). */
  at: number;
  /** Browser time the retransmission fills the gap. */
  until: number;
  /** How many responses were held up. */
  stalled: number;
}

export interface Run {
  version: Version;
  timings: Timing[];
  /** When each connection finished its handshakes (browser time). */
  connReady: number[];
  /** Every resource is in the browser. */
  total: number;
  loss: LossInfo | null;
}

const EPS = 1e-6;
/** Bytes of the lost resource still to send at the moment its packet is lost. */
const lossLeft = (tr: { res: Resource }) => tr.res.size * (1 - LOSS_AT_FRACTION);

interface Transfer {
  res: Resource;
  conn: number;
  need: number;
  sent?: number;
  serverStart?: number;
  remaining: number;
  sentBytes: number;
  lastSent?: number;
  done?: number;
  frames: number[];
}

interface Freeze {
  from: number;
  to: number;
  affects: (t: Transfer) => boolean;
}

type Timed =
  | { t: number; kind: 'arrive'; id: string }
  | { t: number; kind: 'clientDone'; id: string }
  | { t: number; kind: 'connReady'; conn: number };

/** Stream IDs: odd from 1 on HTTP/2 (RFC 9113); client bidirectional streams 0, 4, 8, … on HTTP/3 (RFC 9000). */
export const streamId = (version: Version, order: number) => (version === 'h3' ? order * 4 : order * 2 + 1);

/**
 * Load `page` (its first resource is the HTML; the rest are discovered when it finishes)
 * over one HTTP version. Event-driven fluid model: every response that is sending shares
 * the bandwidth equally; a lost packet freezes the responses it blocks for the recovery
 * time (all of them on HTTP/2's one TCP connection, only its own stream on HTTP/3, only its
 * own connection on HTTP/1.1).
 */
export function simulate(version: Version, p: Params, page: readonly Resource[] = PAGE): Run {
  const half = p.rtt / 2;
  const setup = SETUP_RTTS[version] * p.rtt;
  const recovery = LOSS_RECOVERY_RTTS * p.rtt;
  const transfers = new Map<string, Transfer>();
  const order = page.map((r) => r.id);
  const connReady: number[] = [setup];
  const busy: (string | null)[] = [null];
  const queue: string[] = [];
  const timed: Timed[] = [{ t: setup, kind: 'connReady', conn: 0 }];
  let freeze: Freeze | null = null;
  let lossPending = p.loss && page.some((r) => r.id === LOST_RESOURCE);
  let loss: LossInfo | null = null;
  let t = 0;

  const want = (r: Resource, now: number) => {
    transfers.set(r.id, { res: r, conn: 0, need: now, remaining: r.size, sentBytes: 0, frames: [] });
    queue.push(r.id);
  };
  const send = (id: string, conn: number, now: number) => {
    const tr = transfers.get(id)!;
    tr.conn = conn;
    tr.sent = now;
    timed.push({ t: now + half + tr.res.think, kind: 'arrive', id });
  };
  const dispatch = (now: number) => {
    for (let c = 0; c < connReady.length; c++) {
      if (connReady[c] > now + EPS) continue;
      if (version === 'h1') {
        if (busy[c] === null && queue.length) {
          busy[c] = queue.shift()!;
          send(busy[c]!, c, now);
        }
      } else {
        while (queue.length) send(queue.shift()!, c, now);
      }
    }
  };
  const frozen = (tr: Transfer, now: number) => freeze !== null && now >= freeze.from - EPS && now < freeze.to - EPS && freeze.affects(tr);

  want(page[0], 0);
  while ([...transfers.values()].some((tr) => tr.done === undefined) || transfers.size < page.length) {
    const sending = [...transfers.values()].filter((tr) => tr.serverStart !== undefined && tr.lastSent === undefined);
    const active = sending.filter((tr) => !frozen(tr, t));
    const rate = active.length ? BANDWIDTH_BYTES_PER_MS / active.length : 0;
    let next = Infinity;
    for (const e of timed) next = Math.min(next, e.t);
    for (const tr of active) next = Math.min(next, t + tr.remaining / rate);
    if (freeze && t < freeze.to - EPS) next = Math.min(next, freeze.to);
    const lossy = lossPending ? active.find((tr) => tr.res.id === LOST_RESOURCE) : undefined;
    if (lossy && lossy.remaining > lossLeft(lossy) + EPS) next = Math.min(next, t + (lossy.remaining - lossLeft(lossy)) / rate);
    if (!Number.isFinite(next)) throw new Error('http-versions model stalled');

    for (const tr of active) {
      const before = tr.sentBytes;
      const moved = rate * (next - t);
      tr.sentBytes = Math.min(tr.res.size, before + moved);
      tr.remaining = tr.res.size - tr.sentBytes;
      for (let k = Math.floor(before / DATA_FRAME_BYTES + EPS) + 1; k * DATA_FRAME_BYTES <= tr.sentBytes + EPS; k++) {
        tr.frames.push(t + (k * DATA_FRAME_BYTES - before) / rate);
      }
    }
    t = next;

    for (const tr of active) {
      if (tr.remaining <= EPS && tr.lastSent === undefined) {
        tr.remaining = 0;
        tr.lastSent = t;
        if (tr.res.size % DATA_FRAME_BYTES !== 0) tr.frames.push(t);
        timed.push({ t: t + half, kind: 'clientDone', id: tr.res.id });
      }
    }
    if (lossy && lossy.remaining <= lossLeft(lossy) + EPS) {
      lossPending = false;
      const affects =
        version === 'h2' ? () => true : version === 'h3' ? (x: Transfer) => x === lossy : (x: Transfer) => x.conn === lossy.conn;
      freeze = { from: t, to: t + recovery, affects };
      loss = { resource: LOST_RESOURCE, sentAt: t, at: t + half, until: t + recovery + half, stalled: 0 };
    }

    const due = timed.filter((e) => e.t <= t + EPS).sort((a, b) => a.t - b.t);
    for (const e of due) timed.splice(timed.indexOf(e), 1);
    for (const e of due) {
      if (e.kind === 'arrive') transfers.get(e.id)!.serverStart = e.t;
      else if (e.kind === 'connReady') dispatch(e.t);
      else {
        const tr = transfers.get(e.id)!;
        tr.done = e.t;
        if (version === 'h1') busy[tr.conn] = null;
        if (e.id === page[0].id) {
          for (const r of page.slice(1)) want(r, e.t);
          if (version === 'h1') {
            for (let c = 1; c < p.conns; c++) {
              connReady.push(e.t + setup);
              busy.push(null);
              timed.push({ t: e.t + setup, kind: 'connReady', conn: c });
            }
          }
        }
        dispatch(e.t);
      }
    }
  }

  const fz = freeze as Freeze | null;
  const timings = order.map((id, i): Timing => {
    const tr = transfers.get(id)!;
    const serverStart = tr.serverStart!;
    const lastSent = tr.lastSent!;
    let stall: Interval | null = null;
    if (fz && fz.affects(tr) && lastSent > fz.from + EPS && serverStart < fz.to - EPS) {
      stall = { from: Math.max(fz.from, serverStart) + half, to: fz.to + half };
    }
    return {
      id, kind: tr.res.kind, size: tr.res.size, conn: tr.conn, stream: streamId(version, i),
      need: tr.need, sent: tr.sent!, serverStart, lastSent,
      firstByte: serverStart + half, done: tr.done!, stall, frames: tr.frames,
    };
  });
  if (loss) loss.stalled = timings.filter((x) => x.stall).length;
  return { version, timings, connReady, total: Math.max(...timings.map((x) => x.done)), loss };
}

export const simulateAll = (p: Params, page: readonly Resource[] = PAGE): Record<Version, Run> => ({
  h1: simulate('h1', p, page),
  h2: simulate('h2', p, page),
  h3: simulate('h3', p, page),
});

// ── Waterfall segments ──────────────────────────────────────────────────

export type SegmentKind = 'waiting' | 'transfer' | 'stalled';

export interface Segment {
  kind: SegmentKind;
  from: number;
  to: number;
}

/** A response's bar pieces in browser time: waiting (queued, request travelling, server thinking), transfer, and any stall. */
export function segments(x: Timing): Segment[] {
  const out: Segment[] = [];
  const push = (kind: SegmentKind, from: number, to: number) => {
    if (to - from > EPS) out.push({ kind, from, to });
  };
  const s = x.stall;
  if (s && s.from <= x.firstByte + EPS) {
    push('waiting', x.need, x.firstByte);
    push('stalled', x.firstByte, s.to);
    push('transfer', s.to, x.done);
  } else if (s) {
    push('waiting', x.need, x.firstByte);
    push('transfer', x.firstByte, s.from);
    push('stalled', s.from, s.to);
    push('transfer', s.to, x.done);
  } else {
    push('waiting', x.need, x.firstByte);
    push('transfer', x.firstByte, x.done);
  }
  return out;
}

/** What the waterfall can show at browser time `now`: pieces that have started, cut at `now`. */
export const segmentsUntil = (x: Timing, now: number): Segment[] =>
  segments(x).filter((s) => s.from < now - EPS).map((s) => ({ ...s, to: Math.min(s.to, now) }));

// ── HTTP/2 frame strip ──────────────────────────────────────────────────

export interface WireFrame {
  type: 'HEADERS' | 'DATA';
  stream: number;
  id: string;
  kind: Kind;
  /** Browser time it arrives. */
  at: number;
}

/** Response frames on HTTP/2's one connection, in the order they reach the browser. */
export function frameStrip(run: Run, rtt: number): WireFrame[] {
  const half = rtt / 2;
  const out: WireFrame[] = [];
  for (const x of run.timings) {
    out.push({ type: 'HEADERS', stream: x.stream, id: x.id, kind: x.kind, at: x.serverStart + half });
    for (const f of x.frames) out.push({ type: 'DATA', stream: x.stream, id: x.id, kind: x.kind, at: f + half });
  }
  const rank = (f: WireFrame) => (f.type === 'HEADERS' ? 0 : 1);
  return out.sort((a, b) => a.at - b.at || rank(a) - rank(b) || a.stream - b.stream);
}

// ── Header bytes: HTTP/1.1 text vs an HPACK estimate ──────────────────────

/** Huffman coding shrinks typical header text to roughly this share (illustrative ratio). */
export const HUFFMAN_RATIO = 0.8;

export type Header = readonly [name: string, value: string];

const ACCEPT: Record<Kind, string> = {
  html: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  css: 'text/css,*/*;q=0.1',
  js: '*/*',
  img: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
};
export const AUTHORITY = 'shop.example';

/** The request headers a browser sends for one resource (illustrative values). */
export function requestHeaders(r: Pick<Resource, 'id' | 'kind'>): Header[] {
  return [
    [':method', 'GET'],
    [':scheme', 'https'],
    [':authority', AUTHORITY],
    [':path', `/${r.id}`],
    ['user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'],
    ['accept', ACCEPT[r.kind]],
    ['accept-encoding', 'gzip, deflate, br'],
    ['accept-language', 'en-GB,en;q=0.9'],
    ['cookie', 'session=7f3a9c2e41b8; prefs=dark; cart=3'],
  ];
}

/** Bytes of the HTTP/1.1 request head: request line, Host and every other header, as text. */
export function http1HeadBytes(headers: readonly Header[]): number {
  const get = (n: string) => headers.find(([k]) => k === n)?.[1] ?? '';
  let text = `${get(':method')} ${get(':path')} HTTP/1.1\r\nHost: ${get(':authority')}\r\n`;
  for (const [k, v] of headers) if (!k.startsWith(':')) text += `${k}: ${v}\r\n`;
  return new TextEncoder().encode(`${text}\r\n`).length;
}

/** RFC 7541 Appendix A static-table entries this page uses: full name+value pairs, and names. */
const STATIC_PAIRS = new Map<string, number>([[':method\0GET', 2], [':scheme\0https', 7], [':path\0/', 4]]);
const STATIC_NAMES = new Map<string, number>([
  [':authority', 1], [':path', 4], ['accept-encoding', 16], ['accept-language', 17], ['accept', 19], ['cookie', 32], ['user-agent', 58],
]);

/** Bytes for an HPACK integer with an n-bit prefix (RFC 7541 §5.1). */
export function hpackIntBytes(value: number, prefixBits: number): number {
  const max = (1 << prefixBits) - 1;
  if (value < max) return 1;
  let rest = value - max;
  let n = 2;
  while (rest >= 128) {
    rest = Math.floor(rest / 128);
    n++;
  }
  return n;
}

const huffman = (s: string) => Math.ceil(new TextEncoder().encode(s).length * HUFFMAN_RATIO);

/**
 * HPACK estimate for a sequence of header blocks on one connection. A pair already in the
 * static table or sent earlier (the dynamic table) is one indexed field (RFC 7541 §6.1);
 * anything else is a literal with incremental indexing (§6.2.1): the name as a static index,
 * then the value's length and its Huffman-coded bytes. Huffman lengths use HUFFMAN_RATIO,
 * the one illustrative part. Returns the bytes of each block.
 */
export function hpackBlocks(blocks: readonly (readonly Header[])[]): number[] {
  const dynamic: string[] = [];
  const STATIC_SIZE = 61;
  return blocks.map((headers) => {
    let bytes = 0;
    for (const [name, value] of headers) {
      const key = `${name}\0${value}`;
      const stat = STATIC_PAIRS.get(key);
      const dyn = dynamic.indexOf(key);
      if (stat !== undefined) bytes += hpackIntBytes(stat, 7);
      else if (dyn >= 0) bytes += hpackIntBytes(STATIC_SIZE + dynamic.length - dyn, 7);
      else {
        const nameIndex = STATIC_NAMES.get(name);
        const nameBytes = nameIndex !== undefined ? hpackIntBytes(nameIndex, 6) : 1 + hpackIntBytes(huffman(name), 7) + huffman(name);
        const valueLen = huffman(value);
        bytes += nameBytes + hpackIntBytes(valueLen, 7) + valueLen;
        dynamic.push(key);
      }
    }
    return bytes;
  });
}

export interface HeaderBytes {
  http1: number;
  hpack: number;
  /** First request's HPACK block: nothing is in the dynamic table yet. */
  hpackFirst: number;
  /** The last request's block, once the table is warm. */
  hpackLast: number;
}

/** Request header bytes for the whole page: HTTP/1.1 text vs HPACK on one connection. */
export function headerBytes(page: readonly Resource[] = PAGE): HeaderBytes {
  const blocks = page.map(requestHeaders);
  const hp = hpackBlocks(blocks);
  return {
    http1: blocks.reduce((s, b) => s + http1HeadBytes(b), 0),
    hpack: hp.reduce((s, b) => s + b, 0),
    hpackFirst: hp[0],
    hpackLast: hp.at(-1)!,
  };
}

// ── Facts table ─────────────────────────────────────────────────────────

export interface Facts {
  framing: string;
  transport: string;
  compression: string;
  setup: string;
  hol: string;
}

export const FACTS: Record<Version, Facts> = {
  h1: {
    framing: 'Text lines',
    transport: 'TCP',
    compression: 'None',
    setup: `${SETUP_RTTS.h1} RTT (TCP + TLS 1.3)`,
    hol: 'Per connection: one response at a time',
  },
  h2: {
    framing: 'Binary frames',
    transport: 'TCP',
    compression: 'HPACK',
    setup: `${SETUP_RTTS.h2} RTT (TCP + TLS 1.3)`,
    hol: 'Gone at the HTTP layer; TCP loss stalls every stream',
  },
  h3: {
    framing: 'Binary frames',
    transport: 'QUIC over UDP',
    compression: 'QPACK',
    setup: `${SETUP_RTTS.h3} RTT (QUIC + TLS 1.3 together)`,
    hol: 'Per stream: a loss stalls only its own stream',
  },
};

export const VERSION_NAME: Record<Version, string> = { h1: 'HTTP/1.1', h2: 'HTTP/2', h3: 'HTTP/3' };
