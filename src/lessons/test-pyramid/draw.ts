// Canvas drawing for the suite run: one lane per layer, a square per test, and a time bar.
import { bar, FONT, rect, text } from '../../core/canvas';
import { TOKENS as C } from '../../core/palette';
import { LAYERS, SPEC, type Counts, type Layer, type TestRun } from './model';
import type { World } from './sim';

type Ctx = CanvasRenderingContext2D;

const LABEL_W = 104;
const PAD = 14;
const CELL = 8;
const GAP = 2;
const LANE_GAP = 16;
const BAR_H = 5;
/** Room for a lane's two label lines, even when its squares fit on one row. */
const MIN_LANE_H = 32;

export const LAYER_COLOR: Record<Layer, string> = { unit: C.ok, integration: C.info, e2e: C.violet };

function columns(w: number) {
  return Math.max(10, Math.floor((w - LABEL_W - PAD * 2) / (CELL + GAP)));
}

/** Canvas height needed to draw these counts at this width. */
export function laneHeight(counts: Counts, w: number): number {
  const cols = columns(w);
  return LAYERS.reduce((h, l) => h + laneBlock(counts[l], cols) + LANE_GAP, PAD * 2);
}

function laneBlock(n: number, cols: number) {
  return Math.max(MIN_LANE_H, Math.max(1, Math.ceil(n / cols)) * (CELL + GAP) + 2 + BAR_H);
}

export function drawRun(ctx: Ctx, w: number, world: World, counts: Counts) {
  const cols = columns(w);
  const byLayer = (l: Layer) => world.runs.filter((r) => r.layer === l);
  const fresh = world.runs.length === 0;
  let y = PAD;
  ctx.textBaseline = 'top';
  for (const layer of LAYERS) {
    const n = counts[layer];
    const runs: TestRun[] = fresh ? [] : byLayer(layer);
    const rows = Math.max(1, Math.ceil(n / cols));
    text(ctx, SPEC[layer].label, PAD, y, { color: C.text, font: FONT.sans(13, 700) });
    text(ctx, `${n} × ${SPEC[layer].seconds}s`, PAD, y + 17, { color: C.muted, font: FONT.mono(10) });
    for (let i = 0; i < n; i++) {
      const x = LABEL_W + PAD + (i % cols) * (CELL + GAP);
      const cy = y + Math.floor(i / cols) * (CELL + GAP);
      const r = runs[i];
      const done = r && r.end <= world.t;
      if (!done) {
        rect(ctx, x + 0.5, cy + 0.5, CELL - 1, CELL - 1, { stroke: C.cellLine, radius: 2 });
        continue;
      }
      const fill = r.result === 'fail' ? C.bad : r.result === 'flake' ? C.hi : LAYER_COLOR[layer];
      rect(ctx, x, cy, CELL, CELL, { fill, radius: 2 });
    }
    // Time bar: how much of this layer's total time has elapsed.
    const barY = y + rows * (CELL + GAP) + 2;
    const layerStart = runs.length ? runs[0].end - SPEC[layer].seconds : 0;
    const layerTime = n * SPEC[layer].seconds;
    const elapsed = fresh || !layerTime ? 0 : Math.min(1, Math.max(0, (world.t - layerStart) / layerTime));
    bar(ctx, LABEL_W + PAD, barY, cols * (CELL + GAP) - GAP, BAR_H, elapsed, LAYER_COLOR[layer], { track: C.dim, radius: 3 });
    y += laneBlock(n, cols) + LANE_GAP;
  }
}
