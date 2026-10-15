import { describe, expect, it } from 'vitest';
import { hash32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';
import {
  BURST_SIZE, KEY_SETS, MAX_KEY_DISPLAY, MAX_PARTITIONS, MAX_RECORDS, appendKeys, burstKeys, distinctKeys, expectedMoveShare, keyShown, lastPlacement, lcm, leaderBroker,
  movedKeys, newTopic, normalizeKey, offsetWindow, partitionLengths, partitionOf, placedUnder, recordsOfKey, type Topic,
} from './partitioning';

/** The definition, written out: a key's partition is its hash modulo the count. */
const hashed = (key: string, p: number) => hash32(key) % p;

const sent = (t: Topic, keys: (string | null)[]): Topic => {
  const r = appendKeys(t, keys);
  if (!r.ok) throw new Error(r.error);
  return r.topic;
};

describe('placement', () => {
  it('the same key always lands in one partition, over 10,000 seeded draws', () => {
    const rnd = mulberry32(5);
    const first = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const key = `user-${Math.floor(rnd() * 400)}`;
      const p = 1 + Math.floor(rnd() * MAX_PARTITIONS);
      const at = partitionOf(key, p);
      expect(at).toBe(hashed(key, p));
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(p);
      const id = `${key}/${p}`;
      if (first.has(id)) expect(at).toBe(first.get(id));
      else first.set(id, at);
    }
  });

  it('a seeded set of 1,000 random-looking keys fills every partition within 0.06 of its fair share, for P = 1 to 6', () => {
    const rnd = mulberry32(9);
    const keys = Array.from({ length: 1_000 }, () => rnd().toString(36).slice(2, 10));
    for (let p = 1; p <= MAX_PARTITIONS; p++) {
      const counts = new Array<number>(p).fill(0);
      for (const k of keys) counts[partitionOf(k, p)]++;
      counts.forEach((n) => expect(Math.abs(n / keys.length - 1 / p), `P=${p}`).toBeLessThan(0.06));
    }
  });

  it('keyed records get consecutive offsets inside their partition, and one key keeps its order inside one tape', () => {
    const keys = KEY_SETS[0].keys;
    const rnd = mulberry32(2);
    let t = newTopic(4);
    for (let i = 0; i < 120; i++) t = sent(t, [keys[Math.floor(rnd() * keys.length)]]);
    const next = new Array<number>(4).fill(0);
    for (const r of t.records) {
      expect(r.partition).toBe(hashed(r.key!, 4));
      expect(r.offset).toBe(next[r.partition]++);
    }
    for (const k of distinctKeys(t)) expect(new Set(recordsOfKey(t, k).map((r) => r.partition)).size).toBe(1);
    expect(partitionLengths(t)).toEqual(next);
  });

  it('keyless records go round-robin in this lesson, an empty key is the keyless case, and the order is by arrival', () => {
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey('x')).toBe('x');
    const t = sent(newTopic(3), Array<string | null>(7).fill(null));
    expect(t.records.map((r) => r.partition)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(t.records.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('a key longer than 40 characters is cut for display and hashed whole', () => {
    const base = 'x'.repeat(MAX_KEY_DISPLAY);
    const variants = Array.from({ length: 20 }, (_, i) => `${base}${i}`);
    expect(new Set(variants.map(keyShown)).size).toBe(1);
    expect(keyShown(variants[0])).toBe(`${base}…`);
    expect(keyShown('short')).toBe('short');
    expect(new Set(variants.map((k) => partitionOf(k, 6))).size).toBeGreaterThan(1);
  });

  it('a burst is refused whole when it would pass the cap, and leaves the topic as it was', () => {
    let t = newTopic(3);
    for (let i = 0; i < MAX_RECORDS / BURST_SIZE; i++) t = sent(t, burstKeys(KEY_SETS[0], 7, i));
    expect(t.records).toHaveLength(MAX_RECORDS);
    const refused = appendKeys(t, burstKeys(KEY_SETS[0], 7, 99));
    expect(refused.ok).toBe(false);
    expect(t.records).toHaveLength(MAX_RECORDS);
    expect(appendKeys(t, [])).toMatchObject({ ok: true });
  });

  it('a seeded burst repeats for the same seed and burst number, draws only the key set, and is keyless for "no key"', () => {
    expect(burstKeys(KEY_SETS[0], 7, 0)).toEqual(burstKeys(KEY_SETS[0], 7, 0));
    expect(burstKeys(KEY_SETS[0], 7, 0)).not.toEqual(burstKeys(KEY_SETS[0], 7, 1));
    expect(burstKeys(KEY_SETS[0], 7, 0)).toHaveLength(BURST_SIZE);
    expect(burstKeys(KEY_SETS[0], 7, 0).every((k) => KEY_SETS[0].keys.includes(k!))).toBe(true);
    expect(burstKeys(KEY_SETS[1], 7, 0).every((k) => k === 'hot')).toBe(true);
    expect(burstKeys(KEY_SETS[2], 7, 0).every((k) => k === null)).toBe(true);
  });

  it('a hot key puts every record on one tape', () => {
    const t = sent(newTopic(5), burstKeys(KEY_SETS[1], 1, 0));
    expect(partitionLengths(t).filter((n) => n > 0)).toEqual([BURST_SIZE]);
  });

  it('leaders are spread over three brokers and the window shows the newest 24 offsets', () => {
    expect([0, 1, 2, 3, 4, 5].map(leaderBroker)).toEqual([1, 2, 3, 1, 2, 3]);
    let t = newTopic(1);
    expect(offsetWindow(t)).toEqual({ from: 0, cols: 8 });
    t = sent(t, Array<string | null>(30).fill('k'));
    expect(offsetWindow(t)).toEqual({ from: 6, cols: 24 });
  });
});

describe('adding partitions', () => {
  it('a hash keeps its partition exactly when it is below the smaller count, per common period: brute force over a full period', () => {
    for (let a = 1; a <= MAX_PARTITIONS; a++) {
      for (let b = a; b <= MAX_PARTITIONS; b++) {
        const period = lcm(a, b);
        let moved = 0;
        for (let h = 0; h < period; h++) if (h % a !== h % b) moved++;
        expect(moved / period, `${a}->${b}`).toBeCloseTo(expectedMoveShare(a, b), 12);
      }
    }
    expect(expectedMoveShare(3, 4)).toBeCloseTo(3 / 4, 12);
    expect(expectedMoveShare(5, 6)).toBeCloseTo(5 / 6, 12);
  });

  it('with the real hash, about P/(P+1) of 3,000 keys change partition when one is added, within 0.03', () => {
    for (let p = 1; p < MAX_PARTITIONS; p++) {
      let moved = 0;
      for (let i = 0; i < 3_000; i++) if (hashed(`k${i}`, p) !== hashed(`k${i}`, p + 1)) moved++;
      expect(Math.abs(moved / 3_000 - p / (p + 1)), `${p}->${p + 1}`).toBeLessThan(0.03);
    }
  });

  it('keys that would move are counted from the latest record and the current count, and none move before the count changes', () => {
    let t = sent(newTopic(3), burstKeys(KEY_SETS[0], 3, 0));
    expect(movedKeys(t)).toEqual([]);
    expect(placedUnder(t)).toBe(3);
    t = { ...t, p: 4 };
    const expected = distinctKeys(t).filter((k) => hashed(k, 4) !== lastPlacement(t, k)!.partition);
    expect(movedKeys(t)).toEqual(expected);
    expect(movedKeys(t).length).toBe(distinctKeys(t).filter((k) => hashed(k, 3) !== hashed(k, 4)).length);
    // New records follow the new count; old ones stay where they are written.
    const after = sent(t, ['ada']);
    expect(after.records.at(-1)!.partition).toBe(hashed('ada', 4));
    expect(after.records[0].partition).toBe(t.records[0].partition);
    expect(placedUnder(after)).toBeNull();
  });

  it('an empty topic has no placement and no moved keys', () => {
    expect(movedKeys(newTopic(3))).toEqual([]);
    expect(placedUnder(newTopic(3))).toBeNull();
    expect(distinctKeys(newTopic(3))).toEqual([]);
  });
});
