import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { DEFAULT_CAP_OFF, WINDOW_CAPS, finalOf, hitRatio, makeTrace, simulate, wastedPrefetch, type CacheConfig, type Method, type Pattern } from './cache';
import { accessCaption, cacheFrames, durabilityCaption, percent, plural, readaheadCaption, size } from './captions';
import { BROKEN_ACK_SEED, DEFAULT_ACK_MODE, ack, advance, fsync, freshMachine, kill, powerCut, writePage } from './durability';
import { powerFacts, readRun, readaheadDefaultCap, readaheadRun, seededFacts } from './facts';
import lesson from './index';
import {
  DEFAULT_CAPACITY, DEFAULT_FILE_PAGES, DEFAULT_METHOD, DEFAULT_PATTERN, DEFAULT_TRACE_SEED, READAHEAD_CAPACITY, READAHEAD_FILE_PAGES, READAHEAD_SEED, pageLook, processViews, readaheadLook, traceConfig,
} from './view';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const METHODS: Method[] = ['read', 'mmap'];
const PATTERNS: Pattern[] = ['sequential', 'random', 'repeat', 'two', 'mixed'];

describe('scene switches', () => {
  it('every scene is its own keyed component, so none opens on another scene\'s state', () => {
    expect(sceneElements('mmap-page-cache')).toHaveLength(3);
    expect(sharedSceneComponents('mmap-page-cache')).toEqual([]);
    expect(sceneElements('mmap-page-cache').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    expect([DEFAULT_METHOD, DEFAULT_PATTERN, DEFAULT_FILE_PAGES, DEFAULT_CAPACITY, DEFAULT_TRACE_SEED, DEFAULT_CAP_OFF]).toEqual(['read', 'sequential', 64, 32, 3, 1]);
    expect(WINDOW_CAPS[readaheadDefaultCap]).toBe(8);
    expect([READAHEAD_FILE_PAGES, READAHEAD_CAPACITY, DEFAULT_ACK_MODE]).toEqual([64, 64, 'before']);
    expect(freshMachine()).toMatchObject({ poweredOn: true, processAlive: true, tick: 0 });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: a sequential read() is 64 disk reads, 0% hits, 256.0 KB copied; repeating 8 pages is 8 disk reads and 88%', () => {
    expect(readRun()).toMatchObject({ disk: 64, ratio: '0%', copied: '256.0 KB' });
    expect(readRun('repeat')).toMatchObject({ disk: 8, hits: 56, ratio: '88%' });
    expect(lesson.tryThis[0]).toContain('All 64 pages are disk reads, the hit ratio is 0% and 256.0 KB are copied');
    expect(lesson.tryThis[0]).toContain('8 disk reads and a 88% hit ratio');
    // an independent count: 8 distinct pages, each read from disk once, with room to keep them
    expect(new Set(makeTrace(traceConfig('repeat', 64, 3)).map((a) => a.page)).size).toBe(8);
  });

  it('try-this 2: repeat through mmap copies 0 B with 8 major and 0 minor faults; two processes give 32 major and 32 minor', () => {
    expect(readRun('repeat', 'mmap')).toMatchObject({ copied: '0 B', major: 8, minor: 0 });
    expect(readRun('two', 'mmap')).toMatchObject({ major: 32, minor: 32 });
    expect(lesson.tryThis[1]).toContain('0 B copied to user space, 8 major faults and 0 minor ones');
    expect(lesson.tryThis[1]).toContain('32 major faults for the first process and 32 minor faults for the second');
  });

  it('try-this 3: at 8 pages the hit ratio is 83% with 11 requests, off is 0% and 64, 32 pages is 89% and 7', () => {
    expect(readaheadRun(readaheadDefaultCap)).toEqual({ cap: 8, ratio: '83%', ios: 11 });
    expect(readaheadRun(0)).toEqual({ cap: 1, ratio: '0%', ios: 64 });
    expect(readaheadRun(5)).toEqual({ cap: 32, ratio: '89%', ios: 7 });
    expect(lesson.tryThis[2]).toContain('83% with 11 disk requests');
    expect(lesson.tryThis[2]).toContain('0% and 64 requests');
    expect(lesson.tryThis[2]).toContain('89% and 7');
  });

  it('try-this 4: an acknowledged write() lost to a power cut, kept when fsync comes first', () => {
    const f = powerFacts();
    expect(f.lostPlain).toEqual([{ page: 2, version: 1 }]);
    expect(f.lostWithFsync).toEqual([]);
    expect(lesson.tryThis[3]).toContain('1 acknowledged write lost');
    expect(lesson.tryThis[3]).toContain('fsync, then power cut": 0 lost');
  });

  it('try-this 5: the seeded panel opens on seed 4, which loses an acknowledged write before fsync and none after', () => {
    const f = seededFacts();
    expect(f.seed).toBe(BROKEN_ACK_SEED);
    expect(f.before.length).toBeGreaterThan(0);
    expect(f.after).toEqual([]);
    expect(lesson.tryThis[4]).toContain(`seed ${f.seed}: acknowledging before fsync loses ${plural(f.before.length, 'acknowledged write')} there`);
    expect(lesson.tryThis[4]).toContain('it loses 0');
  });
});

describe('captions are computed from the model', () => {
  it('each frame\'s caption names the access, the outcome and the running hit ratio, for every method and pattern', () => {
    for (const method of METHODS) {
      for (const pattern of PATTERNS) {
        const config: CacheConfig = { filePages: 64, capacity: 16, method, windowCap: 1 };
        const trace = makeTrace(traceConfig(pattern, 64, 3));
        const steps = simulate(config, trace);
        const frames = cacheFrames(config, steps);
        expect(frames).toHaveLength(steps.length);
        frames.forEach((f, i) => {
          const c = text(f.say!);
          const s = steps[i];
          const id = `${method} ${pattern} ${i}`;
          if (i === 0) {
            expect(c, id).toContain('Press play');
            return;
          }
          expect(c, id).toContain(`Access ${i} of ${trace.length}`);
          expect(c, id).toContain(`touches page ${s.access!.page}`);
          expect(c, id).toContain(`${plural(s.counters.hits, 'hit')} in ${plural(s.counters.accesses, 'access', 'accesses')}, ${percent(hitRatio(s.counters))}`);
          const o = s.outcome!;
          expect(c.includes('minor fault'), id).toBe(o === 'minor');
          expect(c.includes('major fault'), id).toBe(o === 'major');
          expect(c.includes('no fault and no copy'), id).toBe(o === 'mapped');
          expect(c.includes('then the kernel copies'), id).toBe(o === 'miss');
          expect(accessCaption(config, s, i, trace.length)).toBe(f.say);
        });
      }
    }
  });

  it('the seed is hidden state for the non-random patterns: the run is identical for any seed', () => {
    for (const pattern of ['sequential', 'repeat', 'two'] as Pattern[]) {
      const cfg: CacheConfig = { filePages: 64, capacity: 32, method: 'mmap', windowCap: 1 };
      const a = simulate(cfg, makeTrace(traceConfig(pattern, 64, 1)));
      const b = simulate(cfg, makeTrace(traceConfig(pattern, 64, 999)));
      expect(a).toEqual(b);
    }
  });

  it('the file strip: dim outlined when not cached, green when cached, violet when mapped by both, letters for the mappers', () => {
    const trace = makeTrace(traceConfig('two', 64, 1));
    const s = finalOf(simulate({ filePages: 64, capacity: 64, method: 'mmap', windowCap: 1 }, trace.slice(0, 4)));
    expect(pageLook(s, 0)).toEqual({ text: 'AB', tone: 'violet', fill: 'tint' });
    expect(pageLook(s, 5)).toEqual({ text: '', tone: 'dim', fill: 'outline' });
    const one = finalOf(simulate({ filePages: 64, capacity: 64, method: 'mmap', windowCap: 1 }, trace.slice(0, 1)));
    expect(pageLook(one, 0)).toEqual({ text: 'A', tone: 'ok', fill: 'tint' });
    expect(processViews(s, trace.slice(0, 4))).toMatchObject({ shared: 2, views: [{ name: 'A', accesses: 2, mappedPages: 2 }, { name: 'B', accesses: 2, mappedPages: 2 }] });
  });

  it('the readahead strip marks read-ahead pages not yet used in orange, and the caption counts them, at every window', () => {
    const trace = makeTrace(traceConfig('mixed', READAHEAD_FILE_PAGES, READAHEAD_SEED));
    for (const windowCap of WINDOW_CAPS) {
      const last = finalOf(simulate({ filePages: READAHEAD_FILE_PAGES, capacity: READAHEAD_CAPACITY, method: 'read', windowCap }, trace));
      const orange = Array.from({ length: READAHEAD_FILE_PAGES }, (_, p) => readaheadLook(last, p)).filter((l) => l.tone === 'orange').length;
      expect(orange).toBe(last.unusedPrefetch.filter(Boolean).length);
      const c = text(readaheadCaption('Mixed', windowCap, last));
      expect(c).toContain(`${plural(wastedPrefetch(last), 'page')} read ahead and never used`);
      expect(c).toContain(`${percent(hitRatio(last.counters))} hits`);
      expect(c).toContain(`${plural(last.counters.ios, 'disk request')} bringing in ${plural(last.counters.diskPages, 'page')}`);
    }
  });

  it('the durability caption follows the machine through writes, ticks, a kill, an fsync and a power cut', () => {
    let m = freshMachine();
    const w = writePage(m, 1, 'write')!;
    m = ack(w.m, w.ack);
    expect(text(durabilityCaption(m, 'before'))).toContain('1 dirty page in the cache, 1 save acknowledged');
    m = advance(m, 7);
    expect(text(durabilityCaption(m, 'before'))).toContain('next writeback wake in 3 ticks');
    m = kill(m);
    expect(text(durabilityCaption(m, 'after'))).toContain('The writer process was killed');
    const lostCaption = text(durabilityCaption(powerCut(m), 'before'));
    expect(lostCaption).toContain('1 acknowledged write lost');
    expect(text(durabilityCaption(powerCut(fsync(m, false)), 'before'))).toContain('All 1 acknowledged write survived');
    expect(text(durabilityCaption(powerCut(freshMachine()), 'before'))).toContain('Nothing had been acknowledged');
  });

  it('sizes read as the lesson says them', () => {
    expect(size(0)).toBe('0 B');
    expect(size(262144)).toBe('256.0 KB');
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
});
