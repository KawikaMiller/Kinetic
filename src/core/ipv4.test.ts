import { describe, expect, it } from 'vitest';
import {
  IPV4_BITS, blockSize, broadcastOf, contains, ipToString, ipv4, maskOf, networkOf, parseCidr, parseIPv4, parsePrefix, wildcardOf,
} from './ipv4';
import { mulberry32 } from './random';

/**
 * Reference implementation: plain arithmetic on block sizes (floor division), no bitwise
 * operators, so it can't share a sign or shift bug with the module.
 */
const ref = {
  size: (p: number) => 2 ** (32 - p),
  network: (a: number, p: number) => Math.floor(a / 2 ** (32 - p)) * 2 ** (32 - p),
  broadcast: (a: number, p: number) => ref.network(a, p) + 2 ** (32 - p) - 1,
  mask: (p: number) => 2 ** 32 - 2 ** (32 - p),
  contains: (net: number, p: number, a: number) => ref.network(a, p) === ref.network(net, p),
  /** Dotted quad by division, the long way round. */
  text: (a: number) => [3, 2, 1, 0].map((k) => Math.floor(a / 256 ** k) % 256).join('.'),
};

const seededAddresses = (n: number, seed: number) => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Math.floor(rnd() * 2 ** 32));
};

const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const errorOf = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

const EDGES = [0, 1, 255, 256, 2 ** 24 - 1, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 2, 2 ** 32 - 1, 0xc0a8010a];

describe('text ⇄ number', () => {
  it('formats and parses back every edge value and 5,000 seeded addresses', () => {
    for (const a of [...EDGES, ...seededAddresses(5000, 4)]) {
      expect(ipToString(a)).toBe(ref.text(a));
      expect(ok(parseIPv4(ipToString(a)))).toBe(a);
      expect(ipv4(ipToString(a))).toBe(a);
    }
  });

  it('round-trips every value of each octet position', () => {
    for (let v = 0; v <= 255; v++) {
      for (let k = 0; k < 4; k++) {
        const a = v * 256 ** k;
        expect(ok(parseIPv4(ipToString(a)))).toBe(a);
      }
    }
  });

  it('ipv4() throws on what parseIPv4 refuses, naming the text', () => {
    expect(() => ipv4('192.168.1')).toThrow(/"192\.168\.1"/);
    expect(() => ipv4('010.0.0.1')).toThrow(RangeError);
  });
});

describe('masks and block maths against the reference', () => {
  const addrs = [...EDGES, ...seededAddresses(2000, 2026)];

  it('masks, wildcards and sizes are right at every prefix 0-32', () => {
    for (let p = 0; p <= IPV4_BITS; p++) {
      expect(maskOf(p)).toBe(ref.mask(p));
      expect(wildcardOf(p)).toBe(2 ** 32 - 1 - ref.mask(p));
      expect(blockSize(p)).toBe(ref.size(p));
      expect(maskOf(p)).toBeGreaterThanOrEqual(0);
    }
    for (let p = 0; p < 32; p++) expect(blockSize(p + 1)).toBe(blockSize(p) / 2);
  });

  it('network and broadcast match for 2,000 seeded addresses at every prefix', () => {
    for (const a of addrs) {
      for (let p = 0; p <= 32; p++) {
        expect(networkOf(a, p)).toBe(ref.network(a, p));
        expect(broadcastOf(a, p)).toBe(ref.broadcast(a, p));
      }
    }
  });

  it('membership is (a & mask) === (net & mask) with unsigned maths, for every prefix', () => {
    const pairs = seededAddresses(4000, 7);
    for (let i = 0; i < pairs.length; i += 2) {
      const [net, a] = [pairs[i], pairs[i + 1]];
      for (let p = 0; p <= 32; p++) {
        expect(contains(net, p, a)).toBe(ref.contains(net, p, a));
        expect(contains(net, p, net)).toBe(true);
        // the same address with a host bit changed stays in; a network bit changed leaves
        if (p < 32) expect(contains(net, p, (net ^ 1) >>> 0)).toBe(true);
        if (p > 0) expect(contains(net, p, (net ^ 2 ** (32 - p)) >>> 0)).toBe(false);
      }
    }
    // the high-bit case a signed & gets wrong
    expect(contains(0xc0000000, 2, 0xffffffff)).toBe(true);
    expect(networkOf(0xffffffff, 1)).toBe(0x80000000);
  });

  it('formats masks', () => {
    expect(ipToString(maskOf(24))).toBe('255.255.255.0');
    expect(ipToString(maskOf(0))).toBe('0.0.0.0');
    expect(ipToString(maskOf(32))).toBe('255.255.255.255');
    expect(ipToString(wildcardOf(26))).toBe('0.0.0.63');
  });
});

describe('parsing hostile input (AC-0/T2 #5)', () => {
  it('reads dotted quads and CIDR', () => {
    expect(ok(parseIPv4(' 192.168.1.10 '))).toBe(0xc0a8010a);
    expect(ok(parseIPv4('255.255.255.255'))).toBe(2 ** 32 - 1);
    expect(ok(parseIPv4('0.0.0.0'))).toBe(0);
    expect(ok(parseCidr('10.0.0.0/8'))).toEqual({ addr: 0x0a000000, prefix: 8 });
    expect(ok(parseCidr('10.0.0.1', 24))).toEqual({ addr: 0x0a000001, prefix: 24 });
    expect(ok(parsePrefix('0'))).toBe(0);
    expect(ok(parsePrefix('32'))).toBe(32);
  });

  it('refuses each bad form with a message', () => {
    const cases: [string, RegExp][] = [
      ['', /Type an IPv4 address/],
      ['   ', /Type an IPv4 address/],
      ['256.1.1.1', /0-255/],
      ['1.2.3', /exactly four.*has 3/],
      ['1.2.3.4.5', /has 5/],
      ['01.2.3.4', /leading zeros/],
      ['192.168.001.1', /leading zeros.*Write 1/],
      ['1..2.3', /empty part/],
      ['1.2.3.', /empty part/],
      ['-1', /Only digits and dots/],
      ['1e400', /Only digits and dots/],
      ['12345678901234567890123', /has 1/],
      ['1.2.3.12345678901234567890123', /0-255.*123456…/],
      ['🙂', /Only digits and dots/],
      ['<b>1.2.3.4</b>', /Only digits and dots/],
      ['1,2,,3', /Only digits and dots/],
      ['0x7f.0.0.1', /Only digits and dots/],
      ['x'.repeat(41), /too long/],
    ];
    for (const [text, msg] of cases) expect(errorOf(parseIPv4(text)), text).toMatch(msg);
  });

  it('refuses bad prefixes', () => {
    expect(errorOf(parseCidr('10.0.0.0/33'))).toMatch(/0-32/);
    expect(errorOf(parseCidr('10.0.0.0/'))).toMatch(/Add a prefix/);
    expect(errorOf(parseCidr('10.0.0.0/-1'))).toMatch(/whole number/);
    expect(errorOf(parseCidr('10.0.0.0/08'))).toMatch(/leading zeros/);
    expect(errorOf(parseCidr('10.0.0.0/24/8'))).toMatch(/one slash/);
    expect(errorOf(parseCidr('10.0.0.0'))).toMatch(/Add a prefix/);
    expect(errorOf(parseCidr('10.0.0.0/1e400'))).toMatch(/whole number/);
    expect(errorOf(parseCidr(`10.0.0.0/${'1'.repeat(40)}`))).toMatch(/far too long/);
    expect(errorOf(parseCidr('300.0.0.0/8'))).toMatch(/0-255/);
  });
});
