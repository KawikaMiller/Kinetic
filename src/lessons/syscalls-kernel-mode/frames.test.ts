import { describe, expect, it } from 'vitest';
import { latency } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { privFrames, readFrames } from './frames';
import lesson from './index';
import { COPY_FILE_BYTES, copyCost, crossings, PRIV_STEPS, READ_STEPS, SORT_KEY, totalNs } from './model';

describe('readFrames', () => {
  it('one captioned frame per step, then a summary whose numbers come from the steps', () => {
    const frames = readFrames();
    expect(frames).toHaveLength(READ_STEPS.length + 1);
    frames.forEach((f) => expect(captionText(f.say).length).toBeGreaterThan(20));
    expect(frames.slice(0, -1).map((f) => f.i)).toEqual(READ_STEPS.map((_, i) => i));
    const last = captionText(frames.at(-1)!.say);
    expect(last).toContain(`${crossings(READ_STEPS)} crossings`);
    expect(last).toContain(latency(totalNs(READ_STEPS)));
  });
  it('the trap and sysret captions match where the ring flips', () => {
    const frames = readFrames();
    READ_STEPS.forEach((s, i) => {
      const text = captionText(frames[i].say);
      if (s.id === 'trap') expect(text).toContain('ring 0');
      if (s.id === 'sysret') expect(text).toContain('ring 3');
    });
  });
});

describe('privFrames', () => {
  it('ends on the killed step', () => {
    const frames = privFrames();
    expect(frames).toHaveLength(PRIV_STEPS.length);
    expect(PRIV_STEPS[frames.at(-1)!.i].killed).toBe(true);
    expect(captionText(frames.at(-1)!.say)).toContain('killed');
  });
});

describe('claims in the lesson text', () => {
  it('Q2: 33 system calls with 64 KiB, about two million byte by byte', () => {
    const big = copyCost(COPY_FILE_BYTES, 64 * 1024);
    const small = copyCost(COPY_FILE_BYTES, 1);
    expect(big.syscalls).toBe(33);
    expect(small.syscalls).toBe(2_097_153);
    expect(lesson.quiz[1].why).toContain(small.syscalls.toLocaleString('en-US'));
    expect(lesson.quiz[1].options[0]).toContain(String(big.syscalls));
  });
  it('Q5: clock_gettime is the vDSO one; the others always trap', () => {
    const key = Object.fromEntries(SORT_KEY.map((i) => [i.fn, i.answer]));
    expect(key.clock_gettime).toBe('never');
    expect([key.getpid, key.open, key.write]).toEqual(['always', 'always', 'always']);
  });
});
