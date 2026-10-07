import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  PRESETS, addressBits, firstDifference, allocate, alignedNeighbours, blockInfo, blockSize, blockToString, broadcastOf, contains, hex32, ipToString,
  isAligned, lanHosts, maskOf, networkOf, parseCidr, parseIPv4, parsePrefix, parseTeams, placeBlock, prefixForHosts, splitEqual, summarize,
  wildcardOf, type Block,
} from './model';

/**
 * Reference implementation: plain arithmetic on block sizes (floor division), no bitwise
 * operators, so it can't share a sign or shift bug with the model.
 */
const ref = {
  size: (p: number) => 2 ** (32 - p),
  network: (a: number, p: number) => Math.floor(a / 2 ** (32 - p)) * 2 ** (32 - p),
  broadcast: (a: number, p: number) => ref.network(a, p) + 2 ** (32 - p) - 1,
  mask: (p: number) => 2 ** 32 - 2 ** (32 - p),
  contains: (net: number, p: number, a: number) => ref.network(a, p) === ref.network(net, p),
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

describe('masks and block maths against the reference', () => {
  const addrs = [0, 1, 2 ** 32 - 1, 2 ** 31, 0xc0a8010a, ...seededAddresses(2000, 2026)];

  it('masks, wildcards and sizes are right at every prefix 0-32', () => {
    for (let p = 0; p <= 32; p++) {
      expect(maskOf(p)).toBe(ref.mask(p));
      expect(wildcardOf(p)).toBe(2 ** 32 - 1 - ref.mask(p));
      expect(blockSize(p)).toBe(ref.size(p));
      expect(maskOf(p)).toBeGreaterThanOrEqual(0);
    }
  });

  it('network, broadcast and host range match for 2,000 seeded addresses at every prefix', () => {
    for (const a of addrs) {
      for (let p = 0; p <= 32; p++) {
        const info = blockInfo(a, p);
        expect(networkOf(a, p)).toBe(ref.network(a, p));
        expect(broadcastOf(a, p)).toBe(ref.broadcast(a, p));
        expect(info.network).toBe(ref.network(a, p));
        expect(info.total).toBe(ref.size(p));
        if (p <= 30) {
          expect(info.broadcast).toBe(ref.broadcast(a, p));
          expect(info.first).toBe(ref.network(a, p) + 1);
          expect(info.last).toBe(ref.broadcast(a, p) - 1);
          expect(info.usable).toBe(ref.size(p) - 2);
        }
      }
    }
  });

  it('follows RFC 3021 for /31 and host-route semantics for /32', () => {
    const p2p = blockInfo(ok(parseIPv4('198.51.100.7')), 31);
    expect(p2p).toMatchObject({ kind: 'point-to-point', usable: 2, broadcast: null });
    expect(ipToString(p2p.first)).toBe('198.51.100.6');
    expect(ipToString(p2p.last)).toBe('198.51.100.7');
    const host = blockInfo(ok(parseIPv4('203.0.113.10')), 32);
    expect(host).toMatchObject({ kind: 'single-host', usable: 1, broadcast: null, total: 1 });
    expect(host.first).toBe(host.last);
  });

  it('a /24 has 254 usable hosts, not 256, and a bigger prefix is a smaller block', () => {
    expect(blockInfo(0xc0a80100, 24).usable).toBe(254);
    for (let p = 0; p < 32; p++) expect(blockSize(p + 1)).toBe(blockSize(p) / 2);
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
    // firstDifference agrees with contains, and names a bit where they really differ
    for (let i = 0; i < pairs.length; i += 2) {
      const [net, a] = [pairs[i], pairs[i + 1]];
      for (let p = 0; p <= 32; p++) {
        const d = firstDifference(net, p, a);
        expect(d === null).toBe(contains(net, p, a));
        if (d !== null) {
          expect(d).toBeLessThan(p);
          expect(addressBits(a)[d]).not.toBe(addressBits(net)[d]);
          expect(addressBits(a).slice(0, d)).toEqual(addressBits(net).slice(0, d));
        }
      }
    }
    // the high-bit case a signed & gets wrong
    expect(contains(0xc0000000, 2, 0xffffffff)).toBe(true);
    expect(networkOf(0xffffffff, 1)).toBe(0x80000000);
  });

  it('formats addresses, masks and bits', () => {
    expect(ipToString(maskOf(24))).toBe('255.255.255.0');
    expect(hex32(maskOf(20))).toBe('0xFFFFF000');
    expect(ipToString(wildcardOf(26))).toBe('0.0.0.63');
    expect(addressBits(0x80000001)).toEqual([1, ...Array(30).fill(0), 1]);
  });
});

describe('parsing hostile input (AC-0/T2 #5)', () => {
  it('reads dotted quads and CIDR', () => {
    expect(ok(parseIPv4(' 192.168.1.10 '))).toBe(0xc0a8010a);
    expect(ok(parseIPv4('255.255.255.255'))).toBe(2 ** 32 - 1);
    expect(ok(parseCidr('10.0.0.0/8'))).toEqual({ addr: 0x0a000000, prefix: 8 });
    expect(ok(parseCidr('10.0.0.1', 24))).toEqual({ addr: 0x0a000001, prefix: 24 });
    expect(ok(parsePrefix('0'))).toBe(0);
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
      ['-1', /Only digits and dots/],
      ['1e400', /Only digits and dots/],
      ['12345678901234567890123', /has 1/],
      ['1.2.3.12345678901234567890123', /0-255.*123456…/],
      ['🙂', /Only digits and dots/],
      ['<b>1.2.3.4</b>', /Only digits and dots/],
      ['1,2,,3', /Only digits and dots/],
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
  });

  it('reads team lists strictly', () => {
    expect(ok(parseTeams(' 50, 10 ,2 '))).toEqual([50, 10, 2]);
    const cases: [string, RegExp][] = [
      ['', /Type host counts/],
      ['50,,2', /gap between two commas/],
      ['50, 10,', /gap/],
      ['0', /at least 1/],
      ['-1', /at least 1/],
      ['1e400', /isn't a whole number/],
      ['2.5', /isn't a whole number/],
      ['12345678901234567890123', /More hosts than IPv4/],
      ['🙂', /isn't a whole number/],
      ['<b>5</b>', /isn't a whole number/],
      ['1,2,3,4,5,6,7,8,9', /Up to 8/],
    ];
    for (const [text, msg] of cases) expect(errorOf(parseTeams(text)), text).toMatch(msg);
  });

  it('every preset parses', () => {
    for (const p of PRESETS) expect(parseCidr(p.cidr).ok).toBe(true);
  });
});

describe('splitting and aggregation', () => {
  const home: Block = { net: 0xc0a80100, prefix: 24 };

  it('splits a /24 into four aligned /26s that summarise back to the /24', () => {
    const parts = splitEqual(home, 26);
    expect(parts.map(blockToString)).toEqual(['192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26']);
    expect(parts.every(isAligned)).toBe(true);
    expect(summarize(parts)).toEqual([home]);
  });

  it('every equal split tiles its parent exactly, at every depth', () => {
    for (const parent of [home, { net: 0, prefix: 0 }, { net: 0x0a000000, prefix: 8 }]) {
      for (let p = parent.prefix; p <= Math.min(32, parent.prefix + 6); p++) {
        const parts = splitEqual(parent, p);
        expect(parts.reduce((s, b) => s + blockSize(b.prefix), 0)).toBe(blockSize(parent.prefix));
        parts.forEach((b, i) => i && expect(b.net).toBe(parts[i - 1].net + blockSize(p)));
        expect(summarize(parts)).toEqual([parent]);
      }
    }
  });

  it('refuses a misaligned block with the reason', () => {
    const r = placeBlock(home, [], { net: 0xc0a80120, prefix: 26 });
    expect(errorOf(r)).toBe('A /26 must start on a multiple of 64 addresses, and 192.168.1.32 doesn\'t. Try 192.168.1.0 or 192.168.1.64.');
    expect(alignedNeighbours(0xc0a80120, 26).map(ipToString)).toEqual(['192.168.1.0', '192.168.1.64']);
  });

  it('refuses overlaps, outsiders and blocks bigger than the parent', () => {
    const first = ok(placeBlock(home, [], { net: 0xc0a80100, prefix: 25 }));
    expect(errorOf(placeBlock(home, [first], { net: 0xc0a80140, prefix: 26 }))).toMatch(/overlaps 192\.168\.1\.0\/25/);
    expect(errorOf(placeBlock(home, [], { net: 0xc0a80200, prefix: 26 }))).toMatch(/isn't inside/);
    expect(errorOf(placeBlock(home, [], { net: 0xc0a80000, prefix: 23 }))).toMatch(/bigger than the \/24/);
    expect(ok(placeBlock(home, [first], { net: 0xc0a80180, prefix: 26 }))).toEqual({ net: 0xc0a80180, prefix: 26 });
  });

  it('accepts exactly the aligned blocks inside the parent (exhaustive over a /24)', () => {
    for (let p = 24; p <= 32; p++) {
      for (let off = 0; off < 256; off++) {
        const r = placeBlock(home, [], { net: home.net + off, prefix: p });
        expect(r.ok).toBe(off % blockSize(p) === 0);
      }
    }
  });

  it('sizes LAN blocks for host counts', () => {
    expect(prefixForHosts(50)).toBe(26);
    expect(prefixForHosts(62)).toBe(26);
    expect(prefixForHosts(63)).toBe(25);
    expect(prefixForHosts(10)).toBe(28);
    expect(prefixForHosts(2)).toBe(30);
    expect(prefixForHosts(1)).toBe(30);
    expect(prefixForHosts(2 ** 32)).toBeNull();
    for (let h = 1; h < 5000; h++) {
      const p = prefixForHosts(h)!;
      expect(lanHosts(p)).toBeGreaterThanOrEqual(h);
      if (p < 30) expect(lanHosts(p + 1)).toBeLessThan(h);
    }
  });

  it('allocates "50, 10, 2" in a /24 aligned, largest first, without overlap', () => {
    const blocks = ok(allocate(home, [50, 10, 2]));
    expect(blocks.map((b) => [blockToString(b), b.team])).toEqual([
      ['192.168.1.0/26', 0],
      ['192.168.1.64/28', 1],
      ['192.168.1.80/30', 2],
    ]);
  });

  it('allocation succeeds exactly when the sizes fit, and never misaligns or overlaps (seeded)', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 400; t++) {
      const demands = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => 1 + Math.floor(rnd() * 120));
      const need = demands.reduce((s, h) => s + blockSize(prefixForHosts(h)!), 0);
      const r = allocate(home, demands);
      expect(r.ok).toBe(need <= 256 && demands.every((h) => prefixForHosts(h)! >= 24));
      if (!r.ok) continue;
      const placed: Block[] = [];
      for (const b of r.value) {
        expect(placeBlock(home, placed, b).ok).toBe(true);
        expect(lanHosts(b.prefix)).toBeGreaterThanOrEqual(demands[b.team]);
        placed.push(b);
      }
      expect(new Set(r.value.map((b) => b.team)).size).toBe(demands.length);
    }
  });

  it('summarise covers exactly the same addresses with blocks no pair of which merges (seeded, against a set)', () => {
    const rnd = mulberry32(5);
    const covered = (bs: readonly Block[]) => {
      const s = new Set<number>();
      for (const b of bs) for (let i = 0; i < blockSize(b.prefix); i++) s.add(b.net + i);
      return s;
    };
    for (let t = 0; t < 300; t++) {
      const parts = splitEqual(home, 24 + 1 + Math.floor(rnd() * 4)).filter(() => rnd() < 0.6);
      const sum = summarize(parts);
      expect([...covered(sum)].sort((a, b) => a - b)).toEqual([...covered(parts)].sort((a, b) => a - b));
      for (let i = 0; i + 1 < sum.length; i++) {
        const [a, b] = [sum[i], sum[i + 1]];
        const mergeable = a.prefix === b.prefix && b.net === a.net + blockSize(a.prefix) && isAligned({ net: a.net, prefix: a.prefix - 1 });
        expect(mergeable).toBe(false);
      }
    }
  });
});
