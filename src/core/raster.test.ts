import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { matMul } from './vec';
import { add3, cross3, dot3, inverse4, length3, lookAt, perspective, projectToScreen, scale3, sub3, unproject, type Vec3 } from './raster3d';
import {
  area2, barycentric, blendOver, coveredPixels, edgeFunction, interpolateLinear, interpolatePerspective, isTopLeft, renderTriangles, wind, type DepthVertex, type ScreenPoint, type Triangle,
} from './raster';

const near = (a: readonly number[], b: readonly number[], tol = 1e-9) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));
const pt = (x: number, y: number): ScreenPoint => ({ x, y });

describe('triangle setup', () => {
  const tri: Triangle = [pt(0, 0), pt(4, 0), pt(0, 4)];

  it('hand values: edge function, twice the area, barycentric weights of (1, 1) are (0.5, 0.25, 0.25)', () => {
    expect(edgeFunction(tri[0], tri[1], 0, 4)).toBe(16);
    expect(area2(tri)).toBe(16);
    near(barycentric(tri, 1, 1), [0.5, 0.25, 0.25]);
    near(barycentric(tri, 0, 0), [1, 0, 0]);
  });

  it('wind keeps a positive triangle, swaps the other, and returns null for no area', () => {
    expect(wind(tri)).toBe(tri);
    const reversed: Triangle = [tri[0], tri[2], tri[1]];
    expect(area2(reversed)).toBe(-16);
    expect(wind(reversed)).toEqual([tri[0], tri[1], tri[2]]);
    expect(wind([pt(0, 0), pt(1, 1), pt(2, 2)])).toBeNull();
  });

  it('top-left: a horizontal edge with the inside below it and an upward edge count, the others do not', () => {
    expect(isTopLeft(pt(0, 0), pt(4, 0))).toBe(true);
    expect(isTopLeft(pt(4, 4), pt(0, 4))).toBe(false);
    expect(isTopLeft(pt(0, 4), pt(0, 0))).toBe(true);
    expect(isTopLeft(pt(4, 0), pt(4, 4))).toBe(false);
  });
});

describe('coveredPixels', () => {
  const randomTri = (rnd: () => number, w: number, h: number): Triangle => [0, 1, 2].map(() => pt(rnd() * (w + 4) - 2, rnd() * (h + 4) - 2)) as unknown as Triangle;

  it('covers exactly the pixels whose centres are inside, for 200 seeded triangles of either winding (brute force over every pixel)', () => {
    const rnd = mulberry32(1);
    const W = 20;
    const H = 14;
    for (let i = 0; i < 200; i++) {
      const t = randomTri(rnd, W, H);
      if (area2(t) === 0) continue;
      const expected = new Set<number>();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const b = barycentric(t, x + 0.5, y + 0.5);
          if (b.every((v) => v > 0)) expected.add(y * W + x);
        }
      }
      const got = coveredPixels(t, W, H);
      expect(new Set(got.map((f) => f.y * W + f.x))).toEqual(expected);
      got.forEach((f) => near(f.bary, barycentric(t, f.x + 0.5, f.y + 0.5), 1e-12));
    }
  });

  it('two triangles sharing an edge through pixel centres cover every pixel of the square exactly once', () => {
    const a: Triangle = [pt(0, 0), pt(4, 0), pt(4, 4)];
    const b: Triangle = [pt(0, 0), pt(4, 4), pt(0, 4)];
    const count = new Map<number, number>();
    for (const t of [a, b]) for (const f of coveredPixels(t, 4, 4)) count.set(f.y * 4 + f.x, (count.get(f.y * 4 + f.x) ?? 0) + 1);
    expect(count.size).toBe(16);
    expect([...count.values()].every((c) => c === 1)).toBe(true);
  });

  it('weights follow the vertex order given, whichever way the triangle winds', () => {
    const t: Triangle = [pt(0, 0), pt(0, 8), pt(8, 0)];
    expect(area2(t)).toBeLessThan(0);
    for (const f of coveredPixels(t, 8, 8)) {
      const x = t[0].x * f.bary[0] + t[1].x * f.bary[1] + t[2].x * f.bary[2];
      const y = t[0].y * f.bary[0] + t[1].y * f.bary[1] + t[2].y * f.bary[2];
      near([x, y], [f.x + 0.5, f.y + 0.5], 1e-12);
    }
  });

  it('clips to the grid and ignores a triangle with no area', () => {
    expect(coveredPixels([pt(0, 0), pt(1, 1), pt(2, 2)], 4, 4)).toEqual([]);
    expect(coveredPixels([pt(-50, -50), pt(60, -50), pt(-50, 60)], 5, 5)).toHaveLength(25);
    expect(coveredPixels([pt(10, 10), pt(14, 10), pt(10, 14)], 5, 5)).toEqual([]);
  });
});

describe('z-buffer', () => {
  const dv = (x: number, y: number, z: number): DepthVertex => ({ x, y, z });

  /** Reference: for every pixel centre, gather every covering triangle and take the smallest interpolated depth. */
  function reference(tris: readonly Triangle<DepthVertex>[], w: number, h: number) {
    const ids = new Int32Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = Infinity;
        tris.forEach((t, i) => {
          const b = barycentric(t, x + 0.5, y + 0.5);
          if (!b.every((v) => v > 0)) return;
          const z = b[0] * t[0].z + b[1] * t[1].z + b[2] * t[2].z;
          if (z < best) {
            best = z;
            ids[y * w + x] = i;
          }
        });
      }
    }
    return ids;
  }

  it('matches the per-pixel reference on 200 seeded triangle soups, in any draw order and with either depth test', () => {
    const rnd = mulberry32(2);
    const W = 16;
    const H = 12;
    for (let s = 0; s < 200; s++) {
      const tris = Array.from({ length: 2 + Math.floor(rnd() * 5) }, () => [0, 1, 2].map(() => dv(rnd() * 20 - 2, rnd() * 16 - 2, rnd())) as unknown as Triangle<DepthVertex>);
      const expected = reference(tris, W, H);
      const shuffled = tris.map((_, i) => i).sort(() => rnd() - 0.5);
      for (const options of [{}, { order: shuffled }, { earlyZ: true }, { order: shuffled, earlyZ: true }]) {
        expect([...renderTriangles(tris, W, H, options).id]).toEqual([...expected]);
      }
    }
  });

  it('fragment-shader invocations, hand-counted: two triangles of 6 identical pixels, near one at z 0.2 and far one at 0.8', () => {
    // Both cover the pixels with x + y < 3 (6 pixels: 1 + 2 + 3 per anti-diagonal), no centre on an edge.
    const near = [dv(0, 0, 0.2), dv(3.9, 0, 0.2), dv(0, 3.9, 0.2)] as const;
    const far = [dv(0, 0, 0.8), dv(3.9, 0, 0.8), dv(0, 3.9, 0.8)] as const;
    const tris = [near, far];
    const backToFront = [1, 0];
    const frontToBack = [0, 1];
    expect(renderTriangles(tris, 4, 4, { order: frontToBack }).coveredFragments).toBe(12);
    // Without early-z the shader runs for every covered fragment, whatever the order.
    expect(renderTriangles(tris, 4, 4, { order: backToFront }).shaderInvocations).toBe(12);
    expect(renderTriangles(tris, 4, 4, { order: frontToBack }).shaderInvocations).toBe(12);
    // With early-z: back to front, both pass (6 + 6); front to back, the far one fails at every pixel (6 + 0).
    expect(renderTriangles(tris, 4, 4, { order: backToFront, earlyZ: true }).shaderInvocations).toBe(12);
    expect(renderTriangles(tris, 4, 4, { order: frontToBack, earlyZ: true }).shaderInvocations).toBe(6);
  });

  it('a nearer triangle hides a farther one only where they overlap, and equal depth keeps the first drawn (strict less)', () => {
    const a = [dv(0, 0, 0.5), dv(8, 0, 0.5), dv(0, 8, 0.5)] as const;
    const b = [dv(0, 0, 0.5), dv(8, 0, 0.5), dv(0, 8, 0.5)] as const;
    expect(new Set(renderTriangles([a, b], 8, 8).id).has(1)).toBe(false);
    expect(new Set(renderTriangles([a, b], 8, 8, { order: [1, 0] }).id).has(0)).toBe(false);
  });
});

describe('interpolation', () => {
  it('screen-linear interpolation of a plain attribute is the barycentric mix', () => {
    near(interpolateLinear([[0], [10], [20]], [0.5, 0.25, 0.25]), [7.5]);
  });

  it('perspective-correct u equals the u found by unprojecting the pixel centre and intersecting the triangle plane (1e-6), and screen-linear differs', () => {
    const W = 64;
    const H = 48;
    const proj = perspective(1.0, W / H, 0.5, 50);
    const view = lookAt([0, 1.5, 6], [0, 0, 0], [0, 1, 0])!;
    const vp = matMul(proj, view);
    const world: [Vec3, Vec3, Vec3] = [[-3, 0, 2], [3, 0, 2], [0, 0, -8]];
    const u = [0, 1, 0.5];
    const projected = world.map((p) => projectToScreen(vp, p, W, H));
    const tri = projected.map((p) => ({ x: p.screen![0], y: p.screen![1] })) as unknown as Triangle;
    const ws = projected.map((p) => p.w) as unknown as Vec3;
    const invVp = inverse4(vp)!;
    const eye: Vec3 = [0, 1.5, 6];
    const normal = cross3(sub3(world[1], world[0]), sub3(world[2], world[0]));

    let worst = 0;
    let linearGap = 0;
    const frags = coveredPixels(tri, W, H);
    expect(frags.length).toBeGreaterThan(200);
    for (const f of frags) {
      const ndcX = ((f.x + 0.5) / W) * 2 - 1;
      const ndcY = 1 - ((f.y + 0.5) / H) * 2;
      const far = unproject(invVp, [ndcX, ndcY, 1])!;
      const dir = sub3(far, eye);
      const t = dot3(sub3(world[0], eye), normal) / dot3(dir, normal);
      const hit = add3(eye, scale3(dir, t));
      // Barycentric weights of the 3D hit by area ratios.
      const area = length3(normal);
      const weights = [
        dot3(cross3(sub3(world[1], hit), sub3(world[2], hit)), normal) / (area * area),
        dot3(cross3(sub3(world[2], hit), sub3(world[0], hit)), normal) / (area * area),
        dot3(cross3(sub3(world[0], hit), sub3(world[1], hit)), normal) / (area * area),
      ];
      const expected = weights[0] * u[0] + weights[1] * u[1] + weights[2] * u[2];
      const correct = interpolatePerspective([[u[0]], [u[1]], [u[2]]], f.bary, ws)[0];
      worst = Math.max(worst, Math.abs(correct - expected));
      linearGap = Math.max(linearGap, Math.abs(interpolateLinear([[u[0]], [u[1]], [u[2]]], f.bary)[0] - expected));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(linearGap).toBeGreaterThan(0.01);
  });

  it('with equal w the two modes agree (a surface facing the camera has nothing to correct)', () => {
    const attrs = [[0], [1], [3]];
    near(interpolatePerspective(attrs, [0.2, 0.3, 0.5], [4, 4, 4]), interpolateLinear(attrs, [0.2, 0.3, 0.5]), 1e-12);
  });
});

describe('blending', () => {
  it('hand values: 25% red over blue is (0.25, 0, 0.75)', () => {
    near(blendOver([1, 0, 0], 0.25, [0, 0, 1]), [0.25, 0, 0.75], 1e-15);
  });

  it('is not commutative: red then green at 50% over blue is (0.25, 0.5, 0.25), the other order (0.5, 0.25, 0.25); alpha 0 or 1 hides the order', () => {
    const red: Vec3 = [1, 0, 0];
    const green: Vec3 = [0, 1, 0];
    const blue: Vec3 = [0, 0, 1];
    near(blendOver(green, 0.5, blendOver(red, 0.5, blue)), [0.25, 0.5, 0.25], 1e-15);
    near(blendOver(red, 0.5, blendOver(green, 0.5, blue)), [0.5, 0.25, 0.25], 1e-15);
    near(blendOver(green, 1, blendOver(red, 1, blue)), blendOver(green, 1, blue), 1e-15);
    near(blendOver(green, 0, blendOver(red, 0, blue)), blue, 1e-15);
  });
});
