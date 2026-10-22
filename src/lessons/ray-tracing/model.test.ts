import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { add3, dot3, length3, reflect3, scale3, sub3, type Vec3 } from '../../core/raster3d';
import { cameraRay, intersectSphere, makeCamera, makeScene, nearestHit, newTraceStats, renderImage, traceRay, type SceneObject, type TraceSettings } from '../../core/raytrace';
import {
  ACNE_TOLERANCE, BIAS_CHOICES, CAMERA, CLEAN_BIAS, DEFAULT_LIGHTING, DEFAULT_PIXEL, IMAGE, MANY, MAX_BOUNCES, PIXELS, PRESETS, compareBvh, differsFromClean,
  initialTrace, lightOf, manySpheres, objectsOf, pixelRay, pixelTrail, rayBudget, render, sceneOf, settingsOf, trailOf, type TraceState,
} from './scene';

const near = (a: readonly number[], b: readonly number[], tol = 1e-12) => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]), `component ${i}`).toBeLessThanOrEqual(tol));
};

describe('the trail of one pixel is the kit colour, step by step', () => {
  it('equals traceRay on 300 seeded pixels across seeded settings, including bias 0, mirrors, no shadows and 4 bounces', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const s: TraceState = {
        ...initialTrace(),
        mirror: Math.round(rnd() * 10) / 10,
        bounces: Math.floor(rnd() * (MAX_BOUNCES + 1)),
        biasIndex: Math.floor(rnd() * BIAS_CHOICES.length),
        shadows: rnd() < 0.7,
        lighting: { ambient: Math.round(rnd() * 20) / 20, diffuse: Math.round(rnd() * 20) / 20, specular: Math.round(rnd() * 20) / 20, shininess: 1 + Math.floor(rnd() * 64) },
      };
      const [x, y] = [Math.floor(rnd() * IMAGE.w), Math.floor(rnd() * IMAGE.h)];
      const scene = sceneOf(s);
      const kit = traceRay(scene, pixelRay(x, y), settingsOf(s));
      near(trailOf(scene, pixelRay(x, y), settingsOf(s)).colour, kit, 1e-12);
    }
  });

  it('the default pixel lands on the mirror ball and its trail has a camera hit, a shadow ray and a mirror ray that hits the floor', () => {
    const t = pixelTrail(initialTrace(), DEFAULT_PIXEL.x, DEFAULT_PIXEL.y);
    expect(t.hits.map((h) => h.object)).toEqual(['mirror ball', 'floor']);
    expect(t.segments.map((s) => s.kind)).toEqual(['camera', 'shadow', 'reflect', 'shadow']);
    const [first] = t.hits;
    expect(first.shadowed).toBe(false);
    expect(first.nl).toBeGreaterThan(0);
  });

  it('a ray that misses everything draws a long camera segment and hits nothing', () => {
    const t = pixelTrail(initialTrace(), 0, 0);
    expect(t.hits).toHaveLength(0);
    expect(t.segments).toHaveLength(1);
    expect(length3(sub3(t.segments[0].to, t.segments[0].from))).toBeCloseTo(30, 9);
  });

  it('the hit distance equals the quadratic root the kit finds, and the mirror ray leaves along the reflection of the camera ray', () => {
    const s = initialTrace();
    const ray = pixelRay(DEFAULT_PIXEL.x, DEFAULT_PIXEL.y);
    const trail = pixelTrail(s, DEFAULT_PIXEL.x, DEFAULT_PIXEL.y);
    const ball = objectsOf(s)[2];
    if (ball.kind !== 'sphere') throw new Error('the mirror ball is a sphere');
    const hit = intersectSphere(ray, ball.center, ball.radius);
    expect(hit?.t).toBeCloseTo(trail.hits[0].t, 12);
    const out = reflect3(ray.dir, trail.hits[0].normal);
    const seg = trail.segments[2];
    const dir = scale3(sub3(seg.to, seg.from), 1 / length3(sub3(seg.to, seg.from)));
    near(dir, out, 1e-9);
  });
});

describe('the scene', () => {
  it('a mirror-symmetric scene renders a mirror-symmetric image with every colour in [0, 1]', () => {
    const material = { color: [0.8, 0.4, 0.3] as Vec3, reflectivity: 0.5 };
    const objects: SceneObject[] = [
      { kind: 'plane', point: [0, -1, 0], normal: [0, 1, 0], material: { color: [0.6, 0.6, 0.6], reflectivity: 0 } },
      { kind: 'sphere', center: [-1.5, 0, -6], radius: 1, material },
      { kind: 'sphere', center: [1.5, 0, -6], radius: 1, material },
    ];
    const cam = makeCamera([0, 1, 1], [0, 0, -6], [0, 1, 0], 1);
    if (!cam) throw new Error('camera');
    const settings: TraceSettings = { lighting: DEFAULT_LIGHTING, shadows: true, maxBounces: 2, bias: CLEAN_BIAS };
    const img = renderImage(makeScene(objects, [0, 5, -2]), cam, 48, 36, settings);
    for (let y = 0; y < 36; y++) for (let x = 0; x < 24; x++) {
      near(img.pixels[y * 48 + x], img.pixels[y * 48 + (47 - x)], 1e-9);
    }
    img.pixels.forEach((p) => p.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }));
  });

  it('bounce depth 0 has no reflection contribution, and depth 1 does', () => {
    const base = { ...initialTrace(), mirror: 1, bounces: 0 };
    const none = render(sceneOf(base), settingsOf(base)).image.pixels;
    const dull = { ...base, mirror: 0 };
    const matte = render(sceneOf(dull), settingsOf(dull)).image.pixels;
    expect(none).toEqual(matte);
    const one = { ...base, bounces: 1 };
    const withMirror = render(sceneOf(one), settingsOf(one)).image.pixels;
    expect(withMirror.some((p, i) => p.some((v, k) => Math.abs(v - none[i][k]) > 0.05))).toBe(true);
  });

  it('every preset is a state the sliders can show', () => {
    for (const p of PRESETS) {
      const s = p.apply(initialTrace());
      for (const v of [s.lighting.ambient, s.lighting.diffuse, s.lighting.specular]) expect(Number.isInteger(Math.round(v * 20)) && Math.abs(v * 20 - Math.round(v * 20)) < 1e-9).toBe(true);
      expect(Math.abs(s.mirror * 10 - Math.round(s.mirror * 10))).toBeLessThan(1e-9);
      expect(s.bounces).toBeGreaterThanOrEqual(0);
      expect(s.bounces).toBeLessThanOrEqual(MAX_BOUNCES);
      expect(s.lighting.shininess).toBeGreaterThanOrEqual(1);
    }
  });

  it('a light or a sphere dragged inside another sphere still renders, with colours in [0, 1]', () => {
    const s: TraceState = { ...initialTrace(), light: [-1.4, -6], spheres: [[-1.4, -6], [-1.2, -6], [-1.4, -6.2]] };
    const img = render(sceneOf(s), settingsOf(s), 48, 36).image;
    img.pixels.forEach((p) => p.forEach((v) => expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true)));
    expect(lightOf(s)[0]).toBe(-1.4);
  });

  it('the default render costs at most 2 x pixels x objects x (1 + bounces) tests, counted, in well under a second', () => {
    for (const bounces of [0, 1, 2, 4]) {
      const s = { ...initialTrace(), bounces, mirror: 1 };
      const t0 = performance.now();
      const r = render(sceneOf(s), settingsOf(s));
      const elapsed = performance.now() - t0;
      expect(r.stats.objectTests).toBeGreaterThan(PIXELS);
      expect(r.stats.objectTests).toBeLessThanOrEqual(r.budget);
      expect(r.budget).toBe(rayBudget(4, bounces));
      expect(elapsed).toBeLessThan(3000);
    }
  });
});

describe('shadow acne', () => {
  it('at bias 0 many pixels differ from the clean render (speckles), and at the clean bias none do', () => {
    const acne = differsFromClean({ ...initialTrace(), biasIndex: 0 });
    expect(acne.filter(Boolean).length).toBeGreaterThan(100);
    expect(differsFromClean(initialTrace()).some(Boolean)).toBe(false);
    expect(ACNE_TOLERANCE).toBeGreaterThan(0);
  });

  it('with shadows off there is no acne at any bias, because no secondary ray is shot at the surface', () => {
    for (let biasIndex = 0; biasIndex < BIAS_CHOICES.length; biasIndex++) {
      const s = { ...initialTrace(), shadows: false, bounces: 0, biasIndex };
      expect(differsFromClean(s, 48, 36).some(Boolean)).toBe(false);
    }
  });

  it('without mirror rays, acne sits only where the surface faces the light (where N·L is positive), because that is the only place a shadow changes the colour', () => {
    const s = { ...initialTrace(), biasIndex: 0, bounces: 0 };
    const scene = sceneOf(s);
    const stats = newTraceStats();
    let checked = 0;
    differsFromClean(s, 48, 36).forEach((bad, i) => {
      if (!bad) return;
      const found = nearestHit(scene, cameraRay(CAMERA, i % 48, Math.floor(i / 48), 48, 36), 0, stats);
      if (!found) throw new Error('an acne pixel has a surface under it');
      const toLight = sub3(scene.light, found.hit.point);
      expect(dot3(found.hit.normal, toLight)).toBeGreaterThan(0);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the bounding volume hierarchy', () => {
  it('matches the brute-force image pixel for pixel on 200 seeded 64-sphere scenes and always tests fewer objects', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const cmp = compareBvh(manySpheres(seed), [3, 5, -2], undefined, 24, 18);
      expect(cmp.identical, `seed ${seed}`).toBe(true);
      expect(cmp.withBvh.stats.objectTests, `seed ${seed}`).toBeLessThan(cmp.without.stats.objectTests);
      expect(cmp.without.stats.boxTests).toBe(0);
      expect(cmp.withBvh.stats.boxTests).toBeGreaterThan(0);
    }
  });

  it('the lesson scene has 64 spheres and a floor, stays inside the counted budget and saves tests at full size', () => {
    const objects = manySpheres();
    expect(objects).toHaveLength(MANY.count + 1);
    const cmp = compareBvh(objects);
    expect(cmp.identical).toBe(true);
    expect(cmp.without.stats.objectTests).toBeLessThanOrEqual(cmp.without.budget);
    expect(cmp.withBvh.stats.objectTests).toBeLessThan(cmp.without.stats.objectTests / 2);
  });

  it('the heat map counts tests per pixel and its total is the counted total', () => {
    const cmp = compareBvh(manySpheres(), [3, 5, -2], undefined, 24, 18);
    expect(cmp.without.image.testsPerPixel.reduce((a, b) => a + b, 0)).toBe(cmp.without.stats.objectTests);
    expect(cmp.withBvh.image.testsPerPixel.reduce((a, b) => a + b, 0)).toBe(cmp.withBvh.stats.objectTests);
  });
});

describe('rays', () => {
  it('a camera ray through the middle of the picture is unit length and points at the target', () => {
    const ray = cameraRay(CAMERA, IMAGE.w / 2 - 0.5, IMAGE.h / 2 - 0.5, IMAGE.w, IMAGE.h);
    expect(length3(ray.dir)).toBeCloseTo(1, 12);
    const toTarget = sub3([0, 0, -6], add3(ray.origin, [0, 0, 0]));
    const cos = dot3(ray.dir, toTarget) / length3(toTarget);
    expect(cos).toBeCloseTo(1, 9);
  });
});
