/** Captions for every scene, built from the model so each number is the one on screen. Plain strings: no JSX here. */
import { decimal, pct, plural, sig } from '../../core/format';
import { DEPTH_BITS, type Vec4 } from '../../core/raster3d';
import {
  CANVAS_ASPECT, cornerName, cameraView, clipScene, depthScene, pipeline, translationEffect,
  type CameraState, type ClipState, type DepthState, type PointState,
} from './model';

const n2 = (v: number) => decimal(v, 2);
export const vec = (v: readonly number[]) => `(${v.map(n2).join(', ')})`;
const spaceValue = (steps: ReturnType<typeof pipeline>, id: string): Vec4 | null => steps.find((s) => s.id === id)?.value ?? null;

export function pointCaption(s: PointState): string {
  const steps = pipeline(s);
  const local = spaceValue(steps, 'local') as Vec4;
  const world = spaceValue(steps, 'world') as Vec4;
  const camera = spaceValue(steps, 'camera') as Vec4;
  const eff = translationEffect(s);
  const move = `Moving the model by (${n2(s.moveX)}, 0, ${n2(s.moveZ)}) shifts the corner by ${n2(eff.point)} as a point and by ${n2(eff.direction)} as a direction.`;
  if (s.kind === 'direction') {
    return `Corner ${s.vertex} ${cornerName(s.vertex)} read as a direction (w = 0): ${vec(local)} in local space, ${vec(world)} in world space, ${vec(camera)} in camera space. ${move} A direction has no place on the screen, so the pipeline stops there.`;
  }
  const clip = spaceValue(steps, 'clip') as Vec4;
  const ndc = spaceValue(steps, 'ndc');
  const screen = spaceValue(steps, 'screen');
  const tail = ndc && screen
    ? `Dividing by w = ${n2(clip[3])} gives NDC ${vec(ndc.slice(0, 3))}, which is pixel (${n2(screen[0])}, ${n2(screen[1])}).`
    : 'It has w = 0, so there is nothing to divide by.';
  return `Corner ${s.vertex} ${cornerName(s.vertex)} as a point: ${vec(local.slice(0, 3))} in local space, ${vec(world.slice(0, 3))} in world space, ${vec(camera.slice(0, 3))} in camera space and ${vec(clip)} in clip space. ${tail} ${move}`;
}

export function cameraCaption(s: CameraState): string {
  const v = cameraView(s);
  const lens = s.projection === 'perspective' ? `perspective, field of view ${s.fovDeg}°` : 'orthographic, parallel rays';
  const out = v.outside === 0 ? 'All 8 corners are inside the frustum.' : `${v.outside} of 8 corners ${v.outside === 1 ? 'is' : 'are'} outside the frustum and drawn dim.`;
  const behind = v.behind === 0 ? '' : ` ${plural(v.behind, 'corner is', 'corners are')} behind the camera, so ${v.behind === 1 ? 'its' : 'their'} edges cannot be drawn.`;
  const stretch = v.stretched ? ` The projection's aspect ${decimal(v.aspect, 2)} differs from the canvas's ${decimal(CANVAS_ASPECT, 2)}, so the picture is stretched.` : '';
  return `${lens}, near ${decimal(s.near, 1)}, far ${decimal(s.far, 1)}. ${out}${behind}${stretch}`;
}

export function clipCaption(s: ClipState): string {
  const r = clipScene(s);
  const made = r.rows.filter((x) => x.created);
  if (s.clipping) {
    if (r.cutBy.length === 0) return `Triangle fully inside the frustum (apex at z = ${decimal(s.apexZ, 1)}): clipping returns it unchanged, with no new vertices.`;
    return `Clipping in clip space against ${r.cutBy.join(' and ')} cuts the triangle and adds ${plural(made.length, 'vertex', 'vertices')}; the ${plural(r.rows.length, 'vertex', 'vertices')} that remain all satisfy -w <= x, y, z <= w. ${r.behindInput > 0 ? `${plural(r.behindInput, 'corner was', 'corners were')} behind the camera (w <= 0).` : ''}`.trim();
  }
  if (r.behindInput === 0) return `Clipping is off, but all three corners are in front of the camera (apex at z = ${decimal(s.apexZ, 1)}), so the picture is right anyway.`;
  const apex = r.rows.find((x) => x.behind);
  return `Clipping is off: ${plural(r.behindInput, 'corner has', 'corners have')} w <= 0 (w = ${decimal(apex?.clip[3] ?? 0, 2)}). The divide by a negative w mirrors it through the screen centre and stretches it, so the triangle is drawn wrong.`;
}

export function depthCaption(s: DepthState): string {
  const r = depthScene(s);
  if (r.clippedShare === 1) return `Both surfaces are about ${r.distance} units away, beyond the far plane at ${r.far}, so the far plane clips them and nothing is drawn. Raise far above the distance.`;
  const side = r.gap < r.resolution ? 'smaller than' : 'larger than';
  return `At distance ${r.distance} with near ${r.near} and far ${r.far}, one step of the ${DEPTH_BITS}-bit depth buffer is ${sig(r.resolution)} units. The surfaces are ${r.gap} apart, ${side} one step. The surfaces slant, so the step varies across the picture, and ${pct(r.tiedShare)} of the drawn pixels store the same depth value for both and z-fight.`;
}

export const CONVENTION =
  'Convention used throughout: right-handed, the camera looks down -z, OpenGL-style clip space (NDC z from -1 at the near plane to +1 at the far plane), screen y down.';
