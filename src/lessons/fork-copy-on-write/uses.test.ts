import { describe, expect, it } from 'vitest';
import { EXEC_PAGES, HUGE_PAGE_BYTES, PAGE_BYTES } from './mmu';
import { DATASET_BYTES, MAX_WORKERS, SERVER_DATA_START, SERVER_PAGES, copyRatio, expectedDirty, forkExecRun, preforkRun, snapshotRun } from './uses';

const RUNS = 2000;

describe('the snapshot: distinct pages dirtied while the child lived', () => {
  it('over 2,000 seeded runs the mean number of copied pages matches N x (1 - (1 - 1/N)^w) within half a page', () => {
    const pages = DATASET_BYTES / PAGE_BYTES;
    for (const writes of [64, 256]) {
      let total = 0;
      for (let seed = 0; seed < RUNS; seed++) total += snapshotRun(PAGE_BYTES, writes, seed).copiedPages;
      const expected = pages * (1 - (1 - 1 / pages) ** writes);
      expect(expectedDirty(pages, writes)).toBeCloseTo(expected, 9);
      expect(Math.abs(total / RUNS - expected), `w=${writes}`).toBeLessThan(0.5);
    }
  });

  it('the growth is the copied pages times the page size, and a naive fork would have copied the whole 8 MiB at once', () => {
    const r = snapshotRun(PAGE_BYTES, 100, 3);
    expect(r.growthBytes).toBe(r.copiedPages * PAGE_BYTES);
    expect(r.naiveForkBytes).toBe(8 * 1024 * 1024);
    expect(r.copiedPages).toBeLessThanOrEqual(100);
    expect(snapshotRun(PAGE_BYTES, 0, 3).copiedPages).toBe(0);
  });

  it('with 2 MiB pages one write copies 512 times as much, and 256 random writes dirty all 4 pages: the whole data set is copied', () => {
    expect(copyRatio()).toBe(512);
    expect(HUGE_PAGE_BYTES / PAGE_BYTES).toBe(512);
    const one = snapshotRun(HUGE_PAGE_BYTES, 1, 3);
    expect([one.copiedPages, one.growthBytes]).toEqual([1, HUGE_PAGE_BYTES]);
    const many = snapshotRun(HUGE_PAGE_BYTES, 256, 3);
    expect([many.pages, many.copiedPages, many.growthBytes]).toEqual([4, 4, DATASET_BYTES]);
    // four huge pages: the expected distinct count follows the same formula
    let total = 0;
    for (let seed = 0; seed < RUNS; seed++) total += snapshotRun(HUGE_PAGE_BYTES, 3, seed).copiedPages;
    expect(Math.abs(total / RUNS - expectedDirty(4, 3))).toBeLessThan(0.05);
  });

  it('the same seed gives the same run', () => {
    expect(snapshotRun(PAGE_BYTES, 200, 9)).toEqual(snapshotRun(PAGE_BYTES, 200, 9));
  });
});

describe('the pre-fork server', () => {
  it('frames in use = 64 + workers x private pages, against (1 + workers) x 64 for a naive fork, at every setting', () => {
    for (let workers = 1; workers <= MAX_WORKERS; workers++) {
      for (let p = 0; p <= SERVER_PAGES - SERVER_DATA_START; p++) {
        const r = preforkRun(workers, p);
        expect(r.frames, `${workers} workers ${p} pages`).toBe(SERVER_PAGES + workers * p);
        expect(r.naiveFrames).toBe((1 + workers) * SERVER_PAGES);
        expect(r.copiedPages).toBe(workers * p);
        expect(r.sharedFrames).toBe(SERVER_PAGES - p);
      }
    }
  });
});

describe('fork then exec', () => {
  it('copies 0 pages: 64 entries forked, then the child holds only its 2 new pages beside the parent\'s 64 frames', () => {
    expect(forkExecRun()).toEqual({ forkedEntries: SERVER_PAGES, copiedPages: 0, frames: SERVER_PAGES + EXEC_PAGES, naiveFrames: 2 * SERVER_PAGES, newPages: EXEC_PAGES });
  });
});
