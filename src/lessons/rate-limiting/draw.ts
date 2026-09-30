// Canvas drawing for the rate-limiter simulation.
import { bar, box, dot, FONT, rect, text, wire } from '../../core/canvas';
import type { Pt } from '../../core/geometry';
import { clamp01, lerp } from '../../core/math';
import { alpha, TOKENS as C } from '../../core/palette';
import { TRAVEL_IN, TRAVEL_OUT, WINDOW, type Limiter, type Particle, type World } from './sim';

type Ctx = CanvasRenderingContext2D;

const SPAN = 8; // seconds shown on the timeline
const BIN = 0.2; // seconds per timeline bar
const REJECT_FADE = 0.5; // seconds a rejected dot fades in the bin (the world keeps it for LINGER, which is longer)
const DOT = { r: 5, glow: 8 };
const PANEL_FILL = alpha(C.cell, 0.9);
const TOKEN_COLS = 5;
const TOKEN_GAP = 16;
const TOKEN_R = 6.5;

/** easeInOutQuad: the particle motion this lesson has always used (core/math's ease is cubic). */
const easeQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const glowDot = (ctx: Ctx, x: number, y: number, r: number, color: string) => dot(ctx, x, y, r, color, { glow: DOT.glow });

function layout(w: number) {
  return { cx: 70, gx: Math.max(300, w * 0.47), ax: w - 80, cy: 128, rejectY: 250, chartTop: 298, chartBottom: 420 };
}

export function drawScene(ctx: Ctx, w: number, s: World) {
  const L = layout(w);
  const lim = s.limiters[s.algo];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  wire(ctx, [
    [{ x: L.cx + 26, y: L.cy }, { x: L.ax - 44, y: L.cy }],
    [{ x: L.gx, y: L.cy + 80 }, { x: L.gx, y: L.rejectY - 16 }],
  ]);

  labelledBox(ctx, L.cx, L.cy, 70, 44, C.info, 'clients');
  labelledBox(ctx, L.ax, L.cy, 88, 50, C.ok, 'API');

  // reject bin
  rect(ctx, L.gx - 90, L.rejectY - 16, 180, 32, { fill: alpha(C.bad, 0.08), stroke: alpha(C.bad, 0.5), lineWidth: 2, radius: 8 });
  text(ctx, '429 Too Many Requests', L.gx, L.rejectY, { color: C.bad, font: FONT.mono(12) });

  drawLimiter(ctx, L.gx, L.cy, lim, s.now);

  for (const p of s.particles) {
    const at = particleAt(p, s.now, L);
    if (!at) continue;
    ctx.globalAlpha = at.alpha;
    glowDot(ctx, at.x, at.y, DOT.r, at.color);
    ctx.globalAlpha = 1;
  }

  drawTimeline(ctx, w, L.chartTop, L.chartBottom, lim, s.now, s.algo === 'fixed');
}

/** Where (and whether) to draw a request right now. Queued leaky-bucket requests are drawn inside the bucket. */
function particleAt(p: Particle, now: number, L: ReturnType<typeof layout>): (Pt & { color: string; alpha: number }) | null {
  if (p.fromBucket) {
    const t = clamp01((now - p.tGate) / TRAVEL_OUT);
    if (t >= 1) return null;
    return { x: lerp(L.gx + 60, L.ax - 44, easeQuad(t)), y: L.cy, color: C.ok, alpha: 1 };
  }
  if (p.outcome === null || now < p.tGate) {
    const t = clamp01((now - p.t0) / TRAVEL_IN);
    return { x: lerp(L.cx + 30, L.gx - 70, easeQuad(t)), y: L.cy + Math.sin(p.id * 1.7) * 18 * (1 - t), color: C.info, alpha: 1 };
  }
  const t = clamp01((now - p.tGate) / TRAVEL_OUT);
  if (p.outcome === 'ok') {
    if (t >= 1) return null;
    return { x: lerp(L.gx - 70, L.ax - 44, easeQuad(t)), y: L.cy, color: C.ok, alpha: 1 };
  }
  if (p.outcome === 'reject') {
    const fade = t >= 1 ? Math.max(0, 1 - (now - p.tGate - TRAVEL_OUT) / REJECT_FADE) : 1;
    return {
      x: lerp(L.gx - 70, L.gx + ((p.id % 7) - 3) * 18, easeQuad(t)),
      y: lerp(L.cy, L.rejectY, easeQuad(t)),
      color: C.bad,
      alpha: fade,
    };
  }
  return null;
}


function labelledBox(ctx: Ctx, x: number, y: number, bw: number, bh: number, color: string, label: string) {
  box(ctx, x, y, bw, bh, { stroke: color });
  text(ctx, label, x, y, { color: C.text, font: FONT.sans(13, 700) });
}

function drawLimiter(ctx: Ctx, x: number, y: number, lim: Limiter, now: number) {
  const { limit, capacity } = lim.p;
  ctx.lineWidth = 2;

  if (lim.id === 'token' || lim.id === 'leaky') {
    const top = y - 62;
    const bottom = y + 72;
    drawBucket(ctx, x, top, bottom, lim.id === 'token' ? C.hi : C.violet);
    drawBucketContents(ctx, x, top, bottom, lim);
    const drip = (now * limit) % 1;
    if (lim.id === 'token') {
      // the faucet
      glowDot(ctx, x, top - 24 + drip * 26, 3.5, C.hi);
      text(ctx, `+${limit} tokens/s`, x, top - 34, { color: C.hi });
      text(ctx, `${Math.floor(lim.tokens)} / ${capacity} tokens`, x, bottom + 16);
    } else {
      // the hole at the bottom leaks at a constant rate
      if (lim.queue.length) glowDot(ctx, x + 60 + drip * 10, bottom - 6, 3, C.ok);
      text(ctx, `queue ${lim.queue.length} / ${capacity}`, x, top - 16, { color: C.violet });
      text(ctx, `leaks ${limit}/s →`, x, bottom + 16);
    }
    return;
  }

  // counter box for the window algorithms
  const bw = 160;
  const bh = 112;
  const color = lim.id === 'fixed' ? C.hi : C.info;
  rect(ctx, x - bw / 2, y - bh / 2, bw, bh, { fill: PANEL_FILL, stroke: color, lineWidth: 2, radius: 12 });

  const count = lim.id === 'fixed' ? lim.count : lim.log.length;
  const full = count >= limit;
  text(ctx, `${count} / ${limit}`, x, y - 8, { color: full ? C.bad : C.text, font: FONT.mono(26, 700) });

  const barW = bw - 28;
  bar(ctx, x - barW / 2, y + 20, barW, 7, count / limit, full ? C.bad : color, { radius: 4 });

  if (lim.id === 'fixed') {
    const into = (now - lim.windowStart) / WINDOW;
    text(ctx, `resets in ${(WINDOW - into * WINDOW).toFixed(1)} s`, x, y + 40);
    // window progress along the top edge
    const x0 = x - bw / 2 + 10;
    wire(ctx, [[{ x: x0, y: y - bh / 2 }, { x: x0 + (bw - 20) * clamp01(into), y: y - bh / 2 }]], { color: C.hi, width: 3, dash: [] });
    text(ctx, 'this clock second', x, y - bh / 2 - 12, { color: C.hi });
  } else {
    // strip of the last second: each accepted request is a tick that slides off the left
    const sx = x - barW / 2;
    text(ctx, 'last 1 s, measured from now', x, y - bh / 2 - 12, { color: C.info });
    const ticks = lim.log.map((t) => {
      const px = sx + barW * (1 - (now - t) / WINDOW);
      return [{ x: px, y: y + 34 }, { x: px, y: y + 46 }] as const;
    });
    wire(ctx, ticks, { color: C.info, width: 2, dash: [] });
    rect(ctx, sx, y + 32, barW, 16, { stroke: C.cellLine });
  }
}

/** The bucket outline: a trapezoid, wider at the top. */
function drawBucket(ctx: Ctx, x: number, top: number, bottom: number, stroke: string) {
  const topHalf = 64;
  const bottomHalf = 50;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = PANEL_FILL;
  ctx.beginPath();
  ctx.moveTo(x - topHalf, top);
  ctx.lineTo(x - bottomHalf, bottom);
  ctx.lineTo(x + bottomHalf, bottom);
  ctx.lineTo(x + topHalf, top);
  ctx.fill();
  ctx.stroke();
}

/** Token bucket: tokens that shrink as they're spent. Leaky bucket: the queued requests. */
function drawBucketContents(ctx: Ctx, x: number, top: number, bottom: number, lim: Limiter) {
  const { capacity } = lim.p;
  const token = lim.id === 'token';
  const n = token ? lim.tokens : lim.queue.length;
  const rows = Math.ceil(capacity / TOKEN_COLS);
  const cell = Math.min(TOKEN_GAP, (bottom - top - 16) / Math.max(rows, 1));
  const r = Math.min(TOKEN_R, cell / 2 - 0.5);
  for (let i = 0; i < capacity; i++) {
    const cx = x + ((i % TOKEN_COLS) - (TOKEN_COLS - 1) / 2) * TOKEN_GAP;
    const cy = bottom - 10 - Math.floor(i / TOKEN_COLS) * cell;
    const fill = clamp01(n - i);
    ctx.strokeStyle = C.cellLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (fill > 0) {
      ctx.globalAlpha = token ? 0.25 + 0.75 * fill : 1;
      ctx.fillStyle = token ? C.hi : C.info;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (token ? Math.max(0.35, fill) : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawTimeline(ctx: Ctx, w: number, top: number, bottom: number, lim: Limiter, now: number, showWindows: boolean) {
  const left = 44;
  const right = w - 20;
  const plotW = right - left;
  const bins = Math.round(SPAN / BIN);
  const ok = new Array<number>(bins).fill(0);
  const bad = new Array<number>(bins).fill(0);
  const start = now - SPAN;
  for (const t of lim.accepted) if (t >= start) ok[Math.min(bins - 1, Math.floor((t - start) / BIN))]++;
  for (const t of lim.rejected) if (t >= start) bad[Math.min(bins - 1, Math.floor((t - start) / BIN))]++;
  const perBin = lim.p.limit * BIN;
  const maxV = Math.max(perBin * 2.2, ...ok.map((v, i) => v + bad[i]));
  const plotH = bottom - top - 18;
  const yOf = (v: number) => bottom - (v / maxV) * plotH;

  text(ctx, 'requests per 0.2 s · last 8 s', left, top - 2, { font: FONT.sans(11), align: 'left' });
  wire(ctx, [[{ x: left, y: bottom }, { x: right, y: bottom }]], { width: 1, dash: [] });

  if (showWindows) {
    const edges: [Pt, Pt][] = [];
    for (let s = Math.ceil(start); s <= now; s++) {
      const x = left + ((s - start) / SPAN) * plotW;
      edges.push([{ x, y: top + 10 }, { x, y: bottom }]);
    }
    wire(ctx, edges, { color: alpha(C.hi, 0.35), width: 1, dash: [3, 4] });
  }

  const bw = plotW / bins;
  for (let i = 0; i < bins; i++) {
    const x = left + i * bw + 1;
    if (ok[i]) rect(ctx, x, yOf(ok[i]), bw - 2, bottom - yOf(ok[i]), { fill: C.ok });
    if (bad[i]) rect(ctx, x, yOf(ok[i] + bad[i]), bw - 2, yOf(ok[i]) - yOf(ok[i] + bad[i]), { fill: C.bad });
  }

  // average limit line
  wire(ctx, [[{ x: left, y: yOf(perBin) }, { x: right, y: yOf(perBin) }]], { color: C.hi, width: 1, dash: [6, 4] });
  text(ctx, `limit ${lim.p.limit}/s`, right, yOf(perBin) - 8, { color: C.hi, font: FONT.mono(10), align: 'right' });
}
