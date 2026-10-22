/**
 * Tunnels as bytes: the outer headers each encapsulation adds around an inner IPv4 packet, with the size of every
 * field from a table, and a byte-level builder (and unwrapper) that constructs each tunnel's real layout with a
 * TOY cipher so the far side can open it. Pure; no network and no real cryptography.
 *
 * Every size and layout here is recalled from memory of the formats (verify against the WireGuard whitepaper, the
 * ESP specification and the VXLAN, GRE and IP documents): the lesson chips them "from memory".
 *   GRE            outer IP + 4-byte GRE header.
 *   IPsec ESP      outer IP [+ UDP 8 when NAT traversal] + ESP header (SPI 4, sequence 4) + IV + inner packet +
 *                  padding + pad length 1 + next header 1 + integrity check value. Sizes depend on the cipher suite.
 *   WireGuard      outer IP + UDP 8 + 16-byte data header (type and reserved 4, receiver index 4, counter 8) + inner
 *                  packet padded to a multiple of 16 + 16-byte authentication tag.
 *   VXLAN          outer IP + UDP 8 + VXLAN header 8 + the inner Ethernet header 14 + inner packet. The outer Ethernet
 *                  header is link layer and does not count against the IP MTU; the inner Ethernet header does, which
 *                  gives the same 50 bytes the outer-Ethernet way of counting gives.
 */
import { fakeSecret } from '../../core/fakeSecret';
import { fnv1a } from '../../core/hash';
import { mulberry32 } from '../../core/random';
import type { Tone } from '../../core/tone';

export type TunnelId = 'gre' | 'esp' | 'wireguard' | 'vxlan';
export type IpVersion = 4 | 6;
export type Suite = 'gcm' | 'cbc';

export const TUNNELS: readonly TunnelId[] = ['gre', 'esp', 'wireguard', 'vxlan'];
export const TUNNEL_NAME: Record<TunnelId, string> = { gre: 'GRE', esp: 'IPsec ESP (tunnel mode)', wireguard: 'WireGuard', vxlan: 'VXLAN' };

export interface TunnelOptions {
  outer: IpVersion;
  /** IPsec ESP only: which cipher suite's sizes to use. Ignored by every other tunnel. */
  suite: Suite;
  /** IPsec ESP only: add the UDP header that carries ESP through NAT. Ignored by every other tunnel. */
  natT: boolean;
}
export const DEFAULT_OPTIONS: TunnelOptions = { outer: 4, suite: 'gcm', natT: false };

export const SUITE_NAME: Record<Suite, string> = { gcm: 'AES-GCM (IV 8, ICV 16)', cbc: 'AES-CBC + HMAC-SHA-256-128 (IV 16, ICV 16)' };
/** Per-suite sizes in bytes: the IV, the integrity check value, and the alignment the padded trailer must reach. */
const SUITE: Record<Suite, { iv: number; icv: number; align: number }> = {
  gcm: { iv: 8, icv: 16, align: 4 },
  cbc: { iv: 16, icv: 16, align: 16 },
};

export const SIZE = {
  ipv4: 20, ipv6: 40, udp: 8, gre: 4, espHeader: 8, espTrailerFixed: 2, wgHeader: 16, wgTag: 16, wgAlign: 16, vxlan: 8, ethernet: 14, innerIpv4: 20,
} as const;

export interface Field {
  name: string;
  bytes: number;
  tone: Tone;
  note: string;
}
export interface Layout {
  before: Field[];
  after: Field[];
}

const outerIp = (v: IpVersion): Field => ({
  name: `outer IPv${v} header`,
  bytes: v === 4 ? SIZE.ipv4 : SIZE.ipv6,
  tone: 'amber',
  note: 'the tunnel endpoints\' addresses, so the network routes this like any packet',
});
const udp: Field = { name: 'outer UDP header', bytes: SIZE.udp, tone: 'pink', note: 'ports 8 bytes: source, destination, length, checksum' };

/** Padding that brings the inner length (plus the ESP trailer bytes) to the suite's alignment. */
export const espPadding = (innerLen: number, suite: Suite): number => {
  const a = SUITE[suite].align;
  return (a - ((innerLen + SIZE.espTrailerFixed) % a)) % a;
};
/** WireGuard pads the inner packet to a multiple of 16 before encrypting it. */
export const wgPadding = (innerLen: number): number => (SIZE.wgAlign - (innerLen % SIZE.wgAlign)) % SIZE.wgAlign;

/** The field table of one tunnel around an inner packet of `innerLen` bytes. */
export function layoutOf(tunnel: TunnelId, innerLen: number, o: TunnelOptions = DEFAULT_OPTIONS): Layout {
  if (tunnel === 'gre') {
    return { before: [outerIp(o.outer), { name: 'GRE header', bytes: SIZE.gre, tone: 'sky', note: 'flags and version 2 bytes, protocol type 2 bytes' }], after: [] };
  }
  if (tunnel === 'esp') {
    const s = SUITE[o.suite];
    const before: Field[] = [outerIp(o.outer)];
    if (o.natT) before.push({ ...udp, note: 'NAT traversal wraps ESP in UDP so a NAT device can map it' });
    before.push(
      { name: 'ESP header (SPI, sequence)', bytes: SIZE.espHeader, tone: 'pink', note: 'security parameters index 4, sequence number 4' },
      { name: 'IV', bytes: s.iv, tone: 'sky', note: `initialisation vector of the ${o.suite === 'gcm' ? 'GCM' : 'CBC'} suite` },
    );
    const pad = espPadding(innerLen, o.suite);
    return {
      before,
      after: [
        { name: 'padding', bytes: pad, tone: 'muted', note: `brings the data to a multiple of ${s.align} bytes` },
        { name: 'pad length + next header', bytes: SIZE.espTrailerFixed, tone: 'muted', note: 'one byte each; next header says IP-in-IP' },
        { name: 'ICV', bytes: s.icv, tone: 'orange', note: 'integrity check value, the authentication tag' },
      ],
    };
  }
  if (tunnel === 'wireguard') {
    return {
      before: [
        outerIp(o.outer),
        udp,
        { name: 'WireGuard data header', bytes: SIZE.wgHeader, tone: 'sky', note: 'type and reserved 4, receiver index 4, counter 8' },
      ],
      after: [
        { name: 'padding', bytes: wgPadding(innerLen), tone: 'muted', note: 'brings the inner packet to a multiple of 16 bytes' },
        { name: 'authentication tag', bytes: SIZE.wgTag, tone: 'orange', note: 'the 16-byte tag of the AEAD cipher' },
      ],
    };
  }
  return {
    before: [
      outerIp(o.outer),
      udp,
      { name: 'VXLAN header', bytes: SIZE.vxlan, tone: 'sky', note: 'flags 1, reserved 3, network identifier 3, reserved 1' },
      { name: 'inner Ethernet header', bytes: SIZE.ethernet, tone: 'sky', note: 'VXLAN carries whole Ethernet frames, so the inner frame\'s header travels too' },
    ],
    after: [],
  };
}

const sum = (fs: readonly Field[]) => fs.reduce((n, f) => n + f.bytes, 0);
/** Every byte the tunnel adds around the inner packet, padding included. */
export const overheadOf = (tunnel: TunnelId, innerLen: number, o: TunnelOptions = DEFAULT_OPTIONS): number => {
  const l = layoutOf(tunnel, innerLen, o);
  return sum(l.before) + sum(l.after);
};
/** The part that does not depend on the inner packet's size: what the tunnel MTU is computed from. */
export const fixedOverheadOf = (tunnel: TunnelId, o: TunnelOptions = DEFAULT_OPTIONS): number => {
  const l = layoutOf(tunnel, 0, o);
  return sum(l.before) + sum(l.after.filter((f) => f.name !== 'padding'));
};

/** The options a tunnel actually reads: others are pinned, so a control for another tunnel never reaches its numbers. */
export const effectiveOptions = (tunnel: TunnelId, o: TunnelOptions): TunnelOptions => ({
  outer: o.outer,
  suite: tunnel === 'esp' ? o.suite : DEFAULT_OPTIONS.suite,
  natT: tunnel === 'esp' ? o.natT : DEFAULT_OPTIONS.natT,
});

// ---- bytes ------------------------------------------------------------------------------------

const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number): number[] => be32(n).reverse();

export function ipv4Checksum(header: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < header.length; i += 2) s += (header[i] << 8) | header[i + 1];
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  return ~s & 0xffff;
}

const addr4 = (a: string): number[] => a.split('.').map(Number);
export const INNER_SRC = '10.1.0.5';
export const INNER_DST = '10.2.0.9';
const OUTER_SRC4 = '192.0.2.1';
const OUTER_DST4 = '198.51.100.1';
const OUTER_SRC6 = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const OUTER_DST6 = [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
const PROTO = { udp: 17, gre: 47, esp: 50 } as const;
const PORT = { wireguard: 51820, natT: 4500, vxlan: 4789 } as const;

/** An IPv4 header with a correct checksum; `total` is the whole packet length. */
export function ipv4Header(total: number, proto: number, src: string, dst: string): number[] {
  const h = [0x45, 0, ...be16(total), 0, 1, 0x40, 0, 64, proto, 0, 0, ...addr4(src), ...addr4(dst)];
  const c = ipv4Checksum(h);
  h[10] = c >> 8;
  h[11] = c & 0xff;
  return h;
}
/** The 40-byte IPv6 header, `payload` bytes following it. */
export const ipv6Header = (payload: number, next: number): number[] => [0x60, 0, 0, 0, ...be16(payload), next, 64, ...OUTER_SRC6, ...OUTER_DST6];

/** The inner packet: a real IPv4 header around `payloadLen` bytes of text. */
export function innerPacket(payloadLen: number): Uint8Array {
  const total = SIZE.innerIpv4 + payloadLen;
  const header = ipv4Header(total, PROTO.udp, INNER_SRC, INNER_DST);
  const text = 'inner payload: a packet inside a packet. ';
  const body = Array.from({ length: payloadLen }, (_, i) => text.charCodeAt(i % text.length));
  return Uint8Array.from([...header, ...body]);
}

// The toy cipher: XOR with a seeded keystream and a 16-byte keyed fingerprint as the tag. NOT secure. The real ones
// (ChaCha20-Poly1305 in WireGuard, AES-GCM or AES-CBC with HMAC in IPsec) are named, not run.
const TOY_KEY = fakeSecret('toy-tunnel-', 'key-not-', 'a-real-one');
const keystream = (nonce: number, len: number): number[] => {
  const rnd = mulberry32(fnv1a(`${TOY_KEY}:${nonce}`));
  return Array.from({ length: len }, () => Math.floor(rnd() * 256));
};
const xor = (data: ArrayLike<number>, nonce: number): number[] => {
  const k = keystream(nonce, data.length);
  return Array.from({ length: data.length }, (_, i) => data[i] ^ k[i]);
};
const toyTag = (data: ArrayLike<number>): number[] => {
  const rnd = mulberry32(fnv1a(`${TOY_KEY}|${Array.from(data).join(',')}`));
  return Array.from({ length: 16 }, () => Math.floor(rnd() * 256));
};

export interface Segment {
  name: string;
  bytes: number[];
}
export interface Wrapped {
  /** The outer bytes before the inner packet, then (for the tunnels that encrypt) the sealed body, then the trailer. */
  segments: Segment[];
  bytes: Uint8Array;
}

const ipSegment = (o: TunnelOptions, proto: number, payloadLen: number): Segment =>
  o.outer === 4
    ? { name: 'outer IPv4 header', bytes: ipv4Header(SIZE.ipv4 + payloadLen, proto, OUTER_SRC4, OUTER_DST4) }
    : { name: 'outer IPv6 header', bytes: ipv6Header(payloadLen, proto) };
const udpSegment = (src: number, dst: number, payloadLen: number): Segment => ({
  name: 'outer UDP header',
  bytes: [...be16(src), ...be16(dst), ...be16(SIZE.udp + payloadLen), 0, 0],
});

const SPI = 0x1000_0001;
const WG_RECEIVER = 0x0a0b0c0d;
const VNI = 5001;
const ESP_SEQUENCE = 7;
const WG_COUNTER = 42;

/** Build a tunnel's real outer layout around `inner`, field by field. */
export function wrap(tunnel: TunnelId, o: TunnelOptions, inner: Uint8Array): Wrapped {
  const opt = effectiveOptions(tunnel, o);
  const segs: Segment[] = [];
  const n = inner.length;
  if (tunnel === 'gre') {
    const gre = { name: 'GRE header', bytes: [0, 0, 0x08, 0x00] };
    segs.push(ipSegment(opt, PROTO.gre, gre.bytes.length + n), gre, { name: 'inner packet', bytes: Array.from(inner) });
  } else if (tunnel === 'esp') {
    const s = SUITE[opt.suite];
    const pad = espPadding(n, opt.suite);
    const plain = [...inner, ...Array.from({ length: pad }, (_, i) => i + 1), pad, 4];
    const header = [...be32(SPI), ...be32(ESP_SEQUENCE)];
    const iv = Array.from({ length: s.iv }, (_, i) => (ESP_SEQUENCE * 31 + i) & 0xff);
    const sealed = xor(plain, ESP_SEQUENCE);
    const icv = toyTag([...header, ...iv, ...sealed]);
    const espLen = header.length + iv.length + sealed.length + icv.length;
    if (opt.natT) {
      segs.push(ipSegment(opt, PROTO.udp, SIZE.udp + espLen), udpSegment(PORT.natT, PORT.natT, espLen));
    } else {
      segs.push(ipSegment(opt, PROTO.esp, espLen));
    }
    segs.push({ name: 'ESP header (SPI, sequence)', bytes: header }, { name: 'IV', bytes: iv }, { name: 'inner packet, padding, trailer (sealed)', bytes: sealed }, { name: 'ICV', bytes: icv });
  } else if (tunnel === 'wireguard') {
    const pad = wgPadding(n);
    const sealed = xor([...inner, ...Array.from({ length: pad }, () => 0)], WG_COUNTER);
    const header = [4, 0, 0, 0, ...be32(WG_RECEIVER).reverse(), ...le32(WG_COUNTER), 0, 0, 0, 0];
    const tag = toyTag([...header, ...sealed]);
    const bodyLen = header.length + sealed.length + tag.length;
    segs.push(ipSegment(opt, PROTO.udp, SIZE.udp + bodyLen), udpSegment(PORT.wireguard, PORT.wireguard, bodyLen));
    segs.push({ name: 'WireGuard data header', bytes: header }, { name: 'inner packet and padding (sealed)', bytes: sealed }, { name: 'authentication tag', bytes: tag });
  } else {
    const vx = { name: 'VXLAN header', bytes: [0x08, 0, 0, 0, (VNI >> 16) & 0xff, (VNI >> 8) & 0xff, VNI & 0xff, 0] };
    const eth = { name: 'inner Ethernet header', bytes: [0x02, 0, 0, 0, 0, 0x02, 0x02, 0, 0, 0, 0, 0x01, 0x08, 0x00] };
    const bodyLen = vx.bytes.length + eth.bytes.length + n;
    segs.push(ipSegment(opt, PROTO.udp, SIZE.udp + bodyLen), udpSegment(49152 + (fnv1a(INNER_SRC) % 1000), PORT.vxlan, bodyLen), vx, eth, { name: 'inner packet', bytes: Array.from(inner) });
  }
  return { segments: segs, bytes: Uint8Array.from(segs.flatMap((s) => s.bytes)) };
}

export type Unwrapped = { ok: true; inner: Uint8Array } | { ok: false; error: string };
const fail = (error: string): Unwrapped => ({ ok: false, error });
const eq = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

/** The far side: read the outer layout back and return the inner packet, or say why it was dropped. */
export function unwrap(tunnel: TunnelId, o: TunnelOptions, packet: Uint8Array): Unwrapped {
  const opt = effectiveOptions(tunnel, o);
  const b = Array.from(packet);
  const ipLen = opt.outer === 4 ? SIZE.ipv4 : SIZE.ipv6;
  if (b.length < ipLen) return fail('shorter than an outer IP header');
  if (opt.outer === 4) {
    if (b[0] !== 0x45) return fail('the outer header is not an IPv4 header without options');
    if (ipv4Checksum(b.slice(0, ipLen)) !== 0) return fail('the outer IPv4 header checksum is wrong');
  } else if (b[0] >> 4 !== 6) return fail('the outer header is not IPv6');
  const proto = opt.outer === 4 ? b[9] : b[6];
  let at = ipLen;
  if (tunnel === 'gre') {
    if (proto !== PROTO.gre) return fail('the outer header does not say GRE');
    if (b[at + 2] !== 0x08 || b[at + 3] !== 0x00) return fail('the GRE protocol type is not IPv4');
    return { ok: true, inner: Uint8Array.from(b.slice(at + SIZE.gre)) };
  }
  if (tunnel === 'esp') {
    const s = SUITE[opt.suite];
    if (opt.natT) {
      if (proto !== PROTO.udp) return fail('NAT traversal expects UDP');
      at += SIZE.udp;
    } else if (proto !== PROTO.esp) return fail('the outer header does not say ESP');
    const header = b.slice(at, at + SIZE.espHeader);
    const iv = b.slice(at + SIZE.espHeader, at + SIZE.espHeader + s.iv);
    const sealed = b.slice(at + SIZE.espHeader + s.iv, b.length - s.icv);
    const icv = b.slice(b.length - s.icv);
    if (!eq(icv, toyTag([...header, ...iv, ...sealed]))) return fail('the integrity check failed, so the packet is dropped');
    const plain = xor(sealed, ESP_SEQUENCE);
    const pad = plain[plain.length - 2];
    if (plain[plain.length - 1] !== 4 || pad > plain.length - 2) return fail('the ESP trailer is malformed');
    return { ok: true, inner: Uint8Array.from(plain.slice(0, plain.length - 2 - pad)) };
  }
  if (proto !== PROTO.udp) return fail('the outer header does not say UDP');
  at += SIZE.udp;
  if (tunnel === 'wireguard') {
    const header = b.slice(at, at + SIZE.wgHeader);
    const sealed = b.slice(at + SIZE.wgHeader, b.length - SIZE.wgTag);
    const tag = b.slice(b.length - SIZE.wgTag);
    if (header[0] !== 4) return fail('not a WireGuard data message');
    if (!eq(tag, toyTag([...header, ...sealed]))) return fail('the authentication tag failed, so the packet is dropped');
    const plain = xor(sealed, WG_COUNTER);
    const total = (plain[2] << 8) | plain[3];
    return total > plain.length ? fail('the inner length field is longer than the data') : { ok: true, inner: Uint8Array.from(plain.slice(0, total)) };
  }
  if (b[at] !== 0x08) return fail('the VXLAN flags do not mark a valid network identifier');
  return { ok: true, inner: Uint8Array.from(b.slice(at + SIZE.vxlan + SIZE.ethernet)) };
}

/** A running total after each field, front fields then trailer fields, for the "overhead so far" column. */
export function runningOverhead(l: Layout): { field: Field; total: number }[] {
  let total = 0;
  return [...l.before, ...l.after].map((field) => {
    total += field.bytes;
    return { field, total };
  });
}
