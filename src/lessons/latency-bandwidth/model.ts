/**
 * Latency, bandwidth and the window, as one idealised link: no loss, no congestion control,
 * a fixed window the learner sets. Units: bandwidth in bits per second, times in seconds,
 * sizes in bytes (decimal: 1 KB = 1,000 bytes, as network speeds are quoted).
 */

export interface Link {
  /** Round-trip time, s. */
  rtt: number;
  /** Bits per second. */
  bandwidth: number;
  /** Bytes the sender may have in flight before it must wait for an ACK. */
  window: number;
}

export const KB = 1_000;
export const MB = 1_000_000;
export const GB = 1_000_000_000;
export const MBIT = 1_000_000;
export const GBIT = 1_000_000_000;

/** Bandwidth-delay product: the bytes in flight it takes to keep the link busy for a whole round trip. */
export const bdp = (bandwidth: number, rtt: number) => (bandwidth * rtt) / 8;

/** Steady-state throughput, bits/s: the link's rate, or one window per round trip if that's less. */
export const throughput = (l: Link) => Math.min(l.bandwidth, (l.window * 8) / l.rtt);

/** True when the window, not the link, sets the speed. */
export const windowLimited = (l: Link) => l.window < bdp(l.bandwidth, l.rtt);

/** The share of the pipe the window can keep full (1 = full). */
export const fillFraction = (l: Link) => Math.min(1, l.window / bdp(l.bandwidth, l.rtt));

/** Round trips a new HTTPS connection costs before the request: TCP's handshake and TLS 1.3's. */
export const NEW_CONNECTION_RTTS = 2;

export interface TransferTime {
  /** Round trips spent waiting: handshakes, the request itself, and window stalls. */
  roundTrips: number;
  /** Of those, how many are stalls: a full window sent, waiting for its ACK. */
  stalls: number;
  /** Seconds of round-trip waiting. */
  latency: number;
  /** Seconds spent putting the bytes on the wire (size ÷ bandwidth, minus what overlaps a stall). */
  serialization: number;
  total: number;
  dominant: 'latency' | 'bandwidth';
}

/**
 * Time from deciding to fetch `size` bytes until the last byte arrives, on an idealised link:
 * `handshakes` round trips to set up, one for the request and the first byte back, then the
 * bytes at line rate. If the window is smaller than the BDP, the sender stalls after every
 * full window until its ACK returns, which costs a round trip per window after the first.
 */
export function transferTime(size: number, l: Link, handshakes: number): TransferTime {
  const stalls = windowLimited(l) && size > l.window ? Math.ceil(size / l.window) - 1 : 0;
  const serialization = ((size - stalls * l.window) * 8) / l.bandwidth;
  const roundTrips = handshakes + 1 + stalls;
  const latency = roundTrips * l.rtt;
  return { roundTrips, stalls, latency, serialization, total: latency + serialization, dominant: latency >= serialization ? 'latency' : 'bandwidth' };
}

/** n requests one after another on an open connection, each fetching `each` bytes, against one request for all of it. */
export function chattyVsBatched(n: number, each: number, l: Link) {
  const one = transferTime(each, l, 0);
  const chatty = n * one.total;
  const batched = transferTime(n * each, l, 0);
  return { one, chatty, batched: batched.total, batchedParts: batched, waiting: n * one.latency };
}

// ── Presets and slider stops ────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  rtt: number;
  bandwidth: number;
}

export const PRESETS: readonly Preset[] = [
  { id: 'rack', label: 'Same rack', rtt: 0.0005, bandwidth: 25 * GBIT },
  { id: 'continent', label: 'Cross-continent', rtt: 0.08, bandwidth: GBIT },
  { id: 'mobile', label: 'Mobile 4G', rtt: 0.05, bandwidth: 20 * MBIT },
  { id: 'satellite', label: 'Satellite (GEO)', rtt: 0.6, bandwidth: 50 * MBIT },
];

export const RTT_STOPS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.6] as const;
export const BANDWIDTH_STOPS = [
  MBIT, 2 * MBIT, 5 * MBIT, 10 * MBIT, 20 * MBIT, 50 * MBIT, 100 * MBIT, 200 * MBIT, 500 * MBIT, GBIT, 2 * GBIT, 5 * GBIT, 10 * GBIT, 25 * GBIT,
] as const;
export const WINDOW_STOPS = [
  KB, 2 * KB, 5 * KB, 10 * KB, 20 * KB, 64 * KB, 100 * KB, 200 * KB, 500 * KB, MB, 2 * MB, 5 * MB, 10 * MB, 20 * MB, 50 * MB, 100 * MB,
] as const;
export const SIZES = [
  { id: '10k', label: '10 KB', bytes: 10 * KB },
  { id: '1m', label: '1 MB', bytes: MB },
  { id: '100m', label: '100 MB', bytes: 100 * MB },
  { id: '1g', label: '1 GB', bytes: GB },
] as const;

/** The chatty preset: 100 small calls (the spec's 80 ms RTT is the cross-continent preset). */
export const CHATTY_CALLS = 100;
export const CHATTY_EACH = 2 * KB;

/** The index of the stop nearest `v` (on a log scale). */
export const nearestStop = (stops: readonly number[], v: number) =>
  stops.reduce((best, s, i) => (Math.abs(Math.log(s / v)) < Math.abs(Math.log(stops[best] / v)) ? i : best), 0);

// ── Units as text ───────────────────────────────────────────────────────

const trim = (x: number, dp: number) => String(Number(x.toFixed(dp)));

/** 1.5 Gbit/s, 20 Mbit/s, 800 kbit/s. */
export function rateText(bitsPerSecond: number): string {
  if (bitsPerSecond >= GBIT) return `${trim(bitsPerSecond / GBIT, 2)} Gbit/s`;
  if (bitsPerSecond >= MBIT) return `${trim(bitsPerSecond / MBIT, bitsPerSecond >= 10 * MBIT ? 1 : 2)} Mbit/s`;
  return `${trim(bitsPerSecond / 1000, 1)} kbit/s`;
}

/** Decimal bytes: 10 MB, 64 KB, 1.25 GB. */
export function sizeText(bytes: number): string {
  if (bytes >= GB) return `${trim(bytes / GB, 2)} GB`;
  if (bytes >= MB) return `${trim(bytes / MB, 2)} MB`;
  if (bytes >= KB) return `${trim(bytes / KB, 1)} KB`;
  return `${Math.round(bytes)} bytes`;
}

/** 0.5 ms, 80 ms, 1.24 s, 20.3 min. */
export function timeText(seconds: number): string {
  if (seconds < 0.0001) return `${trim(seconds * 1e6, 0)} µs`;
  if (seconds < 1) return `${trim(seconds * 1000, seconds < 0.01 ? 2 : 1)} ms`;
  if (seconds < 120) return `${trim(seconds, 2)} s`;
  if (seconds < 7200) return `${trim(seconds / 60, 1)} min`;
  return `${trim(seconds / 3600, 1)} h`;
}

// ── The animated pipe ───────────────────────────────────────────────────

/** The drawn pipe holds this many blocks in one round trip; one block = BDP ÷ PIPE_SLOTS bytes. */
export const PIPE_SLOTS = 24;
/** On screen, one round trip takes this long whatever the RTT (labelled as slowed down). */
export const ANIM_RTT_S = 2.4;

export const blockBytes = (l: Link) => bdp(l.bandwidth, l.rtt) / PIPE_SLOTS;

/** Blocks the window allows in flight, capped by what the pipe holds. */
export const blocksInFlight = (l: Link) => Math.min(PIPE_SLOTS, Math.max(1, Math.round(l.window / blockBytes(l))));

export interface Block {
  id: number;
  /** 0 → 0.5: data travelling to the receiver; 0.5 → 1: its ACK coming back. */
  u: number;
}

export interface PipeWorld {
  blocks: Block[];
  /** Seconds (animation time) until the sender may put out the next block at line rate. */
  gap: number;
  nextId: number;
  limit: number;
  sent: number;
}

export const createPipe = (limit: number): PipeWorld => ({ blocks: [], gap: 0, nextId: 1, limit, sent: 0 });

/**
 * Advance the drawn pipe by dt seconds of animation: blocks move one loop per ANIM_RTT_S,
 * an ACK reaching the sender frees its slot, and the sender emits a block every
 * ANIM_RTT_S / PIPE_SLOTS (line rate) while fewer than `limit` are in flight.
 */
export function stepPipe(w: PipeWorld, dt: number) {
  for (const b of w.blocks) b.u += dt / ANIM_RTT_S;
  w.blocks = w.blocks.filter((b) => b.u < 1);
  w.gap -= dt;
  const spacing = ANIM_RTT_S / PIPE_SLOTS;
  while (w.gap <= 0 && w.blocks.length < w.limit) {
    w.blocks.push({ id: w.nextId++, u: -w.gap / ANIM_RTT_S });
    w.sent++;
    w.gap += spacing;
  }
  if (w.gap < 0) w.gap = 0;
}
