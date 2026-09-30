// Canvas drawing for the circuit-breaker simulation.
import { bar, box, dot, drawSpark, FONT, rect, text, wire } from '../../core/canvas';
import { lerp } from '../../core/math';
import { TOKENS as C } from '../../core/palette';
import { travel } from '../../core/sim';
import { B_CAP, HISTORY, OPEN_FOR, THREADS, TIMEOUT, type BreakerState, type Sim, type World } from './sim';

type Ctx = CanvasRenderingContext2D;

const SPARK_FADE_S = 0.6; // how long a result dot takes to fly back to users
const MAX_B_DOTS = 80;
const B_DOT_COLS = 16;
const RETRY_COLS = 60;
const RETRY_STACK = 18;

const TITLE = FONT.sans(13, 700);
const LABEL = FONT.sans(11);
const SMALL = FONT.mono(9);

function layout(w: number) {
  return { ux: 52, ax: Math.max(210, w * 0.3), bx: w * 0.52, Bx: w - 110, y: 120, bottomTop: 318 };
}

export function drawScene(ctx: Ctx, w: number, h: number, world: World) {
  const sim = world.sim;
  const L = layout(w);
  const now = sim.now;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const aRight = L.ax + 88;
  const bLeft = L.Bx - 88;

  wire(ctx, [
    [{ x: L.ux + 30, y: L.y }, { x: L.ax - 88, y: L.y }],
    [{ x: aRight, y: L.y }, { x: L.bx - 26, y: L.y }],
    [{ x: L.bx + 26, y: L.y }, { x: bLeft, y: L.y }],
  ]);

  // users
  box(ctx, L.ux, L.y, 64, 42, { stroke: C.info });
  text(ctx, 'users', L.ux, L.y, { color: C.text, font: FONT.sans(12, 700) });

  drawServiceA(ctx, L.ax, L.y, sim);
  drawSwitch(ctx, L.bx, L.y, sim.mode === 'breaker' ? sim.breaker : null, now - sim.openedAt);
  drawServiceB(ctx, L.Bx, L.y, sim);

  // calls on the wire
  for (const c of sim.calls) {
    if (now < c.arriveB) {
      const t = travel({ x: aRight, y: 0 }, { x: bLeft, y: 0 }, c.sentAt, c.arriveB - c.sentAt, now);
      dot(ctx, t.x, L.y + ((c.id % 5) - 2) * 4, 3.5, c.probe ? C.hi : C.info);
    } else if (now >= c.bDoneAt && now < c.respAt) {
      const t = travel({ x: bLeft, y: 0 }, { x: aRight, y: 0 }, c.bDoneAt, c.respAt - c.bDoneAt, now);
      const color = c.timedOut ? C.faint : c.ok ? C.ok : C.bad;
      dot(ctx, t.x, L.y + 14 + ((c.id % 5) - 2) * 3, 3.5, color);
    }
  }

  // results flying back to users
  for (const sp of sim.sparks) {
    const t = Math.min(1, (now - sp.t) / SPARK_FADE_S);
    ctx.globalAlpha = 1 - t;
    dot(ctx, lerp(L.ax - 88, L.ux + 30, t), L.y + 20 + ((sp.id % 7) - 3) * 4, 3.5, sp.kind === 'fallback' ? C.hi : C.bad);
    ctx.globalAlpha = 1;
  }

  drawRetries(ctx, 20, L.bottomTop, Math.max(220, w * 0.34), h - 14, sim);
  drawChart(ctx, Math.max(260, w * 0.4), L.bottomTop, w - 20, h - 14, world);
}

function drawServiceA(ctx: Ctx, x: number, y: number, sim: Sim) {
  box(ctx, x, y, 176, 170);
  text(ctx, 'Service A', x, y - 70, { color: C.text, font: TITLE });
  const cols = 8;
  const cell = 16;
  const gx = x - (cols * cell) / 2 + cell / 2;
  const gy = y - 42;
  const waiting = new Set(sim.reqs.filter((r) => r.retryAt !== null).map((r) => r.id));
  sim.threads.forEach((r, i) => {
    const cx = gx + (i % cols) * cell;
    const cy = gy + Math.floor(i / cols) * cell;
    const fill = !r ? C.cell : waiting.has(r.id) ? C.violet : C.info;
    rect(ctx, cx - 6, cy - 6, 12, 12, { fill, stroke: C.cellLine, lineWidth: 1, radius: 2 });
  });
  const busy = sim.threads.filter(Boolean).length;
  text(ctx, `threads ${busy}/${THREADS}`, x, y + 58, { color: busy >= THREADS ? C.bad : C.muted });
  text(ctx, `timeout ${TIMEOUT}s`, x, y + 73, { color: C.faint });
}

function drawServiceB(ctx: Ctx, x: number, y: number, sim: Sim) {
  const now = sim.now;
  const conc = sim.bConcurrency;
  const { mult } = sim.bLoad(conc);
  const overloaded = conc > B_CAP;
  box(ctx, x, y, 176, 170, { stroke: overloaded ? C.bad : C.muted });
  text(ctx, 'Service B', x, y - 70, { color: C.text, font: TITLE });
  // one dot per call B is working on; grey = the caller already gave up
  const inB = sim.calls.filter((c) => c.scheduled && now < c.bDoneAt);
  const shown = inB.slice(0, MAX_B_DOTS);
  shown.forEach((c, i) => {
    dot(ctx, x - 70 + (i % B_DOT_COLS) * 9.3, y - 44 + Math.floor(i / B_DOT_COLS) * 11, 3.4, c.timedOut ? C.faint : C.info);
  });
  if (inB.length > shown.length) text(ctx, `+${inB.length - shown.length}`, x + 70, y + 12, { color: C.bad });

  // capacity bar with a tick at B's capacity
  const barW = 140;
  const fill = overloaded ? C.bad : conc > B_CAP * 0.7 ? C.hi : C.ok;
  bar(ctx, x - barW / 2, y + 30, barW, 6, conc / (B_CAP * 3), fill);
  rect(ctx, x - barW / 2 + barW / 3, y + 26, 1.5, 14, { fill: C.text });
  text(ctx, `${conc} busy · capacity ${B_CAP}`, x, y + 50, { color: overloaded ? C.bad : C.muted });
  text(ctx, `${mult.toFixed(1)}× slower · ${Math.round(sim.failRate * 100)}% fail`, x, y + 66, { color: overloaded ? C.bad : C.faint });
}

function drawSwitch(ctx: Ctx, x: number, y: number, state: BreakerState | null, openFor: number) {
  const color = state === null ? C.faint : state === 'closed' ? C.ok : state === 'open' ? C.bad : C.hi;
  // contacts
  dot(ctx, x - 24, y, 5, color);
  dot(ctx, x + 24, y, 5, color);
  // lever: flat when closed, raised when open, half-raised when half-open
  const angle = state === 'open' ? -0.75 : state === 'half' ? -0.35 : 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x - 24 + Math.cos(angle) * 48, y + Math.sin(angle) * 48);
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (state === null) {
    text(ctx, 'no breaker', x, y - 34, { color: C.faint });
    return;
  }

  // the state machine underneath
  const sy = y + 70;
  const nodes: { id: BreakerState; label: string; x: number; y: number; c: string }[] = [
    { id: 'closed', label: 'CLOSED', x: x - 58, y: sy, c: C.ok },
    { id: 'open', label: 'OPEN', x: x + 58, y: sy, c: C.bad },
    { id: 'half', label: 'HALF-OPEN', x, y: sy + 56, c: C.hi },
  ];
  wire(
    ctx,
    [
      [{ x: nodes[0].x + 30, y: nodes[0].y }, { x: nodes[1].x - 26, y: nodes[1].y }],
      [{ x: nodes[1].x - 10, y: nodes[1].y + 12 }, { x: nodes[2].x + 26, y: nodes[2].y - 10 }],
      [{ x: nodes[2].x - 26, y: nodes[2].y - 10 }, { x: nodes[0].x + 10, y: nodes[0].y + 12 }],
    ],
    { width: 1.5, dash: [] },
  );
  text(ctx, 'failures', x, sy - 9, { color: C.faint, font: SMALL });
  text(ctx, 'wait', x + 48, sy + 32, { color: C.faint, font: SMALL });
  text(ctx, 'probes ok', x - 52, sy + 32, { color: C.faint, font: SMALL });
  for (const n of nodes) {
    const on = n.id === state;
    ctx.globalAlpha = on ? 1 : 0.55;
    rect(ctx, n.x - 34, n.y - 11, 68, 22, { fill: on ? n.c : C.cell, stroke: n.c, lineWidth: on ? 2 : 1, radius: 11 });
    text(ctx, n.label, n.x, n.y, { color: on ? C.bg : n.c, font: FONT.mono(10, 700) });
    ctx.globalAlpha = 1;
  }
  if (state === 'open') text(ctx, `retry B in ${Math.max(0, OPEN_FOR - openFor).toFixed(1)}s`, x, y - 34, { color: C.bad });
}

function drawRetries(ctx: Ctx, x0: number, top: number, x1: number, bottom: number, sim: Sim) {
  text(ctx, 'when retries fire · delay after a failure', x0, top, { font: LABEL, align: 'left' });
  const axisY = bottom - 14;
  const maxDelay = 1;
  wire(ctx, [[{ x: x0, y: axisY }, { x: x1, y: axisY }]], { width: 1, dash: [] });
  for (const v of [0, 0.5, 1]) text(ctx, `${v}s`, x0 + ((x1 - x0) * v) / maxDelay, axisY + 10, { color: C.faint, font: SMALL });
  // stack dots into columns so a lockstep spike reads as a tower
  const cols = new Map<number, number>();
  for (const r of sim.retryDelays) {
    const col = Math.round((r.delay / maxDelay) * RETRY_COLS);
    const n = cols.get(col) ?? 0;
    cols.set(col, n + 1);
    const x = x0 + ((x1 - x0) * Math.min(col, RETRY_COLS)) / RETRY_COLS;
    const y = axisY - 5 - (n % RETRY_STACK) * 5;
    rect(ctx, x - 2, y - 2, 4, 4, { fill: sim.now - r.t < 0.4 ? C.hi : C.violet });
  }
  if (!sim.retryDelays.length) text(ctx, 'no retries right now', (x0 + x1) / 2, axisY - 30, { color: C.faint });
}

function drawChart(ctx: Ctx, x0: number, top: number, x1: number, bottom: number, world: World) {
  text(ctx, 'last 30 s', x0, top, { font: LABEL, align: 'left' });
  text(ctx, '— load on B', x0 + 64, top, { color: C.info, font: LABEL, align: 'left' });
  text(ctx, '— A errors %', x0 + 160, top, { color: C.bad, font: LABEL, align: 'left' });
  const hist = world.history.values;
  const plotTop = top + 16;
  const plotBottom = bottom - 14;
  const bandY = bottom - 8;
  wire(ctx, [[{ x: x0, y: plotBottom }, { x: x1, y: plotBottom }]], { width: 1, dash: [] });
  const plot = { x: x0, y: plotTop, w: x1 - x0, h: plotBottom - plotTop };
  const maxLoad = Math.max(40, ...hist.map((p) => p.bLoad));
  drawSpark(ctx, plot, hist.map((p) => p.bLoad), { cap: HISTORY, max: maxLoad, color: C.info });
  drawSpark(ctx, plot, hist.map((p) => p.err), { cap: HISTORY, max: 100, color: C.bad });
  // breaker state band
  const slot = (x1 - x0) / (HISTORY - 1);
  hist.forEach((p, i) => {
    if (world.sim.mode !== 'breaker' && p.breaker === 'closed') return;
    const fill = p.breaker === 'closed' ? C.ok : p.breaker === 'open' ? C.bad : C.hi;
    rect(ctx, x0 + slot * (i + HISTORY - hist.length), bandY, slot + 0.5, 5, { fill });
  });
}
