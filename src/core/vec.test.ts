import { describe, expect, it } from 'vitest';
import { add, apply, conditionNumber, cosine, det, distance, dot, identity, inverse, matMul, norm, normalize, rotation2, scale, solve, sub, transpose } from './vec';

const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('vectors', () => {
  it('does the basic arithmetic in any dimension', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(norm([3, 4])).toBe(5);
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([1, 2], [3, 4])).toEqual([-2, -2]);
    expect(scale([1, -2, 3], 2)).toEqual([2, -4, 6]);
    expect(distance([0, 0, 0], [1, 2, 2])).toBe(3);
    expect(normalize([0, 0])).toBeNull();
    close(normalize([3, 4])!, [0.6, 0.8]);
  });

  it('gives cosine 1 for parallel, 0 for orthogonal, -1 for opposite, NaN for zero', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [0, 3])).toBe(0);
    expect(cosine([1, 1], [-2, -2])).toBeCloseTo(-1, 12);
    expect(cosine([0, 0], [1, 1])).toBeNaN();
  });

  it('refuses mismatched lengths', () => {
    expect(() => dot([1], [1, 2])).toThrow(RangeError);
  });
});

describe('matrices', () => {
  it('multiplies and applies (columns are where the basis lands)', () => {
    const m = [
      [2, 1],
      [0, 3],
    ];
    expect(apply(m, [1, 0])).toEqual([2, 0]);
    expect(apply(m, [0, 1])).toEqual([1, 3]);
    expect(matMul(m, identity(2))).toEqual(m);
    expect(matMul([[1, 2, 3]], [[1], [2], [3]])).toEqual([[14]]);
    expect(
      transpose([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it('composes transforms right to left', () => {
    const r = rotation2(Math.PI / 2);
    close(apply(r, [1, 0]), [0, 1]);
    close(apply(matMul(r, r), [1, 0]), [-1, 0]);
  });

  it('computes 2×2 and 3×3 determinants', () => {
    expect(
      det([
        [3, 1],
        [2, 4],
      ]),
    ).toBe(10);
    expect(
      det([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(0);
    expect(
      det([
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ]),
    ).toBe(-306);
    expect(det(rotation2(0.7))).toBeCloseTo(1, 12);
    expect(() => det([[1]])).toThrow(RangeError);
  });

  it('inverts, and says null for singular matrices', () => {
    const cases = [
      [
        [4, 7],
        [2, 6],
      ],
      [
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7],
      ],
    ];
    for (const m of cases) {
      const inv = inverse(m)!;
      matMul(m, inv).forEach((row, i) => close(row, identity(m.length)[i]));
    }
    close(inverse(cases[0])!.flat(), [0.6, -0.7, -0.2, 0.4]);
    expect(
      inverse([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull();
  });

  it('solves linear systems with pivoting', () => {
    // needs a row swap: the first pivot is 0
    close(
      solve(
        [
          [0, 1],
          [1, 0],
        ],
        [2, 3],
      )!,
      [3, 2],
    );
    close(
      solve(
        [
          [2, 1, -1],
          [-3, -1, 2],
          [-2, 1, 2],
        ],
        [8, -11, -3],
      )!,
      [2, 3, -1],
    );
    expect(
      solve(
        [
          [1, 1],
          [2, 2],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it('reports a condition number: 1 for the identity, huge when nearly singular', () => {
    expect(conditionNumber(identity(3))).toBe(1);
    expect(
      conditionNumber([
        [1, 1],
        [1, 1 + 1e-9],
      ]),
    ).toBeGreaterThan(1e9);
    expect(
      conditionNumber([
        [1, 1],
        [1, 1],
      ]),
    ).toBe(Infinity);
  });
});
