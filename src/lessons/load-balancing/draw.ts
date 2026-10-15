// Canvas drawing for the load-balancer simulation.
import { bar, dot, FONT, rect, text, wire } from '../../core/canvas';
import { easeInOutQuad, lerp } from '../../core/math';
import { TOKENS as C } from '../../core/palette';
import { FAIL_FADE, QUEUE_CAP, QUEUE_WARN, SERVER_COUNT, serverName, TRAVEL_BACK, TRAVEL_IN, TRAVEL_OUT, type World } from './sim';
import { strategy } from './strategies';

type Ctx = CanvasRenderingContext2D;

const BOX = { w: 126, h: 50 };
const LB_RADIUS = 32;
const QUEUE_SLOT = 12;
const DOT_R = 3.5;
const RING = { r: 13, width: 4 };

export function layout(w: number, h: number) {
  const sx = w - BOX.w / 2 - 24;
  const top = 44;
  const bottom = h - 44;
  return {
    clients: [0.25, 0.5, 0.75].map((f) => ({ x: 52, y: h * f })),
    lb: { x: Math.max(200, w * 0.34), y: h / 2 },
    servers: Array.from({ length: SERVER_COUNT }, (_, i) => ({ x: sx, y: top + ((bottom - top) * i) / (SERVER_COUNT - 1) })),
  };
}

/** Index of the server box under (x, y) in a w×h canvas, or -1. */
export function serverAt(x: number, y: number, w: number, h: number): number {
  return layout(w, h).servers.findIndex((p) => Math.abs(x - p.x) <= BOX.w / 2 && Math.abs(y - p.y) <= BOX.h / 2);
}

export function drawScene(ctx: Ctx, width: number, height: number, w: World) {
  const sim = w.sims[w.strategy];
  const L = layout(width, height);
  const now = w.now;
  const queueX = (i: number, k: number) => L.servers[i].x - BOX.w / 2 - 12 - k * QUEUE_SLOT;

  // links
  wire(ctx, L.clients.map((c) => [{ x: c.x + 20, y: c.y }, { x: L.lb.x - LB_RADIUS, y: L.lb.y }] as const), { width: 1.5, dash: [3, 5] });
  sim.servers.forEach((srv, i) => {
    const p = L.servers[i];
    const lied = srv.healthy && !srv.alive;
    wire(ctx, [[{ x: L.lb.x + LB_RADIUS, y: L.lb.y }, { x: queueX(i, QUEUE_CAP - 1) - 8, y: p.y }]], {
      color: lied ? C.bad : srv.healthy ? C.line2 : C.dim,
      dash: srv.healthy ? [] : [4, 6],
      width: srv.healthy ? 1.5 : 1,
    });
  });

  // clients
  for (const c of L.clients) {
    rect(ctx, c.x - 20, c.y - 14, 40, 26, { fill: C.cell, stroke: C.cellLine, lineWidth: 1.5, radius: 5 });
    rect(ctx, c.x - 14, c.y - 8, 28, 14, { fill: C.info });
    rect(ctx, c.x - 24, c.y + 12, 48, 3, { fill: C.cellLine });
  }
  text(ctx, 'clients', L.clients[0].x, L.clients[0].y - 26, { font: FONT.sans(11, 500), align: 'center' });

  drawBalancer(ctx, L.lb.x, L.lb.y, w);

  // servers
  sim.servers.forEach((srv, i) => {
    const p = L.servers[i];
    const x0 = p.x - BOX.w / 2;
    const y0 = p.y - BOX.h / 2;
    rect(ctx, x0, y0, BOX.w, BOX.h, {
      fill: srv.alive ? C.cell : C.cellDead,
      stroke: srv.alive ? C.cellLine : C.bad,
      lineWidth: 1.5,
      radius: 9,
    });
    drawUtilRing(ctx, x0 + 24, p.y, srv.alive ? srv.util : null);

    text(ctx, serverName(i), x0 + 46, p.y - 4, { color: srv.alive ? C.text : C.bad, font: FONT.sans(13, 700), align: 'left' });
    const sub = srv.alive ? `${srv.speed}× speed` : srv.healthy ? 'DOWN · unseen' : 'DOWN';
    text(ctx, sub, x0 + 46, p.y + 12, { color: srv.alive ? C.muted : C.bad, font: FONT.sans(10.5, 500), align: 'left' });

    // in-progress request's progress bar
    if (srv.current) {
      const r = srv.current;
      const t = Math.min(1, (now - r.tPhase) / Math.max(0.001, r.tEnd - r.tPhase));
      bar(ctx, x0 + 8, y0 + BOX.h - 6, BOX.w - 16, 3, t, C.hi);
    }

    // queue
    const full = srv.queue.length >= QUEUE_WARN;
    ctx.globalAlpha = 0.85;
    srv.queue.forEach((_, k) => rect(ctx, queueX(i, k) - 4.5, p.y - 4.5, 9, 9, { fill: full ? C.bad : C.amber }));
    ctx.globalAlpha = 1;
    if (srv.alive) rect(ctx, queueX(i, QUEUE_CAP - 1) - 7, p.y - 7, QUEUE_CAP * QUEUE_SLOT + 2, 14, { stroke: C.cellLine });
  });

  // requests heading to the LB (shared by every strategy)
  for (const p of w.pending) {
    const t = easeInOutQuad(Math.min(1, (now - p.t0) / TRAVEL_IN));
    const c = L.clients[p.spec.client];
    dot(ctx, lerp(c.x + 20, L.lb.x - 30, t), lerp(c.y, L.lb.y, t), DOT_R, C.info);
  }

  // requests owned by the visible strategy's sim
  for (const r of sim.reqs) {
    const age = now - r.tPhase;
    if (r.phase === 'toServer') {
      const p = L.servers[r.server];
      const t = easeInOutQuad(Math.min(1, age / TRAVEL_OUT));
      const tx = queueX(r.server, sim.servers[r.server].queue.length);
      dot(ctx, lerp(L.lb.x + 30, tx, t), lerp(L.lb.y, p.y, t), DOT_R, C.info);
    } else if (r.phase === 'back') {
      const p = L.servers[r.server];
      const c = L.clients[r.client];
      const t = easeInOutQuad(Math.min(1, age / TRAVEL_BACK));
      ctx.globalAlpha = 1 - t * 0.6;
      dot(ctx, lerp(p.x - BOX.w / 2, c.x + 20, t), lerp(p.y, c.y, t) - Math.sin(t * Math.PI) * 30, DOT_R, C.ok);
      ctx.globalAlpha = 1;
    } else if (r.phase === 'failed' || r.phase === 'dropped') {
      const at =
        r.server < 0
          ? L.lb
          : r.phase === 'dropped'
            ? { x: queueX(r.server, QUEUE_CAP), y: L.servers[r.server].y + age * 40 }
            : { x: L.servers[r.server].x - BOX.w / 2, y: L.servers[r.server].y };
      drawFailure(ctx, at.x, at.y, Math.min(1, age / FAIL_FADE));
    }
  }
}

/** The hexagonal load balancer with the current strategy's name under it. */
function drawBalancer(ctx: Ctx, x: number, y: number, w: World) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    ctx.lineTo(x + Math.cos(a) * LB_RADIUS, y + Math.sin(a) * LB_RADIUS);
  }
  ctx.closePath();
  ctx.fillStyle = C.cell;
  ctx.fill();
  ctx.strokeStyle = C.amber;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'LB', x, y + 5, { color: C.text, font: FONT.sans(14, 700), align: 'center' });
  const s = strategy(w.strategy);
  text(ctx, s.label, x, y + 50, { color: s.color, font: FONT.sans(11, 600), align: 'center' });
}

/** A utilisation ring; `util` null draws a dead server's ✕. */
function drawUtilRing(ctx: Ctx, x: number, y: number, util: number | null) {
  ctx.lineWidth = RING.width;
  ctx.strokeStyle = C.dim;
  ctx.beginPath();
  ctx.arc(x, y, RING.r, 0, Math.PI * 2);
  ctx.stroke();
  if (util !== null) {
    ctx.strokeStyle = util > 0.9 ? C.bad : util > 0.6 ? C.amber : C.ok;
    ctx.beginPath();
    ctx.arc(x, y, RING.r, -Math.PI / 2, -Math.PI / 2 + util * Math.PI * 2);
    ctx.stroke();
  }
  text(ctx, util !== null ? `${Math.round(util * 100)}` : '✕', x, y + 4, {
    color: util !== null ? C.text : C.bad,
    font: FONT.sans(10, 600),
    align: 'center',
  });
}

/** An expanding, fading ring where a request failed or was dropped. t: 0..1 through the fade. */
function drawFailure(ctx: Ctx, x: number, y: number, t: number) {
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = C.bad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 4 + t * 14, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, x, y, DOT_R, C.bad);
  ctx.globalAlpha = 1;
}
