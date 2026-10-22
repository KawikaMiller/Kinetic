import { describe, expect, it } from 'vitest';
import { mulberry32, pick } from '../../core/random';
import { compactFrames, readFrames, writeFrames } from './frames';
import {
  DEFAULT_SEED, KEYS, L0_TRIGGER, MEM_CAP, MISSING, lastDeletedKey, actionKey, actionRnd, compactAll, flushMem, diskEntries, emptyLsm, liveKeys, lookup,
  readPath, seeded, write, type Lsm,
} from './lsm';

const ALL_KEYS = [...KEYS, ...MISSING];
const SEEDS = 200;
const OPS = 80;

/** The reference: a plain Map, applying the same PUT and DELETE sequence. */
function randomRun(seed: number, onStep: (s: Lsm, ref: Map<string, number>) => void) {
  const rnd = mulberry32(seed);
  const ref = new Map<string, number>();
  let s = emptyLsm();
  for (let i = 0; i < OPS; i++) {
    const k = pick(KEYS, rnd);
    const del = rnd() < 0.3;
    s = write(s, k, del);
    // The value a PUT stores is the write's sequence number (s.seq after the write).
    if (del) ref.delete(k);
    else ref.set(k, s.seq);
    onStep(s, ref);
  }
  return s;
}

describe('reads equal a Map reference', () => {
  it(`after every operation of ${SEEDS} seeded sequences, every key reads as the Map says`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      randomRun(seed, (s, ref) => {
        for (const k of ALL_KEYS) expect(lookup(s, k), `seed ${seed} key ${k}`).toBe(ref.get(k));
        expect([...liveKeys(s)].sort()).toEqual([...ref.keys()].sort());
      });
    }
  });

  it('the frames of a GET end on the same answer as the Map, and write frames land on the pure write', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed);
      const ref = new Map<string, number>();
      let s = emptyLsm();
      for (let i = 0; i < 40; i++) {
        const k = pick(KEYS, rnd);
        const del = rnd() < 0.3;
        const { frames, next } = writeFrames(s, k, del);
        expect(next).toEqual(write(s, k, del));
        s = next;
        if (del) ref.delete(k);
        else ref.set(k, s.seq);
        const probe = pick(ALL_KEYS, rnd);
        const path = readPath(s, probe);
        expect(path.found?.v ?? undefined).toBe(ref.get(probe));
        expect(readFrames(s, probe).at(-1)?.lastRead).toEqual({ read: path.read, skipped: path.skipped });
        expect(frames.length).toBeGreaterThan(2);
      }
    }
  });
});

describe('compaction preserves every read', () => {
  it('compacting at any point leaves every key reading the same, and empties L0', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      randomRun(seed, (s) => {
        const c = compactAll(s).s;
        for (const k of ALL_KEYS) expect(lookup(c, k), `seed ${seed} key ${k}`).toBe(lookup(s, k));
        expect(c.l0).toEqual([]);
      });
    }
  });

  it('the manual compaction frames end on the compacted tree', () => {
    const s = seeded();
    expect(compactFrames(s).next).toEqual(compactAll(s).s);
  });

  it('L1 stays sorted and its files never overlap', () => {
    for (let seed = 1; seed <= 50; seed++) {
      randomRun(seed, (s) => {
        const keys = s.l1.flatMap((t) => t.entries.map((e) => e.k));
        expect(keys).toEqual([...keys].sort());
        expect(new Set(keys).size).toBe(keys.length);
      });
    }
  });
});

describe('tombstones hide older versions', () => {
  it('a tombstone in the memtable hides the value in L0; once flushed it still hides it, and compaction drops both', () => {
    let s = emptyLsm();
    for (const k of ['a', 'b', 'c', 'd']) s = write(s, k, false);
    expect(s.l0).toHaveLength(1);
    expect(lookup(s, 'a')).toBe(1);

    s = write(s, 'a', true);
    expect(s.mem.some((e) => e.k === 'a' && e.v === null)).toBe(true);
    expect(s.l0[0].entries.some((e) => e.k === 'a' && e.v === 1)).toBe(true);
    expect(lookup(s, 'a')).toBeUndefined();
    expect(readPath(s, 'a').where).toBe('the memtable');

    for (const k of ['e', 'f', 'g']) s = write(s, k, false);
    expect(s.l0).toHaveLength(2);
    expect(s.l0[0].entries.some((e) => e.k === 'a' && e.v === null)).toBe(true);
    expect(s.l0[1].entries.some((e) => e.k === 'a' && e.v === 1)).toBe(true);
    expect(readPath(s, 'a').where).toBe(`L0 SST ${s.l0[0].id}`);
    expect(lookup(s, 'a')).toBeUndefined();

    const compacted = compactAll(s);
    expect(lookup(compacted.s, 'a')).toBeUndefined();
    expect(compacted.s.l1.flatMap((t) => t.entries).some((e) => e.k === 'a')).toBe(false);
    expect(compacted.dropped.filter((d) => d.e.k === 'a').map((d) => d.why).sort()).toEqual(['overwritten', 'tombstone']);
  });

  it('with the older value in L1 and the tombstone in L0, the read stops at the tombstone', () => {
    let s = emptyLsm();
    for (const k of ['a', 'b', 'c', 'd']) s = write(s, k, false); // flush: L0 has a..d
    s = compactAll(s).s; // a..d now in L1
    expect(s.l1).toHaveLength(1);
    for (const [k, del] of [['a', true], ['e', false], ['f', false], ['g', false]] as const) s = write(s, k, del);
    expect(s.l0).toHaveLength(1);
    expect(s.l1.flatMap((t) => t.entries).some((e) => e.k === 'a' && e.v !== null)).toBe(true);
    const path = readPath(s, 'a');
    expect(path.found?.v).toBeNull();
    expect(path.where).toBe(`L0 SST ${s.l0[0].id}`);
    expect(lookup(s, 'a')).toBeUndefined();
  });

  it('every dropped entry is an older version or a tombstone, and the tombstone count matches the deleted keys', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      randomRun(seed, (s) => {
        if (!s.l0.length) return;
        const c = compactAll(s);
        const disk = [...s.l0, ...s.l1].flatMap((t) => t.entries);
        expect(c.inCount).toBe(disk.length);
        expect(c.dropped.length + c.outCount).toBe(c.inCount);
        const newest = new Map<string, number>();
        for (const e of disk) newest.set(e.k, Math.max(newest.get(e.k) ?? 0, e.seq));
        for (const d of c.dropped) {
          if (d.why === 'overwritten') expect(d.e.seq).toBeLessThan(newest.get(d.e.k) ?? 0);
          else expect(d.e.v).toBeNull();
        }
      });
    }
  });
});

describe('write amplification', () => {
  it('equals (WAL appends + flushed entries + compaction output) / user writes, recomputed from the frames', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed);
      let s = seeded();
      const flushed = new Set<number>(s.l0.map((t) => t.id));
      const compactedOut = new Set<number>(s.l1.map((t) => t.id));
      let flushedEntries = 0;
      let compactedEntries = 0;
      const base = { writes: s.userWrites, disk: s.diskWrites };
      for (let i = 0; i < 50; i++) {
        const { frames, next } = writeFrames(s, pick(KEYS, rnd), rnd() < 0.3);
        for (const f of frames) {
          for (const t of f.s.l0) if (!flushed.has(t.id)) { flushed.add(t.id); flushedEntries += t.entries.length; }
          for (const t of f.s.l1) if (!compactedOut.has(t.id)) { compactedOut.add(t.id); compactedEntries += t.entries.length; }
        }
        s = next;
      }
      const writes = s.userWrites - base.writes;
      expect(writes).toBe(50);
      expect(s.diskWrites - base.disk).toBe(writes + flushedEntries + compactedEntries);
      const f = writeFrames(s, 'a', false).frames.at(-1)!;
      const wa = f.s.diskWrites / f.s.userWrites;
      expect(wa).toBeGreaterThan(1);
    }
  });

  it('the default state has the figures the stage prints', () => {
    const s = seeded();
    expect(s.userWrites).toBe(18);
    expect(s.diskWrites / s.userWrites).toBeGreaterThan(1);
    expect(diskEntries(s)).toBeGreaterThan(0);
    expect(s.mem.length).toBeLessThan(MEM_CAP);
    expect(s.l0.length).toBeLessThan(L0_TRIGGER);
  });
});

/** The first press of each action from the default state, as the stage does it. */
const press = (s: Lsm, action: Parameters<typeof actionKey>[0], step: number) =>
  actionKey(action, liveKeys(s), actionRnd(DEFAULT_SEED, step));

describe('default state', () => {
  const s = seeded();

  it('try-this 1: PUT keys until the memtable flushes and then L0 compacts, from the default state', () => {
    let cur = s;
    let sawFlush = false;
    let sawCompact = false;
    for (let step = 0; step < 40 && !sawCompact; step++) {
      const { frames, next } = writeFrames(cur, press(cur, 'put', step), false);
      if (frames.some((f) => f.s.l0.length > cur.l0.length)) sawFlush = true;
      if (frames.some((f) => f.compacting.length)) sawCompact = true;
      cur = next;
    }
    expect(sawFlush).toBe(true);
    expect(sawCompact).toBe(true);
  });

  it('try-this 2: overwriting a key and reading it returns the newest value, older copies remain until compaction', () => {
    const k = press(s, 'overwrite', 0);
    expect(liveKeys(s)).toContain(k);
    const before = s.seq;
    const { next } = writeFrames(s, k, false);
    expect(lookup(next, k)).toBe(before + 1);
    const copies = (t: Lsm) => [t.mem, ...t.l0.map((x) => x.entries), ...t.l1.map((x) => x.entries)].flat().filter((e) => e.k === k).length;
    expect(copies(next)).toBeGreaterThanOrEqual(2);
  });

  it('try-this 3: deleting a live key reads as deleted while older values still sit below it', () => {
    // The stage's DELETE, then its GET deleted key button (the most recent tombstone), from the default state.
    const k = press(s, 'delete', 0);
    const next = write(s, k, true);
    expect(lastDeletedKey(next)).toBe(k);
    const path = readPath(next, k);
    expect(path.found?.v).toBeNull();
    expect(lookup(next, k)).toBeUndefined();
    const older = [...next.l0, ...next.l1].some((t) => t.entries.some((e) => e.k === k && e.v !== null));
    expect(older).toBe(true);
  });

  it('GET deleted key is available at the default state (two tombstones are stored) and gone once compaction drops them', () => {
    expect(lastDeletedKey(s)).toBe('h');
    expect(lastDeletedKey(compactAll(s).s)).toBe('h'); // the memtable's tombstone is newer than anything compacted
    expect(lastDeletedKey(compactAll(flushMem(s).s).s)).toBeUndefined();
    expect(lastDeletedKey(emptyLsm())).toBeUndefined();
  });

  it('try-this 4: a false positive exists among the missing keys at the default state, and the stage reaches one within five presses', () => {
    const outcomes = MISSING.map((k) => readPath(s, k).steps.filter((st) => st.kind === 'bloom').map((st) => (st.kind === 'bloom' ? st.outcome : '')));
    expect(outcomes.flat().filter((o) => o === 'fp').length).toBeGreaterThan(0);
    expect(outcomes.flat().filter((o) => o === 'skip').length).toBeGreaterThan(0);
    const firstFive = [0, 1, 2, 3, 4].map((step) => press(s, 'get-missing', step));
    const fps = firstFive.flatMap((k) => readPath(s, k).steps).filter((st) => st.kind === 'bloom' && st.outcome === 'fp');
    expect(fps.length).toBeGreaterThan(0);
  });

  it('every missing key reads as absent, whatever the filters say', () => {
    for (const k of MISSING) expect(lookup(s, k)).toBeUndefined();
  });
});

describe('actionKey', () => {
  it('is deterministic per (seed, step) and draws from the right key set', () => {
    const live = ['b', 'c'];
    for (let step = 0; step < 30; step++) {
      expect(actionKey('put', live, actionRnd(5, step))).toBe(actionKey('put', live, actionRnd(5, step)));
      expect(KEYS).toContain(actionKey('put', live, actionRnd(5, step)));
      expect(MISSING).toContain(actionKey('get-missing', live, actionRnd(5, step)));
      expect(live).toContain(actionKey('delete', live, actionRnd(5, step)));
      expect(KEYS).toContain(actionKey('overwrite', [], actionRnd(5, step)));
    }
  });
});
