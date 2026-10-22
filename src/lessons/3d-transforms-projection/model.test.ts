import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { CLIP_PLANES, clipTriangle, det4, inverse4, lookAt, ndcDepthAt, perspective, planeDistance, projectToScreen, transform, unproject, type Vec3 } from '../../core/raster3d';
import {
  CAMERA_PRESETS, CORNERS, CLIP_SCENE, DEG, DEPTH_IMAGE, EDGES, MIN_LOOK_DISTANCE, MIN_PLANE_GAP, NEAR_RANGE, PLOT_LIMIT, POINT_CAMERA, VIEW_H, VIEW_W,
  cameraView, clipScene, clipTriangleCorners, depthScene, edgeState, footprint, initialCamera, initialClip, initialDepth, initialPoint, modelMatrix,
  moveHandle, pipeline, setFar, setNear, sideSegments, surfaceDistance, translationEffect, type CameraState,
} from './model';

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

describe('the hand-worked vectors from the spec (fov 90, aspect 1, near 1, far 100)', () => {
  const P = perspective(90 * DEG, 1, 1, 100);
  const ndcOf = (p: Vec3) => projectToScreen(P, p, 100, 100).ndc as Vec3;
  it('maps (0,0,-1) to (0,0,-1), (1,1,-1) to (1,1,-1) and (0,0,-100) to z = +1', () => {
    ndcOf([0, 0, -1]).forEach((v, i) => expect(v).toBeCloseTo([0, 0, -1][i], 9));
    ndcOf([1, 1, -1]).forEach((v, i) => expect(v).toBeCloseTo([1, 1, -1][i], 9));
    expect(ndcOf([0, 0, -100])[2]).toBeCloseTo(1, 9);
  });
  it('maps (0,0,-10) to 81/99 = 0.8182, from z_clip = -(f+n)/(f-n)·z_e - 2fn/(f-n) and w = -z_e', () => {
    const [f, n, ze] = [100, 1, -10];
    const zClip = (-(f + n) / (f - n)) * ze - (2 * f * n) / (f - n);
    expect(zClip / -ze).toBeCloseTo(81 / 99, 12);
    expect(ndcOf([0, 0, -10])[2]).toBeCloseTo(0.8182, 4);
    expect(ndcDepthAt(10, 1, 100)).toBeCloseTo(81 / 99, 12);
  });
  it('the inverse projection round-trips NDC back to eye space on 1,000 seeded points', () => {
    const inv = inverse4(P);
    if (!inv) throw new Error('P is invertible');
    const rnd = mulberry32(27);
    for (let i = 0; i < 1000; i++) {
      const eye: Vec3 = [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20, -(1 + rnd() * 99)];
      const ndc = projectToScreen(P, eye, 100, 100).ndc as Vec3;
      const back = unproject(inv, ndc) as Vec3;
      back.forEach((v, k) => expect(near(v, eye[k], 1e-6), `${i}`).toBe(true));
    }
  });
});

describe('lookAt', () => {
  it('from (0,0,5) at the origin puts the world origin at (0,0,-5), has determinant 1 and its inverse recovers the eye', () => {
    const V = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    if (!V) throw new Error('has a direction');
    const o = transform(V, [0, 0, 0]);
    [0, 0, -5].forEach((v, i) => expect(o[i]).toBeCloseTo(v, 12));
    expect(det4(V)).toBeCloseTo(1, 12);
    const inv = inverse4(V);
    if (!inv) throw new Error('invertible');
    const e = transform(inv, [0, 0, 0]);
    [0, 0, 5].forEach((v, i) => expect(e[i]).toBeCloseTo(v, 12));
  });
  it('refuses an eye on the target', () => {
    expect(lookAt([1, 2, 3], [1, 2, 3], [0, 1, 0])).toBeNull();
  });
});

describe('scene 1: one vertex through every space', () => {
  it('the world position equals scale, then turn about y, then move, worked by hand for all 8 corners at several settings', () => {
    for (const [scale, turn, mx, mz] of [[1.5, 30, 2, -2], [0.5, 0, -3, 2], [2, 180, 0.5, -6], [1, 90, 0, 0]]) {
      for (let v = 0; v < 8; v++) {
        const s = { ...initialPoint(), scale, turnDeg: turn, moveX: mx, moveZ: mz, vertex: v };
        const [x, y, z] = CORNERS[v].map((c) => c * scale);
        const th = turn * DEG;
        const expected = [x * Math.cos(th) + z * Math.sin(th) + mx, y, -x * Math.sin(th) + z * Math.cos(th) + mz];
        const world = pipeline(s).find((p) => p.id === 'world')?.value;
        expect(world, `corner ${v}`).toBeTruthy();
        expected.forEach((e, i) => expect(world?.[i]).toBeCloseTo(e, 9));
        expect(world?.[3]).toBe(1);
      }
    }
  });

  it('the staged result equals the single combined matrix and divide, and w after the projection is the distance in front of the camera', () => {
    const s = initialPoint();
    const steps = pipeline(s);
    const world = steps.find((p) => p.id === 'world')?.value as readonly number[];
    const camera = steps.find((p) => p.id === 'camera')?.value as readonly number[];
    const clip = steps.find((p) => p.id === 'clip')?.value as readonly number[];
    const ndc = steps.find((p) => p.id === 'ndc')?.value as readonly number[];
    expect(clip[3]).toBeCloseTo(-camera[2], 9);
    expect(Math.hypot(camera[0], camera[1], camera[2])).toBeCloseTo(
      Math.hypot(world[0] - POINT_CAMERA.eye[0], world[1] - POINT_CAMERA.eye[1], world[2] - POINT_CAMERA.eye[2]), 9,
    );
    [0, 1, 2].forEach((i) => expect(ndc[i]).toBeCloseTo(clip[i] / clip[3], 9));
    const screen = steps.find((p) => p.id === 'screen')?.value as readonly number[];
    expect(screen[0]).toBeCloseTo(((ndc[0] + 1) / 2) * VIEW_W, 9);
    expect(screen[1]).toBeCloseTo(((1 - ndc[1]) / 2) * VIEW_H, 9);
  });

  it('the divide is a separate step: moving a corner away along z leaves clip x unchanged but changes NDC x', () => {
    const base = { ...initialPoint(), scale: 1, turnDeg: 0, moveX: 0, vertex: 1 };
    const a = pipeline({ ...base, moveZ: 0 });
    const b = pipeline({ ...base, moveZ: -6 });
    const clipX = (steps: ReturnType<typeof pipeline>) => (steps[3].value as readonly number[])[0];
    expect(clipX(a)).toBeCloseTo(clipX(b), 9);
    const ndcX = (steps: ReturnType<typeof pipeline>) => (steps[4].value as readonly number[])[0];
    expect(ndcX(a)).not.toBeCloseTo(ndcX(b), 3);
  });

  it('translation moves a point and leaves a direction alone, and a direction stops after camera space', () => {
    const s = initialPoint();
    const eff = translationEffect(s);
    expect(eff.point).toBeCloseTo(Math.hypot(s.moveX, s.moveZ), 9);
    expect(eff.direction).toBeCloseTo(0, 12);
    const dir = pipeline({ ...s, kind: 'direction' });
    expect(dir.map((p) => p.value === null)).toEqual([false, false, false, true, true, true]);
    expect(dir[2].value?.[3]).toBe(0);
  });

  it('every control extreme gives finite numbers at every stage that has a value', () => {
    for (const scale of [0.5, 2]) for (const turnDeg of [0, 180]) for (const moveX of [-3, 3]) for (const moveZ of [-6, 2]) {
      for (let vertex = 0; vertex < 8; vertex++) {
        pipeline({ vertex, scale, turnDeg, moveX, moveZ, kind: 'point' }).forEach((p) => p.value?.forEach((v) => expect(Number.isFinite(v)).toBe(true)));
        expect(modelMatrix({ vertex, scale, turnDeg, moveX, moveZ, kind: 'point' })).toHaveLength(4);
      }
    }
  });
});

/** Independent oracle for the frustum: is (x, -z) inside the trapezoid, by cross products with its four edges. */
function insideTrapezoid(poly: [number, number][], p: [number, number]): boolean {
  const signs = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  });
  return signs.every((v) => v >= -1e-9) || signs.every((v) => v <= 1e-9);
}

describe('scene 2: the camera and the frustum', () => {
  it('the top-down trapezoid agrees with the matrix clip test on 2,000 seeded points, for both projections and several cameras', () => {
    const rnd = mulberry32(2);
    for (const projection of ['perspective', 'orthographic'] as const) {
      for (const base of [initialCamera(), { ...initialCamera(), eye: [3, 5] as const, target: [-2, -1] as const, fovDeg: 90, near: 0.5, far: 15 }]) {
        const s: CameraState = { ...base, projection };
        const view = cameraView(s);
        let inside = 0;
        for (let i = 0; i < 500; i++) {
          const p: [number, number] = [(rnd() - 0.5) * 24, (rnd() - 0.5) * 24];
          const clip = transform(view.proj, transform(view.view, [p[0], 0.8, -p[1]]).slice(0, 3) as unknown as Vec3);
          const matrixInside = CLIP_PLANES.filter((pl) => pl === 'left' || pl === 'right' || pl === 'near' || pl === 'far').every((pl) => planeDistance(pl, clip) >= 0);
          const trap = insideTrapezoid(view.trapezoid, p);
          if (matrixInside) inside++;
          expect(trap, `${projection} ${p}`).toBe(matrixInside);
        }
        expect(inside).toBeGreaterThan(20);
      }
    }
  });

  it('orthographic mode ignores the field of view: nothing drawn or counted depends on the hidden slider', () => {
    const a = cameraView({ ...initialCamera(), projection: 'orthographic', fovDeg: 20 });
    const b = cameraView({ ...initialCamera(), projection: 'orthographic', fovDeg: 120 });
    expect(a.trapezoid).toEqual(b.trapezoid);
    expect(a.projected.map((p) => p.screen)).toEqual(b.projected.map((p) => p.screen));
    expect([a.outside, a.behind]).toEqual([b.outside, b.behind]);
  });

  it('a camera put on its target is refused and the handle stays; near and far keep their gap', () => {
    const s = initialCamera();
    const refused = moveHandle(s, 'eye', [s.target[0], -s.target[1]]);
    expect(refused.eye).toEqual(s.eye);
    expect(refused.note).toContain('look-at needs a direction');
    const almost = moveHandle(s, 'eye', [s.target[0] + MIN_LOOK_DISTANCE / 2, -s.target[1]]);
    expect(almost.eye).toEqual(s.eye);
    expect(moveHandle(s, 'eye', [99, 99]).eye).toEqual([PLOT_LIMIT, -PLOT_LIMIT]);
    const high = setNear(s, s.far);
    expect(high.near).toBeLessThan(high.far - MIN_PLANE_GAP);
    expect(high.near).toBeGreaterThanOrEqual(NEAR_RANGE.min);
    expect(high.note).toContain('near must stay below far');
    const low = setFar(s, s.near);
    expect(low.far).toBeGreaterThan(low.near + MIN_PLANE_GAP);
    expect(setNear(s, 2).note).toBeNull();
  });

  it('every preset is a valid camera that looks somewhere, and "camera inside the cube" puts corners behind the near plane', () => {
    for (const p of CAMERA_PRESETS) {
      const view = cameraView(p.apply(initialCamera()));
      expect(view.projected).toHaveLength(8);
    }
    const inside = cameraView(CAMERA_PRESETS.find((p) => p.id === 'inside')?.apply(initialCamera()) as CameraState);
    expect(inside.outside).toBeGreaterThan(0);
    const cs = initialCamera();
    expect(cameraView(cs).outside).toBe(0);
  });

  it('frame cost: 8 corners projected and at most 12 edges drawn, in far less than a frame', () => {
    const t0 = performance.now();
    let last = cameraView(initialCamera());
    for (let i = 0; i < 200; i++) last = cameraView({ ...initialCamera(), fovDeg: 20 + (i % 100) });
    const elapsed = performance.now() - t0;
    expect(last.projected).toHaveLength(8);
    expect(EDGES.filter(([a, b]) => edgeState(last, a, b) !== 'hidden').length).toBeLessThanOrEqual(12);
    expect(elapsed / 200).toBeLessThan(5);
    expect(footprint()).toHaveLength(4);
  });
});

describe('scene 3: clipping', () => {
  it('with clipping on, every output vertex satisfies -w <= x, y, z <= w, for apexes in front of, on and behind the camera', () => {
    for (let apexZ = -8; apexZ <= 3; apexZ += 0.5) {
      const r = clipScene({ clipping: true, apexZ });
      r.rows.forEach((row) => {
        const [x, y, z, w] = row.clip;
        [x, y, z].forEach((c) => {
          expect(c).toBeGreaterThanOrEqual(-w - 1e-9);
          expect(c).toBeLessThanOrEqual(w + 1e-9);
        });
        expect(row.behind).toBe(false);
      });
    }
  });

  it('a triangle fully in front is returned unchanged, with no new vertices', () => {
    const r = clipScene({ clipping: true, apexZ: -4 });
    expect(r.rows.map((x) => x.name)).toEqual(['A', 'B', 'C']);
    expect(r.rows.some((x) => x.created)).toBe(false);
    expect(r.behindInput).toBe(0);
  });

  it('the default straddles the near plane: the apex is behind the camera, clipping adds vertices on the near plane, and clipping off keeps the mirrored apex', () => {
    const on = clipScene(initialClip());
    expect(on.behindInput).toBe(1);
    const made = on.rows.filter((r) => r.created);
    expect(made.length).toBeGreaterThanOrEqual(2);
    made.forEach((r) => expect(r.planes).toContain('near'));
    const off = clipScene({ clipping: false, apexZ: initialClip().apexZ });
    expect(off.rows).toHaveLength(3);
    const apex = off.rows[2];
    expect(apex.behind).toBe(true);
    const flatApexY = apex.screen?.[1] ?? 0;
    expect(flatApexY).toBeGreaterThan(VIEW_H / 2);
  });

  it('the clipped-away part drawn in the side view is exactly the part in front of the near plane, and its split points are the near-plane vertices clipTriangle makes', () => {
    const apexZ = initialClip().apexZ;
    const segs = sideSegments(apexZ);
    segs.filter((s) => s.kept).forEach((s) => [s.from[0], s.to[0]].forEach((d) => expect(d).toBeGreaterThanOrEqual(CLIP_SCENE.near - 1e-9)));
    segs.filter((s) => !s.kept).forEach((s) => [s.from[0], s.to[0]].forEach((d) => expect(d).toBeLessThanOrEqual(CLIP_SCENE.near + 1e-9)));
    const P = perspective(CLIP_SCENE.fovDeg * DEG, CLIP_SCENE.aspect, CLIP_SCENE.near, CLIP_SCENE.far);
    const tri = clipTriangleCorners(apexZ).map((p, i) => ({ clip: transform(P, p), attrs: [i] })) as unknown as Parameters<typeof clipTriangle>[0];
    const created = clipTriangle(tri, ['near']).filter((v) => v.created);
    const f = 1 / Math.tan((CLIP_SCENE.fovDeg * DEG) / 2);
    const splits = segs.filter((s) => s.from[0] === CLIP_SCENE.near || s.to[0] === CLIP_SCENE.near).flatMap((s) => [s.from, s.to]).filter((p) => Math.abs(p[0] - CLIP_SCENE.near) < 1e-9);
    expect(created.length).toBe(2);
    created.forEach((v) => {
      expect(v.clip[3]).toBeCloseTo(CLIP_SCENE.near, 9);
      expect(splits.some((p) => near(p[1], v.clip[1] / f, 1e-9))).toBe(true);
    });
  });
});

describe('scene 4: depth precision', () => {
  /** Smallest gap at distance d whose unrounded 24-bit depth differs by one step, found by bisection on the depth mapping itself. */
  function bisectedGap(d: number, n: number, f: number): number {
    const steps = 2 ** 24 - 1;
    const depth = (x: number) => ((ndcDepthAt(x, n, f) + 1) / 2) * steps;
    let lo = 0;
    let hi = d;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (depth(d + mid) - depth(d) >= 1) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  it('the smallest distinguishable gap matches d^2 / (near * 2^24) within 10% when far >> d >> near', () => {
    // d(window depth)/dd = (far)·near / ((far - near) d^2) · ... for far >> d >> near the slope of z_w is near/d^2 · (far/(far-near)) ≈ near / d^2,
    // so one step of 1/(2^24 - 1) in z_w is d^2 / (near · 2^24) of distance.
    for (const [d, n, f] of [[10, 0.01, 10000], [50, 0.01, 10000], [100, 0.1, 100000], [5, 0.001, 10000]]) {
      const expected = (d * d) / (n * 2 ** 24);
      expect(Math.abs(bisectedGap(d, n, f) / expected - 1)).toBeLessThan(0.1);
    }
  });

  it('a gap well above one step never z-fights and a gap far below it mostly does; the default z-fights in part', () => {
    const d = initialDepth();
    const base = depthScene(d);
    expect(base.gap).toBe(0.01);
    expect(base.resolution).toBeGreaterThan(base.gap);
    expect(base.tiedShare).toBeGreaterThan(0);
    expect(base.tiedShare).toBeLessThan(1);
    const wide = depthScene({ ...d, gapIndex: 6 });
    expect(wide.tiedShare).toBe(0);
    const pushed = depthScene({ ...d, nearIndex: 6 });
    expect(pushed.tiedShare).toBe(0);
    const tiny = depthScene({ ...d, nearIndex: 0, gapIndex: 0 });
    expect(tiny.tiedShare).toBeGreaterThan(0.9);
  });

  it('a pixel is tied exactly when both surfaces quantise to the same 24-bit value, checked against the closed form', () => {
    const s = initialDepth();
    const r = depthScene(s);
    const steps = 2 ** 24 - 1;
    const wd = (x: number) => ((((r.far + r.near) / (r.far - r.near)) - (2 * r.far * r.near) / ((r.far - r.near) * x)) + 1) / 2;
    for (let y = 0; y < DEPTH_IMAGE.h; y += 7) for (let x = 0; x < DEPTH_IMAGE.w; x += 7) {
      const d = surfaceDistance(s.distance, x, y);
      const same = Math.round(wd(d) * steps) === Math.round(wd(d + r.gap) * steps);
      expect(r.tied[y * DEPTH_IMAGE.w + x]).toBe(same ? 1 : 0);
    }
  });

  it('surfaces beyond the far plane are clipped, not counted as z-fighting', () => {
    const r = depthScene({ ...initialDepth(), farIndex: 0 });
    expect(r.far).toBe(10);
    expect(r.clippedShare).toBe(1);
    expect(r.tiedShare).toBe(0);
  });
});
