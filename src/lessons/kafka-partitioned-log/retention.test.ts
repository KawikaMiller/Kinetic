import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  KEYS, MAX_APPENDS, SEGMENT_SIZE, append, applyCompaction, applyRetention, emptyLog, gaps, logEnd, onDisk, preloaded, readFrom, replay, sameState, stateDiff, type SegLog,
} from './retention';

const appendOk = (log: SegLog, key: string, value: number | null): SegLog => {
  const r = append(log, key, value);
  if (!r.ok) throw new Error(r.error);
  return r.log;
};

/** A seeded log of `n` updates to a, b, c with about one in six a tombstone, cleaned by `clean` after random appends. */
function seeded(seed: number, n: number, clean?: (log: SegLog) => SegLog): SegLog {
  const rnd = mulberry32(seed);
  let log = emptyLog();
  for (let i = 0; i < n; i++) {
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    log = appendOk(log, key, rnd() < 1 / 6 ? null : i);
    if (clean && rnd() < 0.25) log = clean(log);
  }
  return log;
}

describe('segments', () => {
  it('records fill a segment of SEGMENT_SIZE, then roll a new one, and offsets count on', () => {
    let log = emptyLog();
    for (let i = 0; i < 9; i++) log = appendOk(log, 'a', i);
    expect(log.segments.map((s) => s.length)).toEqual([SEGMENT_SIZE, SEGMENT_SIZE, 1]);
    expect(onDisk(log).map((r) => r.offset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(logEnd(log)).toBe(9);
  });

  it('refuses an append past the cap and leaves the log as it was', () => {
    let log = emptyLog();
    for (let i = 0; i < MAX_APPENDS; i++) log = appendOk(log, 'a', i);
    expect(append(log, 'a', 1).ok).toBe(false);
    expect(logEnd(log)).toBe(MAX_APPENDS);
  });

  it('appending does not change the log it was given', () => {
    const log = appendOk(emptyLog(), 'a', 1);
    const copy = JSON.stringify(log);
    append(log, 'b', 2);
    expect(JSON.stringify(log)).toBe(copy);
  });
});

describe('retention', () => {
  it('deletes whole oldest segments only: the log start is a segment boundary, the open segment stays, offsets are not renumbered', () => {
    for (let n = 1; n <= 40; n++) {
      for (let keep = 1; keep <= 4; keep++) {
        const full = seeded(n, n);
        const log = applyRetention(full, keep);
        expect(log.segments.length).toBeLessThanOrEqual(Math.max(keep, 1));
        expect(log.logStart % SEGMENT_SIZE, `n=${n} keep=${keep}`).toBe(0);
        expect(log.segments.at(-1)).toEqual(full.segments.at(-1));
        expect(onDisk(log)).toEqual(onDisk(full).filter((r) => r.offset >= log.logStart));
        expect(log.segments.every((s, i) => i === log.segments.length - 1 || s.length === SEGMENT_SIZE)).toBe(true);
      }
    }
  });

  it('keeps the newest `keep` segments, and does nothing when there are no more than that', () => {
    let log = emptyLog();
    for (let i = 0; i < 14; i++) log = appendOk(log, 'a', i);
    expect(applyRetention(log, 4)).toBe(log);
    const kept = applyRetention(log, 2);
    expect(kept.segments.map((s) => s[0].offset)).toEqual([8, 12]);
    expect(kept.logStart).toBe(8);
  });

  it('a consumer below the log start gets "out of range"; one at or above it gets the next record', () => {
    let log = emptyLog();
    for (let i = 0; i < 14; i++) log = appendOk(log, 'a', i);
    log = applyRetention(log, 2);
    expect(readFrom(log, 3)).toEqual({ kind: 'out-of-range', logStart: 8 });
    expect(readFrom(log, 8)).toMatchObject({ kind: 'record', record: { offset: 8 } });
    expect(readFrom(log, 13)).toMatchObject({ kind: 'record', record: { offset: 13 } });
    expect(readFrom(log, 14)).toEqual({ kind: 'end' });
  });

  it('keeps a window of the log, not the state: on seeded logs the retained records often replay to a different Map than the full history (a broken-variant check on the claim)', () => {
    let differing = 0;
    for (let seed = 0; seed < 200; seed++) if (stateDiff(applyRetention(seeded(seed, 24), 2)).length > 0) differing++;
    expect(differing).toBeGreaterThan(5);
    let hand = emptyLog();
    for (const [k, v] of [['a', 1], ['b', 2], ['c', 3], ['b', 4], ['b', 5], ['c', 6], ['b', 7], ['c', 8], ['b', 9]] as const) hand = appendOk(hand, k, v);
    expect(stateDiff(applyRetention(hand, 1))).toEqual(['a', 'c']);
  });
});

describe('compaction', () => {
  it('replays to the same Map as the full history, for 200 seeded logs with tombstones, cleaned at random points', () => {
    for (let seed = 0; seed < 200; seed++) {
      const log = seeded(seed, 6 + (seed % 30), applyCompaction);
      expect(sameState(replay(onDisk(log)), replay(log.history)), `seed ${seed}`).toBe(true);
      expect(stateDiff(applyCompaction(log))).toEqual([]);
    }
  });

  it('keeps the newest record of every key, leaves the open segment alone, never renumbers, and leaves holes exactly where records were dropped', () => {
    for (let seed = 0; seed < 200; seed++) {
      const full = seeded(seed, 6 + (seed % 30));
      const log = applyCompaction(full);
      const newest = new Map<string, number>();
      for (const r of full.history) newest.set(r.key, r.offset);
      const disk = onDisk(log);
      for (const [key, offset] of newest) expect(disk.some((r) => r.key === key && r.offset === offset), `seed ${seed} ${key}`).toBe(true);
      expect(log.segments.at(-1)).toEqual(full.segments.at(-1));
      for (const r of disk) expect(full.history[r.offset]).toEqual(r);
      const dropped = full.history.filter((r) => !disk.some((d) => d.offset === r.offset)).map((r) => r.offset);
      expect(gaps(log)).toEqual(dropped);
      expect(log.logStart).toBe(0);
    }
  });

  it('a closed-segment record survives exactly when it is the newest of its key among the closed segments, for 200 seeded logs (an independent per-record oracle)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const full = seeded(seed, 6 + (seed % 30));
      const closed = full.segments.slice(0, -1).flat();
      const expected = closed.filter((r) => !closed.some((o) => o.key === r.key && o.offset > r.offset)).map((r) => r.offset);
      const survivors = onDisk(applyCompaction(full)).map((r) => r.offset).filter((o) => closed.some((r) => r.offset === o));
      expect(survivors, `seed ${seed}`).toEqual(expected);
    }
  });

  it('the preloaded log keeps offset 10 (the newest a of the closed segments) although a newer a sits in the open segment', () => {
    expect(onDisk(applyCompaction(preloaded())).map((r) => r.offset)).toEqual([5, 10, 11, 12]);
  });

  it('a tombstone is the newest record of its key: it survives compaction and deletes the key in the replay', () => {
    let log = emptyLog();
    for (const [k, v] of [['a', 1], ['b', 2], ['a', null], ['c', 3], ['b', 4], ['c', 5], ['a', 6], ['b', null]] as const) log = appendOk(log, k, v);
    log = appendOk(log, 'c', 7);
    const compacted = applyCompaction(log);
    expect(onDisk(compacted).some((r) => r.key === 'b' && r.value === null)).toBe(true);
    expect(sameState(replay(onDisk(compacted)), replay(log.history))).toBe(true);
    expect(replay(log.history).has('b')).toBe(false);
  });

  it('a consumer asking for a hole reads the next record that survived, and compaction never moves the log start', () => {
    let log = emptyLog();
    for (let i = 0; i < 9; i++) log = appendOk(log, 'a', i);
    const compacted = applyCompaction(log);
    expect(onDisk(compacted).map((r) => r.offset)).toEqual([7, 8]);
    expect(readFrom(compacted, 2)).toMatchObject({ kind: 'record', record: { offset: 7 } });
  });

  it('compacting twice changes nothing more', () => {
    const once = applyCompaction(seeded(3, 30));
    expect(applyCompaction(once)).toEqual(once);
  });
});
