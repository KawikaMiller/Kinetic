import { describe, expect, it } from 'vitest';
import { add, apply, conditionNumber, cosine, det, distance, dot, identity, inverse, leastSquaresQR, matMul, norm, normalize, rotation2, scale, solve, sub, transpose } from './vec';

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

describe('leastSquaresQR', () => {
  const rnd = (() => {
    let s = 12345;
    return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  })();

  it('solves a square non-singular system exactly like solve()', () => {
    const a = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const qr = leastSquaresQR(a, [8, -11, -3])!;
    qr.x.forEach((v, i) => expect(v).toBeCloseTo([2, 3, -1][i], 12));
  });

  it('fits a hand-worked line: (0, 1), (1, 3), (2, 4) gives 7/6 + 1.5x', () => {
    const qr = leastSquaresQR([[1, 0], [1, 1], [1, 2]], [1, 3, 4])!;
    expect(qr.x[0]).toBeCloseTo(7 / 6, 12);
    expect(qr.x[1]).toBeCloseTo(1.5, 12);
  });

  it('leaves a residual orthogonal to every column (Aᵀr = 0) on random overdetermined systems', () => {
    for (let t = 0; t < 50; t++) {
      const m = 5 + Math.floor(rnd() * 20);
      const n = 1 + Math.floor(rnd() * 4);
      const a = Array.from({ length: m }, () => Array.from({ length: n }, () => rnd() * 4 - 2));
      const b = Array.from({ length: m }, () => rnd() * 4 - 2);
      const { x } = leastSquaresQR(a, b)!;
      const res = b.map((bi, i) => bi - dot(a[i], x));
      for (let j = 0; j < n; j++) expect(Math.abs(a.reduce((s, row, i) => s + row[j] * res[i], 0))).toBeLessThan(1e-10);
    }
  });

  it('is null for rank-deficient A: fewer rows than columns, a zero column, or duplicated columns', () => {
    expect(leastSquaresQR([[1, 2, 3], [4, 5, 6]], [1, 2])).toBeNull();
    expect(leastSquaresQR([[1, 0], [2, 0], [3, 0]], [1, 2, 3])).toBeNull();
    expect(leastSquaresQR([[1, 2], [2, 4], [3, 6]], [1, 2, 3])).toBeNull();
  });

  it('handles a degree-12 polynomial on 15 points that defeats the normal equations', () => {
    const xs = Array.from({ length: 15 }, (_, i) => -1 + (2 * i) / 14 + 0.01 * Math.sin(i));
    const a = xs.map((x) => Array.from({ length: 13 }, (_, p) => x ** p));
    const truth = Array.from({ length: 13 }, (_, p) => (p % 3) - 1);
    const b = a.map((row) => dot(row, truth));
    const qr = leastSquaresQR(a, b)!;
    expect(qr).not.toBeNull();
    // The data is exactly a degree-12 polynomial, so the fit must reproduce every point.
    a.forEach((row, i) => expect(dot(row, qr.x)).toBeCloseTo(b[i], 8));
    expect(qr.conditionEstimate).toBeGreaterThan(1e3);
  });

  it('ridge by appended √λ rows equals (AᵀA + λI′)⁻¹Aᵀb', () => {
    const a = [[1, 0.2], [1, 0.9], [1, 1.7], [1, 2.4]];
    const b = [0.5, 1.1, 2.2, 2.6];
    const lambda = 0.3;
    const qr = leastSquaresQR([...a, [0, Math.sqrt(lambda)]], [...b, 0])!;
    const ata = matMul(transpose(a), a).map((row, i) => row.map((v, j) => (i === j && i > 0 ? v + lambda : v)));
    const atb = transpose(a).map((col) => dot(col, b));
    const direct = solve(ata, atb)!;
    qr.x.forEach((v, i) => expect(v).toBeCloseTo(direct[i], 12));
  });
});
