import { describe, expect, it } from 'vitest';
import {
  CLIP_PLANES, DEPTH_BITS, add3, clipPolygon, clipTriangle, compose, cross3, depthResolution, det4, dot3, fanTriangles, identity4, inverse4, isInsideFrustum, length3, lookAt, ndcDepthAt,
  ndcToScreen, normalize3, ortho, perspective, planeDistance, projectToScreen, quantiseDepth, reflect3, rotationX, rotationY, rotationZ, scaling, sub3, translation, transform,
  unproject, windowDepth, type ClipVertex, type Mat4, type Vec3, type Vec4,
} from './raster3d';
import { mulberry32 } from './random';

const near = (a: readonly number[], b: readonly number[], tol = 1e-9) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));
};

describe('vec3', () => {
  it('hand values', () => {
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(length3([2, 3, 6])).toBe(7);
    expect(normalize3([0, 0, 0])).toBeNull();
    expect(add3([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub3([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
  });

  it('reflection: (1, -1, 0)/sqrt2 off a floor with normal +y leaves as (1, 1, 0)/sqrt2', () => {
    const s = Math.SQRT1_2;
    near(reflect3([s, -s, 0], [0, 1, 0]), [s, s, 0], 1e-15);
  });
});

describe('model matrices', () => {
  it('rotations are right-handed: 90 degrees about y sends +x to -z, about x sends +y to +z, about z sends +x to +y', () => {
    near(transform(rotationY(Math.PI / 2), [1, 0, 0]), [0, 0, -1, 1], 1e-15);
    near(transform(rotationX(Math.PI / 2), [0, 1, 0]), [0, 0, 1, 1], 1e-15);
    near(transform(rotationZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0, 1], 1e-15);
  });

  it('a point (w = 1) is translated and a direction (w = 0) is not', () => {
    const t = translation([5, -2, 3]);
    expect(transform(t, [1, 1, 1], 1)).toEqual([6, -1, 4, 1]);
    expect(transform(t, [1, 1, 1], 0)).toEqual([1, 1, 1, 0]);
  });

  it('compose(T, R, S) applies S first, then R, then T', () => {
    const m = compose(translation([10, 0, 0]), rotationZ(Math.PI / 2), scaling([2, 2, 2]));
    near(transform(m, [1, 0, 0]), [10, 2, 0, 1], 1e-12);
  });

  it('det4 equals the Leibniz permutation sum on 100 seeded matrices', () => {
    const rnd = mulberry32(2);
    const permutations = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const parity = (p: number[]) => p.reduce((s, v, i) => s + p.slice(i + 1).filter((w) => w < v).length, 0) % 2 === 0 ? 1 : -1;
    for (let i = 0; i < 100; i++) {
      const m = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => rnd() * 4 - 2));
      const leibniz = permutations([0, 1, 2, 3]).reduce((sum, p) => sum + parity(p) * p.reduce((prod, col, row) => prod * m[row][col], 1), 0);
      expect(det4(m)).toBeCloseTo(leibniz, 9);
    }
  });

  it('det4 of the model pieces: translation and rotation 1, scaling the product of its factors', () => {
    expect(det4(identity4())).toBe(1);
    expect(det4(translation([3, 4, 5]))).toBe(1);
    expect(det4(rotationY(0.7))).toBeCloseTo(1, 12);
    expect(det4(scaling([2, 3, 4]))).toBe(24);
  });
});

describe('lookAt', () => {
  it('hand case: eye (0,0,5) looking at the origin with up +y puts the origin at (0,0,-5) in view space; det 1; the inverse recovers the eye', () => {
    const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0])!;
    near(transform(view, [0, 0, 0]), [0, 0, -5, 1]);
    expect(det4(view)).toBeCloseTo(1, 12);
    near(transform(inverse4(view)!, [0, 0, 0]), [0, 0, 5, 1]);
  });

  it('puts the target straight ahead at its distance and the eye at the origin, for 200 seeded cameras', () => {
    const rnd = mulberry32(3);
    const r = (): Vec3 => [rnd() * 20 - 10, rnd() * 20 - 10, rnd() * 20 - 10];
    for (let i = 0; i < 200; i++) {
      const eye = r();
      const target = r();
      const view = lookAt(eye, target, [0, 1, 0]);
      if (!view) continue;
      near(transform(view, eye), [0, 0, 0, 1]);
      near(transform(view, target), [0, 0, -length3(sub3(target, eye)), 1], 1e-8);
      expect(det4(view)).toBeCloseTo(1, 9);
    }
  });

  it('refuses a camera with no direction or with up parallel to it', () => {
    expect(lookAt([1, 2, 3], [1, 2, 3], [0, 1, 0])).toBeNull();
    expect(lookAt([0, 0, 0], [0, 4, 0], [0, 1, 0])).toBeNull();
  });
});

describe('perspective and the divide', () => {
  const p = perspective(Math.PI / 2, 1, 1, 100);
  const ndc = (eye: Vec3) => projectToScreen(p, eye, 200, 150).ndc!;

  it('hand vectors (fov 90, aspect 1, near 1, far 100)', () => {
    near(ndc([0, 0, -1]), [0, 0, -1]);
    near(ndc([1, 1, -1]), [1, 1, -1]);
    near(ndc([0, 0, -100]), [0, 0, 1]);
    near(ndc([0, 0, -10]), [0, 0, 810 / 990]);
    expect(810 / 990).toBeCloseTo(0.8182, 4);
  });

  it('the divide by w is a separate step: doubling the distance does not double x in NDC, and w is the distance', () => {
    const a = projectToScreen(p, [2, 0, -4], 200, 150);
    const b = projectToScreen(p, [2, 0, -8], 200, 150);
    expect(a.w).toBe(4);
    expect(b.w).toBe(8);
    expect(a.clip[0]).toBe(b.clip[0]);
    near([a.ndc![0], b.ndc![0]], [0.5, 0.25]);
  });

  it('ndcDepthAt matches the matrix for 200 seeded distances', () => {
    const rnd = mulberry32(4);
    const m = perspective(1, 1.5, 0.3, 80);
    for (let i = 0; i < 200; i++) {
      const d = 0.3 + rnd() * 79;
      expect(ndcDepthAt(d, 0.3, 80)).toBeCloseTo(projectToScreen(m, [0, 0, -d], 10, 10).ndc![2], 9);
    }
  });

  it('the inverse projection round-trips NDC back to eye space on 1000 seeded points (1e-9)', () => {
    const rnd = mulberry32(5);
    const m = perspective(1.1, 4 / 3, 0.5, 50);
    const inv = inverse4(m)!;
    for (let i = 0; i < 1000; i++) {
      const eye: Vec3 = [rnd() * 6 - 3, rnd() * 6 - 3, -(0.6 + rnd() * 48)];
      const back = unproject(inv, projectToScreen(m, eye, 10, 10).ndc!)!;
      near(back, eye, 1e-9);
    }
  });

  it('a point behind the camera has w < 0, is flagged, and divides to a mirrored result instead of failing; w = 0 has no divide', () => {
    const behind = projectToScreen(p, [1, 0, 2], 200, 150);
    expect(behind.behind).toBe(true);
    expect(behind.inFrustum).toBe(false);
    // Hand: clip = (1, 0, -(101/99)*2 - 200/99 = -402/99, w = -2), so NDC = (-0.5, 0, 201/99): mirrored in x and past the far plane.
    near(behind.ndc!, [-0.5, 0, 201 / 99]);
    expect(projectToScreen(p, [1, 0, 0], 200, 150).ndc).toBeNull();
  });

  it('the viewport: NDC (0,0) is the centre, (1,1) the top-right corner, (-1,-1) the bottom-left, depth 0..1', () => {
    near(ndcToScreen([0, 0, 0], 200, 150), [100, 75, 0.5]);
    near(ndcToScreen([1, 1, 1], 200, 150), [200, 0, 1]);
    near(ndcToScreen([-1, -1, -1], 200, 150), [0, 150, 0]);
    expect(windowDepth(-1)).toBe(0);
  });

  it('rejects a frustum that cannot exist', () => {
    expect(() => perspective(0, 1, 1, 10)).toThrow(RangeError);
    expect(() => perspective(Math.PI, 1, 1, 10)).toThrow(RangeError);
    expect(() => perspective(1, 1, 5, 5)).toThrow(RangeError);
    expect(() => perspective(1, 1, 0, 5)).toThrow(RangeError);
    expect(() => perspective(1, 0, 1, 5)).toThrow(RangeError);
  });
});

describe('ortho', () => {
  it('hand vectors: the box [-2,2] x [-1,1] x [-1,-11] maps to the NDC cube with w = 1', () => {
    const m: Mat4 = ortho(-2, 2, -1, 1, 1, 11);
    near(transform(m, [2, 1, -1]), [1, 1, -1, 1]);
    near(transform(m, [-2, -1, -11]), [-1, -1, 1, 1]);
    near(transform(m, [0, 0, -6]), [0, 0, 0, 1]);
    expect(() => ortho(1, 1, 0, 1, 0, 1)).toThrow(RangeError);
  });
});

const basisAttrs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const vertexOf = (clip: Vec4, i: number): ClipVertex => ({ clip, attrs: basisAttrs[i] });

describe('clipping', () => {
  const rnd = mulberry32(6);
  const randomClipTriangle = (): [ClipVertex, ClipVertex, ClipVertex] =>
    [0, 1, 2].map((i) => vertexOf([rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 4 - 1], i)) as [ClipVertex, ClipVertex, ClipVertex];

  it('every output vertex satisfies -w <= x, y, z <= w (1e-9) on 500 seeded triangles', () => {
    for (let i = 0; i < 500; i++) {
      for (const v of clipTriangle(randomClipTriangle())) for (const plane of CLIP_PLANES) expect(planeDistance(plane, v.clip)).toBeGreaterThan(-1e-9);
    }
  });

  it('output vertices are true points of the input triangle: attributes are barycentric weights, and clip = sum of weight times input clip', () => {
    for (let i = 0; i < 300; i++) {
      const tri = randomClipTriangle();
      for (const v of clipTriangle(tri)) {
        expect(v.attrs.reduce((s, a) => s + a, 0)).toBeCloseTo(1, 9);
        v.attrs.forEach((a) => expect(a).toBeGreaterThan(-1e-9));
        near(v.clip, [0, 1, 2, 3].map((k) => v.attrs.reduce((s, a, j) => s + a * tri[j].clip[k], 0)), 1e-9);
      }
    }
  });

  it('a triangle fully inside is returned unchanged, one fully outside comes back empty', () => {
    const inside = [vertexOf([0, 0, 0, 1], 0), vertexOf([0.5, 0, 0, 1], 1), vertexOf([0, 0.5, 0, 1], 2)] as const;
    expect(clipTriangle(inside)).toEqual([...inside]);
    expect(clipTriangle(inside).some((v) => v.created)).toBe(false);
    const outside = [vertexOf([5, 0, 0, 1], 0), vertexOf([6, 0, 0, 1], 1), vertexOf([5, 1, 0, 1], 2)] as const;
    expect(clipTriangle(outside)).toEqual([]);
  });

  it('hand case: a triangle crossing only the near plane gains two created vertices on it', () => {
    const tri = [vertexOf([0, 0, 0, 1], 0), vertexOf([0.5, 0, -2, 1], 1), vertexOf([0, 0.5, 0, 1], 2)] as const;
    const out = clipTriangle(tri, ['near']);
    expect(out).toHaveLength(4);
    expect(out.filter((v) => v.created)).toHaveLength(2);
    out.filter((v) => v.created).forEach((v) => expect(planeDistance('near', v.clip)).toBeCloseTo(0, 12));
  });

  it('with only some planes the others are not enforced (the lesson shows clipping off)', () => {
    const behind = [vertexOf([0, 0, 0, 1], 0), vertexOf([0.5, 0, 0, -1], 1), vertexOf([0, 0.5, 0, 1], 2)] as const;
    expect(clipTriangle(behind, [])).toEqual([...behind]);
    clipTriangle(behind).forEach((v) => CLIP_PLANES.forEach((plane) => expect(planeDistance(plane, v.clip)).toBeGreaterThan(-1e-9)));
    expect(isInsideFrustum([0, 0, 0, 1])).toBe(true);
    expect(isInsideFrustum([0, 0, 2, 1])).toBe(false);
  });

  it('the area after clipping equals a brute-force estimate within 1% for seeded near-plane-straddling triangles', () => {
    const m = perspective(Math.PI / 2, 1, 0.5, 20);
    const GRID = 1000;
    let checked = 0;
    for (let trial = 0; trial < 200 && checked < 4; trial++) {
      const eye = [0, 1, 2].map(() => [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 5 - 4] as Vec3);
      const verts = eye.map((e, i) => vertexOf(transform(m, e), i)) as [ClipVertex, ClipVertex, ClipVertex];
      const polygon = clipTriangle(verts);
      if (polygon.length < 3) continue;
      const ndcs = polygon.map((v) => [v.clip[0] / v.clip[3], v.clip[1] / v.clip[3]]);
      const area = Math.abs(ndcs.reduce((s, [x, y], i) => s + x * ndcs[(i + 1) % ndcs.length][1] - ndcs[(i + 1) % ndcs.length][0] * y, 0)) / 2;
      if (area < 0.5 || !polygon.some((v) => v.created)) continue;
      checked++;
      // Independent estimate: for each NDC sample, solve for the point of the original triangle that projects there.
      let inside = 0;
      const cx = verts.map((v) => v.clip);
      for (let iy = 0; iy < GRID; iy++) {
        const y = 1 - ((iy + 0.5) / GRID) * 2;
        for (let ix = 0; ix < GRID; ix++) {
          const x = ((ix + 0.5) / GRID) * 2 - 1;
          const f = cx.map((c) => c[0] - x * c[3]);
          const g = cx.map((c) => c[1] - y * c[3]);
          const a = f[1] - f[0];
          const b = f[2] - f[0];
          const c = g[1] - g[0];
          const d = g[2] - g[0];
          const det = a * d - b * c;
          if (det === 0) continue;
          const l1 = (-f[0] * d + g[0] * b) / det;
          const l2 = (-a * g[0] + c * f[0]) / det;
          const l0 = 1 - l1 - l2;
          if (l0 < 0 || l1 < 0 || l2 < 0) continue;
          const w = l0 * cx[0][3] + l1 * cx[1][3] + l2 * cx[2][3];
          const z = l0 * cx[0][2] + l1 * cx[1][2] + l2 * cx[2][2];
          if (w > 0 && Math.abs(z) <= w) inside++;
        }
      }
      expect(Math.abs((inside * 4) / (GRID * GRID) - area) / area).toBeLessThan(0.01);
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('fanTriangles splits a convex polygon into n-2 triangles from its first vertex', () => {
    expect(fanTriangles(['a', 'b', 'c', 'd', 'e'])).toEqual([['a', 'b', 'c'], ['a', 'c', 'd'], ['a', 'd', 'e']]);
    expect(fanTriangles(['a', 'b'])).toEqual([]);
  });

  it('clipPolygon with the empty plane list leaves any polygon alone', () => {
    const poly = [vertexOf([9, 9, 9, 1], 0), vertexOf([8, 9, 9, 1], 1), vertexOf([9, 8, 9, 1], 2)];
    expect(clipPolygon(poly, [])).toEqual(poly);
  });
});

describe('depth precision', () => {
  /** The first distance above d where the quantised depth changes, by bisection on the quantised mapping itself. */
  const nextStep = (d: number, near: number, far: number, bits: number): number => {
    const q = quantiseDepth(ndcDepthAt(d, near, far), bits);
    let lo = d;
    let hi = d * 1.5;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (quantiseDepth(ndcDepthAt(mid, near, far), bits) === q) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  it('the width of one depth step found by bisection matches d^2 / (near * 2^24) within 10% for far >> d >> near, and the exact formula within 1%', () => {
    for (const [d, near, far] of [[10, 0.1, 1000], [30, 0.1, 5000], [50, 0.5, 2000], [8, 0.05, 800]]) {
      const first = nextStep(d, near, far, DEPTH_BITS);
      const second = nextStep(first, near, far, DEPTH_BITS);
      const width = second - first;
      expect(Math.abs(width - (d * d) / (near * 2 ** 24)) / width).toBeLessThan(0.1);
      expect(Math.abs(width - depthResolution((first + second) / 2, near, far)) / width).toBeLessThan(0.01);
    }
  });

  it('pushing near out from 0.01 to 1 makes a surface at distance 100 about 100 times easier to resolve', () => {
    expect(depthResolution(100, 0.01, 1000) / depthResolution(100, 1, 1000)).toBeCloseTo(100, 0);
  });

  it('two surfaces closer than a step share one quantised depth (z-fighting) and farther apart ones do not', () => {
    const d = 100;
    const gap = depthResolution(d, 0.1, 1000);
    const q = (dist: number) => quantiseDepth(ndcDepthAt(dist, 0.1, 1000));
    expect(q(d)).toBe(q(d + gap * 0.2));
    expect(q(d)).not.toBe(q(d + gap * 3));
  });

  it('quantiseDepth clamps outside the cube and spans 0 to 2^bits - 1', () => {
    expect(quantiseDepth(-1)).toBe(0);
    expect(quantiseDepth(1)).toBe(2 ** DEPTH_BITS - 1);
    expect(quantiseDepth(5)).toBe(2 ** DEPTH_BITS - 1);
    expect(quantiseDepth(-5)).toBe(0);
    expect(quantiseDepth(0, 8)).toBe(128);
  });
});
