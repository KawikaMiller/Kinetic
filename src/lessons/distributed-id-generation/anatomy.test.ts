import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { createGenerator, groupsOf, MAX_RUN, show } from './anatomy';
import { bigOfBits, LAYOUTS, seededBits, TWITTER_EPOCH, uuidVariant, uuidVersion, type FormatId } from './formats';
import { replay } from './btree';
import { makeIds } from './stream';

const FORMATS: FormatId[] = ['autoincrement', 'uuidv4', 'uuidv7', 'ulid', 'snowflake'];
const NOW = 1_700_000_000_000;

describe('what the anatomy scene shows', () => {
  it('draws the bits of the ID it names: the strip read back is the ID, for every format', () => {
    for (const format of FORMATS) {
      const gen = createGenerator(format, () => NOW, seededBits(mulberry32(5)));
      for (let i = 0; i < 20; i++) {
        const id = gen.next();
        expect(bigOfBits(show(format, id).bits), format).toBe(id);
        expect(show(format, id).bits).toHaveLength(LAYOUTS[format].bits);
      }
    }
  });
  it('groups the strip with brackets that tile every field exactly, none longer than MAX_RUN, only the first of a field labelled', () => {
    for (const format of FORMATS) {
      const groups = groupsOf(format);
      let next = 0;
      for (const g of groups) {
        expect(g.from, format).toBe(next);
        expect(g.to - g.from + 1).toBeLessThanOrEqual(MAX_RUN);
        next = g.to + 1;
      }
      expect(next).toBe(LAYOUTS[format].bits);
      for (const f of LAYOUTS[format].fields) {
        const inField = groups.filter((g) => g.from >= f.from && g.to <= f.to);
        expect(inField.reduce((n, g) => n + g.to - g.from + 1, 0)).toBe(f.to - f.from + 1);
        expect(inField.filter((g) => g.label !== undefined).map((g) => g.label)).toEqual([f.label]);
      }
    }
  });
  it('reads fields back out: UUID version and variant, the v7 and ULID time, the snowflake machine and sequence', () => {
    const rnd = seededBits(mulberry32(9));
    const v4 = createGenerator('uuidv4', () => NOW, rnd).next();
    expect([uuidVersion(v4), uuidVariant(v4)]).toEqual([4, 2]);
    expect(show('uuidv4', v4).decoded[0].value).toBe('4');
    const v7 = createGenerator('uuidv7', () => NOW, rnd).next();
    expect(show('uuidv7', v7).decoded[0].value).toBe('2023-11-14 22:13:20.000 UTC');
    expect(show('uuidv7', v7).decoded[1].value).toBe('7');
    const ulid = createGenerator('ulid', () => NOW, rnd).next();
    expect(show('ulid', ulid).decoded[0].value).toBe('2023-11-14 22:13:20.000 UTC');
    const snow = createGenerator('snowflake', () => NOW, rnd, 42);
    snow.next();
    const second = show('snowflake', snow.next());
    expect(second.decoded.map((d) => d.value)).toEqual([new Date(NOW).toISOString().replace('T', ' ').replace('Z', ' UTC'), '42', '1']);
    expect(TWITTER_EPOCH).toBeLessThan(NOW);
  });
});

describe('the generators the page runs', () => {
  it('auto-increment counts 1, 2, 3', () => {
    const gen = createGenerator('autoincrement', () => NOW, seededBits(mulberry32(1)));
    expect([gen.next(), gen.next(), gen.next()]).toEqual([1n, 2n, 3n]);
  });
  it('five UUIDv7s in one millisecond come out in order (the counter), and five UUIDv4s do not', () => {
    const rnd = seededBits(mulberry32(2));
    const v7 = createGenerator('uuidv7', () => NOW, rnd);
    const ids = Array.from({ length: 5 }, () => v7.next());
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : 1)));
    expect(new Set(ids).size).toBe(5);
    const v4 = createGenerator('uuidv4', () => NOW, rnd);
    const random = Array.from({ length: 5 }, () => v4.next());
    expect(random).not.toEqual([...random].sort((a, b) => (a < b ? -1 : 1)));
  });
  it('a burst larger than the sequence waits for the next millisecond instead of repeating, for v7 and snowflake', () => {
    for (const format of ['uuidv7', 'snowflake'] as const) {
      const gen = createGenerator(format, () => NOW, seededBits(mulberry32(3)));
      const ids = Array.from({ length: 10_000 }, () => gen.next());
      expect(new Set(ids).size, format).toBe(10_000);
      expect(ids.every((id, i) => i === 0 || id > ids[i - 1]), format).toBe(true);
    }
  });
});

describe('the try-this steps, from the default state', () => {
  it('index locality at 1,000 inserts: UUIDv4 writes to most pages in the last 100 inserts, UUIDv7 to at most two', () => {
    const v4 = replay(makeIds('uuidv4', 2000), 100)[10];
    const v7 = replay(makeIds('uuidv7', 2000), 100)[10];
    expect(v4.inserts).toBe(1000);
    expect(v4.touched).toBeGreaterThan(0.7 * v4.pages.length);
    expect(v7.touched).toBeLessThanOrEqual(2);
    expect(v4.middleSplits).toBeGreaterThan(0);
    expect(v7.middleSplits).toBe(0);
  });
});
