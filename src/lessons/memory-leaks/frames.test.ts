import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { mb, verdictCaption } from './frames';
import { heapRun, verdict, type CacheFix, type Config, type LeakId } from './model';

const LEAKS: LeakId[] = ['listener', 'cache', 'interval', 'errors', 'bigCache'];

describe('the verdict caption, every preset × fix × a few durations', () => {
  for (const leak of LEAKS) {
    const fixes: CacheFix[] = leak === 'cache' ? ['none', 'lru', 'weakmap'] : leak === 'bigCache' ? ['none'] : ['none', 'lru'];
    for (const fix of fixes) {
      for (const hours of [1, 2.5, 8]) {
        it(`${leak} ${fix} ${hours} h`, () => {
          const c: Config = { leak, fix: fix !== 'none', cacheFix: fix === 'none' ? 'lru' : fix };
          const run = heapRun(c, hours * 60);
          const text = captionText(verdictCaption(leak, run));
          const v = verdict(run);
          expect(v.verdict).toBe(c.fix || leak === 'bigCache' ? 'flat' : 'leak');
          if (v.verdict === 'leak') expect(text).toContain(`about ${mb(v.growthPerHour)} an hour`);
          else expect(text).toContain(mb(run.troughs.at(-1)!.heap));
          expect(text.includes('not a leak')).toBe(leak === 'bigCache');
        });
      }
    }
  }
});
