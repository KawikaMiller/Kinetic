/**
 * Two other ways to read the same capture: tcpdump-style text lines, and the diagnosis each
 * capture teaches. Both are pure, so the tests can check them against the packets.
 */
import { ipToString } from '../../core/ipv4';
import { SERVER, type Captured, type DiagnosisId } from './captures';
import { decode, type Field } from './wire';

/** The tcpdump clock is illustrative: the captures start at noon. */
const clock = (t: number) => {
  const us = Math.round(t * 1e6);
  const s = Math.floor(us / 1e6);
  return `12:00:${String(s).padStart(2, '0')}.${String(us % 1e6).padStart(6, '0')}`;
};

const FLAG_LETTER = { SYN: 'S', FIN: 'F', PSH: 'P', RST: 'R' } as const;

/** One packet in the style of `tcpdump -n` (relative sequence numbers after the handshake). */
export function tcpdumpLine(p: Captured): string {
  const d = decode(p.frame);
  if (d.udp && p.dns) {
    const head = `${clock(p.t)} IP ${ipToString(d.src)}.${d.udp.sport} > ${ipToString(d.dst)}.${d.udp.dport}:`;
    const size = d.udp.length - 8;
    if (!p.dns.response) return `${head} ${p.dns.id}+ ${p.dns.type}? ${p.dns.name}. (${size})`;
    if (p.dns.rcode === 3) return `${head} ${p.dns.id} NXDomain 0/0/0 (${size})`;
    return `${head} ${p.dns.id} 1/0/0 ${p.dns.type} ${p.dns.answer} (${size})`;
  }
  const t = p.tcp!;
  const letters = (['SYN', 'FIN', 'PSH', 'RST'] as const).filter((f) => t.flags.includes(f)).map((f) => FLAG_LETTER[f]).join('') + (t.flags.includes('ACK') ? '.' : '');
  const head = `${clock(p.t)} IP ${ipToString(d.src)}.${d.tcp!.sport} > ${ipToString(d.dst)}.${d.tcp!.dport}: Flags [${letters}],`;
  const handshake = t.flags.includes('SYN') || t.flags.includes('RST');
  // tcpdump prints seq for SYN, FIN and RST even with no data; absolute for the handshake, relative after it.
  const seq = handshake ? `seq ${t.seq}` : t.len ? `seq ${t.relSeq}:${t.relSeq + t.len}` : t.flags.includes('FIN') ? `seq ${t.relSeq}` : '';
  const ack = t.flags.includes('ACK') ? `ack ${handshake ? t.ack : t.relAck}` : '';
  return `${head} ${[seq, ack, `win ${d.tcp!.window}`, `length ${t.len}`].filter(Boolean).join(', ')}`;
}

/** What `tcpdump -n host 203.0.113.10` would print: a capture filter keeps only that host's packets. */
export const tcpdumpHost = (packets: readonly Captured[], host = SERVER) => packets.filter((p) => {
  const d = decode(p.frame);
  return d.src === host || d.dst === host;
});

export interface Diagnosis {
  id: DiagnosisId;
  label: string;
  /** The pattern that gives it away. */
  pattern: string;
}

export const DIAGNOSES: readonly Diagnosis[] = [
  { id: 'healthy', label: 'Healthy request', pattern: 'DNS answers, the three-way handshake completes, TLS finishes, data flows both ways and both sides send FIN.' },
  { id: 'refused', label: 'Connection refused', pattern: 'The SYN is answered at once with RST,ACK: something answered, usually the host itself with nothing listening on that port (a firewall rule set to REJECT with tcp-reset can send one too).' },
  { id: 'timeout', label: 'Timed out (dropped)', pattern: 'The SYN is retransmitted with growing gaps (1 s, 2 s, 4 s…) and nothing ever comes back: silence, most often a firewall dropping it, or a host or route that is down.' },
  { id: 'loss', label: 'Packet loss', pattern: 'The client sends duplicate ACKs for the same byte, then the missing segment arrives as a retransmission and the ACK jumps ahead.' },
  { id: 'dns', label: 'DNS failure', pattern: 'The resolver answers "No such name" (NXDOMAIN), so the client never has an address and no SYN is ever sent.' },
  { id: 'tls', label: 'TLS failure', pattern: 'TCP connects fine, but right after the server\'s certificate the client sends a fatal TLS alert (bad_certificate) and closes.' },
];

export const diagnosisOf = (id: DiagnosisId) => DIAGNOSES.find((d) => d.id === id)!;

// ── Application-layer fields, for the layer tree and the bytes ─────────

const TLS_TYPES: Record<number, string> = { 0x14: 'Change Cipher Spec (20)', 0x15: 'Alert (21)', 0x16: 'Handshake (22)', 0x17: 'Application Data (23)' };
const ALERT_NAMES: Record<number, string> = { 42: 'Bad Certificate (42)' };
const hex4 = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;

/** DNS or TLS fields of a packet, with byte ranges in the full frame (which the capture may cut short). */
export function appFields(p: Captured): Field[] {
  const d = decode(p.frame);
  const b = p.frame;
  const at = d.payloadFrom;
  const f = (id: string, name: string, value: string, from: number, len: number): Field => ({ id, layer: 'app', name, value, from, to: from + len - 1 });
  if (p.dns) {
    const flags = (b[at + 2] << 8) | b[at + 3];
    const qLen = p.dns.name.length + 2;
    return [
      f('dns.id', 'Transaction ID', hex4((b[at] << 8) | b[at + 1]), at, 2),
      f('dns.flags', 'Flags', `${hex4(flags)} ${flags & 0x8000 ? 'response' : 'query'}${flags & 0x8000 ? `, ${(flags & 0xf) === 3 ? 'No such name (3)' : 'No error (0)'}` : ''}`, at + 2, 2),
      f('dns.counts', 'Questions / answers', `${(b[at + 4] << 8) | b[at + 5]} / ${(b[at + 6] << 8) | b[at + 7]}`, at + 4, 4),
      f('dns.qry.name', 'Query name', `${p.dns.name} (${p.dns.type})`, at + 12, qLen + 4),
      ...(p.dns.answer ? [f('dns.a', 'Answer', `${p.dns.name} A ${p.dns.answer}, TTL 300`, at + 12 + qLen + 4, 16)] : []),
    ];
  }
  if (p.tls) {
    const len = (b[at + 3] << 8) | b[at + 4];
    const head = [
      f('tls.record.content_type', 'Content type', TLS_TYPES[b[at]] ?? `${b[at]}`, at, 1),
      f('tls.record.version', 'Version', `TLS 1.2 (${hex4((b[at + 1] << 8) | b[at + 2])})`, at + 1, 2),
      f('tls.record.length', 'Length', `${len}`, at + 3, 2),
    ];
    if (b[at] === 0x15)
      return [...head, f('tls.alert.level', 'Alert level', b[at + 5] === 2 ? 'Fatal (2)' : `${b[at + 5]}`, at + 5, 1), f('tls.alert.desc', 'Alert description', ALERT_NAMES[b[at + 6]] ?? `${b[at + 6]}`, at + 6, 1)];
    const body = b[at] === 0x17 ? 'Encrypted data' : b[at] === 0x14 ? 'Change Cipher Spec message' : 'Handshake message';
    return [...head, f('tls.body', body, `${len} bytes${p.tls.record.includes(',') ? ' (first record of this segment)' : ''}`, at + 5, len)];
  }
  return [];
}
