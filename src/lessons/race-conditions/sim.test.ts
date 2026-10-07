import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames } from './frames';
import { EXPECTED, PROGRAMS, interleavings, lostUpdateTally, simulate, type Tid } from './sim';

/** Every pick list of a given length (the free scheduler falls back to alternating after it). */
function allPicks(n: number): Tid[][] {
  return Array.from({ length: 2 ** n }, (_, m) => Array.from({ length: n }, (_, i) => ((m >> i) & 1) as Tid));
}
const ALTERNATE: Tid[] = Array.from({ length: 40 }, (_, i) => (i % 2) as Tid);

describe('the unlocked increment, over every interleaving', () => {
  const orders = interleavings(3, 3);

  it('there are 20 distinct orderings of the six steps', () => {
    expect(orders).toHaveLength(20);
    expect(new Set(orders.map((o) => o.join(''))).size).toBe(20);
  });

  it('ends at 2 exactly when one thread writes before the other reads, else at 1 with the lost write flagged', () => {
    for (const picks of orders) {
      const last = simulate('race', picks, true).at(-1)!;
      // reference: positions of each thread's read (1st step) and write (3rd step)
      const pos = (t: Tid, nth: number) => picks.map((p, i) => [p, i] as const).filter(([p]) => p === t)[nth][1];
      const serial = pos(0, 2) < pos(1, 0) || pos(1, 2) < pos(0, 0);
      expect(last.count).toBe(serial ? EXPECTED : 1);
      expect(last.log.some((l) => l.kind === 'lost')).toBe(!serial);
      // and the caption agrees
      const say = text(buildFrames('race', picks, true).at(-1)!.say);
      expect(say.startsWith(`count = ${last.count}`)).toBe(true);
      expect(say.includes('lost update')).toBe(!serial);
    }
  });

  it('18 of the 20 orderings lose an update (the quiz answer)', async () => {
    expect(lostUpdateTally()).toEqual({ lost: 18, total: 20 });
    const { default: lesson } = await import('./index');
    const q = lesson.quiz.find((x) => x.q.includes('20 possible orderings'))!;
    expect(q.options[q.answer]).toBe(String(lostUpdateTally().lost));
  });
});

describe('with a mutex', () => {
  it('ends at 2 under every schedule, and the caption names who waited', () => {
    for (const picks of allPicks(10)) {
      const frames = buildFrames('mutex', picks);
      const last = frames.at(-1)!;
      expect(last.event).toBe('done');
      expect(last.count).toBe(EXPECTED);
      if (last.note.kind !== 'done') throw new Error('no verdict');
      for (const t of last.note.waited) expect(text(last.say)).toContain(`T${t + 1}`);
    }
  });

  it('the shown run (threads alternating) makes T2 wait', () => {
    const last = buildFrames('mutex', ALTERNATE).at(-1)!;
    expect(text(last.say)).toContain('at the cost of T2 waiting');
  });
});

describe('two locks', () => {
  it('opposite lock order deadlocks under alternating turns, each thread holding the lock the other wants', () => {
    const frames = buildFrames('deadlock', ALTERNATE);
    const last = frames.at(-1)!;
    expect(last.event).toBe('deadlock');
    if (last.note.kind !== 'deadlock') throw new Error('no deadlock note');
    expect(last.note.holds).toEqual([['A'], ['B']]);
    expect(last.note.wants).toEqual(['B', 'A']);
    expect(text(last.say)).toContain('T1 holds A and waits for B; T2 holds B and waits for A');
  });

  it('opposite order deadlocks exactly when each thread takes its first lock before either takes its second', () => {
    let deadlocks = 0;
    for (const picks of allPicks(10)) {
      const states = simulate('deadlock', picks);
      const last = states.at(-1)!;
      // reference: at some point T1 holds A and T2 holds B, and each still has its second lock ahead
      const bothHoldOne = states.some((s) => s.locks.A === 0 && s.locks.B === 1 && s.pc[0] === 1 && s.pc[1] === 1);
      expect(last.event === 'deadlock').toBe(bothHoldOne);
      if (last.event === 'deadlock') deadlocks++;
      else expect(last.event).toBe('done');
    }
    // some schedules deadlock, some slip through
    expect(deadlocks).toBeGreaterThan(0);
    expect(deadlocks).toBeLessThan(2 ** 10);
  });

  it('the same lock order never deadlocks, under any schedule', () => {
    for (const picks of allPicks(12)) {
      const last = simulate('ordered', picks).at(-1)!;
      expect(last.event).toBe('done');
      expect(last.done).toEqual([true, true]);
    }
  });
});

describe('every frame', () => {
  it('has its own caption', () => {
    const runs = [
      ...interleavings(3, 3).map((p) => buildFrames('race', p, true)),
      buildFrames('mutex', ALTERNATE),
      buildFrames('deadlock', ALTERNATE),
      buildFrames('ordered', ALTERNATE),
    ];
    for (const frames of runs) for (const f of frames) expect(text(f.say).length).toBeGreaterThan(0);
  });

  it('a partial schedule of your own stops where your picks stop', () => {
    const frames = buildFrames('race', [0, 1], true);
    expect(frames).toHaveLength(3);
    expect(frames.at(-1)!.pc).toEqual([1, 1]);
    expect(PROGRAMS.race[0]).toHaveLength(3);
  });
});
