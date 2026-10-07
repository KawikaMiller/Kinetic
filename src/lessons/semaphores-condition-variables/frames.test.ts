import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { bufferFrames, bugScene, cpuShares } from './frames';
import type { Config, Mode } from './model';
import { WINDOW, laneBars } from './view';

const MODES: Mode[] = ['busy', 'semaphore', 'monitor'];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function configs(): Config[] {
  const out: Config[] = [];
  for (const variant of MODES)
    for (const producers of [1, 2, 3])
      for (const consumers of [1, 2, 3])
        for (const ifBug of variant === 'monitor' ? [false, true] : [false])
          out.push({ variant, capacity: 1 + ((producers + consumers) % 4), producers, consumers, itemsEach: 6, produceTicks: producers, consumeTicks: consumers + 1, ifBug });
  return out;
}

describe('bounded-buffer captions over every mode × producers × consumers × condition check', () => {
  it('every frame has a caption, and the last one states the run’s real outcome', () => {
    for (const c of configs())
      for (const seed of SEEDS) {
        const frames = bufferFrames(c, seed);
        expect(frames.every((f) => f.say !== undefined)).toBe(true);
        const last = frames.at(-1)!;
        const text = captionText(last.say);
        const total = c.producers * c.itemsEach;
        if (last.note.kind === 'finished') {
          expect(text).toContain(`all ${total} items came out in the order they went in, none lost or duplicated`);
          expect(last.consumed).toEqual(last.produced);
          const { spin, idle } = cpuShares(last.cpu);
          expect(text).toContain(`${Math.round(spin * 100)}% of the run spinning and ${Math.round(idle * 100)}% idle`);
        } else {
          // Only the `if` bug can break the buffer, and it breaks it by a woken thread not re-checking.
          expect(last.note.kind).toBe('violation');
          expect(c.ifBug).toBe(true);
          if (last.note.kind !== 'violation') continue;
          const culprit = last.note.t;
          expect(text.startsWith(last.note.what === 'garbage' ? 'Garbage read.' : 'Overflow.')).toBe(true);
          expect(frames.some((f) => f.note.kind === 'signal' && f.note.woke.includes(culprit))).toBe(true);
          if (last.note.what === 'garbage') expect(c.consumers).toBeGreaterThan(1);
          else expect(c.producers).toBeGreaterThan(1);
        }
        // Spin captions only in busy-wait; "sleeps" only where threads really sleep.
        for (const f of frames) {
          const t = captionText(f.say);
          if (t.includes('so it spins')) expect(c.variant).toBe('busy');
          if (f.note.kind === 'P' && !f.note.got) expect(t).toContain('sleeps');
        }
      }
  });
});

describe('wake-up bug scenes', () => {
  it('signal on one shared CV: the replayed schedule hangs, and the count of hanging schedules is real', () => {
    const { ex, frames } = bugScene('singleSignal');
    expect(ex.stuck).toBeGreaterThan(0);
    expect(captionText(frames.at(-1)!.say).startsWith('Stuck.')).toBe(true);
  });

  it('broadcast: no schedule hangs and the replay finishes', () => {
    const { ex, frames } = bugScene('singleBroadcast');
    expect(ex.stuck).toBe(0);
    expect(captionText(frames.at(-1)!.say).startsWith('Done')).toBe(true);
  });

  it('check without the lock: the replay loses a wake-up, says so, then hangs', () => {
    const { frames } = bugScene('lostWakeup');
    const lost = frames.findIndex((f) => captionText(f.say).includes('the wake-up is lost'));
    const sleep = frames.findIndex((f, i) => i > lost && f.note.kind === 'sleep');
    expect(lost).toBeGreaterThan(0);
    expect(sleep).toBeGreaterThan(lost);
    expect(captionText(frames.at(-1)!.say).startsWith('Stuck.')).toBe(true);
  });
});

describe('timeline bars', () => {
  it('tile each lane without overlap inside the window, one tick per tick', () => {
    const frames = bufferFrames({ variant: 'monitor', capacity: 2, producers: 2, consumers: 2, itemsEach: 6, produceTicks: 2, consumeTicks: 3, ifBug: false }, 4);
    for (const index of [1, 10, 39, 40, 41, 120, frames.length - 1]) {
      const bars = laneBars(frames, index);
      const now = frames[index].tick;
      for (const lane of frames[0].threads.map((t) => t.id)) {
        const mine = bars.filter((b) => b.lane === lane).sort((a, b) => a.start - b.start);
        for (let k = 1; k < mine.length; k++) expect(mine[k].start).toBe(mine[k - 1].end);
        for (const b of mine) {
          expect(b.start).toBeGreaterThanOrEqual(Math.max(0, now - WINDOW));
          expect(b.end).toBeLessThanOrEqual(now);
          expect(b.end).toBeGreaterThan(b.start);
        }
      }
    }
  });
});
