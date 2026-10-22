/**
 * A small ray tracer: rays against spheres, planes and triangles, Lambert and Phong shading,
 * shadow and mirror rays with a bias, a median-split bounding volume hierarchy, and a counted
 * image renderer. Used by ray-tracing; vec3 maths is core/raster3d. Pure and deterministic.
 *
 * Every intersection returns the normal facing against the ray (normal·dir <= 0), so shading
 * never has to flip it. Counts are real: `TraceStats` is incremented where a test runs.
 */
import { add3, cross3, dot3, length3, lookAt, normalize3, reflect3, scale3, sub3, type Vec3 } from './raster3d';

export interface Ray {
  origin: Vec3;
  /** Need not be a unit vector for the intersection routines; shading and `makeCamera` rays are unit. */
  dir: Vec3;
}

export interface Hit {
  /** Distance along the ray in units of `dir`. */
  t: number;
  point: Vec3;
  /** Unit, facing against the ray. */
  normal: Vec3;
  /** The ray started inside the sphere (the hit is its far side and the normal points inward). */
  inside?: boolean;
}

const pointAt = (ray: Ray, t: number): Vec3 => add3(ray.origin, scale3(ray.dir, t));
const facing = (n: Vec3, dir: Vec3): Vec3 => (dot3(n, dir) > 0 ? scale3(n, -1) : n);

/** The nearest root of |o + t·d - c|² = r² beyond `tMin`. Tangent rays (discriminant 0) hit once; a ray starting inside hits the far side. */
export function intersectSphere(ray: Ray, center: Vec3, radius: number, tMin = 0): Hit | null {
  const a = dot3(ray.dir, ray.dir);
  const oc = sub3(ray.origin, center);
  const halfB = dot3(oc, ray.dir);
  const disc = halfB * halfB - a * (dot3(oc, oc) - radius * radius);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const near = (-halfB - root) / a;
  const far = (-halfB + root) / a;
  const inside = near <= tMin;
  const t = inside ? far : near;
  if (t <= tMin) return null;
  const point = pointAt(ray, t);
  const outward = scale3(sub3(point, center), 1 / radius);
  return { t, point, normal: inside ? scale3(outward, -1) : outward, inside };
}

/** The ray against the plane through `point` with `normal`; null when parallel or behind. */
export function intersectPlane(ray: Ray, point: Vec3, normal: Vec3, tMin = 0): Hit | null {
  const denom = dot3(normal, ray.dir);
  if (denom === 0) return null;
  const t = dot3(sub3(point, ray.origin), normal) / denom;
  if (t <= tMin) return null;
  const unit = normalize3(normal);
  return unit ? { t, point: pointAt(ray, t), normal: facing(unit, ray.dir) } : null;
}

export interface TriangleHit extends Hit {
  /** Weights of vertices b and c (a's weight is 1 - u - v). */
  u: number;
  v: number;
}

/** Moller-Trumbore ray-triangle intersection (two-sided). */
export function intersectTriangle(ray: Ray, a: Vec3, b: Vec3, c: Vec3, tMin = 0): TriangleHit | null {
  const e1 = sub3(b, a);
  const e2 = sub3(c, a);
  const p = cross3(ray.dir, e2);
  const det = dot3(e1, p);
  if (det === 0) return null;
  const s = sub3(ray.origin, a);
  const u = dot3(s, p) / det;
  if (u < 0 || u > 1) return null;
  const q = cross3(s, e1);
  const v = dot3(ray.dir, q) / det;
  if (v < 0 || u + v > 1) return null;
  const t = dot3(e2, q) / det;
  if (t <= tMin) return null;
  const normal = normalize3(cross3(e1, e2));
  return normal ? { t, point: pointAt(ray, t), normal: facing(normal, ray.dir), u, v } : null;
}

// ── shading ──

/** The Lambert term: max(0, N·L) for unit vectors. */
export const lambert = (normal: Vec3, toLight: Vec3) => Math.max(0, dot3(normal, toLight));

/** The Phong term: max(0, R·V)^shininess with R the light direction mirrored about the normal; 0 when the light is behind the surface. */
export function phong(normal: Vec3, toLight: Vec3, toViewer: Vec3, shininess: number): number {
  if (dot3(normal, toLight) <= 0) return 0;
  const r = reflect3(scale3(toLight, -1), normal);
  return Math.max(0, dot3(r, toViewer)) ** shininess;
}

export interface Lighting {
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
}

export interface Material {
  color: Vec3;
  /** 0 matte to 1 mirror. */
  reflectivity: number;
}

export interface SphereObject {
  kind: 'sphere';
  center: Vec3;
  radius: number;
  material: Material;
}
export interface PlaneObject {
  kind: 'plane';
  point: Vec3;
  normal: Vec3;
  material: Material;
}
export type SceneObject = SphereObject | PlaneObject;

// ── bounding volume hierarchy ──

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export interface BvhNode {
  box: Aabb;
  /** Leaf: indices into the list the tree was built from. */
  items?: number[];
  left?: BvhNode;
  right?: BvhNode;
}

const unionBox = (a: Aabb, b: Aabb): Aabb => ({
  min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
  max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
});
const centroid = (b: Aabb): Vec3 => scale3(add3(b.min, b.max), 0.5);
export const sphereBox = (center: Vec3, radius: number): Aabb => ({ min: sub3(center, [radius, radius, radius]), max: add3(center, [radius, radius, radius]) });

/** A median-split tree over boxes: split on the longest axis of the centroids at the median, one item per leaf. */
export function buildBvh(boxes: readonly Aabb[]): BvhNode | null {
  const build = (items: number[]): BvhNode => {
    const box = items.map((i) => boxes[i]).reduce(unionBox);
    if (items.length === 1) return { box, items };
    const cs = items.map((i) => centroid(boxes[i]));
    const spread = [0, 1, 2].map((k) => Math.max(...cs.map((c) => c[k])) - Math.min(...cs.map((c) => c[k])));
    const axis = spread.indexOf(Math.max(...spread));
    const sorted = [...items].sort((a, b) => centroid(boxes[a])[axis] - centroid(boxes[b])[axis] || a - b);
    const mid = sorted.length >> 1;
    return { box, left: build(sorted.slice(0, mid)), right: build(sorted.slice(mid)) };
  };
  return boxes.length === 0 ? null : build(boxes.map((_, i) => i));
}

/** Slab test: the distance where the ray enters the box (0 if it starts inside), or null for a miss or a box wholly beyond `tMax`. */
export function intersectBox(ray: Ray, box: Aabb, tMax = Infinity): number | null {
  let near = 0;
  let far = tMax;
  for (let k = 0; k < 3; k++) {
    if (ray.dir[k] === 0) {
      if (ray.origin[k] < box.min[k] || ray.origin[k] > box.max[k]) return null;
      continue;
    }
    const t1 = (box.min[k] - ray.origin[k]) / ray.dir[k];
    const t2 = (box.max[k] - ray.origin[k]) / ray.dir[k];
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return null;
  }
  return near;
}

// ── scene and tracing ──

export interface TraceStats {
  /** Ray-object intersection tests run (the cost a BVH cuts). */
  objectTests: number;
  /** Ray-box tests run walking the BVH. */
  boxTests: number;
}
export const newTraceStats = (): TraceStats => ({ objectTests: 0, boxTests: 0 });

export interface Scene {
  spheres: readonly SphereObject[];
  /** Planes are unbounded, so they never go in the BVH and are always tested. */
  planes: readonly PlaneObject[];
  light: Vec3;
  bvh: BvhNode | null;
}

/** A scene; with `bvh` the spheres are put in a tree, without it every ray tests every sphere. */
export function makeScene(objects: readonly SceneObject[], light: Vec3, { bvh = false }: { bvh?: boolean } = {}): Scene {
  const spheres = objects.filter((o): o is SphereObject => o.kind === 'sphere');
  const planes = objects.filter((o): o is PlaneObject => o.kind === 'plane');
  return { spheres, planes, light, bvh: bvh ? buildBvh(spheres.map((s) => sphereBox(s.center, s.radius))) : null };
}

export interface SceneHit {
  hit: Hit;
  object: SceneObject;
}

const hitSphere = (s: SphereObject, ray: Ray, tMin: number, stats: TraceStats): Hit | null => {
  stats.objectTests++;
  return intersectSphere(ray, s.center, s.radius, tMin);
};
const hitPlane = (p: PlaneObject, ray: Ray, tMin: number, stats: TraceStats): Hit | null => {
  stats.objectTests++;
  return intersectPlane(ray, p.point, p.normal, tMin);
};

/** The nearest hit beyond `tMin` (and before `tMax`), or null. */
export function nearestHit(scene: Scene, ray: Ray, tMin: number, stats: TraceStats, tMax = Infinity): SceneHit | null {
  const nearest: { found: SceneHit | null } = { found: null };
  const limit = () => nearest.found?.hit.t ?? tMax;
  const consider = (hit: Hit | null, object: SceneObject) => {
    if (hit && hit.t < limit()) nearest.found = { hit, object };
  };
  scene.planes.forEach((p) => consider(hitPlane(p, ray, tMin, stats), p));
  const walk = (node: BvhNode) => {
    stats.boxTests++;
    if (intersectBox(ray, node.box, limit()) === null) return;
    if (node.items) node.items.forEach((i) => consider(hitSphere(scene.spheres[i], ray, tMin, stats), scene.spheres[i]));
    else if (node.left && node.right) [node.left, node.right].forEach(walk);
  };
  if (scene.bvh) walk(scene.bvh);
  else scene.spheres.forEach((s) => consider(hitSphere(s, ray, tMin, stats), s));
  return nearest.found;
}

/** Whether anything blocks the ray between `tMin` and `tMax` (a shadow ray); stops at the first blocker. */
export function occluded(scene: Scene, ray: Ray, tMin: number, tMax: number, stats: TraceStats): boolean {
  if (scene.planes.some((p) => (hitPlane(p, ray, tMin, stats)?.t ?? Infinity) < tMax)) return true;
  const walk = (node: BvhNode): boolean => {
    stats.boxTests++;
    if (intersectBox(ray, node.box, tMax) === null) return false;
    if (node.items) return node.items.some((i) => (hitSphere(scene.spheres[i], ray, tMin, stats)?.t ?? Infinity) < tMax);
    return !!node.left && !!node.right && (walk(node.left) || walk(node.right));
  };
  return scene.bvh ? walk(scene.bvh) : scene.spheres.some((s) => (hitSphere(s, ray, tMin, stats)?.t ?? Infinity) < tMax);
}

export interface TraceSettings {
  lighting: Lighting;
  shadows: boolean;
  /** Mirror bounces after the camera ray (0 = none). */
  maxBounces: number;
  /** Distance along the normal that secondary rays start from. At 0 they can hit the surface they left (shadow acne). */
  bias: number;
}

/** What a ray that hits nothing sees. */
export const BACKGROUND: Vec3 = [0.08, 0.09, 0.14];
const WHITE: Vec3 = [1, 1, 1];

const clamp01Colour = (c: Vec3): Vec3 => [Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2]))];

/** The colour a ray sees: ambient + Lambert diffuse + Phong specular (unless shadowed), mixed with the mirror ray by reflectivity until the bounce limit. Components are in [0, 1]. */
export function traceRay(scene: Scene, ray: Ray, settings: TraceSettings, stats: TraceStats = newTraceStats(), bounce = 0): Vec3 {
  const found = nearestHit(scene, ray, 0, stats);
  if (!found) return BACKGROUND;
  const { hit, object } = found;
  const { lighting, bias } = settings;
  const albedo = object.material.color;
  const start = add3(hit.point, scale3(hit.normal, bias));
  const toLightVec = sub3(scene.light, start);
  const toLight = normalize3(toLightVec) ?? hit.normal;
  const shadowed = settings.shadows && occluded(scene, { origin: start, dir: toLight }, 0, length3(toLightVec), stats);
  const viewer = normalize3(scale3(ray.dir, -1)) ?? hit.normal;
  let colour = scale3(albedo, lighting.ambient);
  if (!shadowed) {
    colour = add3(colour, scale3(albedo, lighting.diffuse * lambert(hit.normal, toLight)));
    colour = add3(colour, scale3(WHITE, lighting.specular * phong(hit.normal, toLight, viewer, lighting.shininess)));
  }
  const mirror = object.material.reflectivity;
  if (mirror > 0 && bounce < settings.maxBounces) {
    const dir = normalize3(reflect3(ray.dir, hit.normal));
    if (dir) {
      const reflected = traceRay(scene, { origin: start, dir }, settings, stats, bounce + 1);
      colour = add3(scale3(colour, 1 - mirror), scale3(reflected, mirror));
    }
  }
  return clamp01Colour(colour);
}

export interface Camera {
  eye: Vec3;
  forward: Vec3;
  side: Vec3;
  up: Vec3;
  /** Vertical field of view in radians. */
  fovY: number;
}

/** A pinhole camera, or null when the look-at has no direction (eye on the target, or up parallel to the view). */
export function makeCamera(eye: Vec3, target: Vec3, up: Vec3, fovY: number): Camera | null {
  if (!lookAt(eye, target, up)) return null;
  const forward = normalize3(sub3(target, eye))!;
  const side = normalize3(cross3(forward, up))!;
  return { eye, forward, side, up: cross3(side, forward), fovY };
}

/** The unit ray through the centre of pixel (px, py) of a width × height image (y down). */
export function cameraRay(camera: Camera, px: number, py: number, width: number, height: number): Ray {
  const half = Math.tan(camera.fovY / 2);
  const x = ((px + 0.5) / width) * 2 - 1;
  const y = 1 - ((py + 0.5) / height) * 2;
  const dir = add3(camera.forward, add3(scale3(camera.side, x * half * (width / height)), scale3(camera.up, y * half)));
  return { origin: camera.eye, dir: normalize3(dir)! };
}

export interface RenderedImage {
  width: number;
  height: number;
  /** Row-major colours in [0, 1]. */
  pixels: Vec3[];
  /** Ray-object tests per pixel (camera, shadow and mirror rays together): the heat map. */
  testsPerPixel: number[];
}

/** Trace every pixel centre. `stats` (optional) accumulates the totals. */
export function renderImage(scene: Scene, camera: Camera, width: number, height: number, settings: TraceSettings, stats: TraceStats = newTraceStats()): RenderedImage {
  const pixels: Vec3[] = [];
  const testsPerPixel: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const before = stats.objectTests;
      pixels.push(traceRay(scene, cameraRay(camera, x, y, width, height), settings, stats));
      testsPerPixel.push(stats.objectTests - before);
    }
  }
  return { width, height, pixels, testsPerPixel };
}
