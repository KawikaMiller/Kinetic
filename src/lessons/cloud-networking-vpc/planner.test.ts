import { describe, expect, it } from 'vitest';
import { blockSize, ipToString, ipv4 } from '../../core/ipv4';
import { mulberry32, randInt } from '../../core/random';
import { DEFAULT_ROWS, DEFAULT_VPC, MAX_SUBNET_ROWS, carve, firstFit, overlapOf, parseBlock, spanOf, spanToCidrs, usableAddresses } from './planner';
import { cidrText, type Cidr } from './vpc';

const addresses = (c: Cidr): Set<number> => {
  const s = spanOf(c);
  const out = new Set<number>();
  for (let a = s.first; a <= s.last; a++) out.add(a);
  return out;
};

describe('usable addresses under the five-address reserve', () => {
  it('a /24 gives 251, a /28 gives 11 and a /29 gives 3 (hand cases)', () => {
    expect(usableAddresses(24)).toBe(251);
    expect(usableAddresses(28)).toBe(11);
    expect(usableAddresses(29)).toBe(3);
    expect(usableAddresses(16)).toBe(65531);
  });

  it('a block smaller than the reserve gives none, never a negative number', () => {
    expect(usableAddresses(30)).toBe(0);
    expect(usableAddresses(31)).toBe(0);
    expect(usableAddresses(32)).toBe(0);
  });

  it('equals the block size minus five at every prefix', () => {
    for (let p = 0; p <= 29; p++) expect(usableAddresses(p)).toBe(2 ** (32 - p) - 5);
  });
});

describe('overlap detection', () => {
  it('equals a brute-force comparison of address sets on 500 seeded CIDR pairs', () => {
    const rnd = mulberry32(33);
    const base = ipv4('10.0.0.0');
    const block = (): Cidr => {
      const prefix = randInt(20, 28, rnd);
      const size = blockSize(prefix);
      const slot = randInt(0, Math.floor(2 ** 14 / size) - 1, rnd);
      return { net: base + slot * size, prefix };
    };
    let overlapping = 0;
    for (let i = 0; i < 500; i++) {
      const a = block();
      const b = block();
      const sa = addresses(a);
      const shared = [...addresses(b)].filter((x) => sa.has(x));
      const got = overlapOf(spanOf(a), spanOf(b));
      if (shared.length === 0) expect(got).toBeNull();
      else {
        overlapping++;
        expect(got).toEqual({ first: Math.min(...shared), last: Math.max(...shared) });
      }
    }
    expect(overlapping).toBeGreaterThan(20);
  });
});

describe('span to CIDR blocks', () => {
  it('covers exactly the span, with aligned, adjacent, non-overlapping blocks, on 300 seeded spans', () => {
    const rnd = mulberry32(34);
    for (let i = 0; i < 300; i++) {
      const first = ipv4('10.0.0.0') + randInt(0, 5000, rnd);
      const last = first + randInt(0, 5000, rnd);
      const blocks = spanToCidrs(first, last);
      let cursor = first;
      for (const b of blocks) {
        expect(spanOf(b).first).toBe(cursor);
        expect(b.net % blockSize(b.prefix)).toBe(0);
        cursor = spanOf(b).last + 1;
      }
      expect(cursor).toBe(last + 1);
    }
  });
});

describe('typed blocks are refused with the reason', () => {
  const refuse = (text: string) => {
    const r = parseBlock(text, 'Row 2');
    expect(r.ok, text).toBe(false);
    return r.ok ? '' : r.error;
  };
  it('a /33, a bad octet, a size outside /16-/28 and host bits are each refused, naming the row', () => {
    expect(refuse('10.0.0.0/33')).toMatch(/^Row 2: .*\/33/);
    expect(refuse('10.0.0.256/24')).toMatch(/^Row 2: .*256/);
    expect(refuse('10.0.0.0/8')).toMatch(/^Row 2: \/8 is outside the \/16 to \/28/);
    expect(refuse('10.0.0.0/29')).toMatch(/outside the \/16 to \/28/);
    expect(refuse('10.0.0.5/24')).toMatch(/host bits set; the block starts at 10\.0\.0\.0\. Write 10\.0\.0\.0\/24/);
    expect(refuse('')).toMatch(/^Row 2: /);
    expect(refuse('10.0.0.0')).toMatch(/prefix/);
  });
  it('very long and markup-shaped text is refused, and the error stays short', () => {
    for (const text of ['x'.repeat(5000), '<b>10.0.0.0/24</b>', '10.0.0.0/24'.repeat(400)]) {
      expect(refuse(text).length).toBeLessThan(300);
    }
  });
  it('a good block parses to itself', () => {
    expect(parseBlock(' 10.0.4.0/22 ', 'Row 1')).toEqual({ ok: true, value: { net: ipv4('10.0.4.0'), prefix: 22 } });
  });
});

describe('carving the /16', () => {
  it('the design: three /24 subnets, 753 usable, and a free list that exactly fills the rest of the range', () => {
    const c = carve(DEFAULT_VPC, DEFAULT_ROWS);
    expect(c.accepted.map(cidrText)).toEqual(['10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24']);
    expect(c.usable).toBe(753);
    expect(c.freeAddresses).toBe(65536 - 3 * 256);
    expect(c.free.map(cidrText)).toEqual(['10.0.0.0/24', '10.0.4.0/22', '10.0.8.0/21', '10.0.16.0/20', '10.0.32.0/19', '10.0.64.0/18', '10.0.128.0/17']);
    expect(cidrText(c.largestFree!)).toBe('10.0.128.0/17');
  });

  it('an overlapping row is not counted and the message gives the shared range (try-this 5)', () => {
    const rows = DEFAULT_ROWS.map((r, i) => (i === 1 ? { ...r, text: '10.0.1.128/25' } : r));
    const c = carve(DEFAULT_VPC, rows);
    const second = c.rows[1];
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('overlap at 10.0.1.128 to 10.0.1.255');
    expect(c.usable).toBe(502);
    expect(c.accepted).toHaveLength(2);
  });

  it('a subnet outside the VPC range is refused with the range named, and nothing is clamped', () => {
    const c = carve(DEFAULT_VPC, [{ name: 'x', text: '10.1.0.0/24' }]);
    expect(c.rows[0].ok).toBe(false);
    if (!c.rows[0].ok) expect(c.rows[0].error).toContain('falls outside the VPC range 10.0.0.0/16');
    expect(c.accepted).toHaveLength(0);
    expect(c.freeAddresses).toBe(65536);
  });

  it('accepted subnets and free blocks partition the range on 200 seeded row sets, and no counted pair overlaps', () => {
    const rnd = mulberry32(35);
    for (let i = 0; i < 200; i++) {
      const rows = Array.from({ length: randInt(1, MAX_SUBNET_ROWS, rnd) }, (_, k) => {
        const prefix = randInt(18, 28, rnd);
        const slot = randInt(0, 2 ** (prefix - 16) - 1, rnd);
        return { name: `r${k}`, text: `${ipToString(ipv4('10.0.0.0') + slot * blockSize(prefix))}/${prefix}` };
      });
      const c = carve(DEFAULT_VPC, rows);
      const cover = new Uint8Array(65536);
      const mark = (b: Cidr) => {
        const sp = spanOf(b);
        for (let x = sp.first; x <= sp.last; x++) cover[x - ipv4('10.0.0.0')]++;
      };
      c.accepted.forEach(mark);
      c.free.forEach(mark);
      // every address of the range is covered exactly once by a counted subnet or a free block
      expect(cover.every((n) => n === 1)).toBe(true);
    }
  });

  it('the first fit is the first free block big enough, and null when no free block is', () => {
    const c = carve(DEFAULT_VPC, DEFAULT_ROWS);
    expect(cidrText(firstFit(c, 24)!)).toBe('10.0.0.0/24');
    expect(cidrText(firstFit(c, 22)!)).toBe('10.0.4.0/22');
    expect(firstFit(c, 16)).toBeNull();
    const full = carve(DEFAULT_VPC, [{ name: 'all', text: '10.0.0.0/16' }]);
    expect(firstFit(full, 28)).toBeNull();
    expect(full.largestFree).toBeNull();
  });
});
