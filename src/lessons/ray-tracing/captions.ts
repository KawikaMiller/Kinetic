/** Captions for every scene, built from the model so each number is the one on screen. Plain strings. */
import { decimal, integer, pct, plural } from '../../core/format';
import type { Vec3 } from '../../core/raster3d';
import { rgbText } from './paint';
import { BIAS_CHOICES, CLEAN_BIAS, MIRROR_INDEX, PIXELS, SPHERES, type BvhComparison, type Render, type TraceState, type Trail } from './scene';

const n2 = (v: number) => decimal(v, 2);
const n3 = (v: number) => decimal(v, 3);
const vec = (v: Vec3) => `(${v.map(n2).join(', ')})`;

export function pixelCaption(s: TraceState, x: number, y: number, trail: Trail): string {
  const lead = `Pixel (${x}, ${y}):`;
  const [first, second] = trail.hits;
  if (!first) return `${lead} the camera ray leaves the eye and hits nothing, so the pixel is the background colour ${rgbText(trail.colour)}.`;
  const light = first.shadowed === null
    ? `Shadows are off, so it is lit: N·L = ${n2(first.nl)}.`
    : first.shadowed
      ? 'The shadow ray toward the light is blocked, so only ambient light reaches it.'
      : `The shadow ray toward the light is clear, so it is lit: N·L = ${n2(first.nl)}.`;
  const reflective = first.object === SPHERES[MIRROR_INDEX].name && s.mirror > 0;
  const mirror = second
    ? ` The mirror ray bounces on and hits the ${second.object} at t = ${n3(second.t)}.`
    : reflective && s.bounces === 0
      ? ' Bounce depth is 0, so no mirror ray is shot.'
      : reflective
        ? ' The mirror ray leaves the scene and hits nothing.'
        : '';
  return `${lead} the camera ray hits the ${first.object} at t = ${n3(first.t)}, point ${vec(first.point)}. ${light}${mirror} The pixel is ${rgbText(trail.colour)}.`;
}

export function shadingCaption(s: TraceState, r: Render): string {
  const l = s.lighting;
  const mirrors = s.bounces === 0 ? 'bounce depth 0, so no mirror rays' : `mirror reflectivity ${n2(s.mirror)} and bounce depth ${s.bounces}`;
  return `Ambient ${n2(l.ambient)}, diffuse ${n2(l.diffuse)}, specular ${n2(l.specular)} (shininess ${l.shininess}), shadows ${s.shadows ? 'on' : 'off'}, ${mirrors}: the render made ${integer(r.stats.objectTests)} ray-object tests for ${integer(PIXELS)} pixels, ${decimal(r.stats.objectTests / PIXELS, 1)} per pixel, under the budget of ${integer(r.budget)}.`;
}

export function acneCaption(s: TraceState, differing: number): string {
  const bias = BIAS_CHOICES[s.biasIndex];
  const lead = `Bias ${bias}: ${plural(differing, 'pixel')} differ${differing === 1 ? 's' : ''} from the clean render (bias ${CLEAN_BIAS}).`;
  if (bias === 0) return `${lead} A shadow ray starts exactly on its own surface and can hit it again, so lit pixels come out dark: shadow acne.`;
  if (bias < CLEAN_BIAS) {
    return differing > 0
      ? `${lead} The start point is only just off the surface, still close enough for rounding to put some of them on the wrong side.`
      : `${lead} The start point is only just off the surface, but already far enough that no pixel changes.`;
  }
  if (bias === CLEAN_BIAS) return `${lead} Secondary rays start just off the surface, so they miss it and the speckles are gone.`;
  return `${lead} A large bias moves the start of a shadow ray so far from the surface that shadows creep away from where objects touch the floor.`;
}

export function bvhCaption(c: BvhComparison, on: boolean): string {
  const a = c.without.stats.objectTests;
  const b = c.withBvh.stats.objectTests;
  const same = c.identical ? 'The two images are identical pixel for pixel.' : 'The two images differ.';
  return `Showing the render ${on ? 'with' : 'without'} the hierarchy. Without it the render made ${integer(a)} ray-object tests; with it ${integer(b)} object tests and ${integer(c.withBvh.stats.boxTests)} box tests, ${pct(1 - b / a)} fewer object tests. ${same}`;
}
