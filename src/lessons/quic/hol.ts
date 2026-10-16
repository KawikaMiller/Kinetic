/**
 * Head-of-line blocking. Several streams share one connection; each stream's data sits in packets in a fixed send order.
 * A packet takes half a round trip to arrive. A lost packet is noticed and resent: its copy arrives one round trip later
 * than the original would have. Over TCP (HTTP/2) the bytes of every stream come out in the order they were sent, so a
 * stream's data waits for every earlier packet. Over QUIC each stream is delivered in order on its own, so it waits only for
 * its own packets. No congestion control, no reordering other than the loss, no second loss of the resend.
 */
export type StreamId = string;
/** A packet is the list of streams that have data in it. */
export type Packet = readonly StreamId[];
export interface Layout {
  streams: readonly StreamId[];
  packets: readonly Packet[];
}

/** Spacing between packet sends, ms. */
export const PACKET_GAP_MS = 10;

/** Four streams over ten packets; packet 6 holds only stream D's data. */
export const DEFAULT_LAYOUT: Layout = {
  streams: ['A', 'B', 'C', 'D'],
  packets: [['A', 'B'], ['C'], ['D'], ['A'], ['B', 'C'], ['D'], ['A'], ['B'], ['C'], ['D']],
};
export const DEFAULT_LOST: readonly number[] = [5];

export interface StreamTimes {
  stream: StreamId;
  /** When the stream's first packet arrives. */
  first: number;
  /** When the stream has all its data, with nothing lost. */
  clean: number;
  /** The same over TCP, with the lost packets. */
  tcp: number;
  /** The same over QUIC, with the lost packets. */
  quic: number;
}

export interface HolRun {
  /** Arrival of each packet, with its loss (indexed like layout.packets). */
  arrivals: number[];
  cleanArrivals: number[];
  streams: StreamTimes[];
}

/** Completion time of every stream with and without the lost packets (0-based indexes). */
export function holRun(layout: Layout, lost: readonly number[], rttMs: number): HolRun {
  const clean = layout.packets.map((_, k) => k * PACKET_GAP_MS + rttMs / 2);
  const arrivals = clean.map((t, k) => (lost.includes(k) ? t + rttMs : t));
  const prefix: number[] = [];
  arrivals.forEach((t, k) => prefix.push(Math.max(t, k === 0 ? 0 : prefix[k - 1])));
  const streams = layout.streams.map((stream) => {
    const idx = layout.packets.flatMap((p, k) => (p.includes(stream) ? [k] : []));
    const last = idx[idx.length - 1];
    return {
      stream,
      first: clean[idx[0]],
      clean: Math.max(...idx.map((k) => clean[k])),
      tcp: prefix[last],
      quic: Math.max(...idx.map((k) => arrivals[k])),
    };
  });
  return { arrivals, cleanArrivals: clean, streams };
}

export interface HolSummary {
  /** Streams that finish later than with no loss, over each stack. */
  tcpDelayed: number;
  quicDelayed: number;
  /** The last stream's finish time. */
  tcpEnd: number;
  quicEnd: number;
}

export function summariseHol(run: HolRun): HolSummary {
  const late = (pick: (s: StreamTimes) => number) => run.streams.filter((s) => pick(s) > s.clean).length;
  return {
    tcpDelayed: late((s) => s.tcp),
    quicDelayed: late((s) => s.quic),
    tcpEnd: Math.max(...run.streams.map((s) => s.tcp)),
    quicEnd: Math.max(...run.streams.map((s) => s.quic)),
  };
}

/** Streams that have data in the packet, as the table prints them. */
export const packetText = (p: Packet): string => p.join(' + ');

export const toggleLost = (lost: readonly number[], k: number): number[] => (lost.includes(k) ? lost.filter((x) => x !== k) : [...lost, k].sort((a, b) => a - b));
