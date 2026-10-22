// Canvas drawing for the backpressure pipeline. The sim knows nothing about pixels:
// the renderer keeps each item's on-screen position and eases it toward the slot its
// state puts it in, advancing by sim time so a paused sim stands still.
import { box, dot, drawSpark, FONT, rect, text, wire } from '../../core/canvas';
import { duration } from '../../core/format';
import type { Pt } from '../../core/geometry';
import { clamp01 } from '../../core/math';
import { alpha, TOKENS as C } from '../../core/palette';
import { arrivalRate, CAP, HISTORY, ITEM_FADE_S, littleCheck, MEM_LIMIT, mm1Latency, MU, SHED_AT, type Item, type Pipeline, type World } from './sim';

type Ctx = CanvasRenderingContext2D;

const EASE_RATE = 10; // how fast items slide toward their slot (per second)
const P99_BAD_S = 3;
const DANGER_UTILISATION = 0.8;
const CURVE_MAX_S = 2;
const CURVE_STEPS = 200;

const TITLE = FONT.sans(12, 700);
const LABEL = FONT.sans(11);
const SMALL = FONT.mono(9);

function layout(w: number) {
  const qx0 = 150;
  const qx1 = Math.max(qx0 + 260, w * 0.58);
  return { px: 66, qx0, qx1, wx: qx1 + 70, sx: qx1 + 170, mx: w - 40, y: 112, binY: 215, bottomTop: 282, slot: (qx1 - qx0) / CAP };
}

type Layout = ReturnType<typeof layout>;

/** How many queue slots fit in the pipe; items further back are "in memory" only. */
const visibleSlots = (L: Layout) => Math.floor((L.qx1 - L.qx0) / L.slot);

function target(it: Item, p: Pipeline, L: Layout, at: Pt): Pt {
  switch (it.state) {
    case 'queued': {
      const i = p.queue.indexOf(it);
      return i >= 0 && i < visibleSlots(L) ? { x: L.qx1 - L.slot * (i + 0.5), y: L.y } : { x: L.qx0 + 4, y: L.y };
    }
    case 'serving':
      return { x: L.wx - 32, y: L.y };
    case 'done':
      return { x: L.sx + 20, y: L.y };
    case 'rejected':
      return { x: at.x + 8, y: L.binY };
  }
}

/** Returns a draw function that remembers where every item is on screen. */
export function createRenderer() {
  let positions = new Map<number, Pt>();
  let pipeline: Pipeline | null = null;
  let lastNow = 0;

  return function drawScene(ctx: Ctx, w: number, h: number, world: World) {
    const p = world.p;
    if (p !== pipeline) {
      // a reset: new pipeline, new items
      pipeline = p;
      positions = new Map();
      lastNow = p.now;
    }
    const dt = Math.max(0, p.now - lastNow);
    lastNow = p.now;
    const L = layout(w);

    const k = Math.min(1, dt * EASE_RATE);
    const spawn = { x: L.px + 34, y: L.y };
    const next = new Map<number, Pt>();
    for (const it of p.items) {
      const at = positions.get(it.id) ?? { ...spawn };
      const t = target(it, p, L, at);
      at.x += (t.x - at.x) * k;
      at.y += (t.y - at.y) * k;
      next.set(it.id, at);
    }
    positions = next;

    drawPipeline(ctx, L, world, positions);
    drawCurve(ctx, 20, L.bottomTop, Math.max(280, w * 0.46), h - 12, arrivalRate(world) / MU);
    drawLittle(ctx, Math.max(320, w * 0.52), L.bottomTop, w - 20, h - 12, world);
  };
}

function drawPipeline(ctx: Ctx, L: Layout, world: World, positions: Map<number, Pt>) {
  const p = world.p;
  const now = p.now;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // producer
  const blocked = p.policy === 'bounded' && p.pendingUpstream > 0;
  box(ctx, L.px, L.y, 92, 58, { stroke: blocked ? C.hi : C.info });
  text(ctx, 'producer', L.px, L.y - 10, { color: C.text, font: TITLE });
  text(ctx, blocked ? '⏸ waiting' : `${arrivalRate(world)}/s`, L.px, L.y + 10, { color: blocked ? C.hi : C.muted });
  if (blocked) text(ctx, `${p.pendingUpstream} waiting upstream`, L.px, L.y + 46, { color: C.hi });

  // queue pipe
  rect(ctx, L.qx0 - 6, L.y - 16, L.qx1 - L.qx0 + 12, 32, { fill: alpha(C.bg, 0.85), stroke: C.cellLine, lineWidth: 1.5, radius: 8 });
  text(ctx, p.policy === 'unbounded' ? 'queue (no limit)' : `queue · max ${CAP}`, L.qx0 - 4, L.y - 28, { align: 'left' });
  if (p.policy !== 'unbounded') {
    // the hard wall at the capacity limit
    wire(ctx, [[{ x: L.qx0 - 6, y: L.y - 20 }, { x: L.qx0 - 6, y: L.y + 20 }]], { color: C.bad, width: 3, dash: [] });
  }
  if (p.policy === 'shed') {
    const x = L.qx1 - L.slot * SHED_AT;
    wire(ctx, [[{ x, y: L.y - 22 }, { x, y: L.y + 22 }]], { color: C.violet, width: 1.5, dash: [3, 3] });
    text(ctx, 'shed low priority past here', x, L.y + 32, { color: C.violet, font: FONT.mono(10) });
  }
  const visible = visibleSlots(L);
  if (p.queue.length > visible) {
    text(ctx, `+${p.queue.length - visible} more in memory`, L.qx0 - 4, L.y + 30, { color: C.bad, align: 'left' });
  }

  // worker and sink
  box(ctx, L.wx, L.y, 96, 58, { stroke: p.down ? C.bad : p.serving ? C.ok : C.cellLine });
  box(ctx, L.sx, L.y, 64, 40, { stroke: C.ok });

  // reject bin
  rect(ctx, L.qx0 - 6, L.binY - 14, 190, 28, { fill: alpha(C.bad, 0.06), stroke: alpha(C.bad, 0.45), lineWidth: 2, radius: 8 });
  text(ctx, 'dropped · 503 · lost', L.qx0 + 4, L.binY, { color: C.bad, align: 'left' });

  drawMemory(ctx, L, p);

  // items
  for (const it of p.items) {
    if (it.state === 'queued' && p.queue.indexOf(it) >= visible) continue;
    const at = positions.get(it.id);
    if (!at) continue;
    const fading = it.state === 'done' || it.state === 'rejected';
    ctx.globalAlpha = fading ? Math.max(0, 1 - (now - it.stateAt) / ITEM_FADE_S) : 1;
    const fill = it.state === 'done' ? C.ok : it.state === 'rejected' ? C.bad : p.policy === 'shed' && it.high ? C.hi : C.info;
    rect(ctx, at.x - 6, at.y - 6, 12, 12, { fill, radius: 2.5 });
    ctx.globalAlpha = 1;
  }

  // labels go on top of the items passing through
  if (p.down) {
    text(ctx, '💥 OOM-killed', L.wx, L.y - 8, { color: C.bad, font: TITLE });
    text(ctx, `restart ${(p.crashedUntil - now).toFixed(1)}s`, L.wx, L.y + 12, { color: C.bad });
  } else {
    text(ctx, 'worker', L.wx + 12, L.y - 10, { color: C.text, font: TITLE });
    text(ctx, `${MU}/s max`, L.wx + 12, L.y + 10);
  }
  text(ctx, 'done', L.sx, L.y - 30, { color: C.ok, font: TITLE });
}

function drawMemory(ctx: Ctx, L: Layout, p: Pipeline) {
  const top = 40;
  const bottom = 200;
  const fill = clamp01(p.inSystem / MEM_LIMIT);
  const inner = (bottom - top - 4) * fill;
  rect(ctx, L.mx - 12, top, 24, bottom - top, { fill: C.cell, stroke: C.cellLine, lineWidth: 2, radius: 6 });
  rect(ctx, L.mx - 10, bottom - 2 - inner, 20, inner, { fill: fill > 0.8 ? C.bad : fill > 0.4 ? C.hi : C.ok, radius: 4 });
  wire(ctx, [[{ x: L.mx - 18, y: top }, { x: L.mx + 18, y: top }]], { color: C.bad, width: 2, dash: [3, 3] });
  text(ctx, 'OOM', L.mx, top - 10, { color: C.bad });
  text(ctx, 'memory', L.mx, bottom + 14);
}

/** The M/M/1 latency curve with a "you are here" dot at the current utilisation. */
function drawCurve(ctx: Ctx, x0: number, top: number, x1: number, bottom: number, rho: number) {
  text(ctx, 'avg latency vs utilisation (M/M/1 queue)', x0, top, { font: LABEL, align: 'left' });
  const pl = x0 + 34;
  const pt = top + 18;
  const pb = bottom - 18;
  const xOf = (r: number) => pl + (x1 - pl) * r;
  const yOf = (v: number) => pb - (Math.min(v, CURVE_MAX_S) / CURVE_MAX_S) * (pb - pt);

  // danger zone past the knee
  rect(ctx, xOf(DANGER_UTILISATION), pt, xOf(1) - xOf(DANGER_UTILISATION), pb - pt, { fill: alpha(C.bad, 0.07) });
  ctx.strokeStyle = C.line2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pl, pt);
  ctx.lineTo(pl, pb);
  ctx.lineTo(x1, pb);
  ctx.stroke();
  for (const r of [0, 0.5, DANGER_UTILISATION, 1]) {
    text(ctx, `${r * 100}%`, xOf(r), pb + 10, { color: r === DANGER_UTILISATION ? C.bad : C.faint, font: SMALL });
  }
  for (const v of [0, 1, 2]) text(ctx, `${v}s`, pl - 6, yOf(v), { color: C.faint, font: SMALL, align: 'right' });

  ctx.strokeStyle = C.hi;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const r = (i / CURVE_STEPS) * 0.995;
    const W = mm1Latency(MU, r * MU);
    if (i) ctx.lineTo(xOf(r), yOf(W));
    else ctx.moveTo(xOf(r), yOf(W));
  }
  ctx.stroke();

  // you are here
  const r = Math.min(rho, 1);
  const W = mm1Latency(MU, rho * MU);
  const color = rho >= 1 ? C.bad : rho >= DANGER_UTILISATION ? C.hi : C.ok;
  dot(ctx, xOf(r), yOf(W), 6, color, { glow: 10 });
  const label = rho >= 1 ? 'you: ∞ (queue grows forever)' : `you: ${Math.round(rho * 100)}% → ${duration(W)}`;
  const right = rho > 0.6;
  text(ctx, label, xOf(r) + (right ? -10 : 10), Math.max(pt + 6, yOf(W) - 12), { color, align: right ? 'right' : 'left' });
}

/** Little's Law measured live, plus the p99 history chart. */
function drawLittle(ctx: Ctx, x0: number, top: number, x1: number, bottom: number, world: World) {
  const st = world.p.stats();
  text(ctx, "Little's Law · last 10 s (a noisy window)", x0, top, { font: LABEL, align: 'left' });
  const rows: [string, string, string][] = [
    ['L', `${st.L.toFixed(1)} items`, 'in the system on average'],
    ['λ', `${st.throughput.toFixed(1)}/s`, 'throughput'],
    ['W', st.W >= 1 ? `${st.W.toFixed(2)} s` : `${Math.round(st.W * 1000)} ms`, 'average time inside'],
  ];
  rows.forEach(([sym, val, note], i) => {
    const y = top + 24 + i * 22;
    text(ctx, sym, x0, y, { color: C.hi, font: FONT.mono(14, 700), align: 'left' });
    text(ctx, val, x0 + 26, y, { color: C.text, font: FONT.mono(13, 700), align: 'left' });
    text(ctx, note, x0 + 120, y, { color: C.faint, font: LABEL, align: 'left' });
  });
  // Little's Law only holds in steady state; while the queue is still growing or draining, it won't match
  const { lw, steady } = littleCheck(st);
  text(
    ctx,
    steady ? `λ × W = ${lw.toFixed(1)}  ≈  L = ${st.L.toFixed(1)}  ✓` : `λ × W = ${lw.toFixed(1)}  ≠  L = ${st.L.toFixed(1)}`,
    x0,
    top + 90,
    { color: steady ? C.ok : C.hi, font: FONT.mono(13, 700), align: 'left' },
  );
  if (!steady) {
    text(ctx, 'not steady yet: the queue is still growing or draining', x0, top + 106, { color: C.hi, font: FONT.sans(10), align: 'left' });
  }

  // p99 history
  const axisY = bottom - 4;
  const chartTop = top + 134;
  const hist = world.history.values;
  text(ctx, 'p99 latency · last 30 s', x0, chartTop - 6, { font: FONT.sans(10), align: 'left' });
  wire(ctx, [[{ x: x0, y: axisY }, { x: x1, y: axisY }]], { width: 1, dash: [] });
  if (hist.length > 1) {
    const max = Math.max(1, ...hist);
    const plot = { x: x0, y: chartTop + 4, w: x1 - x0, h: axisY - chartTop - 4 };
    drawSpark(ctx, plot, hist, { cap: HISTORY, max, color: hist[hist.length - 1] > P99_BAD_S ? C.bad : C.info });
    text(ctx, max >= 1 ? `${max.toFixed(1)}s` : '', x1, chartTop - 6, { color: C.faint, font: SMALL, align: 'right' });
  }
}
