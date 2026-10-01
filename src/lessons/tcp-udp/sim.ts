// Tick-based simulation of the same 12-packet transfer over TCP and over UDP.
// Deterministic for a given seed, so the step player can rewind it.
//
// TCP here is a small but honest model: cumulative ACKs ("next byte I expect"),
// receiver buffers out-of-order data but only hands the app an in-order prefix,
// one retransmission timer, and Tahoe-style congestion control (slow start,
// then on timeout: ssthresh = cwnd/2, cwnd = 1, go back to the first unacked).

import { mulberry32 } from '../../core/random';

export const N = 12;
/** One-way link latency in ticks. */
export const LATENCY = 6;
/** Retransmission timeout in ticks (a bit more than one round trip). */
export const RTO = 2 * LATENCY + 4;
export const MAX_WIN = 8;
/** Safety cap; heavy loss means many back-to-back timeouts, so leave room. */
const MAX_TICKS = 900;

export interface FlightView {
  id: number;
  seq: number;
  /** 0 → sender, 1 → receiver. Lost packets stop at 0.5. */
  p: number;
  lost: boolean;
  dead: boolean;
  retx: boolean;
}

export interface AckView {
  id: number;
  ack: number;
  p: number;
}

export type SendState = 'unsent' | 'sent' | 'acked';

export interface TcpView {
  status: SendState[];
  flights: FlightView[];
  acks: AckView[];
  buffer: number[];
  delivered: number[];
  cwnd: number;
  ssthresh: number;
  retransmits: number;
  lastDeliver: number;
  longestStall: number;
  done: boolean;
  doneAt: number | null;
}

export interface UdpView {
  sent: number;
  flights: FlightView[];
  delivered: number[];
  lost: number[];
  done: boolean;
  doneAt: number | null;
}

export type SimEvent =
  | { kind: 'tcp-loss'; seq: number }
  | { kind: 'udp-loss'; seq: number }
  | { kind: 'retx'; seq: number; cwnd: number }
  | { kind: 'hol'; waiting: number; held: number[] }
  | { kind: 'release'; seqs: number[] }
  | { kind: 'udp-reorder'; seq: number; before: number }
  | { kind: 'udp-done' }
  | { kind: 'tcp-done' };

export interface Tick {
  t: number;
  tcp: TcpView;
  udp: UdpView;
  cwnd: number[];
  events: SimEvent[];
}

interface Flight {
  id: number;
  seq: number;
  sent: number;
  arrive: number;
  lost: boolean;
  retx: boolean;
}

interface Ack {
  id: number;
  ack: number;
  sent: number;
  arrive: number;
}

const DROP_AT = 0.5;
/** How long a dropped packet's ✕ lingers on screen, in ticks. */
const DEAD_LINGER = 3;

function view(f: Flight, t: number): FlightView | null {
  const span = f.arrive - f.sent;
  const p = (t - f.sent) / span;
  if (f.lost) {
    const dropTick = f.sent + span * DROP_AT;
    if (t > dropTick + DEAD_LINGER) return null;
    return { id: f.id, seq: f.seq, p: Math.min(p, DROP_AT), lost: true, dead: p >= DROP_AT, retx: f.retx };
  }
  if (t >= f.arrive) return null;
  return { id: f.id, seq: f.seq, p, lost: false, dead: false, retx: f.retx };
}

export function simulate(seed: number, loss: number, reorder: number): Tick[] {
  const rT = mulberry32(seed);
  const rU = mulberry32(seed ^ 0x9e3779b9);
  let nextId = 1;

  const transmit = (rng: () => number, seq: number, t: number, forceLoss: boolean, retx: boolean): Flight => {
    const extra = rng() < reorder ? 1 + Math.floor(rng() * 4) : 0;
    const lost = forceLoss || rng() < loss;
    return { id: nextId++, seq, sent: t, arrive: t + LATENCY + extra, lost, retx };
  };

  // TCP state
  let base = 1;
  let nextSeq = 1;
  let cwnd = 1;
  let ssthresh = MAX_WIN;
  let timerStart = 0;
  let expected = 1;
  const everSent = new Set<number>();
  const buffer = new Set<number>();
  const tcpDelivered: number[] = [];
  let tcpFlights: Flight[] = [];
  let acks: Ack[] = [];
  let retransmits = 0;
  let lastDeliver = -1;
  let longestStall = 0;
  let tcpDoneAt: number | null = null;
  let holAnnounced = false;

  // UDP state
  let udpSent = 0;
  let udpFlights: Flight[] = [];
  const udpDelivered: number[] = [];
  const udpLost: number[] = [];
  let udpDoneAt: number | null = null;

  const cwndHist: number[] = [];
  const ticks: Tick[] = [];

  for (let t = 0; t < MAX_TICKS; t++) {
    const events: SimEvent[] = [];

    // ── TCP ──────────────────────────────────────────────────────────
    // 1. data reaching the receiver
    for (const f of tcpFlights) {
      if (f.lost || f.arrive !== t) continue;
      if (f.seq === expected) {
        const released = [f.seq];
        expected++;
        while (buffer.has(expected)) {
          buffer.delete(expected);
          released.push(expected);
          expected++;
        }
        if (lastDeliver >= 0) longestStall = Math.max(longestStall, t - lastDeliver);
        lastDeliver = t;
        tcpDelivered.push(...released);
        if (released.length > 1) events.push({ kind: 'release', seqs: released });
        if (!buffer.size) holAnnounced = false;
      } else if (f.seq > expected && !buffer.has(f.seq)) {
        buffer.add(f.seq);
        if (!holAnnounced) {
          holAnnounced = true;
          events.push({ kind: 'hol', waiting: expected, held: [...buffer].sort((a, b) => a - b) });
        }
      }
      acks.push({ id: nextId++, ack: expected, sent: t, arrive: t + LATENCY });
    }
    // lost packets announce themselves when they vanish mid-link
    for (const f of tcpFlights) {
      if (f.lost && Math.floor(f.sent + (f.arrive - f.sent) * DROP_AT) === t) events.push({ kind: 'tcp-loss', seq: f.seq });
    }

    // 2. ACKs reaching the sender
    for (const a of acks) {
      if (a.arrive !== t || a.ack <= base) continue;
      const newly = a.ack - base;
      base = a.ack;
      for (let i = 0; i < newly; i++) cwnd += cwnd < ssthresh ? 1 : 1 / cwnd;
      cwnd = Math.min(cwnd, MAX_WIN);
      if (nextSeq < base) nextSeq = base;
      timerStart = t;
    }

    // 3. retransmission timeout
    if (base <= N && nextSeq > base && t - timerStart >= RTO) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      cwnd = 1;
      nextSeq = base;
      timerStart = t;
      events.push({ kind: 'retx', seq: base, cwnd });
    }

    // 4. send (link carries one packet per tick)
    if (nextSeq <= N && nextSeq - base < Math.floor(cwnd)) {
      const retx = everSent.has(nextSeq);
      if (retx) retransmits++;
      if (nextSeq === base) timerStart = t;
      // Script one early loss so the story always shows up; the rest is random.
      const force = loss > 0 && nextSeq === 4 && !retx;
      tcpFlights.push(transmit(rT, nextSeq, t, force, retx));
      everSent.add(nextSeq);
      nextSeq++;
    }

    if (tcpDoneAt === null && base > N && tcpDelivered.length === N) {
      tcpDoneAt = t;
      events.push({ kind: 'tcp-done' });
    }

    // ── UDP ──────────────────────────────────────────────────────────
    for (const f of udpFlights) {
      if (f.lost) {
        if (Math.floor(f.sent + (f.arrive - f.sent) * DROP_AT) === t) {
          udpLost.push(f.seq);
          events.push({ kind: 'udp-loss', seq: f.seq });
        }
        continue;
      }
      if (f.arrive !== t) continue;
      const maxSoFar = Math.max(0, ...udpDelivered);
      if (f.seq < maxSoFar && !events.some((e) => e.kind === 'udp-reorder')) {
        events.push({ kind: 'udp-reorder', seq: f.seq, before: maxSoFar });
      }
      udpDelivered.push(f.seq);
    }
    if (udpSent < N) {
      udpSent++;
      udpFlights.push(transmit(rU, udpSent, t, loss > 0 && udpSent === 5, false));
    }
    if (udpDoneAt === null && udpSent === N && udpDelivered.length + udpLost.length === N) {
      udpDoneAt = t;
      events.push({ kind: 'udp-done' });
    }

    cwndHist.push(cwnd);

    const status: SendState[] = Array.from({ length: N }, (_, i) =>
      i + 1 < base ? 'acked' : everSent.has(i + 1) ? 'sent' : 'unsent',
    );
    ticks.push({
      t,
      tcp: {
        status,
        flights: tcpFlights.map((f) => view(f, t)).filter((f): f is FlightView => !!f),
        acks: acks.filter((a) => t < a.arrive).map((a) => ({ id: a.id, ack: a.ack, p: (t - a.sent) / (a.arrive - a.sent) })),
        buffer: [...buffer].sort((a, b) => a - b),
        delivered: tcpDelivered.slice(),
        cwnd,
        ssthresh,
        retransmits,
        lastDeliver,
        longestStall,
        done: tcpDoneAt !== null,
        doneAt: tcpDoneAt,
      },
      udp: {
        sent: udpSent,
        flights: udpFlights.map((f) => view(f, t)).filter((f): f is FlightView => !!f),
        delivered: udpDelivered.slice(),
        lost: udpLost.slice().sort((a, b) => a - b),
        done: udpDoneAt !== null,
        doneAt: udpDoneAt,
      },
      cwnd: cwndHist.slice(),
      events,
    });

    // drop finished flights so the arrays stay small
    tcpFlights = tcpFlights.filter((f) => view(f, t + 1) || f.arrive >= t);
    udpFlights = udpFlights.filter((f) => view(f, t + 1) || f.arrive >= t);
    acks = acks.filter((a) => a.arrive >= t);

    if (tcpDoneAt !== null && udpDoneAt !== null && t >= Math.max(tcpDoneAt, udpDoneAt) + 3) break;
  }
  return ticks;
}
