/**
 * Ethernet II + IPv4 + TCP/UDP frames as bytes, the way a capture file stores them, and the
 * decoder that reads them back. Checksums are the real RFC 1071 ones' complement sums.
 * Everything is synthetic: documentation addresses (RFC 5737) and made-up, locally
 * administered MAC addresses.
 */
import { ipToString } from '../../core/ipv4';

export const ETH_LEN = 14;
export const IP_LEN = 20;
export const TCP_LEN = 20;
export const UDP_LEN = 8;
export const ETHERTYPE_IPV4 = 0x0800;
export const PROTO_TCP = 6;
export const PROTO_UDP = 17;
export const PROTO_ICMP = 1;
/** Bytes the capture keeps of each frame (tcpdump -s): longer frames are cut, as real captures are. */
export const SNAPLEN = 128;

export const TCP_FLAG_BITS = { FIN: 0x01, SYN: 0x02, RST: 0x04, PSH: 0x08, ACK: 0x10 } as const;
export type TcpFlag = keyof typeof TCP_FLAG_BITS;

export interface FrameSpec {
  srcMac: readonly number[];
  dstMac: readonly number[];
  src: number;
  dst: number;
  ttl: number;
  id: number;
  proto: typeof PROTO_TCP | typeof PROTO_UDP;
  sport: number;
  dport: number;
  /** TCP only. */
  seq?: number;
  ack?: number;
  flags?: readonly TcpFlag[];
  window?: number;
  /** The full transport payload. */
  payload: readonly number[];
}

const u16 = (v: number) => [(v >>> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
export const readU16 = (b: readonly number[], i: number) => (b[i] << 8) | b[i + 1];
export const readU32 = (b: readonly number[], i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

/** RFC 1071: the ones' complement of the ones' complement sum of 16-bit words. */
export function internetChecksum(bytes: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    sum += (bytes[i] << 8) | (bytes[i + 1] ?? 0);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}

/** The TCP/UDP checksum covers a pseudo-header (addresses, protocol, length) plus the whole segment. */
export function transportChecksum(src: number, dst: number, proto: number, segment: readonly number[]): number {
  return internetChecksum([...u32(src), ...u32(dst), 0, proto, ...u16(segment.length), ...segment]);
}

export const flagByte = (flags: readonly TcpFlag[]) => flags.reduce((b, f) => b | TCP_FLAG_BITS[f], 0);

/** The full frame, every byte as it went on the wire. */
export function buildFrame(f: FrameSpec): number[] {
  let segment: number[];
  if (f.proto === PROTO_TCP) {
    segment = [
      ...u16(f.sport), ...u16(f.dport), ...u32(f.seq ?? 0), ...u32(f.ack ?? 0),
      (TCP_LEN / 4) << 4, flagByte(f.flags ?? []), ...u16(f.window ?? 64240), 0, 0, 0, 0, ...f.payload,
    ];
  } else {
    segment = [...u16(f.sport), ...u16(f.dport), ...u16(UDP_LEN + f.payload.length), 0, 0, ...f.payload];
  }
  const sum = transportChecksum(f.src, f.dst, f.proto, segment);
  const at = f.proto === PROTO_TCP ? 16 : 6;
  segment[at] = sum >>> 8;
  segment[at + 1] = sum & 0xff;

  const ip = [0x45, 0, ...u16(IP_LEN + segment.length), ...u16(f.id), 0x40, 0, f.ttl, f.proto, 0, 0, ...u32(f.src), ...u32(f.dst)];
  const ipSum = internetChecksum(ip);
  ip[10] = ipSum >>> 8;
  ip[11] = ipSum & 0xff;
  return [...f.dstMac, ...f.srcMac, ...u16(ETHERTYPE_IPV4), ...ip, ...segment];
}

// ── Decoding: fields with their byte ranges, for the layer tree and ByteGrid ──

export type Layer = 'eth' | 'ip' | 'tcp' | 'udp' | 'app';

export interface Field {
  id: string;
  layer: Layer;
  name: string;
  value: string;
  /** Inclusive byte range in the frame. */
  from: number;
  to: number;
}

export const macText = (b: readonly number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join(':');

export interface Decoded {
  fields: Field[];
  proto: number;
  src: number;
  dst: number;
  ttl: number;
  ipChecksumOk: boolean;
  /** Bytes of the transport payload in the frame as built (before the snaplen cut). */
  payloadFrom: number;
  tcp?: { sport: number; dport: number; seq: number; ack: number; flags: TcpFlag[]; window: number };
  udp?: { sport: number; dport: number; length: number };
}

/** Read a full frame back into named fields. Used for the layer tree, and by the tests to check the builder. */
export function decode(b: readonly number[]): Decoded {
  const fields: Field[] = [];
  const add = (id: string, layer: Layer, name: string, value: string, from: number, len: number) => fields.push({ id, layer, name, value, from, to: from + len - 1 });
  add('eth.dst', 'eth', 'Destination', macText(b.slice(0, 6)), 0, 6);
  add('eth.src', 'eth', 'Source', macText(b.slice(6, 12)), 6, 6);
  add('eth.type', 'eth', 'Type', `0x${readU16(b, 12).toString(16).padStart(4, '0')} (IPv4)`, 12, 2);
  const ip = ETH_LEN;
  const proto = b[ip + 9];
  const src = readU32(b, ip + 12);
  const dst = readU32(b, ip + 16);
  const ipChecksumOk = internetChecksum(b.slice(ip, ip + IP_LEN)) === 0;
  add('ip.version', 'ip', 'Version / header length', `${b[ip] >> 4} / ${(b[ip] & 0xf) * 4} bytes`, ip, 1);
  add('ip.len', 'ip', 'Total length', `${readU16(b, ip + 2)}`, ip + 2, 2);
  add('ip.id', 'ip', 'Identification', `0x${readU16(b, ip + 4).toString(16).padStart(4, '0')}`, ip + 4, 2);
  add('ip.flags', 'ip', 'Flags', b[ip + 6] & 0x40 ? "0x40: Don't fragment" : '0x00', ip + 6, 2);
  add('ip.ttl', 'ip', 'Time to live', `${b[ip + 8]}`, ip + 8, 1);
  add('ip.proto', 'ip', 'Protocol', proto === PROTO_TCP ? 'TCP (6)' : proto === PROTO_UDP ? 'UDP (17)' : `${proto}`, ip + 9, 1);
  add('ip.checksum', 'ip', 'Header checksum', `0x${readU16(b, ip + 10).toString(16).padStart(4, '0')} [${ipChecksumOk ? 'correct' : 'incorrect'}]`, ip + 10, 2);
  add('ip.src', 'ip', 'Source address', ipToString(src), ip + 12, 4);
  add('ip.dst', 'ip', 'Destination address', ipToString(dst), ip + 16, 4);
  const t = ip + IP_LEN;
  const out: Decoded = { fields, proto, src, dst, ttl: b[ip + 8], ipChecksumOk, payloadFrom: t };
  if (proto === PROTO_TCP) {
    const fb = b[t + 13];
    const flags = (Object.keys(TCP_FLAG_BITS) as TcpFlag[]).filter((f) => fb & TCP_FLAG_BITS[f]);
    out.tcp = { sport: readU16(b, t), dport: readU16(b, t + 2), seq: readU32(b, t + 4), ack: readU32(b, t + 8), flags, window: readU16(b, t + 14) };
    add('tcp.srcport', 'tcp', 'Source port', `${out.tcp.sport}`, t, 2);
    add('tcp.dstport', 'tcp', 'Destination port', `${out.tcp.dport}`, t + 2, 2);
    add('tcp.seq', 'tcp', 'Sequence number (raw)', `${out.tcp.seq}`, t + 4, 4);
    add('tcp.ack', 'tcp', 'Acknowledgment number (raw)', `${out.tcp.ack}`, t + 8, 4);
    add('tcp.hdr_len', 'tcp', 'Header length', `${(b[t + 12] >> 4) * 4} bytes`, t + 12, 1);
    add('tcp.flags', 'tcp', 'Flags', `0x${fb.toString(16).padStart(3, '0')} (${flags.join(', ') || 'none'})`, t + 13, 1);
    add('tcp.window', 'tcp', 'Window', `${out.tcp.window}`, t + 14, 2);
    add('tcp.checksum', 'tcp', 'Checksum', `0x${readU16(b, t + 16).toString(16).padStart(4, '0')} [unverified]`, t + 16, 2);
    out.payloadFrom = t + TCP_LEN;
  } else {
    out.udp = { sport: readU16(b, t), dport: readU16(b, t + 2), length: readU16(b, t + 4) };
    add('udp.srcport', 'udp', 'Source port', `${out.udp.sport}`, t, 2);
    add('udp.dstport', 'udp', 'Destination port', `${out.udp.dport}`, t + 2, 2);
    add('udp.length', 'udp', 'Length', `${out.udp.length}`, t + 4, 2);
    add('udp.checksum', 'udp', 'Checksum', `0x${readU16(b, t + 6).toString(16).padStart(4, '0')} [unverified]`, t + 6, 2);
    out.payloadFrom = t + UDP_LEN;
  }
  return out;
}
