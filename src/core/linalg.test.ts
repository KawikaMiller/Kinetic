import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import {
  conv2d, covariance, eigen2x2, jacobiEigen, matMul, matPow, mean, pca, pcaProject, powerIteration, softmax, svdReconstruct, svdSmall, topEigen, transpose,
  type Complex,
} from './linalg';
import { apply, dot, identity, norm, solve, sub, type Mat } from './vec';

const randomMatrix = (rows: number, cols: number, rnd: () => number): number[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => rnd() * 6 - 3));

const maxAbs = (m: Mat) => Math.max(...m.flat().map(Math.abs));

describe('matMul / transpose / matPow', () => {
  it('re-exports the vec versions and powers a matrix', () => {
    expect(matMul([[1, 2], [3, 4]], [[0, 1], [1, 0]])).toEqual([[2, 1], [4, 3]]);
    expect(transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
    const m = [[1, 1], [1, 0]];
    expect(matPow(m, 10)).toEqual([[89, 55], [55, 34]]);
    expect(matPow(m, 0)).toEqual(identity(2));
    expect(() => matPow(m, -1)).toThrow(RangeError);
  });
});

describe('powerIteration', () => {
  const a = [[2, 1], [1, 2]];

  it('returns every iterate and converges to the dominant eigenvector (1,1)/sqrt2 with lambda 3', () => {
    const steps = powerIteration(a, { iters: 40, start: [1, 0] });
    expect(steps).toHaveLength(41);
    const last = steps[40];
    expect(last.v[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(last.v[1]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(last.lambda).toBeCloseTo(3, 12);
    expect(last.stretch).toBeCloseTo(3, 12);
    expect(steps[0].v).toEqual([1, 0]);
  });

  it('shrinks the second component by exactly 1/3 each step (lambda2/lambda1)', () => {
    const steps = powerIteration(a, { iters: 6, start: [1, 0] });
    // Component along (1,-1)/sqrt2 relative to the one along (1,1)/sqrt2.
    const ratio = (v: readonly number[]) => (v[0] - v[1]) / (v[0] + v[1]);
    for (let i = 1; i < steps.length; i++) expect(ratio(steps[i].v) / ratio(steps[i - 1].v)).toBeCloseTo(1 / 3, 12);
  });

  it('matches the Jacobi dominant eigenvector on 200 seeded symmetric positive matrices (Av = lambda v residual)', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 200; t++) {
      const b = randomMatrix(4, 4, rnd);
      const s = matMul(transpose(b), b);
      const ref = jacobiEigen(s);
      if (ref.values[0] - ref.values[1] < 0.5) continue; // too slow to converge in 3000 steps
      const last = powerIteration(s, { iters: 3000 }).at(-1)!;
      expect(Math.abs(dot(last.v, ref.vectors[0]))).toBeCloseTo(1, 8);
      expect(norm(sub(apply(s, last.v), last.v.map((x) => x * last.lambda)))).toBeLessThan(1e-6);
    }
  });

  it('with the l1 norm keeps a probability vector summing to 1 and reports the change', () => {
    const steps = powerIteration([[0.9, 0.5], [0.1, 0.5]], { iters: 60, norm: 'l1', start: [1, 0] });
    for (const s of steps) expect(s.v.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(steps[60].v[0]).toBeCloseTo(5 / 6, 10);
    expect(steps[1].change).toBeCloseTo(Math.abs(0.9 - 1) + 0.1, 12);
    expect(steps[60].change).toBeLessThan(1e-9);
  });

  it('stops at the zero vector and refuses a zero start', () => {
    expect(powerIteration([[0, 0], [0, 0]], { iters: 5 })).toHaveLength(1);
    expect(() => powerIteration(a, { iters: 1, start: [0, 0] })).toThrow(RangeError);
  });
});

describe('PageRank by power iteration', () => {
  /** Column-stochastic page matrix of a graph (links[i] = pages i points to; dead ends spread evenly). */
  const googleMatrix = (links: readonly number[][], d: number): { g: number[][]; m: number[][] } => {
    const n = links.length;
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    links.forEach((outs, j) => {
      if (outs.length === 0) for (let i = 0; i < n; i++) m[i][j] = 1 / n;
      else for (const i of outs) m[i][j] += 1 / outs.length;
    });
    return { m, g: m.map((row) => row.map((x) => d * x + (1 - d) / n)) };
  };

  it('the known graph A,B,C -> D, D -> A at d = 0.85 gives 0.4453, 0.0375, 0.0375, 0.4797', () => {
    const { g } = googleMatrix([[3], [3], [3], [0]], 0.85);
    const rank = powerIteration(g, { iters: 200, norm: 'l1', start: [0.25, 0.25, 0.25, 0.25] }).at(-1)!.v;
    [0.4453, 0.0375, 0.0375, 0.4797].forEach((x, i) => expect(rank[i]).toBeCloseTo(x, 4));
    expect(rank[1]).toBeCloseTo(0.15 / 4, 12);
  });

  it('equals the direct solve (I - dM) x = (1 - d)/n on 200 seeded graphs, dead ends included', () => {
    const rnd = mulberry32(11);
    for (let t = 0; t < 200; t++) {
      const n = 3 + Math.floor(rnd() * 5);
      const links = Array.from({ length: n }, () => Array.from({ length: n }, (_, j) => j).filter(() => rnd() < 0.4));
      const d = 0.5 + rnd() * 0.45;
      const { g, m } = googleMatrix(links, d);
      const direct = solve(
        m.map((row, i) => row.map((x, j) => (i === j ? 1 : 0) - d * x)),
        new Array(n).fill((1 - d) / n),
      )!;
      const iterated = powerIteration(g, { iters: 400, norm: 'l1' }).at(-1)!.v;
      iterated.forEach((x, i) => expect(x).toBeCloseTo(direct[i], 9));
    }
  });
});

describe('jacobiEigen', () => {
  it('diagonalises 300 seeded symmetric matrices: A v = lambda v and orthonormal vectors, values descending', () => {
    const rnd = mulberry32(3);
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rnd() * 7);
      const b = randomMatrix(n, n, rnd);
      const s = b.map((row, i) => row.map((x, j) => (x + b[j][i]) / 2));
      const { values, vectors } = jacobiEigen(s);
      vectors.forEach((v, i) => {
        expect(norm(sub(apply(s, v), v.map((x) => x * values[i])))).toBeLessThan(1e-9);
        expect(norm(v)).toBeCloseTo(1, 12);
        for (let j = 0; j < i; j++) expect(Math.abs(dot(v, vectors[j]))).toBeLessThan(1e-10);
        if (i > 0) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      });
      expect(values.reduce((x, y) => x + y, 0)).toBeCloseTo(s.reduce((x, r, i) => x + r[i], 0), 9);
    }
  });

  it('knows [[2,1],[1,2]] has eigenvalues 3 and 1, and rejects a non-symmetric matrix', () => {
    const { values } = jacobiEigen([[2, 1], [1, 2]]);
    expect(values[0]).toBeCloseTo(3, 12);
    expect(values[1]).toBeCloseTo(1, 12);
    expect(() => jacobiEigen([[1, 2], [0, 1]])).toThrow(RangeError);
  });

  it('topEigen (deflated power iteration) agrees with Jacobi on a covariance matrix', () => {
    const rnd = mulberry32(5);
    const cov = covariance(Array.from({ length: 50 }, () => Array.from({ length: 5 }, () => rnd() * (1 + rnd()))));
    const ref = jacobiEigen(cov);
    const top = topEigen(cov, 2);
    top.values.forEach((v, i) => expect(v).toBeCloseTo(ref.values[i], 8));
    top.vectors.forEach((v, i) => expect(Math.abs(dot(v, ref.vectors[i]))).toBeCloseTo(1, 6));
  });
});

describe('eigen2x2', () => {
  const asComplex = (x: number | Complex): Complex => (typeof x === 'number' ? { re: x, im: 0 } : x);

  it('satisfies A v = lambda v to 1e-9 on 1000 seeded matrices (real and complex pairs), and agrees with Jacobi when symmetric', () => {
    const rnd = mulberry32(21);
    let real = 0;
    let complex = 0;
    for (let t = 0; t < 1000; t++) {
      const m = randomMatrix(2, 2, rnd);
      if (t % 4 === 0) m[1][0] = m[0][1];
      const e = eigen2x2(m)!;
      expect(e).not.toBeNull();
      for (let i = 0; i < 2; i++) {
        const lambda = asComplex(e.values[i]);
        const v = (e.vectors[i] as readonly (number | Complex)[]).map(asComplex);
        const av = m.map((row) => ({ re: row[0] * v[0].re + row[1] * v[1].re, im: row[0] * v[0].im + row[1] * v[1].im }));
        av.forEach((x, k) => {
          expect(x.re).toBeCloseTo(lambda.re * v[k].re - lambda.im * v[k].im, 9);
          expect(x.im).toBeCloseTo(lambda.re * v[k].im + lambda.im * v[k].re, 9);
        });
        expect(Math.hypot(v[0].re, v[0].im, v[1].re, v[1].im)).toBeCloseTo(1, 12);
      }
      if (e.kind === 'real') {
        real++;
        expect(Math.abs(e.values[0])).toBeGreaterThanOrEqual(Math.abs(e.values[1]));
        if (m[1][0] === m[0][1]) {
          const j = jacobiEigen(m);
          expect([...e.values].sort((x, y) => y - x)[0]).toBeCloseTo(j.values[0], 10);
          expect([...e.values].sort((x, y) => y - x)[1]).toBeCloseTo(j.values[1], 10);
        }
      } else {
        complex++;
        expect(e.values[0].im).toBeGreaterThan(0);
        expect(e.values[1].im).toBeCloseTo(-e.values[0].im, 12);
      }
    }
    expect(real).toBeGreaterThan(100);
    expect(complex).toBeGreaterThan(100);
  });

  it('reads off the textbook cases', () => {
    const sym = eigen2x2([[2, 1], [1, 2]])!;
    expect(sym).toMatchObject({ kind: 'real', values: [3, 1] });
    expect(sym.vectors[0][0]).toBeCloseTo(Math.SQRT1_2, 12);
    const rotation = eigen2x2([[0, -1], [1, 0]])!;
    expect(rotation.kind).toBe('complex');
    expect(rotation.values[0]).toEqual({ re: 0, im: 1 });
    expect(eigen2x2([[3, 0], [0, 3]])).toMatchObject({ kind: 'real', values: [3, 3] });
  });

  it('returns null for a defective matrix (a shear) and for nothing else it was asked about', () => {
    expect(eigen2x2([[1, 1], [0, 1]])).toBeNull();
    expect(eigen2x2([[2, 1], [0, 2]])).toBeNull();
    expect(eigen2x2([[1, 1], [0, 3]])).not.toBeNull();
    expect(() => eigen2x2([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toThrow(RangeError);
  });
});

describe('svdSmall', () => {
  const check = (a: Mat) => {
    const { u, s, v } = svdSmall(a);
    const r = Math.min(a.length, a[0].length);
    expect(s).toHaveLength(r);
    expect(maxAbs(sub2(svdReconstruct({ u, s, v }), a))).toBeLessThan(1e-9);
    for (const m of [u, v]) {
      const g = matMul(transpose(m), m);
      expect(maxAbs(sub2(g, identity(r)))).toBeLessThan(1e-9);
    }
    s.forEach((x, i) => {
      expect(x).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(x).toBeLessThanOrEqual(s[i - 1] + 1e-12);
    });
  };
  const sub2 = (a: Mat, b: Mat) => a.map((row, i) => sub(row, b[i]));

  it('A = U S V^T to 1e-9 with orthonormal U and V on 200 seeded matrices up to 8 x 8 (wide, tall, square)', () => {
    const rnd = mulberry32(13);
    for (let t = 0; t < 200; t++) check(randomMatrix(1 + Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 8), rnd));
  });

  it('handles rank-deficient matrices and the zero matrix', () => {
    check([[1, 2, 3], [2, 4, 6], [3, 6, 9]]);
    check([[0, 0], [0, 0]]);
    check([[1, 0], [0, 0], [0, 0]]);
    expect(svdSmall([[1, 2, 3], [2, 4, 6], [3, 6, 9]]).s.slice(1)).toEqual([0, 0]);
  });

  it('knows [[3,0],[0,-2]] has singular values 3 and 2, and that singular values are the roots of eig(A^T A)', () => {
    expect(svdSmall([[3, 0], [0, -2]]).s).toEqual([3, 2]);
    const rnd = mulberry32(17);
    const a = randomMatrix(5, 4, rnd);
    const lambdas = jacobiEigen(matMul(transpose(a), a)).values;
    svdSmall(a).s.forEach((x, i) => expect(x).toBeCloseTo(Math.sqrt(lambdas[i]), 9));
  });

  it('the rank-k rebuild error equals the root of the discarded sigma squared (Eckart-Young identity)', () => {
    const rnd = mulberry32(19);
    const a = randomMatrix(8, 8, rnd);
    const svd = svdSmall(a);
    for (let k = 0; k <= 8; k++) {
      const err = Math.sqrt(sub2(svdReconstruct(svd, k), a).flat().reduce((x, y) => x + y * y, 0));
      expect(err).toBeCloseTo(Math.sqrt(svd.s.slice(k).reduce((x, y) => x + y * y, 0)), 9);
    }
  });

  it('refuses matrices over 8 x 8', () => {
    expect(() => svdSmall(randomMatrix(9, 3, mulberry32(1)))).toThrow(RangeError);
    expect(() => svdSmall(randomMatrix(3, 9, mulberry32(1)))).toThrow(RangeError);
  });
});

describe('covariance and pca', () => {
  it('computes the population covariance of a hand-worked set', () => {
    // x = 1,2,3 and y = 2,4,6: var x = 2/3, var y = 8/3, cov = 4/3.
    const c = covariance([[1, 2], [2, 4], [3, 6]]);
    expect(c[0][0]).toBeCloseTo(2 / 3, 12);
    expect(c[1][1]).toBeCloseTo(8 / 3, 12);
    expect(c[0][1]).toBeCloseTo(4 / 3, 12);
    expect(mean([[1, 2], [3, 6]])).toEqual([2, 4]);
  });

  it('finds the axis of a stretched cloud and the variances in order, total = trace', () => {
    const rnd = mulberry32(23);
    const pts = Array.from({ length: 300 }, () => {
      const t = (rnd() - 0.5) * 10;
      const noise = (rnd() - 0.5) * 0.5;
      return [t * Math.cos(0.6) - noise * Math.sin(0.6) + 4, t * Math.sin(0.6) + noise * Math.cos(0.6) - 2];
    });
    const p = pca(pts, 2);
    expect(Math.abs(p.axes[0][0])).toBeCloseTo(Math.cos(0.6), 1);
    expect(p.variances[0]).toBeGreaterThan(p.variances[1]);
    expect(p.variances[0] + p.variances[1]).toBeCloseTo(p.total, 9);
    expect(p.mean[0]).toBeCloseTo(4, 0);
    const ref = jacobiEigen(covariance(pts));
    expect(p.variances[0]).toBeCloseTo(ref.values[0], 9);
    expect(pcaProject(p, p.mean).every((x) => Math.abs(x) < 1e-12)).toBe(true);
  });
});

describe('softmax', () => {
  it('sums to 1, is order-preserving, survives huge inputs and honours temperature', () => {
    const p = softmax([1, 2, 3]);
    expect(p.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(p[0]).toBeCloseTo(Math.exp(1) / (Math.exp(1) + Math.exp(2) + Math.exp(3)), 12);
    expect(softmax([1000, 1001])[1]).toBeCloseTo(1 / (1 + Math.exp(-1)), 12);
    expect(softmax([1, 2, 3], 100)[0]).toBeGreaterThan(0.33);
    expect(softmax([1, 2, 3], 0.1)[2]).toBeGreaterThan(0.99);
    expect(() => softmax([1], 0)).toThrow(RangeError);
  });
});

describe('conv2d', () => {
  const naive = (img: Mat, ker: Mat, stride: number, pad: number) => {
    const padded = Array.from({ length: img.length + 2 * pad }, (_, y) =>
      Array.from({ length: img[0].length + 2 * pad }, (_, x) => img[y - pad]?.[x - pad] ?? 0),
    );
    const out: number[][] = [];
    for (let y = 0; y + ker.length <= padded.length; y += stride) {
      const row: number[] = [];
      for (let x = 0; x + ker[0].length <= padded[0].length; x += stride) {
        let s = 0;
        for (let i = 0; i < ker.length; i++) for (let j = 0; j < ker[0].length; j++) s += padded[y + i][x + j] * ker[i][j];
        row.push(s);
      }
      out.push(row);
    }
    return out;
  };

  it('equals a naive padded-image loop on 300 seeded images, kernels, strides and paddings', () => {
    const rnd = mulberry32(29);
    for (let t = 0; t < 300; t++) {
      const img = randomMatrix(3 + Math.floor(rnd() * 6), 3 + Math.floor(rnd() * 6), rnd);
      const ker = randomMatrix(1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 3), rnd);
      const stride = 1 + Math.floor(rnd() * 3);
      const pad = Math.floor(rnd() * 3);
      const got = conv2d(img, ker, { stride, pad });
      const want = naive(img, ker, stride, pad);
      expect(got.length).toBe(want.length);
      got.forEach((row, y) => row.forEach((x, k) => expect(x).toBeCloseTo(want[y][k], 12)));
    }
  });

  it('does a hand-worked 3 x 3 edge detector, does not flip the kernel, and refuses a kernel that does not fit', () => {
    expect(conv2d([[1, 2, 3], [4, 5, 6], [7, 8, 9]], [[1, 0], [0, -1]])).toEqual([[-4, -4], [-4, -4]]);
    expect(conv2d([[1, 2, 3]], [[1, 0, 0]])).toEqual([[1]]);
    expect(conv2d([[1, 2, 3, 4, 5]], [[1]], { stride: 2 })).toEqual([[1, 3, 5]]);
    expect(() => conv2d([[1, 2]], [[1, 1, 1]])).toThrow(RangeError);
    expect(() => conv2d([[1]], [[1]], { stride: 0 })).toThrow(RangeError);
  });
});
