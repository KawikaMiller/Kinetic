import type { ReactNode } from 'react';
import { pct, plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { drawDepth, rasterize, wrongPixels, type EdgeTest, type FillRule, type PixelResult, type Raster, type SharedResult, type Tri } from './model';

/** A number as typed: exact values here are multiples of 1/16, so four decimals never round one to 0. */
export const num = (v: number) => {
  const s = String(Number(v.toFixed(4)));
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
};

export interface CoverFrame extends Frame {
  /** How many pixels of the box have been tested so far. */
  tested: number;
  /** Index (in the raster's tested list) of the pixel under test in this frame, or null. */
  current: number | null;
}

const EDGE_NAMES = ['w0', 'w1', 'w2'];

/** Why the centre passed or failed, in words. */
export function centreVerdict(t: EdgeTest): ReactNode {
  const zero = t.w.map((w, i) => (w === 0 ? i : -1)).filter((i) => i >= 0);
  const failing = t.pass.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (failing.length === 0) {
    if (zero.length === 0) return <>all three are positive, so the centre is inside</>;
    return <>{zero.map((i) => EDGE_NAMES[i]).join(' and ')} = 0 puts the centre exactly on an edge; it's a top or left edge, so the pixel counts</>;
  }
  const neg = failing.filter((i) => t.w[i] < 0);
  if (neg.length) return <>{neg.map((i) => EDGE_NAMES[i]).join(' and ')} {neg.length > 1 ? 'are' : 'is'} negative, so the centre is outside</>;
  return <>{failing.map((i) => EDGE_NAMES[i]).join(' and ')} = 0 puts the centre exactly on an edge that isn't a top or left edge, so this triangle doesn't take it</>;
}

export function pixelCaption(p: PixelResult, samples: number): ReactNode {
  const ws = p.centre.w.map((w, i) => `${EDGE_NAMES[i]} = ${num(w)}`).join(', ');
  const head = <>Pixel ({p.x}, {p.y}), centre ({p.x + 0.5}, {p.y + 0.5}): {ws}. </>;
  if (samples === 1) {
    return <>{head}At the centre {centreVerdict(p.centre)}{p.centre.inside ? <>: it <span className="hl info">lights</span>.</> : '.'}</>;
  }
  const hits = Math.round(p.cover * samples);
  return <>{head}{hits} of {samples} sample points are inside, so it is shaded {pct(p.cover)}.</>;
}

export function summaryCaption(r: Raster): ReactNode {
  if (!r.tri) return <>These three corners are on one line, so the triangle has no area and nothing is tested.</>;
  if (!r.box || r.tested.length === 0) {
    return <>The bounding box holds no pixel whose {r.samples === 1 ? 'centre' : 'sample points'} could be inside, so nothing is tested and nothing lights, even though the triangle is drawn over the grid.</>;
  }
  const n = r.tested.length;
  const shareTxt = pct(r.covered / n);
  const what = r.samples === 1 ? 'lit' : 'got some shade';
  return (
    <>Done: {plural(n, 'pixel')} tested, {r.covered} {what} ({shareTxt} of the box). {r.samples > 1
      ? <>Each pixel took {r.samples} tests instead of 1, which is the price of antialiasing.</>
      : <>Pixels outside the dashed box were never tested at all.</>}</>
  );
}

/** Intro, one frame per tested pixel, then the summary. `n` is samples per axis (1, 2 or 4). */
export function coverageFrames(tri: Tri, n: number, rule: FillRule = 'topLeft'): { raster: Raster; frames: CoverFrame[] } {
  const raster = rasterize(tri, n, rule);
  const count = raster.tested.length;
  const what = raster.samples === 1 ? 'centre' : `(${raster.samples} sample points)`;
  const intro = count
    ? <>The dashed box is the triangle's bounding box: {plural(count, 'pixel')}. Step tests one pixel {what} at a time; play runs the whole box, row by row.</>
    : summaryCaption(raster);
  const frames: CoverFrame[] = [{ tested: 0, current: null, say: intro }];
  raster.tested.forEach((p, i) => frames.push({ tested: i + 1, current: i, say: pixelCaption(p, raster.samples), quiet: true }));
  if (count) frames.push({ tested: count, current: null, say: summaryCaption(raster), hold: 2 });
  return { raster, frames };
}

// ── Shared edge ─────────────────────────────────────────────────────

export function sharedCaption(r: SharedResult, rule: FillRule): ReactNode {
  const twice = r.overdraw.length;
  const missed = r.gaps.length;
  if (!r.proper) {
    return <>Both far corners are now on the same side of the shared edge, so the triangles overlap: the {twice} pixels drawn twice are real overlap, not a fill-rule problem. Drag a corner back across.</>;
  }
  if (rule === 'inclusive') {
    if (twice === 0) return <>w ≥ 0 counts a centre on an edge for both triangles, but no pixel centre lies on the shared edge right now, so nothing is drawn twice. Put the shared edge's ends on half-pixel spots to see it.</>;
    return <>w ≥ 0: {plural(twice, 'pixel centre')} on the shared edge pass for both triangles, so they are <span className="hl bad">drawn twice</span>. With transparency, those pixels would show a darker seam.</>;
  }
  if (rule === 'exclusive') {
    if (missed === 0) return <>w &gt; 0 drops centres that lie exactly on an edge, but none lies on the shared edge right now, so nothing goes missing this time.</>;
    return <>w &gt; 0: {plural(missed, 'pixel centre')} along the shared edge, between its ends, fail for both triangles, so they are <span className="hl orange">never drawn</span>: a crack between two triangles that touch.</>;
  }
  if (twice === 0 && missed === 0) {
    return <>Top-left rule: a centre exactly on an edge belongs to the triangle for which that edge is a top or left edge. Every centre along the shared edge, between its ends, goes to exactly one of the two, and no pixel is drawn twice.</>;
  }
  return <>Top-left rule: {twice} drawn twice and {missed} missed.</>;
}

// ── Depth ───────────────────────────────────────────────────────────

export const DEPTH_NAMES = ['violet', 'amber'] as const;

export function depthCaption(tris: readonly Tri[], order: readonly [number, number], zBuffer: boolean): ReactNode {
  const wrong = wrongPixels(drawDepth(tris, order, zBuffer));
  const last = DEPTH_NAMES[order[1]];
  if (zBuffer) {
    return wrong === 0
      ? <>Z-buffer on: each pixel keeps the depth of what's drawn there and only lets something nearer overwrite it, so all overlap pixels show the nearer triangle, in either draw order.</>
      : <>Z-buffer on, yet {plural(wrong, 'pixel')} show the farther triangle.</>;
  }
  const otherWrong = wrongPixels(drawDepth(tris, [order[1], order[0]], false));
  const both = wrong > 0 && otherWrong > 0;
  return (
    <>No z-buffer: the {last} triangle is drawn second, so it paints over the overlap. {plural(wrong, 'pixel')} now show the farther triangle
      {both ? <>, and swapping the order still leaves {otherWrong} wrong: each triangle is nearer over part of the overlap, so no draw order is right everywhere.</> : '.'}</>
  );
}
