// Canvas drawing for the message-queue simulation, plus the on-screen positions
// of messages (eased toward their logical slot every frame, in sim time).
import { bar, box, drawSpark, FONT, rect, text, wire } from '../../core/canvas';
import type { Pt } from '../../core/geometry';
import { alpha, TOKENS as C } from '../../core/palette';
import { BACKLOG_WARN, DEPTH_HISTORY, DLQ_SHOWN, DONE_FADE, SUBSCRIBERS, type Broker, type Msg } from './sim';

type Ctx = CanvasRenderingContext2D;

const SLOT = 22; // px per queued message
const EASE_RATE = 9; // how quickly a message glides to its target (per second)
const FANOUT_S = 0.35; // fresh pub/sub messages pause at the topic this long
const SPARK = { w: 220, h: 32, minMax: 10 };

export function layout(w: number, h: number, b: Broker) {
  const qx0 = Math.max(170, w * 0.24);
  const qx1 = w * 0.64;
  const cx = w * 0.82;
  const producers = [{ x: 58, y: h * 0.3 }, { x: 58, y: h * 0.58 }];
  if (b.mode === 'work') {
    const laneY = h * 0.44;
    const n = b.consumers.length;
    const top = 44;
    const bottom = h - 120;
    const consumers = b.consumers.map((_, i) => ({ x: cx, y: n === 1 ? laneY : top + ((bottom - top) * i) / (n - 1) }));
    return { qx0, qx1, lanes: [laneY], consumers, producers, topic: null, dlq: { x: (qx0 + qx1) / 2, y: h - 44 } };
  }
  const lanes = [h * 0.15, h * 0.39, h * 0.63];
  return {
    qx0: qx0 + 50, qx1, lanes, consumers: b.consumers.map((c) => ({ x: cx, y: lanes[c.lane] })), producers,
    topic: { x: qx0 - 10, y: h * 0.39 }, dlq: { x: (qx0 + qx1) / 2 + 25, y: h - 44 },
  };
}

type Layout = ReturnType<typeof layout>;

/** Where each message is drawn. Owned by the view, not the sim. */
export interface MessageView {
  broker: Broker | null;
  lastNow: number;
  pos: Map<number, Pt>;
}

export const createMessageView = (): MessageView => ({ broker: null, lastNow: 0, pos: new Map() });

/** Where a message is heading this frame, and how visible it is. `at` is where it is now. */
function target(m: Msg, b: Broker, L: Layout, at: Pt): Pt & { a: number } {
  const laneY = L.lanes[m.lane];
  switch (m.state) {
    case 'queued': {
      // fresh pub/sub messages fan out through the topic first
      if (L.topic && !m.redelivered && b.now - m.born < FANOUT_S) return { ...L.topic, a: 1 };
      const i = b.lanes[m.lane].indexOf(m);
      const maxSlots = Math.floor((L.qx1 - L.qx0) / SLOT);
      return { x: i < maxSlots ? L.qx1 - 12 - i * SLOT : L.qx0 + 8, y: laneY, a: i < maxSlots ? 1 : 0 };
    }
    case 'processing':
    case 'unacked': {
      const ci = b.consumers.findIndex((c) => c.id === m.heldBy);
      return ci >= 0 ? { x: L.consumers[ci].x - 36, y: L.consumers[ci].y, a: 1 } : { ...at, a: 1 };
    }
    case 'done':
      return { x: at.x + 200, y: at.y, a: Math.max(0, 1 - (b.now - m.stateAt) / DONE_FADE) };
    case 'dlq': {
      const i = b.dlq.indexOf(m);
      return { x: L.dlq.x - 66 + (i % DLQ_SHOWN) * 12, y: L.dlq.y + 6, a: 1 };
    }
  }
}

/** Glide every message toward its target by however much sim time passed since the last frame. */
function easeMessages(view: MessageView, b: Broker, L: Layout) {
  if (view.broker !== b) {
    view.broker = b;
    view.lastNow = b.now;
    view.pos.clear();
  }
  const k = Math.min(1, (b.now - view.lastNow) * EASE_RATE);
  view.lastNow = b.now;
  const live = new Set<number>();
  for (const m of b.msgs) {
    live.add(m.id);
    const p = view.pos.get(m.id) ?? { ...L.producers[m.producer] };
    const t = target(m, b, L, p);
    p.x += (t.x - p.x) * k;
    p.y += (t.y - p.y) * k;
    view.pos.set(m.id, p);
  }
  for (const id of view.pos.keys()) if (!live.has(id)) view.pos.delete(id);
}

export function drawScene(ctx: Ctx, w: number, h: number, b: Broker, view: MessageView) {
  const L = layout(w, h, b);
  easeMessages(view, b, L);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  drawWires(ctx, L, b);
  for (const p of L.producers) labelledBox(ctx, p.x, p.y, 84, 40, C.info, 'producer');
  if (L.topic) {
    ctx.fillStyle = C.cell;
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(L.topic.x, L.topic.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'topic', L.topic.x, L.topic.y - 38, { color: C.violet, font: FONT.sans(12, 700) });
  }
  drawQueues(ctx, L, b);
  drawConsumers(ctx, L, b);

  // dead-letter queue
  rect(ctx, L.dlq.x - 80, L.dlq.y - 22, 160, 44, { fill: alpha(C.bad, 0.06), stroke: alpha(C.bad, 0.45), lineWidth: 1.5, radius: 9 });
  text(ctx, `dead-letter queue · ${b.dlqTotal}`, L.dlq.x, L.dlq.y - 10, { color: C.bad });

  // messages
  for (const m of b.msgs) {
    const at = view.pos.get(m.id)!;
    const t = target(m, b, L, at);
    if (t.a <= 0.02) continue;
    ctx.globalAlpha = m.state === 'unacked' ? 0.55 : t.a;
    const fill = m.state === 'done' ? C.ok : m.state === 'dlq' ? C.bad : m.poison ? C.violet : C.info;
    envelope(ctx, at.x, at.y, fill, m.redelivered && m.state !== 'done' && m.state !== 'dlq');
    if (m.state === 'unacked') {
      // ring draining until the broker gives up waiting for an ack
      const left = Math.max(0, (m.redeliverAt - b.now) / (m.redeliverAt - m.stateAt));
      ctx.strokeStyle = C.hi;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(at.x, at.y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      text(ctx, 'no ack', at.x, at.y - 22, { color: C.hi });
    }
    ctx.globalAlpha = 1;
  }

  drawDepthChart(ctx, h, L, b);
}

function drawWires(ctx: Ctx, L: Layout, b: Broker) {
  const segments: [Pt, Pt][] = [];
  for (const p of L.producers) {
    const to = L.topic ?? { x: L.qx0 - 10, y: L.lanes[0] };
    segments.push([{ x: p.x + 40, y: p.y }, to]);
  }
  if (L.topic) for (const y of L.lanes) segments.push([L.topic, { x: L.qx0 - 10, y }]);
  L.consumers.forEach((p, i) => segments.push([{ x: L.qx1 + 10, y: L.lanes[b.consumers[i].lane] }, { x: p.x - 60, y: p.y }]));
  wire(ctx, segments);
}

function drawQueues(ctx: Ctx, L: Layout, b: Broker) {
  const maxSlots = Math.floor((L.qx1 - L.qx0) / SLOT);
  L.lanes.forEach((y, lane) => {
    rect(ctx, L.qx0 - 8, y - 15, L.qx1 - L.qx0 + 16, 30, { fill: alpha(C.bg, 0.8), stroke: C.cellLine, lineWidth: 1.5, radius: 8 });
    const name = b.mode === 'work' ? 'queue' : `${SUBSCRIBERS[lane].name} queue`;
    text(ctx, name, L.qx0 - 6, y - 25, { align: 'left' });
    text(ctx, 'head →', L.qx1 + 6, y - 25, { color: C.faint, align: 'right' });
    const depth = b.lanes[lane].length;
    if (depth > maxSlots) text(ctx, `+${depth - maxSlots} more waiting`, L.qx0 - 6, y + 25, { color: C.bad, align: 'left' });
  });
}

function drawConsumers(ctx: Ctx, L: Layout, b: Broker) {
  b.consumers.forEach((c, i) => {
    const p = L.consumers[i];
    const dead = c.deadUntil >= b.now;
    const name = b.mode === 'work' ? `worker ${c.id}` : SUBSCRIBERS[c.lane].name;
    rect(ctx, p.x - 58, p.y - 20, 116, 40, {
      fill: dead ? alpha(C.bad, 0.1) : C.cell,
      stroke: dead ? C.bad : c.msg ? C.ok : C.cellLine,
      lineWidth: 2,
      radius: 9,
    });
    const label = dead ? `💥 restarting ${(c.deadUntil - b.now).toFixed(1)}s` : name;
    text(ctx, label, p.x + 6, p.y - 5, { color: dead ? C.bad : C.text, font: FONT.sans(12) });
    if (!dead) {
      const progress = c.msg ? Math.min(1, (b.now - c.started) / c.duration) : 0;
      bar(ctx, p.x - 20, p.y + 9, 70, 4, progress, c.msg?.poison ? C.violet : C.ok);
    }
  });
}

/** Queue depth over the last 30 s, bottom left. */
function drawDepthChart(ctx: Ctx, h: number, L: Layout, b: Broker) {
  const hist = b.depthHistory.values;
  const sx = 20;
  const sy = h - 18;
  const sw = Math.min(SPARK.w, L.qx0 - 50);
  text(ctx, 'queue depth · last 30 s', sx, sy - 44, { font: FONT.sans(11), align: 'left' });
  wire(ctx, [[{ x: sx, y: sy }, { x: sx + sw, y: sy }]], { width: 1, dash: [] });
  drawSpark(ctx, { x: sx, y: sy - SPARK.h, w: sw, h: SPARK.h }, hist, {
    cap: DEPTH_HISTORY,
    minMax: SPARK.minMax,
    align: 'left',
    color: hist[hist.length - 1] > BACKLOG_WARN ? C.bad : C.hi,
  });
}

function labelledBox(ctx: Ctx, x: number, y: number, bw: number, bh: number, color: string, label: string) {
  box(ctx, x, y, bw, bh, { stroke: color, radius: 9 });
  text(ctx, label, x, y, { color: C.text, font: FONT.sans(12, 700) });
}

function envelope(ctx: Ctx, x: number, y: number, fill: string, outline: boolean) {
  rect(ctx, x - 8, y - 6, 16, 12, { fill, radius: 2.5 });
  ctx.strokeStyle = alpha(C.bg, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 5);
  ctx.lineTo(x, y + 1);
  ctx.lineTo(x + 7, y - 5);
  ctx.stroke();
  if (outline) rect(ctx, x - 10, y - 8, 20, 16, { stroke: C.hi, lineWidth: 2, radius: 4 });
}
