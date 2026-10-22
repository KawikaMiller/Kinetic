import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS, SIZE, TUNNELS, effectiveOptions, espPadding, fixedOverheadOf, innerPacket, ipv4Checksum, layoutOf, overheadOf, unwrap, wgPadding, wrap,
  type Suite, type TunnelId, type TunnelOptions,
} from './tunnels';

// The sizes below are the hand-worked vectors of the spec, FROM MEMORY of the formats (verify against the WireGuard
// whitepaper, the ESP specification, and the GRE, IP and VXLAN documents).
const opts = (outer: 4 | 6 = 4, suite: Suite = 'gcm', natT = false): TunnelOptions => ({ outer, suite, natT });
const everyOption = (): TunnelOptions[] => [4, 6].flatMap((outer) => (['gcm', 'cbc'] as const).flatMap((suite) => [false, true].map((natT) => opts(outer as 4 | 6, suite, natT))));

describe('overhead equals the sum of the field table, against hand-worked values', () => {
  it('WireGuard adds 60 bytes over IPv4 and 80 over IPv6 (20 or 40 + 8 + 16 + 16)', () => {
    expect(fixedOverheadOf('wireguard', opts(4))).toBe(60);
    expect(fixedOverheadOf('wireguard', opts(6))).toBe(80);
  });
  it('GRE adds 24 bytes behind an outer IPv4 header (20 + 4) and 44 behind IPv6', () => {
    expect(fixedOverheadOf('gre', opts(4))).toBe(24);
    expect(fixedOverheadOf('gre', opts(6))).toBe(44);
  });
  it('VXLAN adds 50 bytes against the IP MTU (IP 20, UDP 8, VXLAN 8, inner Ethernet 14), 70 over IPv6', () => {
    expect(fixedOverheadOf('vxlan', opts(4))).toBe(50);
    expect(fixedOverheadOf('vxlan', opts(6))).toBe(70);
  });
  it('ESP in tunnel mode: 54 with AES-GCM and 62 with AES-CBC plus HMAC (before padding), and NAT traversal adds the 8-byte UDP header', () => {
    expect(fixedOverheadOf('esp', opts(4, 'gcm'))).toBe(20 + 8 + 8 + 2 + 16);
    expect(fixedOverheadOf('esp', opts(4, 'cbc'))).toBe(20 + 8 + 16 + 2 + 16);
    expect(fixedOverheadOf('esp', opts(4, 'gcm', true))).toBe(54 + 8);
    expect(fixedOverheadOf('esp', opts(6, 'cbc', true))).toBe(40 + 8 + 8 + 16 + 2 + 16);
  });
  it('padding: a 128-byte inner packet needs none for WireGuard, 2 for ESP-GCM and 14 for ESP-CBC; 1 byte more changes each', () => {
    expect([wgPadding(128), espPadding(128, 'gcm'), espPadding(128, 'cbc')]).toEqual([0, 2, 14]);
    expect([wgPadding(129), espPadding(129, 'gcm'), espPadding(129, 'cbc')]).toEqual([15, 1, 13]);
    expect(overheadOf('wireguard', 128, opts())).toBe(60);
    expect(overheadOf('wireguard', 129, opts())).toBe(60 + 15);
  });
  it('padding makes the inner packet plus its trailer a whole number of blocks, for every length, and is smaller than a block', () => {
    for (let n = 0; n < 200; n++) {
      expect((n + 2 + espPadding(n, 'gcm')) % 4).toBe(0);
      expect((n + 2 + espPadding(n, 'cbc')) % 16).toBe(0);
      expect((n + wgPadding(n)) % 16).toBe(0);
      expect(espPadding(n, 'cbc')).toBeLessThan(16);
      expect(wgPadding(n)).toBeLessThan(16);
    }
  });
});

describe('the byte builder constructs each tunnel and agrees with the table', () => {
  it('wrapped length is inner length plus the table overhead, for every tunnel, option and payload size 0..80', () => {
    for (const t of TUNNELS) {
      for (const o of everyOption()) {
        for (let payload = 0; payload <= 80; payload += 1) {
          const inner = innerPacket(payload);
          const wrapped = wrap(t, o, inner);
          expect(wrapped.bytes.length, `${t} ${JSON.stringify(o)} ${payload}`).toBe(inner.length + overheadOf(t, inner.length, effectiveOptions(t, o)));
        }
      }
    }
  });

  it('the bytes before the inner packet match the table field by field (sizes of the constructed headers)', () => {
    for (const t of TUNNELS) {
      for (const o of everyOption()) {
        const inner = innerPacket(100);
        const eff = effectiveOptions(t, o);
        const layout = layoutOf(t, inner.length, eff);
        const segs = wrap(t, o, inner).segments;
        layout.before.forEach((f, i) => expect(segs[i].bytes.length, `${t} ${f.name}`).toBe(f.bytes));
      }
    }
  });

  it('the trailer sizes match too: the tag is 16 bytes, ESP padding is as computed', () => {
    const inner = innerPacket(108);
    const wg = wrap('wireguard', opts(), inner);
    expect(wg.segments[wg.segments.length - 1].bytes).toHaveLength(16);
    const esp = wrap('esp', opts(4, 'cbc'), inner);
    expect(esp.segments[esp.segments.length - 1].bytes).toHaveLength(16);
    expect(esp.segments.find((s) => s.name.startsWith('inner packet'))!.bytes).toHaveLength(inner.length + 14 + 2);
  });

  it('the outer IPv4 header carries a valid checksum and the right protocol and total length', () => {
    const proto: Record<TunnelId, number> = { gre: 47, esp: 50, wireguard: 17, vxlan: 17 };
    for (const t of TUNNELS) {
      const w = wrap(t, opts(4), innerPacket(60));
      const head = Array.from(w.bytes.slice(0, SIZE.ipv4));
      expect(ipv4Checksum(head)).toBe(0);
      expect(head[9]).toBe(proto[t]);
      expect((head[2] << 8) | head[3]).toBe(w.bytes.length);
    }
    // NAT traversal turns the ESP protocol number into UDP
    expect(wrap('esp', opts(4, 'gcm', true), innerPacket(60)).bytes[9]).toBe(17);
  });

  it('the IPv4 checksum matches a published header example (45 00 00 73 00 00 40 00 40 11 .. c0 a8 00 01 c0 a8 00 c7 has checksum b861)', () => {
    const header = [0x45, 0, 0, 0x73, 0, 0, 0x40, 0, 0x40, 0x11, 0, 0, 0xc0, 0xa8, 0, 0x01, 0xc0, 0xa8, 0, 0xc7];
    expect(ipv4Checksum(header)).toBe(0xb861);
  });

  it('the far side recovers the inner packet exactly, for every tunnel, option and 40 payload sizes', () => {
    for (const t of TUNNELS) {
      for (const o of everyOption()) {
        for (let payload = 0; payload < 40; payload++) {
          const inner = innerPacket(payload * 7);
          const back = unwrap(t, o, wrap(t, o, inner).bytes);
          expect(back, `${t} ${payload}`).toEqual({ ok: true, inner });
        }
      }
    }
  });

  it('a changed byte after the outer headers is caught by WireGuard and ESP (the tag), as a toy MAC', () => {
    for (const t of ['wireguard', 'esp'] as const) {
      for (const o of [opts(4), opts(4, 'cbc', true)]) {
        const w = wrap(t, o, innerPacket(50)).bytes;
        const eff = effectiveOptions(t, o);
        const start = SIZE.ipv4 + (t === 'wireguard' ? SIZE.udp : eff.natT ? SIZE.udp : 0);
        for (let i = start; i < w.length; i++) {
          const bad = Uint8Array.from(w);
          bad[i] ^= 0x01;
          expect(unwrap(t, o, bad).ok, `${t} byte ${i}`).toBe(false);
        }
      }
    }
  });

  it('a broken outer IPv4 header is refused by every tunnel', () => {
    for (const t of TUNNELS) {
      const w = Uint8Array.from(wrap(t, opts(4), innerPacket(30)).bytes);
      w[8] ^= 0xff; // time to live: the checksum no longer matches
      expect(unwrap(t, opts(4), w).ok).toBe(false);
    }
  });

  it('options that belong to ESP do not reach the other tunnels: the field table is identical across suite and NAT-T', () => {
    for (const t of ['gre', 'wireguard', 'vxlan'] as const) {
      const base = JSON.stringify(layoutOf(t, 100, effectiveOptions(t, DEFAULT_OPTIONS)));
      for (const o of everyOption().filter((x) => x.outer === 4)) expect(JSON.stringify(layoutOf(t, 100, effectiveOptions(t, o)))).toBe(base);
    }
  });
});
