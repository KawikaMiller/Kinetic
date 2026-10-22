/** Captions for every scene, built from the model so each number is the one on screen. Plain strings. */
import { decimal, plural } from '../../core/format';
import { blend, probePixel, type BlendState, type Region } from './blend';
import { rgbText } from './paint';
import { overdraw, type OverdrawState } from './overdraw';
import { GRID, type Fragment } from './render';
import { STAGES, type Analysis, type PipelineState } from './stages';

const n2 = (v: number) => decimal(v, 2);

const nlRange = (fragments: readonly Fragment[]) => {
  const nls = fragments.map((f) => f.nl);
  return nls.length ? `${n2(Math.min(...nls))} to ${n2(Math.max(...nls))}` : 'none';
};

export function pipelineCaption(s: PipelineState, a: Analysis): string {
  const stage = STAGES[s.stage].id;
  const t = s.triangle + 1;
  const total = a.fragments.length;
  switch (stage) {
    case 'input':
      return `Input assembly: the vertex buffer holds ${a.vertexCount} vertices and the index buffer ${a.indexCount} indices, so ${plural(a.triangles, 'triangle')}. Triangle ${t} reads indices ${a.indices.join(', ')}.`;
    case 'vertex': {
      const ws = a.assembled.outs.map((o) => n2(o.clip[3])).join(', ');
      return `Vertex shader: runs once per vertex, 3 times for triangle ${t}. It multiplies each position by model, view and projection (clip w is ${ws}) and passes u, v and the world-space normal on.`;
    }
    case 'primitive':
      return a.wasClipped
        ? `Primitive assembly and clipping: triangle ${t} crosses a clip plane, so clipping cuts it to a polygon of ${plural(a.assembled.clipped.length, 'vertex', 'vertices')}, which becomes ${plural(a.assembled.pieces.length, 'triangle')}.`
        : `Primitive assembly and clipping: all three vertices of triangle ${t} are inside the frustum, so clipping leaves it alone; the divide by w and the viewport put it on the ${GRID.w} by ${GRID.h} grid.`;
    case 'raster':
      return total === 0
        ? `Rasterisation: triangle ${t} covers no pixel centre of the ${GRID.w} by ${GRID.h} grid, so it produces no fragments (it may be edge-on, off screen or very small).`
        : `Rasterisation: triangle ${t} covers ${plural(total, 'pixel centre')} of the ${GRID.w} by ${GRID.h} grid, so it produces ${plural(total, 'fragment')}. A fragment is a candidate for a pixel, not a pixel.`;
    case 'fragment':
      return `Fragment shader: runs once per fragment, ${total} times for triangle ${t}. This scene's shader is a fixed Lambert term N·L, from ${nlRange(a.fragments)} here; the shader scene lets you write your own.`;
    case 'depth':
      return `Depth test: ${a.passed} of ${plural(total, 'fragment')} ${a.passed === 1 ? 'is' : 'are'} nearer than what triangles 1 to ${s.triangle} left in the depth buffer and pass; ${total - a.passed} fail and are discarded.`;
    case 'blend':
      return `Blending is off in this scene: the ${plural(a.passed, 'fragment')} that passed replace${a.passed === 1 ? 's' : ''} what is in the framebuffer. The last scene turns blending on.`;
    case 'framebuffer':
      return `Framebuffer: triangle ${t} is on top at ${plural(a.onTopSlots.length, 'pixel')}; with the ${s.triangle} before it, ${plural(a.drawnSlots.length, 'pixel')} show some triangle. A later triangle may still cover them.`;
  }
}

export function flightText(a: Analysis, stage: number): string {
  const total = a.fragments.length;
  return [
    '3 vertices',
    '3 clip positions',
    plural(a.assembled.pieces.length, 'triangle'),
    plural(total, 'fragment'),
    plural(total, 'shaded fragment'),
    plural(a.passed, 'fragment'),
    plural(a.passed, 'colour'),
    plural(a.onTopSlots.length, 'pixel'),
  ][stage];
}

export function fragmentText(f: Fragment, passed: boolean): string {
  return `pixel (${f.x}, ${f.y}): weights ${f.bary.map(n2).join(', ')}, u ${n2(f.u)}, v ${n2(f.v)}, N·L ${n2(f.nl)}, depth ${decimal(f.depth, 4)}, ${passed ? 'passes the depth test' : 'fails the depth test'}`;
}

export interface ShaderCaptionInput {
  fields: readonly [string, string, string];
  errors: readonly (string | null)[];
  shaded: number;
  badCount: number;
}
const CHANNELS = ['red', 'green', 'blue'] as const;

export function shaderCaption(i: ShaderCaptionInput): string {
  const refused = i.errors.findIndex((e) => e !== null);
  const lead = `Shader: red = ${i.fields[0]}, green = ${i.fields[1]}, blue = ${i.fields[2]}.`;
  if (refused >= 0) {
    return `${lead} Not applied: the ${CHANNELS[refused]} field says "${i.errors[refused]}" The image still shows the last shader that worked.`;
  }
  const bad = i.badCount === 0 ? 'no pixel came out as NaN or infinite' : `${plural(i.badCount, 'pixel')} came out as NaN or infinite and ${i.badCount === 1 ? 'is' : 'are'} drawn hatched`;
  return `${lead} The shader ran ${plural(i.shaded, 'time')}, once per visible pixel, and ${bad}.`;
}

export function slantCaption(correct: boolean, bent: { differing: number; covered: number }): string {
  const mode = correct ? 'perspective-correct (attributes divided by w, interpolated, divided back)' : 'screen-linear (attributes blended by screen distance)';
  return `Interpolation: ${mode}. The two modes give a different checker colour at ${bent.differing} of ${plural(bent.covered, 'covered pixel')}. ${correct ? 'The squares stay square-looking as they recede.' : 'The squares bend, because screen distance is not distance along the surface.'}`;
}

export function overdrawCaption(s: OverdrawState): string {
  const r = overdraw(s);
  const order = s.order.replace(/-/g, ' ');
  const early = s.earlyZ ? 'with the early depth test' : 'without the early depth test';
  return `Drawing ${order}, ${early}: rasterisation made ${r.rendered.coveredFragments} fragments, the fragment shader ran ${r.rendered.shaderInvocations} times, and ${r.visible} pixels show a triangle, so ${r.wasted} runs were thrown away. The picture is the same in every order.`;
}

const REGION_NAME: Record<Region, string> = { 'a-only': 'only triangle A covers', both: 'both triangles cover', 'b-only': 'only triangle B covers', none: 'neither triangle covers' };
export const regionLabel = (r: Region) => REGION_NAME[r];

export function blendCaption(s: BlendState, region: Region): string {
  const slot = probePixel(region);
  const here = blend(s).pixels[slot];
  const swapped = blend({ ...s, order: s.order === 'a-then-b' ? 'b-then-a' : 'a-then-b' }).pixels[slot];
  const same = here.every((v, i) => Math.abs(v - swapped[i]) < 1e-12);
  const order = s.order === 'a-then-b' ? 'A then B' : 'B then A';
  const tail = region !== 'both'
    ? 'Only one triangle touches this pixel, so the order cannot matter here.'
    : same
      ? 'Swapping the order gives the same colour here, because one alpha is 0 and that triangle adds nothing.'
      : `Swapping to ${s.order === 'a-then-b' ? 'B then A' : 'A then B'} gives ${rgbText(swapped)}: blending is not commutative.`;
  return `Drawn ${order} with alpha ${decimal(s.alphaA, 1)} and ${decimal(s.alphaB, 1)}, the pixel where ${REGION_NAME[region]} it is ${rgbText(here)}. ${tail}`;
}
