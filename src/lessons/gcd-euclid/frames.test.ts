import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { extendedFrames, inverseCaption, tilingFrames } from './frames';
import { euclid } from './model';

const PRESETS: [number, number][] = [[1071, 462], [17, 5], [89, 55], [462, 1071], [1_000_000_000_000, 1], [35, 0], [0, 35]];

describe('tilingFrames', () => {
  it('opens with a caption and closes on the true gcd, for the presets and every pair up to 25', () => {
    const pairs: [number, number][] = [...PRESETS];
    for (let a = 0; a <= 25; a++) for (let b = 0; b <= 25; b++) if (a || b) pairs.push([a, b]);
    for (const [a, b] of pairs) {
      const frames = tilingFrames(a, b);
      const g = euclid(a, b).g;
      expect(frames[0].say, `${a}, ${b}`).toBeTruthy();
      expect(text(frames.at(-1)!.say)).toContain(`gcd(${a.toLocaleString('en-US')}, ${b.toLocaleString('en-US')}) = ${g.toLocaleString('en-US')}`);
    }
  });

  it('narrates the swap, the zero case and the batch placement', () => {
    expect(text(tilingFrames(462, 1071)[1].say)).toContain('q = 0 and the pair simply swaps');
    expect(text(tilingFrames(35, 0)[0].say)).toContain('every number divides 0');
    expect(text(tilingFrames(17, 5).find((f) => f.row === 0 && f.placed === 3)!.say)).toContain('17 = 3·5 + 2');
    expect(text(tilingFrames(1_000_000_000_000, 1)[1].say)).toContain('go down at once');
    expect(text(tilingFrames(1071, 462).at(-1)!.say)).toContain('after 3 divisions');
    expect(text(tilingFrames(1071, 462).at(-1)!.say)).toContain('so 21 divides both sides');
  });
});

describe('extendedFrames', () => {
  it('ends on a·x + b·y = gcd, and names the inverse only when the gcd is 1', () => {
    expect(text(extendedFrames(1071, 462).at(-1)!.say)).toContain('1,071·(−3) + 462·7 = 21');
    expect(text(extendedFrames(3, 11).at(-1)!.say)).toContain('3·4 ≡ 1');
    for (let a = 0; a <= 30; a++) {
      for (let b = 0; b <= 30; b++) {
        if (!a && !b) continue;
        const last = text(extendedFrames(a, b).at(-1)!.say);
        const { g } = euclid(a, b);
        expect(last).toMatch(new RegExp(`= ${g}, the gcd|gcd = ${g},`));
        expect(last.includes('inverse')).toBe(g === 1 && b > 1);
      }
    }
  });
});

describe('inverseCaption', () => {
  it('says 3⁻¹ mod 11 = 4, and "no inverse: gcd is g" otherwise', () => {
    expect(text(inverseCaption(3, 11))).toContain('3⁻¹ mod 11 = 4: 3 × 4 = 12 = 1·11 + 1');
    expect(text(inverseCaption(17, 3120))).toContain('= 2,753');
    expect(text(inverseCaption(4, 12))).toBe('No inverse: gcd(4, 12) is 4, not 1.');
    for (let m = 2; m <= 40; m++) {
      for (let a = 0; a <= 40; a++) {
        const c = text(inverseCaption(a, m));
        const { g } = euclid(a, m);
        if (g === 1) expect(c).toContain('mod');
        else expect(c).toBe(`No inverse: gcd(${a}, ${m}) is ${g}, not 1.`);
      }
    }
  });
});
