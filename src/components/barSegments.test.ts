import { describe, expect, it } from 'vitest';
import { stackShares } from './barSegments';

describe('stackShares', () => {
  it('gives each segment its share of the track', () => {
    expect(stackShares([2, 3], 10)).toEqual([20, 30]);
  });

  it('cuts the stack where it reaches max', () => {
    expect(stackShares([8, 5, 1], 10)).toEqual([80, 20, 0]);
    expect(stackShares([12, 3], 10)).toEqual([100, 0]);
  });

  it('matches game-loop’s old budget bar: update, then min(render, budget − update)', () => {
    const B = 1000 / 60;
    for (const [u, r] of [[3, 4], [10, 9], [20, 2], [0, 0]]) {
      const share = (v: number) => Math.min(100, (v / B) * 100);
      expect(stackShares([u, r], B)).toEqual([share(u), share(Math.min(r, Math.max(0, B - u)))]);
    }
  });

  it('treats negative values and a zero track as nothing', () => {
    expect(stackShares([-2, 4], 10)).toEqual([0, 40]);
    expect(stackShares([1], 0)).toEqual([0]);
  });
});
