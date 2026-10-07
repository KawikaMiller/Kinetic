import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { choose } from '../../core/stats';
import { countsCaption, growthCaption, pascalCaption, treeFrames } from './frames';
import { GROWTHS, LEAF_CAP, MAX_N, MIN_N, PASCAL_ROWS, pascal, permutations } from './model';

const g = (n: number | bigint) => n.toLocaleString('en-US');

describe('treeFrames', () => {
  it('ends on the true count for every n, k and order setting (the full cross product)', () => {
    for (let n = MIN_N; n <= MAX_N; n++) {
      for (let k = 1; k <= n; k++) {
        for (const ordered of [true, false]) {
          const frames = treeFrames(n, k, ordered);
          const all = frames.map((f) => text(f.say));
          const last = all.at(-1)!;
          const P = permutations(n, k);
          if (ordered) expect(last).toContain(`P(${n}, ${k}) = ${g(P)}.`);
          else expect(last).toContain(`/ ${k}! = ${g(P)} / `);
          if (!ordered) expect(last).toContain(`= ${g(choose(n, k))} combinations`);
          expect(all.some((s) => s.includes(`more than ${LEAF_CAP}`))).toBe(P > BigInt(LEAF_CAP));
          expect(frames.some((f) => f.merged)).toBe(!ordered);
          expect(frames.every((f) => f.say)).toBe(true);
        }
      }
    }
  });

  it('counts the branches level by level', () => {
    const frames = treeFrames(4, 3, true).map((f) => text(f.say));
    expect(frames[2]).toContain('each of the 4 branches splits 3 ways');
    expect(frames[3]).toContain('24 so far');
  });
});

describe('captions', () => {
  it('Pascal: each cell is the sum of the two above, read from the triangle', () => {
    const rows = pascal(PASCAL_ROWS);
    expect(text(pascalCaption(rows, 6, 3))).toContain('C(5, 2) + C(5, 3) = 10 + 10 = 20');
    for (let r = 1; r < PASCAL_ROWS; r++) {
      for (let c = 1; c < r; c++) expect(text(pascalCaption(rows, r, c))).toContain(`= ${choose(r, c)}.`);
    }
  });

  it('the four counts and the doubling caption come from the model', () => {
    expect(text(countsCaption(5, 3, false))).toContain('P(5, 3) = 60; ignoring order C(5, 3) = 10');
    expect(text(countsCaption(5, 3, true))).toContain('5³ = 125; ignoring order C(5 + 3 − 1, 3) = 35');
    expect(text(growthCaption(GROWTHS[0], 10))).toBe('Flags 10 → 20: from 1,024 to 1,048,576, ×1,024, not ×2.');
  });
});
