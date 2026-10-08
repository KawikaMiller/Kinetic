import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { bufferFrames, bugScene, cpuShares } from './frames';
import { firstBadSeed, simulate, type Config, type Mode } from './model';
import { WINDOW, badSlot, cpuWindow, laneBars } from './view';

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

describe('try-this outcomes, at the settings each one names (stage defaults otherwise: cap 4, seed 1)', () => {
  const DEFAULTS: Config = { variant: 'monitor', capacity: 4, producers: 1, consumers: 2, itemsEach: 6, produceTicks: 2, consumeTicks: 4, ifBug: false };

  it('#1 Monitor, 3 producers, 1 consumer, produce 0, consume 12: producers sleep on notFull and the CPU idles, on every seed', () => {
    const c: Config = { ...DEFAULTS, producers: 3, consumers: 1, produceTicks: 0, consumeTicks: 12 };
    for (let seed = 0; seed < 200; seed++) {
      const worlds = bufferFrames(c, seed);
      expect(worlds.some((w) => w.count === c.capacity && (w.queues.notFull ?? []).length > 0)).toBe(true);
      expect(worlds.at(-1)!.cpu).toContain('idle');
    }
  });

  it('#2 Busy-wait, 1 producer, produce 12, consume 0: only consumers spin, and the meter goes red at seed 1 for any consumer count', () => {
    for (const producers of [1])
      for (const consumers of [1, 2, 3]) {
        const c: Config = { ...DEFAULTS, variant: 'busy', producers, consumers, produceTicks: 12, consumeTicks: 0 };
        const frames = bufferFrames(c, 1);
        expect(frames.some((w) => cpuWindow(w.cpu).spin > 0.5)).toBe(true);
        for (const w of frames) if (w.cpu.at(-1) === 'spin' && w.active) expect(w.active.startsWith('C')).toBe(true);
      }
  });

  it('#3 if (bug) with 2 consumers: "Find a seed where it breaks" finds a garbage read from the default seed', () => {
    const c: Config = { ...DEFAULTS, ifBug: true };
    const seed = firstBadSeed(c, 2);
    expect(seed).not.toBeNull();
    expect(simulate(c, seed!).at(-1)!.note).toMatchObject({ kind: 'violation', what: 'garbage' });
  });
});

describe('the red slot', () => {
  it('is only the slot the broken step hit (review repro: if-bug, 1P/2C, cap 4, produce 2 / consume 4, seed 3)', () => {
    const c: Config = { variant: 'monitor', capacity: 4, producers: 1, consumers: 2, itemsEach: 6, produceTicks: 2, consumeTicks: 4, ifBug: true };
    const last = bufferFrames(c, 3).at(-1)!;
    expect(last.note).toMatchObject({ kind: 'violation', what: 'garbage' });
    expect(badSlot(last, c.capacity)).toBe(last.head);
    for (const w of bufferFrames(c, 3)) if (w.note.kind !== 'violation' && !(w.note.kind === 'take' && w.note.garbage)) expect(badSlot(w, 4)).toBeNull();
  });

  it('marks the written slot for an overflow', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c: Config = { variant: 'monitor', capacity: 1, producers: 2, consumers: 1, itemsEach: 2, produceTicks: 1, consumeTicks: 1, ifBug: true };
      const frames = bufferFrames(c, seed);
      const i = frames.findIndex((w) => w.note.kind === 'put' && w.note.overflow);
      if (i < 0) continue;
      const put = frames[i].note;
      if (put.kind === 'put') expect(badSlot(frames[i], 1)).toBe(put.slot);
      return;
    }
    throw new Error('no overflow found in 200 seeds');
  });
});
