import type { ReactNode } from 'react';
import { ipToString } from '../../core/ipv4';
import type { Frame } from '../../core/types';
import { CLIENT, type Capture, type Captured, type DiagnosisId } from './captures';
import { PATH, type ProbeResult } from './trace';
import { diagnosisOf } from './views';

const secs = (t: number) => `${Math.round(t * 1000) / 1000} s`;

export function captureIntro(c: Capture): ReactNode {
  return <>{c.label}: {c.packets.length} packets, recorded on the client's network card ({ipToString(CLIENT)}). Click a packet to decode it,
    filter the list, then pick the diagnosis that fits.</>;
}

/** What one packet tells you, from its own fields. */
export function packetCaption(p: Captured, all: readonly Captured[]): ReactNode {
  const n = <>Packet {p.no}</>;
  if (p.dns) {
    if (!p.dns.response) return <>{n}: a <span className="hl violet">DNS query</span>: "what is the {p.dns.type} record for {p.dns.name}?"</>;
    if (p.dns.rcode === 3)
      return <>{n}: the resolver answers <span className="hl violet">No such name</span> (NXDOMAIN, rcode 3) for {p.dns.name} {p.dns.type}. With no address, there's nothing to connect to.</>;
    return <>{n}: the resolver answers <span className="hl violet">{p.dns.name} = {p.dns.answer}</span>. Now the client knows where to connect.</>;
  }
  const t = p.tcp!;
  if (p.tag === 'retransmission') {
    const prev = all.filter((q) => q.no < p.no && q.from === p.from && q.tcp?.seq === t.seq).at(-1);
    const dups = all.filter((q) => q.no < p.no && q.tag === 'dup-ack' && q.tcp?.ack === t.seq).length;
    if (dups >= 3)
      return <>{n}: a <span className="hl orange">fast retransmission</span> of Seq={t.relSeq}: {dups} duplicate ACKs told the server this segment never
        arrived, so it resent it at once instead of waiting for its retransmission timer. The original never reached this capture.</>;
    return <>{n}: a <span className="hl orange">retransmission</span> of Seq={t.relSeq}{prev ? <>, {secs(p.t - prev.t)} after packet {prev.no}</> : ''}. The sender
      never saw an ACK for it, so it sent it again.</>;
  }
  if (p.tag === 'dup-ack')
    return <>{n}: a <span className="hl orange">duplicate ACK</span>: the client still asks for byte {t.relAck}. Data after a gap has arrived, so
      something before it is missing.</>;
  if (p.tag === 'rst')
    return <>{n}: <span className="hl bad">RST,ACK</span> straight back. Something answered, and refused: the client reports "connection refused".</>;
  if (p.tag === 'tls-alert')
    return <>{n}: a fatal <span className="hl bad">TLS alert, {p.tls!.alert}</span>, sent by the client: it rejected the server's certificate, so
      it gives up on the connection. TCP itself was fine.</>;
  if (p.tls) return <>{n}: TLS, {p.tls.record}{p.tls.record === 'Application Data' ? ': encrypted, so the capture shows only its size' : ''}.</>;
  const f = t.flags.join(',');
  if (f === 'SYN') return <>{n}: <span className="hl info">SYN</span>, the client asking to open a connection (relative Seq=0).</>;
  if (f === 'SYN,ACK') return <>{n}: <span className="hl info">SYN,ACK</span>: the server accepts, acknowledging the SYN (Ack=1, because a SYN counts as one byte).</>;
  if (f === 'FIN,ACK') return <>{n}: FIN,ACK: {p.from === 'client' ? 'the client' : 'the server'} has nothing more to send (Seq={t.relSeq}).</>;
  return <>{n}: an ACK: {p.from === 'client' ? 'the client' : 'the server'} has everything before byte {t.relAck} and expects that byte next.</>;
}

export function guessCaption(guess: DiagnosisId, answer: DiagnosisId): ReactNode {
  const g = diagnosisOf(guess);
  if (guess === answer) return <><span className="hl ok">Right: {g.label}.</span> {g.pattern}</>;
  return <><span className="hl bad">Not this one.</span> {g.label} would look like this: {g.pattern} Look at the capture again.</>;
}

// ── Traceroute ──────────────────────────────────────────────────────────

export interface TraceFrame extends Frame {
  /** Probes shown so far (0 = none). */
  shown: number;
}

export function traceFrames(trace: readonly ProbeResult[]): TraceFrame[] {
  return [
    { shown: 0, say: <>traceroute sends probes with TTL 1, 2, 3…; each router takes one off the TTL, and the one that takes it to 0 answers. Press
      play.</> },
    ...trace.map((h, i): TraceFrame => {
      const hop = PATH[h.at];
      const rtts = h.rtts.map((r) => `${r} ms`).join(', ');
      if (h.reply === 'port-unreachable')
        return { shown: i + 1, hold: 2, say: <>TTL {h.ttl} reaches {ipToString(hop.ip)} itself, which answers <span className="hl ok">ICMP Port Unreachable</span> ({rtts}):
          the trace is done after {h.ttl} hops.</> };
      if (h.from === null)
        return { shown: i + 1, say: <>TTL {h.ttl} dies at hop {h.ttl} (in this simulated path, the {hop.name}), which doesn't answer: <b>* * *</b>. Not
          necessarily broken: many routers ignore or rate-limit these probes. If later hops answer, this one is forwarding fine.</> };
      return { shown: i + 1, say: <>TTL {h.ttl} dies at hop {h.ttl}, the {hop.name} ({ipToString(hop.ip)}), which answers{' '}
        <span className="hl info">ICMP Time Exceeded</span>: {rtts}.</> };
    }),
  ];
}
