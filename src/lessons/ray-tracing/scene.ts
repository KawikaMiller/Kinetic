/**
 * ray-tracing: the scene, its settings and a per-pixel trail. Everything is core/raytrace; this file
 * only chooses the scene, wraps the render with counts, and records the segments of one pixel's rays
 * for the top-down diagram (a replica of traceRay that keeps its steps, tested against the kit).
 */
import { clamp01 } from '../../core/math';
import { mulberry32, randRange } from '../../core/random';
import { add3, length3, normalize3, reflect3, scale3, sub3, type Vec3 } from '../../core/raster3d';
import {
  BACKGROUND, cameraRay, lambert, makeCamera, makeScene, nearestHit, newTraceStats, occluded, phong, renderImage,
  type Camera, type Lighting, type Ray, type RenderedImage, type Scene, type SceneObject, type TraceSettings, type TraceStats,
} from '../../core/raytrace';

export const IMAGE = { w: 96, h: 72 } as const;
export const PIXELS = IMAGE.w * IMAGE.h;

export const DEFAULT_LIGHTING: Lighting = { ambient: 0.15, diffuse: 0.8, specular: 0.4, shininess: 24 };
export const LIGHT_HEIGHT = 5;
export const FLOOR_Y = -1;
/** A bias that keeps secondary rays off their own surface without visibly moving the shadows. */
export const CLEAN_BIAS = 1e-3;
export const BIAS_CHOICES = [0, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 5e-2] as const;
export const MAX_BOUNCES = 4;
export const DEFAULT_MIRROR = 0.6;

const EYE: Vec3 = [0, 1, 1];
const LOOK_AT: Vec3 = [0, 0, -6];
const FOV_Y = 1;
export const CAMERA: Camera = (() => {
  const c = makeCamera(EYE, LOOK_AT, [0, 1, 0], FOV_Y);
  if (!c) throw new RangeError('the lesson camera has a direction');
  return c;
})();

export interface SphereSpec {
  name: string;
  radius: number;
  colour: Vec3;
  /** Resting on the floor: the centre height follows from the radius. */
  start: readonly [number, number];
}
/** The three spheres of scenes 1 to 3. The second is the mirror ball (its reflectivity is a control). */
export const SPHERES: readonly SphereSpec[] = [
  { name: 'red sphere', radius: 1, colour: [0.9, 0.3, 0.2], start: [-1.4, -6] },
  { name: 'mirror ball', radius: 1, colour: [0.8, 0.8, 0.9], start: [1.4, -6] },
  { name: 'green sphere', radius: 0.6, colour: [0.3, 0.8, 0.4], start: [0, -4] },
];
const FLOOR_COLOUR: Vec3 = [0.6, 0.6, 0.6];
export const MIRROR_INDEX = 1;
export const LIGHT_START: readonly [number, number] = [3, -2];

export interface TraceState {
  /** Top-down (x, z) of each sphere in SPHERES. */
  spheres: readonly (readonly [number, number])[];
  light: readonly [number, number];
  lighting: Lighting;
  shadows: boolean;
  mirror: number;
  bounces: number;
  biasIndex: number;
  bvh: boolean;
}

export const initialTrace = (): TraceState => ({
  spheres: SPHERES.map((s) => s.start),
  light: LIGHT_START,
  lighting: DEFAULT_LIGHTING,
  shadows: true,
  mirror: DEFAULT_MIRROR,
  bounces: 1,
  biasIndex: BIAS_CHOICES.indexOf(CLEAN_BIAS),
  bvh: false,
});

export const OBJECT_NAMES = ['floor', ...SPHERES.map((s) => s.name)] as const;

/** The objects: the floor first, then the three spheres. */
export function objectsOf(s: TraceState): SceneObject[] {
  return [
    { kind: 'plane', point: [0, FLOOR_Y, 0], normal: [0, 1, 0], material: { color: FLOOR_COLOUR, reflectivity: 0 } },
    ...SPHERES.map((spec, i): SceneObject => ({
      kind: 'sphere',
      center: [s.spheres[i][0], FLOOR_Y + spec.radius, s.spheres[i][1]],
      radius: spec.radius,
      material: { color: spec.colour, reflectivity: i === MIRROR_INDEX ? s.mirror : 0 },
    })),
  ];
}

export const lightOf = (s: TraceState): Vec3 => [s.light[0], LIGHT_HEIGHT, s.light[1]];
export const settingsOf = (s: TraceState): TraceSettings => ({ lighting: s.lighting, shadows: s.shadows, maxBounces: s.bounces, bias: BIAS_CHOICES[s.biasIndex] });
export const sceneOf = (s: TraceState): Scene => makeScene(objectsOf(s), lightOf(s), { bvh: s.bvh });

export interface Render {
  image: RenderedImage;
  stats: TraceStats;
  /** The most the kit's bound allows: each camera or mirror ray is followed by at most one shadow ray. */
  budget: number;
}
export const rayBudget = (objects: number, bounces: number, pixels: number = PIXELS) => 2 * pixels * objects * (1 + bounces);

export function render(scene: Scene, settings: TraceSettings, w: number = IMAGE.w, h: number = IMAGE.h): Render {
  const stats = newTraceStats();
  const image = renderImage(scene, CAMERA, w, h, settings, stats);
  return { image, stats, budget: rayBudget(scene.spheres.length + scene.planes.length, settings.maxBounces, w * h) };
}

// ── the 64-sphere scene of scene 4 ──

export const MANY = { count: 64, seed: 64 } as const;
const MANY_AREA = { x: [-7, 7], z: [-16, -3], radius: [0.3, 0.6] } as const;

/** 64 spheres resting on the floor at seeded positions; none are mirrors, so a ray costs one shadow ray at most. */
export function manySpheres(seed: number = MANY.seed, count: number = MANY.count): SceneObject[] {
  const rnd = mulberry32(seed);
  const spheres = Array.from({ length: count }, (): SceneObject => {
    const radius = randRange(MANY_AREA.radius[0], MANY_AREA.radius[1], rnd);
    return {
      kind: 'sphere',
      center: [randRange(MANY_AREA.x[0], MANY_AREA.x[1], rnd), FLOOR_Y + radius, randRange(MANY_AREA.z[0], MANY_AREA.z[1], rnd)],
      radius,
      material: { color: [randRange(0.3, 0.95, rnd), randRange(0.3, 0.95, rnd), randRange(0.3, 0.95, rnd)], reflectivity: 0 },
    };
  });
  return [{ kind: 'plane', point: [0, FLOOR_Y, 0], normal: [0, 1, 0], material: { color: FLOOR_COLOUR, reflectivity: 0 } }, ...spheres];
}

export interface BvhComparison {
  withBvh: Render;
  without: Render;
  identical: boolean;
}
export const MANY_SETTINGS: TraceSettings = { lighting: DEFAULT_LIGHTING, shadows: true, maxBounces: 0, bias: CLEAN_BIAS };

/** The same scene rendered both ways, so the readout can show the saving and that the picture did not change. */
export function compareBvh(objects: SceneObject[], light: Vec3 = [3, LIGHT_HEIGHT, -2], settings: TraceSettings = MANY_SETTINGS, w: number = IMAGE.w, h: number = IMAGE.h): BvhComparison {
  const withBvh = render(makeScene(objects, light, { bvh: true }), settings, w, h);
  const without = render(makeScene(objects, light, { bvh: false }), settings, w, h);
  const same = withBvh.image.pixels.every((p, i) => p.every((v, k) => v === without.image.pixels[i][k]));
  return { withBvh, without, identical: same };
}

// ── one pixel's trail ──

export type SegmentKind = 'camera' | 'shadow' | 'reflect';
export interface Segment {
  from: Vec3;
  to: Vec3;
  kind: SegmentKind;
  /** A shadow ray that hit something before the light. */
  blocked?: boolean;
}
export interface TrailHit {
  /** 0 for the camera ray, 1 for the first mirror ray, ... */
  bounce: number;
  object: string;
  t: number;
  point: Vec3;
  normal: Vec3;
  /** The Lambert term toward the light from the (biased) start point. */
  nl: number;
  /** Null when shadows are off. */
  shadowed: boolean | null;
}
export interface Trail {
  hits: TrailHit[];
  segments: Segment[];
  colour: Vec3;
}

/** How far a ray that hits nothing is drawn. */
export const MISS_LENGTH = 30;
const WHITE: Vec3 = [1, 1, 1];
const clampColour = (c: Vec3): Vec3 => [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];

/** Follows one ray as traceRay does, keeping every segment and hit. The colour is computed in the same order as the kit's, and a test holds the two equal. */
export function trailOf(scene: Scene, ray: Ray, settings: TraceSettings, bounce = 0, trail: Trail = { hits: [], segments: [], colour: BACKGROUND }): Trail {
  const stats = newTraceStats();
  const kind: SegmentKind = bounce === 0 ? 'camera' : 'reflect';
  const found = nearestHit(scene, ray, 0, stats);
  if (!found) {
    trail.segments.push({ from: ray.origin, to: add3(ray.origin, scale3(ray.dir, MISS_LENGTH)), kind });
    trail.colour = BACKGROUND;
    return trail;
  }
  const { hit, object } = found;
  trail.segments.push({ from: ray.origin, to: hit.point, kind });
  const start = add3(hit.point, scale3(hit.normal, settings.bias));
  const toLightVec = sub3(scene.light, start);
  const toLight = normalize3(toLightVec) ?? hit.normal;
  const shadowed = settings.shadows && occluded(scene, { origin: start, dir: toLight }, 0, length3(toLightVec), stats);
  trail.segments.push({ from: start, to: scene.light, kind: 'shadow', blocked: shadowed });
  const viewer = normalize3(scale3(ray.dir, -1)) ?? hit.normal;
  const nl = lambert(hit.normal, toLight);
  trail.hits.push({
    bounce, object: nameOf(scene, object), t: hit.t, point: hit.point, normal: hit.normal, nl, shadowed: settings.shadows ? shadowed : null,
  });
  const albedo = object.material.color;
  let colour = scale3(albedo, settings.lighting.ambient);
  if (!shadowed) {
    colour = add3(colour, scale3(albedo, settings.lighting.diffuse * nl));
    colour = add3(colour, scale3(WHITE, settings.lighting.specular * phong(hit.normal, toLight, viewer, settings.lighting.shininess)));
  }
  const mirror = object.material.reflectivity;
  if (mirror > 0 && bounce < settings.maxBounces) {
    const dir = normalize3(reflect3(ray.dir, hit.normal));
    if (dir) {
      const inner = trailOf(scene, { origin: start, dir }, settings, bounce + 1, trail);
      colour = add3(scale3(colour, 1 - mirror), scale3(inner.colour, mirror));
    }
  }
  trail.colour = clampColour(colour);
  return trail;
}

function nameOf(scene: Scene, object: SceneObject): string {
  if (object.kind === 'plane') return OBJECT_NAMES[0];
  const i = scene.spheres.findIndex((sphere) => sphere === object);
  return SPHERES[i]?.name ?? `sphere ${i + 1}`;
}

// ── pixels, presets, acne ──

/** The pixel scene 1 opens on: it lies on the mirror ball, so its trail has a mirror ray. */
export const DEFAULT_PIXEL = { x: 56, y: 36 } as const;

export const pixelRay = (x: number, y: number, w: number = IMAGE.w, h: number = IMAGE.h): Ray => cameraRay(CAMERA, x, y, w, h);

export const pixelTrail = (s: TraceState, x: number, y: number): Trail => trailOf(sceneOf(s), pixelRay(x, y), settingsOf(s));

/** Largest channel difference that still counts as the same colour when pixels are compared with a clean render. */
export const ACNE_TOLERANCE = 0.02;

/** Pixels whose colour differs from the render with a clean bias: the speckles of acne at bias 0, or the creeping shadows of a large bias. */
export function differsFromClean(s: TraceState, w: number = IMAGE.w, h: number = IMAGE.h): boolean[] {
  const scene = sceneOf(s);
  const here = render(scene, settingsOf(s), w, h).image.pixels;
  const clean = render(scene, { ...settingsOf(s), bias: CLEAN_BIAS }, w, h).image.pixels;
  return here.map((p, i) => p.some((v, k) => Math.abs(v - clean[i][k]) > ACNE_TOLERANCE));
}

export interface Preset {
  id: string;
  label: string;
  apply: (s: TraceState) => TraceState;
}
export const PRESETS: readonly Preset[] = [
  { id: 'mirror', label: 'mirror ball', apply: (s) => ({ ...s, mirror: 1, bounces: 2 }) },
  { id: 'shadows', label: 'shadows only', apply: (s) => ({ ...s, lighting: { ambient: 0, diffuse: 1, specular: 0, shininess: s.lighting.shininess }, shadows: true, mirror: 0, bounces: 0 }) },
  { id: 'flat', label: 'no reflections (depth 0)', apply: (s) => ({ ...s, bounces: 0 }) },
];

/** Drags the light (handle 0) or a sphere (handle 1 and up) to a plot position; the plot's y is -z. */
export function moveBody(s: TraceState, index: number, plot: readonly [number, number]): TraceState {
  const spot = [plot[0], -plot[1]] as const;
  if (index === 0) return { ...s, light: spot };
  return { ...s, spheres: s.spheres.map((p, i) => (i === index - 1 ? spot : p)) };
}
