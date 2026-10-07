import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  ATTEMPT_DELAY_MS, PRESETS, RACE, addressBits, classify, eui64, fieldOfBit, formatCanonical, formatFull, groupParts, happyEyeballs, parseIPv6,
  randomIid, stageText, withIid, zeroRun, type AddressType,
} from './model';

const ok = (text: string) => {
  const r = parseIPv6(text);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r.value;
};
const canon = (text: string) => formatCanonical(ok(text));
const errorOf = (text: string) => {
  const r = parseIPv6(text);
  return r.ok ? null : r.error;
};

/**
 * Reference for the "::" choice, written differently from the model: list every maximal run of
 * zero groups, keep those of 2+, sort by length (longest first) then position (first first),
 * and splice the winner out of the hex groups. RFC 5952 §4.2.2-4.2.3.
 */
function reference(h: number[]): string {
  const groups = h.map((g) => g.toString(16));
  const runs: { from: number; len: number }[] = [];
  h.forEach((g, i) => {
    if (g !== 0 || (i > 0 && h[i - 1] === 0)) return;
    let len = 0;
    while (i + len < 8 && h[i + len] === 0) len++;
    runs.push({ from: i, len });
  });
  const best = runs.filter((r) => r.len >= 2).sort((a, b) => b.len - a.len || a.from - b.from)[0];
  if (!best) return groups.join(':');
  return `${groups.slice(0, best.from).join(':')}::${groups.slice(best.from + best.len).join(':')}`;
}

/** Random addresses with plenty of zero groups, so runs and ties come up often. */
function seeded(n: number, seed: number) {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Array.from({ length: 8 }, () => (rnd() < 0.45 ? 0 : rnd() < 0.3 ? Math.floor(rnd() * 16) : Math.floor(rnd() * 0x10000))));
}

describe('RFC 5952 canonical form', () => {
  it('matches the RFC\'s examples', () => {
    expect(canon('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(canon('2001:0db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(canon('2001:db8::0:1')).toBe('2001:db8::1');
    expect(canon('2001:db8:0:0:0::1')).toBe('2001:db8::1');
    expect(canon('2001:db8:0:0:0:0:2:1')).toBe('2001:db8::2:1');
    expect(canon('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
    expect(canon('2001:0:0:1:0:0:0:1')).toBe('2001:0:0:1::1');
    expect(canon('2001:DB8::AAAA')).toBe('2001:db8::aaaa');
    expect(canon('2001:0db8::0001')).toBe('2001:db8::1');
    expect(canon('0:0:0:0:0:0:0:0')).toBe('::');
    expect(canon('0:0:0:0:0:0:0:1')).toBe('::1');
    expect(canon('1:0:0:0:0:0:0:0')).toBe('1::');
  });

  it('never collapses a single zero group', () => {
    expect(zeroRun(ok('2001:db8:0:1:1:1:1:1'))).toBeNull();
    expect(canon('1:0:1:0:1:0:1:0')).toBe('1:0:1:0:1:0:1:0');
  });

  it('agrees with an enumerate-and-sort reference on 1,000 seeded addresses', () => {
    for (const h of seeded(1000, 52)) expect(formatCanonical(h)).toBe(reference(h));
  });

  it('round-trips 1,000 seeded addresses through canonical and full text', () => {
    for (const h of seeded(1000, 5952)) {
      expect(ok(formatCanonical(h))).toEqual(h);
      expect(ok(formatFull(h))).toEqual(h);
      expect(formatCanonical(ok(formatCanonical(h)))).toBe(formatCanonical(h));
      expect(formatFull(h)).toMatch(/^([0-9a-f]{4}:){7}[0-9a-f]{4}$/);
    }
  });

  it('builds the compress animation from the same rules: full, zeros dropped, then canonical', () => {
    for (const h of seeded(300, 11)) {
      expect(stageText(h, 0)).toBe(formatFull(h));
      expect(stageText(h, 2)).toBe(formatCanonical(h));
      const run = zeroRun(h);
      h.forEach((g, i) => {
        const p = groupParts(h, i);
        expect(p.zeros + p.digits).toBe(g.toString(16).padStart(4, '0'));
        expect(p.inRun).toBe(!!run && i >= run.from && i < run.from + run.len);
      });
      expect(ok(stageText(h, 1))).toEqual(h);
    }
  });
});

describe('malformed input is refused', () => {
  it('names the problem', () => {
    const cases: [string, RegExp][] = [
      ['', /Type an IPv6 address/],
      ['   ', /Type an IPv6 address/],
      ['2001:db8::1::1', /only once/],
      ['1:2:3:4:5:6:7:8:9', /8 groups.*has 9/],
      ['1:2:3:4:5:6:7', /8 groups.*has 7/],
      ['2001:db8::12345', /at most 4 hex digits.*has 5/],
      ['2001:db8:::1', /":::"/],
      ['1:2:3:4:5:6:7::8', /fewer than 8/],
      [':1:2:3:4:5:6:7', /empty group/],
      ['1:2:3:4:5:6:7:', /empty group/],
      ['2001:db8::g', /Only hex digits/],
      ['::ffff:192.0.2.1', /not modelled/],
      ['fe80::1%eth0', /not modelled/],
      ['🙂', /Only hex digits/],
      ['<b>::1</b>', /Only hex digits/],
      ['-1', /Only hex digits/],
      ['1e400', /at most 4 hex digits.*has 5/],
      ['123456789012345678901234567890', /at most 4 hex digits/],
      ['1,2', /Only hex digits/],
      ['1'.repeat(50), /Too long/],
    ];
    for (const [text, msg] of cases) expect(errorOf(text), text).toMatch(msg);
  });
});

describe('address types', () => {
  const t = (text: string): AddressType => classify(ok(text));

  it('classifies each prefix, including its edges', () => {
    expect(t('::')).toBe('unspecified');
    expect(t('::1')).toBe('loopback');
    expect(t('ff02::1')).toBe('multicast');
    expect(t('ff00::')).toBe('multicast');
    expect(t('fe80::1')).toBe('link-local');
    expect(t('febf:ffff::1')).toBe('link-local');
    expect(t('fec0::1')).not.toBe('link-local');
    expect(t('fc00::1')).toBe('unique-local');
    expect(t('fdff:ffff::1')).toBe('unique-local');
    expect(t('2001:db8::1')).toBe('documentation');
    expect(t('2001:db8:ffff::1')).toBe('documentation');
    expect(t('2001:db9::1')).toBe('global-unicast');
    expect(t('3fff:0fff::1')).toBe('documentation');
    expect(t('3fff:1000::1')).toBe('global-unicast');
    expect(t('2000::1')).toBe('global-unicast');
    expect(t('3fff:ffff::1')).toBe('global-unicast');
    expect(t('4000::1')).toBe('other');
    expect(t('::2')).toBe('other');
  });

  it('every preset parses to the type its label names', () => {
    const want: Record<string, AddressType> = {
      Documentation: 'documentation', 'Link-local': 'link-local', 'Unique local': 'unique-local', Loopback: 'loopback', Multicast: 'multicast',
    };
    for (const p of PRESETS) expect(classify(ok(p.text))).toBe(want[p.label]);
  });
});

describe('bits and fields', () => {
  it('spells 128 bits, most significant first, split /48 + 16 + 64', () => {
    const bits = addressBits(ok('8000::1'));
    expect(bits).toHaveLength(128);
    expect(bits[0]).toBe(1);
    expect(bits[127]).toBe(1);
    expect(bits.filter(Boolean)).toHaveLength(2);
    expect([0, 47, 48, 63, 64, 127].map(fieldOfBit)).toEqual(['site', 'site', 'subnet', 'subnet', 'iid', 'iid']);
  });
});

describe('SLAAC interface IDs', () => {
  it('derives EUI-64 from 00:1a:2b:3c:4d:5e as 021a:2bff:fe3c:4d5e', () => {
    expect(formatFull([0, 0, 0, 0, ...eui64('00:1a:2b:3c:4d:5e')]).slice(20)).toBe('021a:2bff:fe3c:4d5e');
    // flipping the U/L bit works both ways
    expect(eui64('02:1a:2b:3c:4d:5e')[0]).toBe(0x001a);
  });

  it('builds the global address from the /64 prefix and the interface ID', () => {
    const addr = withIid(ok('2001:db8:1:2::'), eui64('00:1a:2b:3c:4d:5e'));
    expect(formatCanonical(addr)).toBe('2001:db8:1:2:21a:2bff:fe3c:4d5e');
    const rnd = mulberry32(3);
    const iid = randomIid(rnd);
    expect(iid).toHaveLength(4);
    expect(iid.every((g) => g >= 0 && g <= 0xffff && Number.isInteger(g))).toBe(true);
    expect(randomIid(mulberry32(3))).toEqual(iid);
  });
});

describe('Happy Eyeballs', () => {
  it('IPv6 wins when it connects within the attempt delay; IPv4 never starts', () => {
    const r = happyEyeballs(RACE);
    expect(r).toMatchObject({ winner: 'v6', v4Start: null, connectedAt: RACE.dnsMs + RACE.v6Ms });
  });

  it('a broken IPv6 path costs exactly the attempt delay before IPv4 connects', () => {
    const r = happyEyeballs({ ...RACE, v6Ms: null });
    expect(r).toMatchObject({ winner: 'v4', v6Done: null, v4Start: RACE.dnsMs + ATTEMPT_DELAY_MS, connectedAt: RACE.dnsMs + ATTEMPT_DELAY_MS + RACE.v4Ms });
  });

  it('picks whichever connects first once both are racing', () => {
    for (let v6 = 0; v6 <= 600; v6 += 10) {
      for (const v4 of [5, 35, 200]) {
        const r = happyEyeballs({ dnsMs: 0, v6Ms: v6, v4Ms: v4 });
        const v4Done = ATTEMPT_DELAY_MS + v4;
        if (v6 <= ATTEMPT_DELAY_MS) expect(r.v4Start).toBeNull();
        expect(r.winner).toBe(v6 <= ATTEMPT_DELAY_MS || v6 <= v4Done ? 'v6' : 'v4');
        expect(r.connectedAt).toBe(Math.min(v6 <= ATTEMPT_DELAY_MS ? v6 : Math.min(v6, v4Done)));
      }
    }
  });
});
