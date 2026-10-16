import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { shareCaption, size, worldCaption } from './captions';
import { brokenFacts, forkFacts, shareFacts, snapshotFacts, writeFacts, WRITE_PAGE } from './facts';
import lesson from './index';
import { Mmu, PAGES } from './mmu';
import { FILE_BYTES, forkShare, openingShare, readShared } from './share';
import { DEFAULT_USES, usesView } from './usesView';
import { HUGE_PAGE_BYTES, PAGE_BYTES } from './mmu';
import { DEFAULT_WRITE_BYTE, openingWorld, POOL_FRAMES } from './view';
import { DATASET_BYTES, snapshotRun, SNAPSHOT_SEED, expectedDirty } from './uses';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

describe('scene switches', () => {
  it('the process scene is returned twice, so each use is keyed and the second opens on its own state', () => {
    expect(sceneElements('fork-copy-on-write')).toHaveLength(4);
    expect(sharedSceneComponents('fork-copy-on-write')).toEqual(['ProcessScene']);
    expect(sceneElements('fork-copy-on-write').filter((e) => e.component === 'ProcessScene').every((e) => e.keyed)).toBe(true);
    expect(sceneElements('fork-copy-on-write').every((e) => e.keyed)).toBe(true);
  });

  it('the two process scenes open differently: before the fork, and after it with every frame shared', () => {
    expect(openingWorld('fork').alive.map((p) => p.pid)).toEqual([1]);
    expect(openingWorld('write').alive.map((p) => p.pid)).toEqual([1, 2]);
    expect(openingWorld('write').frames.filter((f) => f.refs === 2)).toHaveLength(PAGES);
    expect(openingWorld('fork').broken).toBe(false);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: fork leaves 8 frames in use, 0 bytes copied, 8 entries forked, a naive fork would copy 32.0 KB', () => {
    expect(forkFacts()).toEqual({ framesBefore: 8, framesAfter: 8, copied: 0, entries: 8, naive: '32.0 KB' });
    expect(lesson.tryThis[0]).toContain('frames in use stay at 8 (they were 8)');
    expect(lesson.tryThis[0]).toContain('8 table entries');
    expect(text(worldCaption(openingWorldForked()))).toContain('0 pages copied (0 B)');
  });

  it('try-this 2: writing 0x41 to page 3 of P2 copies one page, uses 9 frames, P2 reads 41, P1 still reads 43', () => {
    const f = writeFacts();
    expect(f).toEqual({ framesInUse: 9, copiedBytes: '4.0 KB', childReads: '41', parentReads: '43', parentBefore: '43' });
    expect(lesson.tryThis[1]).toContain('one page is copied (4.0 KB), 9 frames are in use, P2 reads 41 on page 3 and P1 still reads 43');
    // an independent check of the byte: page 3 starts as 0x10 + 3 x 0x11
    expect((0x10 + 3 * 0x11).toString(16).toUpperCase()).toBe('43');
    expect(DEFAULT_WRITE_BYTE).toBe(0x41);
  });

  it('try-this 3: the broken handler lets P1 read 41 as well, and the invariant names a shared frame mapped writable', () => {
    const f = brokenFacts();
    expect(f.parentReads).toBe('41');
    expect(f.violation).toContain('shared by 2 entries but P2 maps it writable');
    expect(lesson.tryThis[2]).toContain('P1 now reads 41 too');
    const m = openingWorld('write');
    m.broken = true;
    m.write(2, WRITE_PAGE, DEFAULT_WRITE_BYTE);
    expect(text(worldCaption(m))).toContain('The fault handler is broken');
    expect(m.log.at(-1)!.kind).toBe('fault-through');
  });

  it('try-this 4: the snapshot copies the formula\'s pages (within one) and grows memory by that many 4 KB pages; huge pages copy all 4 and grow 8.0 MB', () => {
    const f = snapshotFacts();
    const run = snapshotRun(PAGE_BYTES, 256, SNAPSHOT_SEED);
    expect(f.smallPages).toBe(String(run.copiedPages));
    expect(Math.abs(run.copiedPages - expectedDirty(DATASET_BYTES / PAGE_BYTES, 256))).toBeLessThan(12);
    expect(f.smallGrowth).toBe(size(run.copiedPages * PAGE_BYTES));
    expect(f.expected).toBe(expectedDirty(2048, 256).toFixed(1));
    expect([f.hugePages, f.hugeGrowth]).toEqual(['4', '8.0 MB']);
    expect(lesson.tryThis[3]).toContain(`${f.smallPages} pages are copied`);
    expect(lesson.tryThis[3]).toContain('4 pages are copied and memory grows by 8.0 MB');
  });

  it('try-this 5: fork returns 2 and 0, the child has 1 of 3 threads, and two 4-byte reads leave the shared offset at 8', () => {
    expect(shareFacts()).toEqual({ parentReturn: 2, childReturn: 0, childThreads: 1, parentThreads: 3, offset: 8 });
    expect(lesson.tryThis[4]).toContain('returned 2 in the parent and 0 in the child, which has 1 of the parent\'s 3 threads');
    expect(lesson.tryThis[4]).toContain('ends at 8');
  });
});

describe('captions are computed from the model', () => {
  it('the world caption states the processes, shared frames, frames in use and copies after every step of a random run', () => {
    const m = new Mmu(PAGES, POOL_FRAMES);
    const p1 = m.spawn();
    const steps: (() => void)[] = [() => m.fork(p1), () => m.write(2, 1, 5), () => m.fork(1), () => m.write(3, 1, 6), () => m.write(1, 1, 7), () => m.exit(2), () => m.exec(3)];
    for (const step of steps) {
      step();
      const c = text(worldCaption(m));
      expect(c).toContain(`${m.alive.length} ${m.alive.length === 1 ? 'process' : 'processes'} alive`);
      expect(c).toContain(`${m.framesInUse} of ${POOL_FRAMES} frames in use`);
      expect(c).toContain(`${m.copiedPages} ${m.copiedPages === 1 ? 'page' : 'pages'} copied (${size(m.copiedPages * PAGE_BYTES)})`);
      expect(c).toContain(`${m.frames.filter((f) => f.refs > 1).length} ${m.frames.filter((f) => f.refs > 1).length === 1 ? 'frame' : 'frames'} shared`);
    }
  });

  it('the uses captions quote the run at the slider extremes and for every preset', () => {
    for (const writes of [0, 32, 1024]) {
      for (const huge of [false, true]) {
        const v = usesView({ ...DEFAULT_USES, snapshotWrites: writes, huge });
        const run = snapshotRun(huge ? HUGE_PAGE_BYTES : PAGE_BYTES, writes, SNAPSHOT_SEED);
        expect(v.caption).toContain(`the parent takes ${writes} writes`);
        expect(v.caption).toContain(`memory grew by ${size(run.growthBytes)}`);
        expect(v.caption).toContain(`${run.copiedPages.toLocaleString('en-US')} ${run.copiedPages === 1 ? 'page' : 'pages'} of ${run.pages.toLocaleString('en-US')}`);
      }
    }
    for (const workers of [1, 4]) {
      for (const w of [0, 16]) {
        const v = usesView({ ...DEFAULT_USES, preset: 'prefork', workers, workerWrites: w });
        expect(v.caption).toContain(`${workers} workers share`);
        expect(v.caption).toContain(`${64 + workers * w} frames are in use where a naive fork would hold ${(1 + workers) * 64}`);
      }
    }
    expect(usesView({ ...DEFAULT_USES, preset: 'exec' }).caption).toContain('0 pages were copied and 2 new pages were loaded');
  });

  it('the share caption follows the fork and the reads', () => {
    expect(text(shareCaption(openingShare()))).toContain('fork() has not been called');
    let s = forkShare(openingShare(), 1);
    expect(text(shareCaption(s))).toContain('fork() returned 2 in the parent and 0 in the child');
    s = readShared(s, 2)!;
    expect(text(shareCaption(s))).toContain('after P2 read bytes 0 to 4');
    expect(FILE_BYTES).toBe(32);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('the quiz\'s 1 GB question matches the model: 8 writes to 8 pages copy 8 pages, and the page size is 4 KB', () => {
    const m = new Mmu(PAGES);
    const p = m.spawn();
    const c = m.fork(p);
    for (let page = 0; page < 8; page++) m.write(c, page, 1);
    expect([m.copiedPages, m.copiedPages * PAGE_BYTES]).toEqual([8, 32768]);
  });
});

function openingWorldForked() {
  const m = openingWorld('fork');
  m.fork(1);
  return m;
}
