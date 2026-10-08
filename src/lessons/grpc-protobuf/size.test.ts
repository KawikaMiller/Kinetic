import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { encodeCaption } from './frames';
import { emptyOrder, type DeltaType, type Order } from './model';
import { randomOrder } from './randomOrder';
import { analyse, sizeTones, sizeVerdict } from './scene';

const order = (o: Partial<Order>): Order => ({ ...emptyOrder(), ...o });
const DEFAULT = order({ id: 150n, item: 'testing', qty: 3, delta: -1, tags: [3, 270, 86942] });
const DELTA_TYPES: DeltaType[] = ['sint32', 'int32'];

describe('the size verdict is computed, not assumed (review: "-165% smaller" for twelve -1 tags)', () => {
  const twelve = order({ tags: Array(12).fill(-1) });

  it('twelve -1 tags: 122 bytes of protobuf against 46 of JSON (hand count: 2 + 12 x 10, and 9 + 24 + 11 + 2)', () => {
    const a = analyse(twelve, 'sint32', 'same');
    expect(a.encoded.bytes).toHaveLength(122);
    expect(a.jsonBytes).toBe(46);
    const v = sizeVerdict(122, 46);
    expect(v.smaller).toBe('json');
    expect(v.overhead).toBeCloseTo(122 / 46 - 1, 9);
    expect(sizeTones(v)).toEqual({ protobuf: 'bad', json: 'ok' });
  });

  it('the caption says larger, never a negative "smaller", and explains the 10-byte negatives', () => {
    const text = expectCaption(encodeCaption(twelve, analyse(twelve, 'sint32', 'same'), 'same'));
    expect(text).toContain('122 bytes in protobuf and 46 bytes as JSON (protobuf is 165% larger here)');
    expect(text).toContain('takes 10 bytes');
    expect(text).not.toContain('smaller');
  });

  it('the default message is still smaller as protobuf (24 vs 69): green for protobuf, red for JSON', () => {
    const v = sizeVerdict(24, 69);
    expect(v).toMatchObject({ smaller: 'protobuf', overhead: null });
    expect(v.saving).toBeCloseTo(1 - 24 / 69, 9);
    expect(sizeTones(v)).toEqual({ protobuf: 'ok', json: 'bad' });
    expect(expectCaption(encodeCaption(DEFAULT, analyse(DEFAULT, 'sint32', 'same'), 'same'))).toContain('(65% smaller)');
  });

  it('equal sizes colour neither side; an empty message has no ratio', () => {
    expect(sizeVerdict(10, 10)).toMatchObject({ smaller: 'same', saving: 0, overhead: null });
    expect(sizeTones(sizeVerdict(10, 10))).toEqual({ protobuf: undefined, json: undefined });
    expect(sizeVerdict(0, 2).ratio).toBeNull();
  });

  it('for seeded messages the wording always matches which side is smaller, and no percentage is negative', () => {
    const rnd = mulberry32(404);
    let larger = 0;
    for (let i = 0; i < 300; i++) {
      const o = randomOrder(rnd);
      for (const dt of DELTA_TYPES) {
        const a = analyse(o, dt, 'same');
        const n = a.encoded.bytes.length;
        if (n === 0) continue;
        const text = expectCaption(encodeCaption(o, a, 'same'));
        const v = sizeVerdict(n, a.jsonBytes);
        if (v.smaller === 'json') larger++;
        expect(text.includes('smaller)')).toBe(v.smaller === 'protobuf');
        expect(text.includes('larger here')).toBe(v.smaller === 'json');
        expect(text.includes('the same size')).toBe(v.smaller === 'same');
        expect(text).not.toMatch(/-\d+%/);
      }
    }
    expect(larger).toBeGreaterThan(0);
  });
});
