import { describe, expect, it } from 'vitest';
import { enc, hotp, totp } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import {
  ACCEPT_WINDOW, STEP_SECONDS, accepts, base32Decode, base32Encode, counterAt, counterToBytes, groupSecret, secondsLeft, skewVerdict,
  stepsApart, totpSteps, truncate,
} from './totp';

/** RFC 6238 Appendix B, SHA-1 (the 8-digit values), with the ASCII secret 12345678901234567890. */
const RFC_KEY = enc.encode('12345678901234567890');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP against RFC 6238 Appendix B (SHA-1)', () => {
  for (const [t, code] of RFC_VECTORS) {
    it(`T = ${t} gives ${code} at 8 digits, and the 6-digit code is its last 6 digits`, async () => {
      const steps = await totpSteps(RFC_KEY, t, 8);
      expect(steps!.code).toBe(code);
      const six = await totpSteps(RFC_KEY, t, 6);
      expect(six!.code).toBe(code.slice(-6));
    });
  }

  it('the step-by-step version equals core/crypto totp for 200 seeded keys and times', async () => {
    const rnd = mulberry32(6238);
    for (let i = 0; i < 200; i++) {
      const key = Uint8Array.from({ length: 20 }, () => Math.floor(rnd() * 256));
      const t = Math.floor(rnd() * 4e9);
      const steps = await totpSteps(key, t);
      expect(steps!.code).toBe(await totp(key, t));
      expect(steps!.code).toBe(await hotp(key, counterAt(t)));
    }
  });

  it('keeps consistent intermediate values: offset is the last nibble, the 31-bit value mod 10^6 is the code', async () => {
    const s = (await totpSteps(RFC_KEY, 59))!;
    expect(s.counter).toBe(1);
    expect(Array.from(s.counterBytes)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(s.mac.length).toBe(20);
    expect(s.offset).toBe(s.mac[19] & 0x0f);
    expect(s.truncated).toBeLessThan(2 ** 31);
    expect(String(s.truncated % 1e6).padStart(6, '0')).toBe(s.code);
  });

  it('RFC 4226 section 5.4: the published MAC truncates at offset 10 to 0x50ef7f19 and 872921', () => {
    const mac = Uint8Array.from([0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16, 0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e, 0x94, 0x5b, 0x55, 0x5a]);
    const t = truncate(mac, 6);
    expect(t.offset).toBe(10);
    expect(t.truncated).toBe(0x50ef7f19);
    expect(t.code).toBe('872921');
  });
});

describe('clock helpers', () => {
  it('counter and countdown', () => {
    expect(counterAt(0)).toBe(0);
    expect(counterAt(29)).toBe(0);
    expect(counterAt(30)).toBe(1);
    expect(secondsLeft(30)).toBe(STEP_SECONDS);
    expect(secondsLeft(59)).toBe(1);
  });

  it('8-byte big-endian counter', () => {
    expect(Array.from(counterToBytes(0x0102030405))).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
  });
});

describe('the skew window accepts exactly ±1 step', () => {
  it('accepts iff the counters are at most one apart, for every moment in 3 steps and every skew -200..200', () => {
    for (let t = 1000; t < 1000 + 3 * STEP_SECONDS; t++) {
      for (let skew = -200; skew <= 200; skew++) {
        const apart = Math.floor((t + skew) / STEP_SECONDS) - Math.floor(t / STEP_SECONDS);
        expect(stepsApart(t, t + skew)).toBe(apart);
        expect(accepts(t, t + skew)).toBe(Math.abs(apart) <= ACCEPT_WINDOW);
      }
    }
  });

  it('skewVerdict matches a brute-force sweep over a whole step of moments', () => {
    for (let skew = -200; skew <= 200; skew++) {
      const results = new Set<boolean>();
      for (let t = 3000; t < 3000 + STEP_SECONDS; t++) results.add(accepts(t, t + skew));
      const brute = results.size === 2 ? 'sometimes' : results.has(true) ? 'always' : 'never';
      expect(skewVerdict(skew)).toBe(brute);
    }
  });

  it('comparing real codes agrees with the counter rule for seeded secrets (skipping accidental code collisions)', async () => {
    const rnd = mulberry32(99);
    let compared = 0;
    for (let i = 0; i < 30; i++) {
      const key = Uint8Array.from({ length: 20 }, () => Math.floor(rnd() * 256));
      const now = 1_700_000_000 + Math.floor(rnd() * 100000);
      const skew = Math.floor(rnd() * 241) - 120;
      const phone = (await totpSteps(key, now + skew))!.code;
      const server = await Promise.all([-1, 0, 1].map(async (d) => (await totpSteps(key, now + d * STEP_SECONDS))!.code));
      const collision = !accepts(now, now + skew) && server.includes(phone);
      if (collision) continue;
      expect(server.includes(phone)).toBe(accepts(now, now + skew));
      compared++;
    }
    expect(compared).toBeGreaterThan(25);
  });
});

describe('base32 (RFC 4648)', () => {
  const vectors: [string, string][] = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
  for (const [text, b32] of vectors) {
    it(`"${text}" <-> ${b32}`, () => {
      expect(base32Encode(enc.encode(text))).toBe(b32);
      expect(Array.from(base32Decode(b32)!)).toEqual(Array.from(enc.encode(text)));
    });
  }

  it('round-trips 300 seeded byte strings of every length 0..40', () => {
    const rnd = mulberry32(32);
    for (let i = 0; i < 300; i++) {
      const bytes = Uint8Array.from({ length: i % 41 }, () => Math.floor(rnd() * 256));
      expect(Array.from(base32Decode(base32Encode(bytes))!)).toEqual(Array.from(bytes));
    }
  });

  it('decodes lowercase, spaces and padding, and refuses other characters', () => {
    expect(Array.from(base32Decode('mzxw 6ytb oi======')!)).toEqual(Array.from(enc.encode('foobar')));
    expect(base32Decode('MZXW1')).toBeNull();
    expect(base32Decode('😀')).toBeNull();
  });

  it('groups a secret in fours', () => {
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });
});
