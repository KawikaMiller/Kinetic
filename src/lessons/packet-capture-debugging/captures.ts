/**
 * Six pre-built captures from a simulated network, as seen on the client's network card:
 * everything the client sends is captured, and only what reaches it from the far side.
 * Sequence and acknowledgment numbers come from a small TCP model (send-next and
 * receive-next per side, with an out-of-order buffer), so retransmissions and duplicate ACKs
 * fall out of the arithmetic instead of being typed in.
 *
 * TLS here is version 1.2, so the certificate and the alert are readable in the capture
 * (TLS 1.3 encrypts them). Addresses are documentation ranges; MACs are made up.
 */
import { ipv4 } from '../../core/ipv4';
import { mulberry32 } from '../../core/random';
import { PROTO_TCP, PROTO_UDP, SNAPLEN, buildFrame, type TcpFlag } from './wire';

export const CLIENT = ipv4('192.0.2.10');
export const RESOLVER = ipv4('198.51.100.53');
export const SERVER = ipv4('203.0.113.10');
/** Locally administered (the 0x02 bit), so they can't clash with a real vendor's. */
export const CLIENT_MAC = [0x02, 0x00, 0x5e, 0x00, 0x53, 0x0a];
export const GATEWAY_MAC = [0x02, 0x00, 0x5e, 0x00, 0x53, 0x01];
export const NAME = 'shop.example';
/** `.invalid` is reserved (RFC 6761): it never resolves. */
export const MISSING_NAME = 'shop.invalid';
export const CLIENT_PORT = 51514;
export const DNS_PORT = 40001;
export const HTTPS = 443;
const CLIENT_ISN = 0x6a1f2c00;
const SERVER_ISN = 0x1d4e9a00;
const SERVER_TTL = 52;
const RESOLVER_TTL = 60;
const CLIENT_TTL = 64;
/** Linux waits 1 s before the first SYN retransmission and doubles the wait each time. */
export const SYN_RTO_S = 1;

export type Side = 'client' | 'server' | 'resolver';
export type Tag = 'dns' | 'handshake' | 'ack' | 'data' | 'fin' | 'rst' | 'retransmission' | 'dup-ack' | 'tls-alert';

export interface Captured {
  no: number;
  t: number;
  from: Side;
  to: Side;
  /** The whole frame as sent, and the part the capture kept (SNAPLEN). */
  frame: number[];
  captured: number[];
  protocol: 'DNS' | 'TCP' | 'TLSv1.2';
  info: string;
  tag: Tag;
  tcp?: { seq: number; ack: number; flags: TcpFlag[]; len: number; relSeq: number; relAck: number };
  dns?: { id: number; name: string; type: 'A' | 'AAAA'; response: boolean; rcode: 0 | 3; answer?: string };
  tls?: { record: string; alert?: string };
}

export type DiagnosisId = 'healthy' | 'refused' | 'timeout' | 'loss' | 'dns' | 'tls';

export interface Capture {
  id: string;
  /** Shown to the learner: deliberately not a spoiler. */
  label: string;
  answer: DiagnosisId;
  packets: Captured[];
}

const ipOf: Record<Side, number> = { client: CLIENT, server: SERVER, resolver: RESOLVER };
const ttlOf: Record<Side, number> = { client: CLIENT_TTL, server: SERVER_TTL, resolver: RESOLVER_TTL };

// ── Payloads ────────────────────────────────────────────────────────────

function dnsName(name: string): number[] {
  return [...name.split('.').flatMap((l) => [l.length, ...[...l].map((c) => c.charCodeAt(0))]), 0];
}
const TYPE_CODE = { A: 1, AAAA: 28 } as const;

/** A DNS message: header, one question, and for a NOERROR A response one answer (TTL 300). */
export function dnsMessage(id: number, name: string, type: 'A' | 'AAAA', response: false | { rcode: 0 | 3; answer?: number }): number[] {
  const flags = response ? 0x8180 | response.rcode : 0x0100;
  const an = response && response.answer !== undefined ? 1 : 0;
  const q = [...dnsName(name), 0, TYPE_CODE[type], 0, 1];
  const answer = an && response ? [0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0x01, 0x2c, 0, 4, ...[24, 16, 8, 0].map((s) => (response.answer! >>> s) & 0xff)] : [];
  return [id >> 8, id & 0xff, flags >> 8, flags & 0xff, 0, 1, 0, an, 0, 0, 0, 0, ...q, ...answer];
}

const TLS_CONTENT = { changeCipherSpec: 0x14, handshake: 0x16, alert: 0x15, appData: 0x17 } as const;
/** A TLS 1.2 record of `len` bytes in total; the body is deterministic filler after the first type byte. */
function tlsRecord(content: number, len: number, first: number[], seed: number): number[] {
  const rnd = mulberry32(seed);
  const body = [...first, ...Array.from({ length: Math.max(0, len - 5 - first.length) }, () => Math.floor(rnd() * 256))];
  const n = len - 5;
  return [content, 0x03, 0x03, n >> 8, n & 0xff, ...body].slice(0, len);
}
export const ALERTS = { bad_certificate: 42 } as const;
const alertRecord = (description: number) => [TLS_CONTENT.alert, 0x03, 0x03, 0, 2, 2, description];

// ── A capture being built ───────────────────────────────────────────────

interface Endpoint {
  isn: number;
  sndNxt: number;
  rcvNxt: number;
  ooo: Map<number, number>;
  lastPureAck: number | null;
  dupCount: number;
  dupOf: number;
}

class Builder {
  packets: Captured[] = [];
  t = 0;
  private ipId = 0x3e00;
  private ep: Record<'client' | 'server', Endpoint> = {
    client: { isn: CLIENT_ISN, sndNxt: CLIENT_ISN, rcvNxt: 0, ooo: new Map(), lastPureAck: null, dupCount: 0, dupOf: 0 },
    server: { isn: SERVER_ISN, sndNxt: SERVER_ISN, rcvNxt: 0, ooo: new Map(), lastPureAck: null, dupCount: 0, dupOf: 0 },
  };
  private peerIsn: number | null = null;

  at(t: number) {
    this.t = t;
    return this;
  }

  /** The sequence number `side` will use for its next new segment. */
  nextSeq(side: 'client' | 'server') {
    return this.ep[side].sndNxt;
  }

  private push(p: Omit<Captured, 'no' | 'captured' | 't'>) {
    this.packets.push({ ...p, no: this.packets.length + 1, t: this.t, captured: p.frame.slice(0, SNAPLEN) });
  }

  private frame(from: Side, to: Side, proto: typeof PROTO_TCP | typeof PROTO_UDP, sport: number, dport: number, payload: number[], tcp?: { seq: number; ack: number; flags: TcpFlag[]; window?: number }) {
    return buildFrame({
      srcMac: from === 'client' ? CLIENT_MAC : GATEWAY_MAC, dstMac: from === 'client' ? GATEWAY_MAC : CLIENT_MAC,
      src: ipOf[from], dst: ipOf[to], ttl: ttlOf[from], id: this.ipId++, proto, sport, dport, payload, ...tcp,
    });
  }

  dns(from: 'client' | 'resolver', id: number, name: string, type: 'A' | 'AAAA', response: false | { rcode: 0 | 3; answer?: number }) {
    const payload = dnsMessage(id, name, type, response);
    const [sport, dport] = from === 'client' ? [DNS_PORT, 53] : [53, DNS_PORT];
    const hex = `0x${id.toString(16).padStart(4, '0')}`;
    const info = !response
      ? `Standard query ${hex} ${type} ${name}`
      : response.rcode === 3
        ? `Standard query response ${hex} No such name ${type} ${name}`
        : `Standard query response ${hex} ${type} ${name} ${type} ${[24, 16, 8, 0].map((s) => (response.answer! >>> s) & 0xff).join('.')}`;
    this.push({
      from, to: from === 'client' ? 'resolver' : 'client', frame: this.frame(from, from === 'client' ? 'resolver' : 'client', PROTO_UDP, sport, dport, payload),
      protocol: 'DNS', info, tag: 'dns',
      dns: { id, name, type, response: !!response, rcode: response ? response.rcode : 0, answer: response && response.answer !== undefined ? info.split(' ').at(-1) : undefined },
    });
    return this;
  }

  /**
   * One TCP segment from `from`. `lost`: it never reaches the other side (and if it came from
   * the server, the client's capture never sees it). `retransmit`: resend from this sequence
   * number. `rawSeq` overrides the sequence number outright (a RST answering a SYN uses 0).
   */
  tcp(from: 'client' | 'server', flags: TcpFlag[], payload: number[] = [], opts: { lost?: boolean; retransmit?: number; rawSeq?: number; tls?: Captured['tls']; tag?: Tag } = {}) {
    const me = this.ep[from];
    const other = from === 'client' ? 'server' : 'client';
    const peer = this.ep[other];
    const len = payload.length;
    const consumes = len + (flags.includes('SYN') ? 1 : 0) + (flags.includes('FIN') ? 1 : 0);
    const seq = opts.rawSeq ?? opts.retransmit ?? me.sndNxt;
    if (opts.retransmit === undefined && opts.rawSeq === undefined) me.sndNxt += consumes;
    const ack = flags.includes('ACK') ? me.rcvNxt : 0;

    let tag: Tag = opts.tag ?? (flags.includes('RST') ? 'rst' : flags.includes('SYN') ? 'handshake' : flags.includes('FIN') ? 'fin' : len ? 'data' : 'ack');
    const pureAck = flags.length === 1 && flags[0] === 'ACK' && len === 0;
    let dupNote = '';
    if (pureAck && me.lastPureAck === ack && opts.retransmit === undefined) {
      if (me.dupCount === 0) me.dupOf = this.packets.findLast((p) => p.from === from && p.tcp?.ack === ack)!.no;
      me.dupCount++;
      tag = 'dup-ack';
      dupNote = `[TCP Dup ACK ${me.dupOf}#${me.dupCount}] `;
    } else if (pureAck) {
      me.dupCount = 0;
    }
    if (pureAck) me.lastPureAck = ack;
    if (opts.retransmit !== undefined) tag = 'retransmission';

    // Delivery: the receiver's next expected byte only moves on in-order data.
    if (!opts.lost && !flags.includes('RST')) {
      if (flags.includes('SYN')) peer.rcvNxt = seq + 1;
      else if (consumes && seq === peer.rcvNxt) {
        peer.rcvNxt += consumes;
        while (peer.ooo.has(peer.rcvNxt)) {
          const n = peer.ooo.get(peer.rcvNxt)!;
          peer.ooo.delete(peer.rcvNxt);
          peer.rcvNxt += n;
        }
      } else if (consumes && seq > peer.rcvNxt) peer.ooo.set(seq, consumes);
    }
    if (from === 'server' && this.peerIsn === null) this.peerIsn = seq;

    const sport = from === 'client' ? CLIENT_PORT : HTTPS;
    const dport = from === 'client' ? HTTPS : CLIENT_PORT;
    const isnOf = (s: 'client' | 'server') => (s === 'client' ? CLIENT_ISN : this.peerIsn ?? SERVER_ISN);
    const relSeq = seq - isnOf(from);
    const relAck = ack ? ack - isnOf(other) : 0;
    // The handshake's third packet: the first ACK, Seq=1 Ack=1.
    if (tag === 'ack' && relSeq === 1 && relAck === 1) tag = 'handshake';
    if (from === 'server' && opts.lost) return this;

    const shown = (['SYN', 'FIN', 'RST', 'PSH', 'ACK'] as TcpFlag[]).filter((f) => flags.includes(f)).join(', ');
    const tcpInfo = `${sport} → ${dport} [${shown}] Seq=${relSeq}${flags.includes('ACK') ? ` Ack=${relAck}` : ''} Len=${len}`;
    const info = `${opts.retransmit !== undefined ? '[TCP Retransmission] ' : ''}${dupNote}${opts.tls ? opts.tls.record : tcpInfo}`;
    this.push({
      from, to: other, frame: this.frame(from, other, PROTO_TCP, sport, dport, payload, { seq, ack, flags, window: flags.includes('RST') ? 0 : undefined }), protocol: opts.tls ? 'TLSv1.2' : 'TCP', info, tag,
      tcp: { seq, ack, flags, len, relSeq, relAck }, tls: opts.tls,
    });
    return this;
  }
}

// ── The scenarios ───────────────────────────────────────────────────────

const RTT = 0.04;
const DNS_RTT = 0.012;

function lookup(b: Builder, t = 0) {
  return b.at(t).dns('client', 0x1a2b, NAME, 'A', false).at(t + DNS_RTT).dns('resolver', 0x1a2b, NAME, 'A', { rcode: 0, answer: SERVER });
}
function handshake(b: Builder, t: number) {
  return b.at(t).tcp('client', ['SYN']).at(t + RTT).tcp('server', ['SYN', 'ACK']).at(t + RTT + 0.0002).tcp('client', ['ACK']);
}
/** A ChangeCipherSpec record: content type 20, TLS 1.2, length 1, the single byte 1. */
const CCS = [TLS_CONTENT.changeCipherSpec, 0x03, 0x03, 0x00, 0x01, 0x01];
const hello = (seed: number) => tlsRecord(TLS_CONTENT.handshake, 517, [0x01], seed);
const serverFlight = (seed: number) => tlsRecord(TLS_CONTENT.handshake, 1380, [0x02], seed);

/** The TLS 1.2 handshake up to the encrypted request. */
function tlsHandshake(b: Builder, t: number) {
  b.at(t).tcp('client', ['PSH', 'ACK'], hello(1), { tls: { record: 'Client Hello' } });
  b.at(t + RTT).tcp('server', ['PSH', 'ACK'], serverFlight(2), { tls: { record: 'Server Hello, Certificate, Server Hello Done' } });
  // One segment can carry several records: ChangeCipherSpec is its own record type (20), never inside a handshake record.
  b.at(t + RTT + 0.002).tcp('client', ['PSH', 'ACK'], [...tlsRecord(TLS_CONTENT.handshake, 75, [0x10], 3), ...CCS, ...tlsRecord(TLS_CONTENT.handshake, 45, [0x14], 7)], {
    tls: { record: 'Client Key Exchange, Change Cipher Spec, Finished' },
  });
  b.at(t + 2 * RTT + 0.002).tcp('server', ['PSH', 'ACK'], [...CCS, ...tlsRecord(TLS_CONTENT.handshake, 45, [0x14], 4)], { tls: { record: 'Change Cipher Spec, Finished' } });
  b.at(t + 2 * RTT + 0.003).tcp('client', ['PSH', 'ACK'], tlsRecord(TLS_CONTENT.appData, 210, [0x00], 5), { tls: { record: 'Application Data' } });
  return b;
}
function close(b: Builder, t: number) {
  return b.at(t).tcp('client', ['FIN', 'ACK']).at(t + RTT).tcp('server', ['FIN', 'ACK']).at(t + RTT + 0.0002).tcp('client', ['ACK']);
}

export function healthy(): Captured[] {
  const b = new Builder();
  lookup(b);
  handshake(b, 0.014);
  tlsHandshake(b, 0.0545);
  b.at(0.2).tcp('server', ['PSH', 'ACK'], tlsRecord(TLS_CONTENT.appData, 900, [0x00], 6), { tls: { record: 'Application Data' } });
  b.at(0.2003).tcp('client', ['ACK']);
  close(b, 0.21);
  return b.packets;
}

export function refused(): Captured[] {
  const b = new Builder();
  lookup(b);
  b.at(0.014).tcp('client', ['SYN']).at(0.014 + RTT).tcp('server', ['RST', 'ACK'], [], { rawSeq: 0 });
  return b.packets;
}

/** The SYN and its retransmissions, every wait doubling, and never an answer. */
export const DROP_RETRIES = 3;
export function dropped(): Captured[] {
  const b = new Builder();
  lookup(b);
  const t0 = 0.014;
  b.at(t0).tcp('client', ['SYN'], [], { lost: true });
  let wait = SYN_RTO_S;
  let t = t0;
  for (let i = 0; i < DROP_RETRIES; i++) {
    t += wait;
    b.at(t).tcp('client', ['SYN'], [], { lost: true, retransmit: CLIENT_ISN });
    wait *= 2;
  }
  return b.packets;
}

export const LOSS_SEGMENTS = 5;
export const LOST_SEGMENT = 2;
export const MSS = 1400;
/** The response arrives in five segments; the second is lost on the way, so the client keeps asking for it. */
export function lossy(): Captured[] {
  const b = new Builder();
  lookup(b);
  handshake(b, 0.014);
  tlsHandshake(b, 0.0545);
  let t = 0.2;
  const segs = Array.from({ length: LOSS_SEGMENTS }, (_, i) => tlsRecord(TLS_CONTENT.appData, MSS, [0x00], 10 + i));
  let lostSeq = 0;
  segs.forEach((s, i) => {
    const n = i + 1;
    if (n === LOST_SEGMENT) {
      lostSeq = b.nextSeq('server');
      b.at(t).tcp('server', ['PSH', 'ACK'], s, { lost: true });
    } else {
      b.at(t).tcp('server', ['PSH', 'ACK'], s, { tls: { record: 'Application Data' } });
      b.at(t + 0.0002).tcp('client', ['ACK']);
    }
    t += 0.001;
  });
  t += RTT / 2;
  b.at(t).tcp('server', ['PSH', 'ACK'], segs[LOST_SEGMENT - 1], { retransmit: lostSeq, tls: { record: 'Application Data' } });
  b.at(t + 0.0002).tcp('client', ['ACK']);
  close(b, t + 0.01);
  return b.packets;
}

export function dnsFailure(): Captured[] {
  const b = new Builder();
  b.at(0).dns('client', 0x5c01, MISSING_NAME, 'A', false).at(0.0001).dns('client', 0x5c02, MISSING_NAME, 'AAAA', false);
  b.at(DNS_RTT).dns('resolver', 0x5c01, MISSING_NAME, 'A', { rcode: 3 }).at(DNS_RTT + 0.0001).dns('resolver', 0x5c02, MISSING_NAME, 'AAAA', { rcode: 3 });
  return b.packets;
}

export function tlsFailure(): Captured[] {
  const b = new Builder();
  lookup(b);
  handshake(b, 0.014);
  b.at(0.0545).tcp('client', ['PSH', 'ACK'], hello(1), { tls: { record: 'Client Hello' } });
  b.at(0.0545 + RTT).tcp('server', ['PSH', 'ACK'], serverFlight(2), { tls: { record: 'Server Hello, Certificate, Server Hello Done' } });
  b.at(0.0547 + RTT).tcp('client', ['ACK']);
  b.at(0.0552 + RTT).tcp('client', ['PSH', 'ACK'], alertRecord(ALERTS.bad_certificate), {
    tls: { record: 'Alert (Level: Fatal, Description: Bad Certificate)', alert: 'bad_certificate' }, tag: 'tls-alert',
  });
  close(b, 0.0555 + RTT);
  return b.packets;
}

export const CAPTURES: readonly Capture[] = [
  { id: 'c1', label: 'Capture 1', answer: 'timeout', packets: dropped() },
  { id: 'c2', label: 'Capture 2', answer: 'healthy', packets: healthy() },
  { id: 'c3', label: 'Capture 3', answer: 'dns', packets: dnsFailure() },
  { id: 'c4', label: 'Capture 4', answer: 'loss', packets: lossy() },
  { id: 'c5', label: 'Capture 5', answer: 'tls', packets: tlsFailure() },
  { id: 'c6', label: 'Capture 6', answer: 'refused', packets: refused() },
];
