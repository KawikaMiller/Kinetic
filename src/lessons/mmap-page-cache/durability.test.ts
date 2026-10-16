import { describe, expect, it } from 'vitest';
import {
  BROKEN_ACK_SEED, DIRTY_EXPIRE, DURABILITY_PAGES, MAX_SAVES, WRITEBACK_WAKE, ack, advance, cachedCount, dirtyCount, fsync, freshMachine, kill, lostWrites, planFor, powerCut, runSchedule,
  scheduleFor, touchAfterTruncate, untilWake, writePage, type AckMode, type Machine, type Step,
} from './durability';

const SEEDS = Array.from({ length: 200 }, (_, i) => i);
const MODES: AckMode[] = ['before', 'after'];

/** An independent oracle: replay the steps one tick at a time and say what is on disk when the plug is pulled. */
function oracleDisk(steps: readonly Step[]): number[] {
  const disk = Array<number>(DURABILITY_PAGES).fill(0);
  const value = Array<number>(DURABILITY_PAGES).fill(0);
  const dirty = Array<boolean>(DURABILITY_PAGES).fill(false);
  const dirtyAt = Array<number>(DURABILITY_PAGES).fill(0);
  let t = 0;
  let version = 1;
  let alive = true;
  const flushWhere = (want: (p: number) => boolean) => {
    for (let p = 0; p < DURABILITY_PAGES; p++) if (dirty[p] && want(p)) {
      disk[p] = value[p];
      dirty[p] = false;
    }
  };
  for (const s of steps) {
    if (s.kind === 'write' && alive) {
      value[s.page] = version++;
      if (!dirty[s.page]) {
        dirty[s.page] = true;
        dirtyAt[s.page] = t;
      }
    } else if (s.kind === 'fsync') flushWhere(() => true);
    else if (s.kind === 'tick') {
      for (let i = 0; i < s.ticks; i++) {
        t++;
        if (t % 5 === 0) flushWhere((p) => t - dirtyAt[p] >= 30);
      }
    } else if (s.kind === 'kill') alive = false;
  }
  return disk;
}

describe('over 200 seeded write/crash schedules', () => {
  it('after the power cut each page holds exactly the version the oracle says was last flushed, never a later unflushed one, in both ack policies', () => {
    for (const mode of MODES) {
      for (const seed of SEEDS) {
        const r = runSchedule(seed, mode);
        expect(r.m.disk, `${mode} seed ${seed}`).toEqual(oracleDisk(r.steps));
        expect(cachedCount(r.m)).toBe(0);
        expect(dirtyCount(r.m)).toBe(0);
        for (let p = 0; p < DURABILITY_PAGES; p++) {
          const written = r.steps.filter((s) => s.kind === 'write' && s.page === p).length;
          expect(r.m.disk[p]).toBeLessThanOrEqual(r.m.nextVersion - 1);
          if (written === 0) expect(r.m.disk[p]).toBe(0);
        }
      }
    }
  });

  it('a later write that was still dirty at the cut is not on disk: the version on disk is older than the newest write of that page', () => {
    let witnessed = 0;
    for (const seed of SEEDS) {
      const { steps } = scheduleFor(planFor(seed), 'before');
      const r = runSchedule(seed, 'before');
      const newest = new Map<number, number>();
      let v = 1;
      let alive = true;
      for (const s of steps) {
        if (s.kind === 'kill') alive = false;
        if (s.kind === 'write' && alive) newest.set(s.page, v++);
      }
      for (const [page, version] of newest) if (r.m.disk[page] < version) witnessed++;
    }
    expect(witnessed).toBeGreaterThan(0);
  });

  it('ack after fsync: no acknowledged write is lost on any of the 200 seeds', () => {
    for (const seed of SEEDS) {
      const r = runSchedule(seed, 'after');
      expect(r.lost, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('the broken policy: ack before fsync', () => {
  const lowest = () => SEEDS.find((seed) => runSchedule(seed, 'before').lost.length > 0) ?? -1;

  it('loses an acknowledged write on a pinned lowest seed', () => {
    expect(lowest()).toBe(BROKEN_ACK_SEED);
  });

  it('for the stated reason: the plug was pulled after the ack and before the fsync of that save, and the same plan acked after fsync loses nothing', () => {
    const seed = lowest();
    const broken = runSchedule(seed, 'before');
    expect(broken.steps.at(-1)!.kind).toBe('ack');
    const lostVersion = broken.lost[0].version;
    expect(broken.m.acked.some((a) => a.version === lostVersion)).toBe(true);
    expect(broken.m.disk[broken.lost[0].page]).toBeLessThan(lostVersion);
    const fixed = runSchedule(seed, 'after');
    expect(fixed.lost).toEqual([]);
    // the very same plan, cut at the same save, ends before any fsync-then-ack could complete without durability
    expect(planFor(seed).saves.length).toBeLessThanOrEqual(MAX_SAVES);
  });

  it('more than one seed shows it: the loss is not a one-off', () => {
    expect(SEEDS.filter((s) => runSchedule(s, 'before').lost.length > 0).length).toBeGreaterThan(10);
  });
});

describe('hand-worked cases', () => {
  const written = (m: Machine, page: number, via: 'write' | 'mmap' = 'write') => writePage(m, page, via)!;

  it('write() or a store through the mapping both leave the page dirty in the cache and not on disk', () => {
    for (const via of ['write', 'mmap'] as const) {
      const r = written(freshMachine(), 3, via);
      expect([r.m.cache[3]?.dirty, r.m.disk[3]]).toEqual([true, 0]);
    }
  });

  it('kill the process: the dirty page stays and the timer still writes it back at tick 30, so nothing is lost', () => {
    let m = written(freshMachine(), 3).m;
    m = kill(m);
    expect(m.cache[3]?.dirty).toBe(true);
    expect(writePage(m, 4, 'write')).toBeNull();
    m = advance(m, DIRTY_EXPIRE - 1);
    expect(m.disk[3]).toBe(0);
    m = advance(m, 1);
    expect(m.disk[3]).toBe(1);
  });

  it('power cut right after an acknowledged write() loses it; fsync then power cut keeps it', () => {
    const w = written(freshMachine(), 3);
    const acked = ack(w.m, w.ack);
    expect(lostWrites(powerCut(acked))).toEqual([{ page: 3, version: 1 }]);
    expect(lostWrites(powerCut(fsync(acked, false)))).toEqual([]);
  });

  it('the timer wakes every 5 ticks and flushes only pages dirty for 30 ticks or more: a page dirtied at tick 12 goes out at the wake at 45, not before', () => {
    let m = advance(freshMachine(), 12);
    m = written(m, 5).m;
    m = advance(m, 32);
    expect([m.tick, m.disk[5]]).toEqual([44, 0]);
    expect(untilWake(m)).toBe(1);
    m = advance(m, 1);
    expect(m.disk[5]).toBe(1);
    expect(WRITEBACK_WAKE).toBe(5);
  });

  it('fsync with the ack-after policy acknowledges the waiting saves only once they are on disk', () => {
    let m = written(freshMachine(), 1).m;
    m = written(m, 2).m;
    expect(m.acked).toHaveLength(0);
    m = fsync(m, true);
    expect(m.acked).toHaveLength(2);
    expect(lostWrites(powerCut(m))).toEqual([]);
  });

  it('writing a dirty page again keeps its first-dirtied time, so the timer is not postponed by overwrites', () => {
    let m = written(freshMachine(), 0).m;
    m = advance(m, 25);
    m = written(m, 0).m;
    expect(m.cache[0]!.dirtiedAt).toBe(0);
    m = advance(m, 5);
    expect(m.disk[0]).toBe(2);
  });
});

describe('truncation: a mapped access past the end is a signal', () => {
  it('mmap past the new end is SIGBUS (seen on Linux 6.18, WSL2), read() returns 0 bytes, and inside the file both are fine', () => {
    expect(touchAfterTruncate('mmap', 40, 16)).toEqual({ kind: 'sigbus' });
    expect(touchAfterTruncate('read', 40, 16)).toEqual({ kind: 'eof' });
    expect(touchAfterTruncate('mmap', 3, 16)).toEqual({ kind: 'ok' });
    expect(touchAfterTruncate('read', 15, 16)).toEqual({ kind: 'ok' });
  });
});
