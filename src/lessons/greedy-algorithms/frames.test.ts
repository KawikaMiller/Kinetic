import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { coinFrames, exchangeFrames, scheduleFrames } from './frames';
import { bruteForceBest, dpCoins, greedyCoins, greedySchedule, meetings, PRESETS, randomMeetings, TRICKY_COINS, US_COINS, type Rule } from './model';

const RULES: Rule[] = ['finish', 'start', 'shortest'];
const DAYS = [...PRESETS.map((p) => ({ name: p.id, ms: meetings(p.pairs) })), ...[1, 2, 3, 4, 5].map((s) => ({ name: `seed ${s}`, ms: randomMeetings(s) }))];
const last = <T,>(xs: T[]) => xs[xs.length - 1];

describe('meeting frames: every rule × every day', () => {
  for (const day of DAYS) {
    for (const rule of RULES) {
      it(`${day.name}, ${rule}`, () => {
        const frames = scheduleFrames(day.ms, rule);
        const g = greedySchedule(day.ms, rule).booked.length;
        const best = bruteForceBest(day.ms).size;
        const end = captionText(last(frames).say);
        // The verdict is computed from the counts, never from the preset.
        if (g === best) expect(end).toContain('greedy was optimal here');
        else expect(end).toContain(`greedy lost by ${best - g}`);
        expect(end).toContain(`best possible is ${best}`);
        expect(last(frames).done).toBe(true);
        expect(last(frames).booked).toHaveLength(g);
        // One intro, one frame per meeting, one summary; every frame says something.
        expect(frames).toHaveLength(day.ms.length + 2);
        for (const f of frames) expect(captionText(f.say).length).toBeGreaterThan(0);
        // Each scan frame names the meeting it looks at, and only that meeting is "now".
        frames.slice(1, -1).forEach((f) => expect(Object.values(f.status).filter((s) => s === 'now')).toHaveLength(1));
        expect(Object.values(last(frames).status)).not.toContain('now');
        expect(Object.values(last(frames).status)).not.toContain('pending');
      });
    }
  }

  it('only the losing presets lose, and only for the rule they trap', () => {
    const lost = (id: string, rule: Rule) => captionText(last(scheduleFrames(meetings(PRESETS.find((p) => p.id === id)!.pairs), rule)).say).includes('lost');
    expect(lost('long', 'start')).toBe(true);
    expect(lost('bridge', 'shortest')).toBe(true);
    for (const id of ['workday', 'long', 'bridge']) expect(lost(id, 'finish')).toBe(false);
  });
});

describe('exchange frames', () => {
  for (const day of DAYS) {
    it(day.name, () => {
      const frames = exchangeFrames(day.ms);
      const end = captionText(last(frames).say);
      const swaps = frames.filter((f) => f.swappedIn !== null);
      if (swaps.length) {
        expect(end).toContain(`After ${swaps.length} swap`);
        for (const f of swaps) expect(captionText(f.say)).toContain('still no overlap');
        expect(last(frames).schedule.map((m) => m.id)).toEqual(greedySchedule(day.ms, 'finish').booked.map((m) => m.id).sort());
      } else {
        expect(end).toContain("nothing to swap");
      }
    });
  }
});

describe('coin frames', () => {
  const cases: [number, readonly number[]][] = [[6, TRICKY_COINS], [30, [1, 10, 25]], [8, [4, 5]], [7, [4, 5]], [1, [1]], [99, [1, 7, 23]]];
  for (const [target, coins] of cases) {
    it(`${target} with {${coins.join(', ')}}`, () => {
      const frames = coinFrames(target, [{ name: 'US', coins: US_COINS }, { name: 'Yours', coins }]);
      const end = captionText(last(frames).say);
      const g = greedyCoins(coins, target);
      const dp = dpCoins(coins, target).coins;
      if (!dp) expect(end).toContain('no mix of these coins');
      else if (g.left > 0) expect(end).toContain(`stuck with ${g.left} left`);
      else if (g.taken.length === dp.length) expect(end).toMatch(/Yours: greedy's .* greedy was optimal here/);
      else expect(end).toContain(`greedy lost by ${g.taken.length - dp.length}`);
      expect(end).toMatch(/^US: greedy's .* greedy was optimal here/);
      expect(last(frames).done).toBe(true);
    });
  }
});

describe('quiz numbers come from the model', () => {
  it('6 with {1, 3, 4}: greedy 3 coins, fewest 2', () => {
    expect(greedyCoins(TRICKY_COINS, 6).taken).toHaveLength(3);
    expect(dpCoins(TRICKY_COINS, 6).coins).toHaveLength(2);
  });
  it('30 with {1, 10, 25}: greedy 6 coins, three 10s', () => {
    expect(greedyCoins([1, 10, 25], 30).taken).toEqual([25, 1, 1, 1, 1, 1]);
    expect(dpCoins([1, 10, 25], 30).coins).toEqual([10, 10, 10]);
  });
  it('the try-this claim: all-morning goes from 3 to 7', () => {
    const ms = meetings(PRESETS.find((p) => p.id === 'long')!.pairs);
    expect(greedySchedule(ms, 'start').booked).toHaveLength(3);
    expect(greedySchedule(ms, 'finish').booked).toHaveLength(7);
  });
});
