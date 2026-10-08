import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  bigOfBits, bitsOfBig, CROCKFORD, decodeSnowflake, encodeSnowflake, LAYOUTS, MAX_MACHINE, MAX_SEQUENCE, MAX_SNOWFLAKE_MS, nextSnowflake, nextV7,
  parseUlid, parseUuid, seededBits, SNOWFLAKE, startSnowflake, TWITTER_EPOCH, ulidMillis, ulidText, ulidValue, uuidText, uuidV4, uuidV7, uuidV7Millis,
  uuidVariant, uuidVersion, type FormatId, type RandomBits, type SnowflakeState,
} from './formats';

/** A RandomBits that returns the given values in order, whatever width is asked for. */
const fixed = (...values: bigint[]): RandomBits => {
  let i = 0;
  return () => values[i++];
};

describe('bits', () => {
  it('round-trips any width up to 128', () => {
    const rnd = mulberry32(1);
    const random = seededBits(rnd);
    for (let width = 1; width <= 128; width++) {
      const v = random(width);
      expect(v >> BigInt(width)).toBe(0n);
      expect(bigOfBits(bitsOfBig(v, width))).toBe(v);
      expect(bitsOfBig(v, width)).toHaveLength(width);
    }
  });
  it('lays the most significant bit first and refuses a value that does not fit', () => {
    expect(bitsOfBig(0b1011n, 6)).toEqual([0, 0, 1, 0, 1, 1]);
    expect(() => bitsOfBig(16n, 4)).toThrow(RangeError);
    expect(() => bitsOfBig(-1n, 4)).toThrow(RangeError);
  });
  it('seeded random bits stay inside their width and differ between calls', () => {
    const random = seededBits(mulberry32(3));
    const seen = new Set<bigint>();
    for (let i = 0; i < 200; i++) {
      const v = random(62);
      expect(v >> 62n).toBe(0n);
      seen.add(v);
    }
    expect(seen.size).toBe(200);
    expect(random(1) <= 1n).toBe(true);
  });
});

describe('UUIDv4 (RFC 9562)', () => {
  it('reproduces the RFC 9562 example: 919108f7-52d1-4320-9bac-f847db4148a8', () => {
    // random_a 0x919108f752d1, random_b 0x320, random_c 0x1bacf847db4148a8 (the 62 bits after the variant)
    const v = uuidV4(fixed(0x919108f752d1n, 0x320n, 0x1bacf847db4148a8n));
    expect(uuidText(v)).toBe('919108f7-52d1-4320-9bac-f847db4148a8');
    expect(uuidVersion(v)).toBe(4);
    expect(uuidVariant(v)).toBe(0b10);
  });
  it('puts the version at bits 48-51 and the variant at 64-65, with 122 free bits, for every seeded UUID', () => {
    const random = seededBits(mulberry32(9));
    for (let i = 0; i < 500; i++) {
      const v = uuidV4(random);
      const bits = bitsOfBig(v, 128);
      expect(bits.slice(48, 52)).toEqual([0, 1, 0, 0]);
      expect(bits.slice(64, 66)).toEqual([1, 0]);
      const text = uuidText(v);
      expect(text).toHaveLength(36);
      expect(text[14]).toBe('4');
      expect('89ab').toContain(text[19]);
    }
  });
  it('the 122 non-fixed bits really are free: all-ones and all-zeros input give the extremes', () => {
    const ones = uuidV4(fixed(2n ** 48n - 1n, 2n ** 12n - 1n, 2n ** 62n - 1n));
    const zeros = uuidV4(fixed(0n, 0n, 0n));
    expect(uuidText(ones)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidText(zeros)).toBe('00000000-0000-4000-8000-000000000000');
  });
  it('parses its own text, and refuses anything that is not 8-4-4-4-12 hex', () => {
    const v = uuidV4(seededBits(mulberry32(2)));
    expect(parseUuid(uuidText(v))).toBe(v);
    expect(parseUuid('not-a-uuid')).toBeNull();
    expect(parseUuid(uuidText(v).replaceAll('-', ''))).toBeNull();
  });
});

describe('UUIDv7 (RFC 9562)', () => {
  it('reproduces the RFC 9562 example: 017f22e2-79b0-7cc3-98c4-dc0c0c07398f', () => {
    // unix_ts_ms 0x017F22E279B0, rand_a 0xCC3, rand_b 0x18C4DC0C0C07398F (the 62 bits after the variant)
    const v = uuidV7(0x017f22e279b0, 0xcc3n, 0x18c4dc0c0c07398fn);
    expect(uuidText(v)).toBe('017f22e2-79b0-7cc3-98c4-dc0c0c07398f');
    expect(uuidV7Millis(v)).toBe(1_645_557_742_000);
    expect(uuidVersion(v)).toBe(7);
    expect(uuidVariant(v)).toBe(0b10);
  });
  it('the timestamp is the first 48 bits, the version 0111 and the variant 10', () => {
    const v = uuidV7(1_700_000_000_000, 0n, 0n);
    const bits = bitsOfBig(v, 128);
    expect(bigOfBits(bits.slice(0, 48))).toBe(1_700_000_000_000n);
    expect(bits.slice(48, 52)).toEqual([0, 1, 1, 1]);
    expect(bits.slice(64, 66)).toEqual([1, 0]);
  });
  it('a later millisecond always sorts after an earlier one, whatever the random bits', () => {
    const random = seededBits(mulberry32(4));
    for (let i = 0; i < 2000; i++) {
      const ms = 1_700_000_000_000 + i;
      const a = uuidV7(ms, random(12), random(62));
      const b = uuidV7(ms + 1, random(12), random(62));
      expect(a < b).toBe(true);
    }
  });
  it('refuses a timestamp or a field that does not fit', () => {
    expect(() => uuidV7(2 ** 48, 0n, 0n)).toThrow(RangeError);
    expect(() => uuidV7(-1, 0n, 0n)).toThrow(RangeError);
    expect(() => uuidV7(1, 4096n, 0n)).toThrow(RangeError);
    expect(() => uuidV7(1, 0n, 2n ** 62n)).toThrow(RangeError);
  });

  it('the counter method is strictly increasing over 30,000 calls on a clock that stalls and goes backwards', () => {
    const rnd = mulberry32(12);
    const random = seededBits(mulberry32(13));
    let clock = 1_700_000_000_000;
    let state = null as ReturnType<typeof nextV7>['state'] | null;
    let last = -1n;
    let waits = 0;
    let made = 0;
    for (let i = 0; i < 30_000; i++) {
      // mostly the same millisecond, sometimes forward, sometimes back
      const r = rnd();
      clock += r < 0.01 ? randInt(1, 3, rnd) : r < 0.015 ? -randInt(1, 5, rnd) : 0;
      let res = nextV7(state, clock, random);
      if ('wait' in res) {
        waits += 1;
        clock = res.state.ms + 1;
        res = nextV7(res.state, clock, random);
      }
      if ('wait' in res) throw new Error('a fresh millisecond cannot be full');
      state = res.state;
      expect(res.uuid > last).toBe(true);
      expect(uuidVersion(res.uuid)).toBe(7);
      expect(uuidVariant(res.uuid)).toBe(0b10);
      last = res.uuid;
      made += 1;
    }
    expect(made).toBe(30_000);
    expect(waits).toBeGreaterThan(0);
  });

  it('within one millisecond the counter in rand_a counts up by one, from a seed below 2048', () => {
    const random = seededBits(mulberry32(5));
    let res = nextV7(null, 5000, random);
    if ('wait' in res) throw new Error('first call cannot wait');
    const start = Number((res.uuid >> 64n) & 0xfffn);
    expect(start).toBeLessThan(2048);
    for (let k = 1; k <= 10; k++) {
      res = nextV7(res.state, 5000, random);
      if ('wait' in res) throw new Error('not full yet');
      expect(Number((res.uuid >> 64n) & 0xfffn)).toBe(start + k);
    }
  });

  it('waits rather than roll the counter over: 4,096 minus the seed ids in the millisecond, then a refusal until the clock moves', () => {
    const random = seededBits(mulberry32(6));
    let state = null as ReturnType<typeof nextV7>['state'] | null;
    let count = 0;
    let seed = -1;
    for (;;) {
      const res = nextV7(state, 9000, random);
      if ('wait' in res) break;
      if (seed < 0) seed = Number((res.uuid >> 64n) & 0xfffn);
      state = res.state;
      count += 1;
      if (count > 5000) throw new Error('never filled');
    }
    expect(state!.counter).toBe(0xfff);
    expect(count).toBe(4096 - seed);
    expect('wait' in nextV7(state, 9000, random)).toBe(true);
    expect('wait' in nextV7(state, 8999, random)).toBe(true);
    expect('wait' in nextV7(state, 9001, random)).toBe(false);
  });
});

describe('ULID', () => {
  it('uses the Crockford alphabet: 32 characters in ASCII order, without I, L, O or U', () => {
    expect(CROCKFORD).toHaveLength(32);
    expect([...CROCKFORD].sort().join('')).toBe(CROCKFORD);
    for (const c of 'ILOU') expect(CROCKFORD).not.toContain(c);
    expect(new Set(CROCKFORD).size).toBe(32);
  });
  it('the smallest and the largest ULIDs, and the largest time', () => {
    expect(ulidText(0n)).toBe('0'.repeat(26));
    expect(ulidText(2n ** 128n - 1n)).toBe(`7${'Z'.repeat(25)}`);
    expect(ulidText(ulidValue(2 ** 48 - 1, 0n)).slice(0, 10)).toBe('7ZZZZZZZZZ');
  });
  it('encodes the time in the first 10 characters, matching an independent base-32 conversion', () => {
    const rnd = mulberry32(8);
    for (let i = 0; i < 300; i++) {
      const ms = Math.floor(rnd() * 2 ** 48);
      let digits = '';
      let rest = ms;
      for (let k = 0; k < 10; k++) {
        digits = CROCKFORD[rest % 32] + digits;
        rest = Math.floor(rest / 32);
      }
      expect(ulidText(ulidValue(ms, 0n)).slice(0, 10)).toBe(digits);
    }
  });
  it('matches the ULID specification\'s example time: 1469918176385 ms is 01ARYZ6S41', () => {
    expect(ulidText(ulidValue(1_469_918_176_385, 0n)).slice(0, 10)).toBe('01ARYZ6S41');
  });
  it('round-trips through its text and keeps its 80 random bits intact', () => {
    const random = seededBits(mulberry32(10));
    for (let i = 0; i < 500; i++) {
      const v = ulidValue(1_700_000_000_000 + i * 977, random(80));
      const text = ulidText(v);
      expect(text).toHaveLength(26);
      expect([...text].every((c) => CROCKFORD.includes(c))).toBe(true);
      expect(parseUlid(text)).toBe(v);
      expect(parseUlid(text.toLowerCase())).toBe(v);
      expect(ulidMillis(v)).toBe(1_700_000_000_000 + i * 977);
    }
  });
  it('sorts lexicographically by time: text order is millisecond order, whatever the random part', () => {
    const random = seededBits(mulberry32(11));
    const ids = Array.from({ length: 1000 }, (_, i) => ulidText(ulidValue(1_700_000_000_000 + i * 7, random(80))));
    expect([...ids].sort()).toEqual(ids);
  });
  it('refuses text that is the wrong length, has a letter outside the alphabet, or overflows 128 bits', () => {
    expect(parseUlid('0'.repeat(25))).toBeNull();
    expect(parseUlid(`U${'0'.repeat(25)}`)).toBeNull();
    expect(parseUlid(`8${'0'.repeat(25)}`)).toBeNull();
  });
});

describe('Snowflake-style 64-bit IDs', () => {
  it('has 1 + 41 + 10 + 12 = 64 bits', () => {
    expect(SNOWFLAKE.signBits + SNOWFLAKE.timeBits + SNOWFLAKE.machineBits + SNOWFLAKE.sequenceBits).toBe(64);
    expect(MAX_MACHINE).toBe(1023);
    expect(MAX_SEQUENCE).toBe(4095);
  });
  it('encodes by hand-worked cases', () => {
    expect(encodeSnowflake({ time: 1, machine: 1, sequence: 1 })).toBe(4_198_401n); // 2^22 + 2^12 + 1
    expect(encodeSnowflake({ time: 0, machine: 0, sequence: 4095 })).toBe(4095n);
    expect(encodeSnowflake({ time: 0, machine: 1023, sequence: 0 })).toBe(1023n * 4096n);
    expect(encodeSnowflake({ time: 5, machine: 0, sequence: 0 })).toBe(5n * 4_194_304n);
  });
  it('round-trips its fields, boundary values included', () => {
    const edges = [0, 1, 2, 4095 - 1, 4095];
    for (const time of [0, 1, 2 ** 40, MAX_SNOWFLAKE_MS - 1, MAX_SNOWFLAKE_MS]) {
      for (const machine of [0, 1, 512, 1022, 1023]) {
        for (const sequence of edges) {
          expect(decodeSnowflake(encodeSnowflake({ time, machine, sequence }))).toEqual({ time, machine, sequence });
        }
      }
    }
  });
  it('the largest id is 2^63 - 1: the sign bit stays 0', () => {
    expect(encodeSnowflake({ time: MAX_SNOWFLAKE_MS, machine: MAX_MACHINE, sequence: MAX_SEQUENCE })).toBe(2n ** 63n - 1n);
    expect(() => decodeSnowflake(2n ** 63n)).toThrow(RangeError);
  });
  it('refuses a field that does not fit', () => {
    expect(() => encodeSnowflake({ time: 0, machine: 1024, sequence: 0 })).toThrow(RangeError);
    expect(() => encodeSnowflake({ time: 0, machine: 0, sequence: 4096 })).toThrow(RangeError);
    expect(() => encodeSnowflake({ time: MAX_SNOWFLAKE_MS + 1, machine: 0, sequence: 0 })).toThrow(RangeError);
    expect(() => encodeSnowflake({ time: -1, machine: 0, sequence: 0 })).toThrow(RangeError);
  });
  it('a 41-bit timestamp from the Twitter epoch lasts about 69 years', () => {
    const years = MAX_SNOWFLAKE_MS / (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(69);
    expect(years).toBeLessThan(70);
    expect(TWITTER_EPOCH).toBe(Date.UTC(2010, 10, 4, 1, 42, 54, 657));
  });

  it('issues 4,096 ids in one millisecond, and the 4,097th has to wait for the next', () => {
    let state: SnowflakeState = startSnowflake();
    const ids: bigint[] = [];
    for (let i = 0; i < 4096; i++) {
      const r = nextSnowflake(state, 7, 1000, 'refuse');
      expect(r.id).not.toBeNull();
      state = r.state;
      ids.push(r.id!);
    }
    expect(new Set(ids).size).toBe(4096);
    expect(decodeSnowflake(ids[0]).sequence).toBe(0);
    expect(decodeSnowflake(ids[4095]).sequence).toBe(4095);
    const full = nextSnowflake(state, 7, 1000, 'refuse');
    expect(full).toMatchObject({ id: null, event: 'sequence-full', until: 1001 });
    const next = nextSnowflake(full.state, 7, 1001, 'refuse');
    expect(next.event).toBe('new-ms');
    expect(decodeSnowflake(next.id!)).toEqual({ time: 1001, machine: 7, sequence: 0 });
  });

  it('ids from one machine increase while the clock moves forward', () => {
    let state = startSnowflake();
    let last = -1n;
    const rnd = mulberry32(14);
    let now = 100;
    for (let i = 0; i < 20_000; i++) {
      if (rnd() < 0.3) now += 1;
      const r = nextSnowflake(state, 9, now, 'wait');
      if (r.id === null) {
        now = r.until;
        continue;
      }
      state = r.state;
      expect(r.id > last).toBe(true);
      last = r.id;
    }
  });

  describe('a clock that goes backwards', () => {
    const issue = (policy: 'refuse' | 'wait' | 'ignore') => {
      let state = startSnowflake();
      const ids: bigint[] = [];
      const events: string[] = [];
      // two ids a millisecond at 100..104, then the clock steps back to 102 and runs forward again
      const clock = [100, 100, 101, 101, 102, 102, 103, 103, 104, 104, 102, 102, 103, 103, 104, 104, 105, 105];
      for (const now of clock) {
        const r = nextSnowflake(state, 3, now, policy);
        events.push(r.event);
        if (r.id !== null) {
          ids.push(r.id);
          state = r.state;
        }
      }
      return { ids, events };
    };
    it('ignoring it repeats ids that were already handed out', () => {
      const { ids, events } = issue('ignore');
      expect(events).toContain('clock-back-ignored');
      expect(new Set(ids).size).toBeLessThan(ids.length);
      expect(ids.length - new Set(ids).size).toBeGreaterThan(0);
    });
    it('refusing it hands out no id until the clock has caught up, and none repeats', () => {
      const { ids, events } = issue('refuse');
      expect(events.filter((e) => e === 'clock-back-refused').length).toBe(4);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it('waiting it out is the same: nothing is issued until the clock reaches the last time', () => {
      const { ids, events } = issue('wait');
      expect(events.filter((e) => e === 'clock-back-wait').length).toBe(4);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it('the refusal says how long to wait: until the last time issued', () => {
      let state = startSnowflake();
      state = nextSnowflake(state, 3, 500, 'refuse').state;
      const r = nextSnowflake(state, 3, 497, 'refuse');
      expect(r).toMatchObject({ id: null, event: 'clock-back-refused', until: 500 });
    });
  });

  it('two machines with the same machine id repeat each other\'s ids; different ids never do', () => {
    const run = (a: number, b: number) => {
      let sa = startSnowflake();
      let sb = startSnowflake();
      const ids: bigint[] = [];
      for (let ms = 10; ms < 40; ms++) {
        for (let k = 0; k < 3; k++) {
          const ra = nextSnowflake(sa, a, ms, 'wait');
          const rb = nextSnowflake(sb, b, ms, 'wait');
          sa = ra.state;
          sb = rb.state;
          ids.push(ra.id!, rb.id!);
        }
      }
      return ids;
    };
    const same = run(7, 7);
    expect(new Set(same).size).toBe(same.length / 2);
    const different = run(7, 8);
    expect(new Set(different).size).toBe(different.length);
  });
});

describe('the layouts', () => {
  const formats = Object.keys(LAYOUTS) as FormatId[];
  it('cover every bit exactly once, in order', () => {
    for (const f of formats) {
      const { bits, fields } = LAYOUTS[f];
      let next = 0;
      for (const field of fields) {
        expect(field.from, f).toBe(next);
        next = field.to + 1;
      }
      expect(next, f).toBe(bits);
    }
  });
  const width = (f: FormatId, kind: string) =>
    LAYOUTS[f].fields.filter((x) => x.kind === kind).reduce((s, x) => s + x.to - x.from + 1, 0);
  it('UUIDv4 has 122 random bits and 6 fixed ones; UUIDv7 a 48-bit time and 74 random bits; ULID 48 + 80', () => {
    expect(width('uuidv4', 'random')).toBe(122);
    expect(width('uuidv4', 'version')).toBe(6);
    expect(width('uuidv7', 'time')).toBe(48);
    expect(width('uuidv7', 'random')).toBe(74);
    expect(width('uuidv7', 'version')).toBe(6);
    expect(width('ulid', 'time')).toBe(48);
    expect(width('ulid', 'random')).toBe(80);
    expect(width('snowflake', 'time')).toBe(41);
    expect(width('snowflake', 'machine')).toBe(10);
    expect(width('snowflake', 'sequence')).toBe(12);
  });
  it('the fields sit where the encoders put the bits', () => {
    const v7 = bitsOfBig(uuidV7(1_700_000_000_000, 0xfffn, 2n ** 62n - 1n), 128);
    const field = (f: FormatId, kind: string) => LAYOUTS[f].fields.filter((x) => x.kind === kind);
    for (const x of field('uuidv7', 'time')) expect(bigOfBits(v7.slice(x.from, x.to + 1))).toBe(1_700_000_000_000n);
    for (const x of field('uuidv7', 'version')) expect(v7.slice(x.from, x.to + 1)).toEqual(x.to - x.from === 3 ? [0, 1, 1, 1] : [1, 0]);
    const snow = bitsOfBig(encodeSnowflake({ time: 123456, machine: 321, sequence: 77 }), 64);
    expect(bigOfBits(snow.slice(1, 42))).toBe(123456n);
    expect(bigOfBits(snow.slice(42, 52))).toBe(321n);
    expect(bigOfBits(snow.slice(52, 64))).toBe(77n);
    expect(snow[0]).toBe(0);
  });
});
