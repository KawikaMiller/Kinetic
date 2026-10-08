import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { replay } from './btree';
import { indexCaption } from './captions';
import type { FormatId } from './formats';
import { makeIds } from './stream';

const STEP = 100;
const TOTAL = 2000;

const captionAt = (format: FormatId, inserts: number) => {
  const shot = replay(makeIds(format, TOTAL), STEP)[inserts / STEP];
  return expectCaption(indexCaption(format, shot));
};

describe('index caption', () => {
  it('random UUIDs never claim to pile onto the right-hand edge, even while the index is tiny', () => {
    for (const inserts of [100, 200, 1000]) {
      const text = captionAt('uuidv4', inserts);
      expect(text, `${inserts}`).toContain('land anywhere');
      expect(text, `${inserts}`).not.toContain('right-hand edge');
    }
  });

  it('time-ordered formats pile onto the right-hand edge', () => {
    for (const format of ['autoincrement', 'uuidv7', 'snowflake'] as FormatId[]) {
      expect(captionAt(format, 1000), format).toContain('right-hand edge');
    }
  });

  it('ULID says keys inside one millisecond are random, so not every key sorts after every old one', () => {
    const text = captionAt('ulid', 1000);
    expect(text).toContain('inside one millisecond they are random');
    expect(text).not.toContain('after every old one');
  });

  it('says "1 page", never "1 pages"', () => {
    expect(captionAt('autoincrement', 100)).not.toMatch(/\b1 pages\b/);
  });
});
