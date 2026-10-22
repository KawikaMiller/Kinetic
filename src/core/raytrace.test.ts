import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { add3, cross3, dot3, inverse4, length3, lookAt, normalize3, perspective, scale3, sub3, unproject, type Vec3 } from './raster3d';
import {
  buildBvh, cameraRay, intersectBox, intersectPlane, intersectSphere, intersectTriangle, lambert, makeCamera, makeScene, nearestHit, newTraceStats, occluded, phong, renderImage,
  sphereBox, traceRay, type Lighting, type Material, type Ray, type SceneObject, type TraceSettings,
} from './raytrace';
import { matMul } from './vec';

const near = (a: readonly number[], b: readonly number[], tol = 1e-9) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));
};

const matte = (color: Vec3, reflectivity = 0): Material => ({ color, reflectivity });
const LIGHTING: Lighting = { ambient: 0.15, diffuse: 0.8, specular: 0.4, shininess: 24 };
const SETTINGS: TraceSettings = { lighting: LIGHTING, shadows: true, maxBounces: 2, bias: 1e-4 };

const FLOOR: SceneObject = { kind: 'plane', point: [0, -1, 0], normal: [0, 1, 0], material: matte([0.6, 0.6, 0.6]) };
const defaultObjects = (): SceneObject[] => [
  FLOOR,
  { kind: 'sphere', center: [-1.6, 0, -6], radius: 1, material: matte([0.9, 0.2, 0.2]) },
  { kind: 'sphere', center: [0, 0, -7], radius: 1, material: matte([0.2, 0.9, 0.3], 0.5) },
  { kind: 'sphere', center: [1.6, 0, -6], radius: 1, material: matte([0.2, 0.4, 0.9]) },
];
const LIGHT: Vec3 = [3, 5, -2];
const CAMERA = makeCamera([0, 1, 1], [0, 0, -6], [0, 1, 0], 1)!;

describe('ray-sphere', () => {
  it('hand case: from the origin along -z at a unit sphere centred (0, 0, -5), t = 4 and the normal is +z', () => {
    const hit = intersectSphere({ origin: [0, 0, 0], dir: [0, 0, -1] }, [0, 0, -5], 1)!;
    expect(hit.t).toBe(4);
    near(hit.point, [0, 0, -4]);
    near(hit.normal, [0, 0, 1]);
    expect(hit.inside).toBe(false);
  });

  it('tangent ray hits once, a miss and a sphere behind the ray give null, and a ray from inside hits the far side with an inward normal', () => {
    const tangent = intersectSphere({ origin: [1, 0, 5], dir: [0, 0, -1] }, [0, 0, 0], 1)!;
    expect(tangent.t).toBe(5);
    near(tangent.point, [1, 0, 0]);
    expect(intersectSphere({ origin: [1.01, 0, 5], dir: [0, 0, -1] }, [0, 0, 0], 1)).toBeNull();
    expect(intersectSphere({ origin: [0, 0, 5], dir: [0, 0, 1] }, [0, 0, 0], 1)).toBeNull();
    const inside = intersectSphere({ origin: [0, 0, 0], dir: [1, 0, 0] }, [0, 0, 0], 2)!;
    expect(inside.t).toBe(2);
    expect(inside.inside).toBe(true);
    near(inside.normal, [-1, 0, 0]);
  });

  it('t equals an independent bisection root of |o + tÂ·d - c|Â² - rÂ² on 1000 seeded rays (hit or miss agree too)', () => {
    const rnd = mulberry32(1);
    const f = (ray: Ray, c: Vec3, r: number, t: number) => {
      const p = add3(ray.origin, scale3(ray.dir, t));
      return dot3(sub3(p, c), sub3(p, c)) - r * r;
    };
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      const origin: Vec3 = [rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 10 - 5];
      const center: Vec3 = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
      const radius = 0.3 + rnd() * 1.5;
      // Aim near the sphere (off by up to 1.5 radii) so most rays hit and the rest graze or miss.
      const aim = add3(center, [(rnd() - 0.5) * 3 * radius, (rnd() - 0.5) * 3 * radius, (rnd() - 0.5) * 3 * radius]);
      const dir = normalize3(sub3(aim, origin))!;
      const ray = { origin, dir };
      const analytic = intersectSphere(ray, center, radius);
      // Scan for the first sign change of f along the ray, then bisect it.
      let lo = 0;
      let found: number | null = null;
      const startSign = Math.sign(f(ray, center, radius, 0));
      for (let t = 0.01; t < 40 && found === null; t += 0.01) {
        if (Math.sign(f(ray, center, radius, t)) !== startSign) {
          let a = lo;
          let b = t;
          for (let k = 0; k < 60; k++) {
            const mid = (a + b) / 2;
            if (Math.sign(f(ray, center, radius, mid)) === startSign) a = mid;
            else b = mid;
          }
          found = (a + b) / 2;
        }
        lo = t;
      }
      if (found === null) {
        if (analytic) expect(analytic.t).toBeGreaterThan(39.9);
        else expect(analytic).toBeNull();
      } else {
        hits++;
        expect(analytic).not.toBeNull();
        expect(Math.abs(analytic!.t - found)).toBeLessThan(1e-9);
      }
    }
    expect(hits).toBeGreaterThan(100);
  });
});

describe('ray-plane and ray-triangle', () => {
  it('plane hand cases: straight down onto y = 0 gives t = 5 with a +y normal; from below the normal flips; parallel and behind give null', () => {
    const down = intersectPlane({ origin: [0, 5, 0], dir: [0, -1, 0] }, [0, 0, 0], [0, 1, 0])!;
    expect(down.t).toBe(5);
    near(down.normal, [0, 1, 0]);
    near(intersectPlane({ origin: [0, -5, 0], dir: [0, 1, 0] }, [0, 0, 0], [0, 1, 0])!.normal, [0, -1, 0]);
    expect(intersectPlane({ origin: [0, 5, 0], dir: [1, 0, 0] }, [0, 0, 0], [0, 1, 0])).toBeNull();
    expect(intersectPlane({ origin: [0, 5, 0], dir: [0, 1, 0] }, [0, 0, 0], [0, 1, 0])).toBeNull();
  });

  it('triangle hand case: (0.25, 0.25, 1) straight down hits (0,0,0),(1,0,0),(0,1,0) at t = 1 with weights u = v = 0.25', () => {
    const hit = intersectTriangle({ origin: [0.25, 0.25, 1], dir: [0, 0, -1] }, [0, 0, 0], [1, 0, 0], [0, 1, 0])!;
    expect(hit.t).toBe(1);
    expect(hit.u).toBe(0.25);
    expect(hit.v).toBe(0.25);
    near(hit.normal, [0, 0, 1]);
    expect(intersectTriangle({ origin: [0.8, 0.8, 1], dir: [0, 0, -1] }, [0, 0, 0], [1, 0, 0], [0, 1, 0])).toBeNull();
  });

  it('matches plane intersection plus an area-ratio inside test on 1000 seeded rays and triangles', () => {
    const rnd = mulberry32(2);
    const r3 = (s: number): Vec3 => [(rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s];
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      const [a, b, c] = [r3(6), r3(6), r3(6)];
      const origin = r3(10);
      const aim = add3(scale3(add3(add3(a, b), c), 1 / 3), r3(3));
      const ray = { origin, dir: normalize3(sub3(aim, origin))! };
      const got = intersectTriangle(ray, a, b, c);
      const normal = cross3(sub3(b, a), sub3(c, a));
      const plane = length3(normal) > 1e-6 ? intersectPlane(ray, a, normal) : null;
      if (!plane) {
        expect(got).toBeNull();
        continue;
      }
      const area = dot3(normal, normal);
      const wa = dot3(cross3(sub3(b, plane.point), sub3(c, plane.point)), normal) / area;
      const wb = dot3(cross3(sub3(c, plane.point), sub3(a, plane.point)), normal) / area;
      const wc = 1 - wa - wb;
      const inside = wa > 1e-9 && wb > 1e-9 && wc > 1e-9;
      const outside = wa < -1e-9 || wb < -1e-9 || wc < -1e-9;
      if (inside) {
        hits++;
        expect(got).not.toBeNull();
        expect(Math.abs(got!.t - plane.t)).toBeLessThan(1e-9);
        near([got!.u, got!.v], [wb, wc], 1e-9);
      } else if (outside) {
        expect(got).toBeNull();
      }
    }
    expect(hits).toBeGreaterThan(30);
  });
});

describe('shading terms', () => {
  it('Lambert: facing the light 1, at 60 degrees 0.5, behind the surface 0', () => {
    expect(lambert([0, 1, 0], [0, 1, 0])).toBe(1);
    expect(lambert([0, 1, 0], [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 0])).toBeCloseTo(0.5, 12);
    expect(lambert([0, 1, 0], [0, -1, 0])).toBe(0);
  });

  it('Phong: viewer along the mirror direction gives 1; 30 degrees off with shininess 2 gives cos(30)^2 = 0.75; a light behind gives 0', () => {
    const n: Vec3 = [0, 1, 0];
    const l = normalize3([1, 1, 0])!;
    const mirror = normalize3([-1, 1, 0])!;
    expect(phong(n, l, mirror, 8)).toBeCloseTo(1, 12);
    const off = [Math.cos(Math.PI / 4 + Math.PI / 6) * -1, Math.sin(Math.PI / 4 + Math.PI / 6), 0] as const;
    expect(phong(n, l, off, 2)).toBeCloseTo(0.75, 12);
    expect(phong(n, [0, -1, 0], mirror, 8)).toBe(0);
  });
});

describe('boxes and the BVH', () => {
  it('slab test hand cases: entry distance, inside gives 0, parallel outside misses, a box beyond tMax is skipped', () => {
    const box = { min: [-1, -1, -3] as Vec3, max: [1, 1, -1] as Vec3 };
    expect(intersectBox({ origin: [0, 0, 5], dir: [0, 0, -1] }, box)).toBe(6);
    expect(intersectBox({ origin: [0, 0, -2], dir: [0, 0, -1] }, box)).toBe(0);
    expect(intersectBox({ origin: [3, 0, 5], dir: [0, 0, -1] }, box)).toBeNull();
    expect(intersectBox({ origin: [0, 0, 5], dir: [0, 0, -1] }, box, 5)).toBeNull();
  });

  const randomSpheres = (rnd: () => number, n: number): SceneObject[] =>
    Array.from({ length: n }, () => ({
      kind: 'sphere' as const,
      center: [rnd() * 14 - 7, rnd() * 6 - 3, -4 - rnd() * 14] as Vec3,
      radius: 0.3 + rnd() * 0.7,
      material: matte([rnd(), rnd(), rnd()], rnd() < 0.3 ? 0.4 : 0),
    }));

  it('the tree holds every sphere once and every parent box contains its children', () => {
    const rnd = mulberry32(3);
    const spheres = randomSpheres(rnd, 64);
    const root = buildBvh(spheres.map((s) => (s.kind === 'sphere' ? sphereBox(s.center, s.radius) : sphereBox([0, 0, 0], 0))))!;
    const seen: number[] = [];
    const walk = (node: NonNullable<typeof root>) => {
      if (node.items) seen.push(...node.items);
      for (const child of [node.left, node.right]) {
        if (!child) continue;
        node.box.min.forEach((v, k) => expect(v).toBeLessThanOrEqual(child.box.min[k]));
        node.box.max.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(child.box.max[k]));
        walk(child);
      }
    };
    walk(root);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(buildBvh([])).toBeNull();
  });

  it('nearestHit and occluded agree between the BVH and brute force on 2000 seeded rays', () => {
    const rnd = mulberry32(4);
    const objects = randomSpheres(rnd, 64);
    const brute = makeScene(objects, LIGHT);
    const tree = makeScene(objects, LIGHT, { bvh: true });
    for (let i = 0; i < 2000; i++) {
      const ray = { origin: [rnd() * 4 - 2, rnd() * 2, 2] as Vec3, dir: normalize3([rnd() - 0.5, rnd() * 0.3 - 0.15, -1])! };
      const a = nearestHit(brute, ray, 0, newTraceStats());
      const b = nearestHit(tree, ray, 0, newTraceStats());
      expect(b?.object).toBe(a?.object);
      expect(b?.hit.t).toBe(a?.hit.t);
      const limit = 5 + rnd() * 20;
      expect(occluded(tree, ray, 0, limit, newTraceStats())).toBe(occluded(brute, ray, 0, limit, newTraceStats()));
    }
  });

  it('the BVH image equals the brute-force image pixel for pixel and runs fewer object tests, on 200 seeded 64-sphere scenes', () => {
    const rnd = mulberry32(5);
    const camera = makeCamera([0, 1, 4], [0, 0, -12], [0, 1, 0], 0.9)!;
    for (let s = 0; s < 200; s++) {
      const objects = [FLOOR, ...randomSpheres(rnd, 64)];
      const brute = newTraceStats();
      const tree = newTraceStats();
      const a = renderImage(makeScene(objects, LIGHT), camera, 12, 9, SETTINGS, brute);
      const b = renderImage(makeScene(objects, LIGHT, { bvh: true }), camera, 12, 9, SETTINGS, tree);
      expect(b.pixels).toEqual(a.pixels);
      expect(tree.objectTests).toBeLessThan(brute.objectTests);
      expect(b.testsPerPixel.reduce((x, y) => x + y, 0)).toBe(tree.objectTests);
    }
  });
});

describe('camera', () => {
  it('rays match the inverse of projectionÂ·view unprojected at the far plane, for several pixels', () => {
    const W = 40;
    const H = 30;
    const eye: Vec3 = [1, 2, 6];
    const camera = makeCamera(eye, [0, 0, 0], [0, 1, 0], 0.8)!;
    const vp = matMul(perspective(0.8, W / H, 0.1, 100), lookAt(eye, [0, 0, 0], [0, 1, 0])!);
    const inv = inverse4(vp)!;
    for (const [px, py] of [[0, 0], [39, 29], [20, 15], [5, 22], [33, 3]]) {
      const ndc: Vec3 = [((px + 0.5) / W) * 2 - 1, 1 - ((py + 0.5) / H) * 2, 1];
      const expected = normalize3(sub3(unproject(inv, ndc)!, eye))!;
      near(cameraRay(camera, px, py, W, H).dir, expected, 1e-9);
    }
  });

  it('refuses a camera with no direction', () => {
    expect(makeCamera([0, 0, 0], [0, 0, 0], [0, 1, 0], 1)).toBeNull();
    expect(makeCamera([0, 0, 0], [0, 3, 0], [0, 1, 0], 1)).toBeNull();
  });
});

describe('tracing an image', () => {
  const W = 24;
  const H = 18;

  it('a mirror-symmetric scene renders a mirror-symmetric image, and every colour is in [0, 1]', () => {
    const objects: SceneObject[] = [
      FLOOR,
      { kind: 'sphere', center: [-1.5, 0, -6], radius: 1, material: matte([0.9, 0.3, 0.2], 0.4) },
      { kind: 'sphere', center: [1.5, 0, -6], radius: 1, material: matte([0.9, 0.3, 0.2], 0.4) },
      { kind: 'sphere', center: [0, 0.2, -9], radius: 1.2, material: matte([0.3, 0.8, 0.5]) },
    ];
    const camera = makeCamera([0, 1, 1], [0, 0, -6], [0, 1, 0], 1)!;
    const bright: TraceSettings = { ...SETTINGS, lighting: { ambient: 1, diffuse: 1, specular: 1, shininess: 8 } };
    for (const settings of [SETTINGS, bright]) {
      const { pixels } = renderImage(makeScene(objects, [0, 6, -1]), camera, W, H, settings);
      pixels.forEach((c) => c.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) near(pixels[y * W + x], pixels[y * W + (W - 1 - x)], 1e-9);
    }
  });

  it('bounce depth 0 has no reflection contribution: it equals the same scene with every reflectivity set to 0', () => {
    const mirrored = defaultObjects();
    const matted = mirrored.map((o) => ({ ...o, material: { ...o.material, reflectivity: 0 } }));
    const none = { ...SETTINGS, maxBounces: 0 };
    const a = renderImage(makeScene(mirrored, LIGHT), CAMERA, W, H, none).pixels;
    const b = renderImage(makeScene(matted, LIGHT), CAMERA, W, H, none).pixels;
    expect(a).toEqual(b);
    const withBounces = renderImage(makeScene(mirrored, LIGHT), CAMERA, W, H, SETTINGS).pixels;
    expect(withBounces).not.toEqual(a);
  });

  it('shadows darken: with shadows on, no pixel is brighter than with them off, and some are darker', () => {
    const scene = makeScene(defaultObjects(), LIGHT);
    const on = renderImage(scene, CAMERA, W, H, { ...SETTINGS, maxBounces: 0 }).pixels;
    const off = renderImage(scene, CAMERA, W, H, { ...SETTINGS, maxBounces: 0, shadows: false }).pixels;
    let darker = 0;
    on.forEach((c, i) => {
      c.forEach((v, k) => expect(v).toBeLessThanOrEqual(off[i][k] + 1e-12));
      if (c.some((v, k) => v < off[i][k] - 1e-9)) darker++;
    });
    expect(darker).toBeGreaterThan(0);
  });

  it('shadow acne: with bias 0 surfaces shadow themselves in places the biased image keeps lit; a small bias removes it', () => {
    const scene = makeScene(defaultObjects(), LIGHT);
    const base = { ...SETTINGS, maxBounces: 0 };
    const clean = renderImage(scene, CAMERA, 96, 72, base).pixels;
    const noBias = renderImage(scene, CAMERA, 96, 72, { ...base, bias: 0 }).pixels;
    const acne = noBias.filter((c, i) => c.some((v, k) => v < clean[i][k] - 1e-9)).length;
    expect(acne).toBeGreaterThan(10);
    const tiny = renderImage(scene, CAMERA, 96, 72, { ...base, bias: 1e-6 }).pixels;
    expect(tiny.filter((c, i) => c.some((v, k) => Math.abs(v - clean[i][k]) > 1e-3))).toHaveLength(0);
  });

  it('reflection, hand-worked: a mirror ball hit head-on sends the ray straight back to a green wall behind the camera, so it shows the wall colour', () => {
    const objects: SceneObject[] = [
      { kind: 'sphere', center: [0, 0, -5], radius: 1, material: matte([1, 1, 1], 1) },
      { kind: 'plane', point: [0, 0, 20], normal: [0, 0, -1], material: matte([0, 1, 0]) },
    ];
    // The light sits on the axis at z = 3, so at the wall N·L = 1 and the mirror term is 1:
    // green·(ambient 0.15 + diffuse 0.8) + 0.4 white = (0.4, 1.35, 0.4), clamped to (0.4, 1, 0.4).
    const scene = makeScene(objects, [0, 0, 3]);
    const ray = { origin: [0, 0, 0] as Vec3, dir: [0, 0, -1] as Vec3 };
    near(traceRay(scene, ray, { ...SETTINGS, maxBounces: 1 }), [0.4, 1, 0.4], 1e-9);
    // With no bounce the ball shows only itself: white·0.95 + 0.4 clamps to white.
    near(traceRay(scene, ray, { ...SETTINGS, maxBounces: 0 }), [1, 1, 1], 1e-9);
  });

  it('the default render stays within the counted budget and well under a loose wall-clock ceiling', () => {
    const objects = defaultObjects();
    const scene = makeScene(objects, LIGHT);
    const stats = newTraceStats();
    const started = performance.now();
    renderImage(scene, CAMERA, 96, 72, SETTINGS, stats);
    const elapsed = performance.now() - started;
    // Each camera or mirror ray is followed by at most one shadow ray, hence the factor 2.
    expect(stats.objectTests).toBeLessThanOrEqual(2 * 96 * 72 * objects.length * (1 + SETTINGS.maxBounces));
    expect(stats.objectTests).toBeGreaterThan(96 * 72);
    expect(elapsed).toBeLessThan(3000);
  });
});
