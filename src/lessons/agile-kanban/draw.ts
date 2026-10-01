// Canvas drawing for the kanban board (top) and the cumulative flow diagram (bottom).
import { FONT, rect, text } from '../../core/canvas';
import { alpha, TOKENS as C } from '../../core/palette';
import {
  CFD_DAYS, inReview, inStage, isBlocked, SPRINT_DAYS, sprintBacklog, type Card, type Counts, type Stage, type World,
} from './sim';

type Ctx = CanvasRenderingContext2D;

const PAD = 14;
const COL_GAP = 10;
const HEADER_H = 26;
const CARD_W = 46;
const CARD_H = 20;
const CARD_GAP = 5;
const BOARD_TOP = 8;
const BOARD_H = 236;
const CFD_TOP = BOARD_TOP + BOARD_H + 22;
const CFD_BOTTOM_PAD = 26;
/** Room to the right of the chart for the WIP and cycle-time labels. */
const CFD_LABEL_W = 92;
const DONE_SHOWN = 12;

/** One hue per column, shared by the board headers and the CFD bands (categorical). */
// Review is pink, not amber: amber read as the yellow of a card being worked on.
export const COLUMN_COLOR: Record<Stage, string> = { backlog: C.info, dev: C.violet, review: C.pink, done: C.ok };
/** Room kept clear at the right of the axis for the "sprints: 10 days" label. */
const SPRINT_LABEL_ROOM = 120;
const COLUMNS: { stage: Stage; label: string }[] = [
  { stage: 'backlog', label: 'Backlog' },
  { stage: 'dev', label: 'In progress' },
  { stage: 'review', label: 'Review' },
  { stage: 'done', label: 'Done' },
];

export function drawScene(ctx: Ctx, w: number, h: number, world: World) {
  drawBoard(ctx, w, world);
  drawCfd(ctx, PAD, CFD_TOP, w - PAD * 2, h - CFD_TOP - CFD_BOTTOM_PAD, world);
}

function drawBoard(ctx: Ctx, w: number, world: World) {
  const colW = (w - PAD * 2 - COL_GAP * 3) / 4;
  const reviewing = new Set(inReview(world).map((c) => c.id));
  COLUMNS.forEach((col, i) => {
    const x = PAD + i * (colW + COL_GAP);
    rect(ctx, x, BOARD_TOP, colW, BOARD_H, { fill: alpha(C.cell, 0.6), stroke: C.line, radius: 10 });
    rect(ctx, x, BOARD_TOP, colW, 3, { fill: COLUMN_COLOR[col.stage], radius: 2 });

    const cards = col.stage === 'done' ? world.recentDone.slice(-DONE_SHOWN).reverse() : inStage(world, col.stage);
    text(ctx, col.label, x + 10, BOARD_TOP + 17, { color: C.text, font: FONT.sans(12, 700), align: 'left', baseline: 'middle' });
    text(ctx, headerCount(col.stage, cards.length, world), x + colW - 10, BOARD_TOP + 17, {
      color: col.stage === 'dev' && world.process === 'kanban' && Number.isFinite(world.wipLimit) ? C.violet : C.muted,
      font: FONT.mono(11), align: 'right', baseline: 'middle',
    });

    const perRow = Math.max(1, Math.floor((colW - 16 + CARD_GAP) / (CARD_W + CARD_GAP)));
    const rows = Math.floor((BOARD_H - HEADER_H - 12 + CARD_GAP) / (CARD_H + CARD_GAP));
    const room = perRow * rows;
    const slots = col.stage === 'dev' && world.process === 'kanban' && Number.isFinite(world.wipLimit) ? world.wipLimit : 0;
    const shown = Math.min(cards.length, cards.length > room ? room - 1 : room);
    const at = (k: number) => ({
      cx: x + 8 + (k % perRow) * (CARD_W + CARD_GAP),
      cy: BOARD_TOP + HEADER_H + 6 + Math.floor(k / perRow) * (CARD_H + CARD_GAP),
    });

    // Empty WIP-limit slots: the violet dashed outlines are how much more In progress may take.
    for (let k = cards.length; k < Math.min(slots, room); k++) {
      const { cx, cy } = at(k);
      ctx.setLineDash([3, 3]);
      rect(ctx, cx, cy, CARD_W, CARD_H, { stroke: C.violet, radius: 5 });
      ctx.setLineDash([]);
    }
    for (let k = 0; k < shown; k++) {
      const { cx, cy } = at(k);
      drawCard(ctx, cx, cy, cards[k], world, reviewing.has(cards[k].id));
    }
    if (cards.length > shown) {
      const { cx, cy } = at(shown);
      text(ctx, `+${cards.length - shown}`, cx + CARD_W / 2, cy + CARD_H / 2, { color: C.muted, font: FONT.mono(11, 700), align: 'center', baseline: 'middle' });
    }
    if (col.stage === 'dev' && slots > 0 && cards.length >= slots) {
      text(ctx, 'limit reached: finish something first', x + colW / 2, BOARD_TOP + BOARD_H - 12, { color: C.violet, font: FONT.sans(10.5), align: 'center', baseline: 'middle' });
    }
  });
}

function headerCount(stage: Stage, shown: number, world: World) {
  if (stage === 'done') return `${world.counts.done} total`;
  if (stage === 'backlog' && world.process === 'scrum') return `${shown} · ${sprintBacklog(world)} in sprint`;
  if (stage === 'dev' && world.process === 'kanban' && Number.isFinite(world.wipLimit)) return `${shown} / ${world.wipLimit}`;
  return String(shown);
}

function drawCard(ctx: Ctx, x: number, y: number, card: Card, world: World, reviewing: boolean) {
  const blocked = isBlocked(card, world.t);
  const worked = (card.stage === 'dev' && !blocked) || reviewing;
  const inSprint = card.stage === 'backlog' && card.committed;
  const tone = blocked ? C.bad : card.stage === 'done' ? C.ok : worked ? C.hi : inSprint ? C.violet : C.cellLine;
  rect(ctx, x, y, CARD_W, CARD_H, { fill: worked || blocked || card.stage === 'done' ? alpha(tone, 0.16) : C.cell, stroke: tone, radius: 5, lineWidth: worked || blocked ? 1.5 : 1 });
  text(ctx, blocked ? 'wait' : `#${card.id}`, x + CARD_W / 2, y + CARD_H / 2 - (worked ? 2 : 0), {
    color: blocked ? C.bad : card.stage === 'done' ? C.ok : worked ? C.text : C.muted,
    font: FONT.mono(10, 700), align: 'center', baseline: 'middle',
  });
  if (worked) {
    const done = card.stage === 'dev' ? 1 - card.devLeft / card.devTotal : 1 - card.reviewLeft / card.reviewTotal;
    rect(ctx, x + 5, y + CARD_H - 5, (CARD_W - 10) * Math.max(0, Math.min(1, done)), 2, { fill: C.hi });
  }
}

/** Stacked cumulative counts: band thickness = cards in that column, horizontal gap = time in the system. */
function drawCfd(ctx: Ctx, x: number, y: number, fullW: number, h: number, world: World) {
  const samples = world.cfd.values;
  const w = fullW - CFD_LABEL_W;
  text(ctx, 'Cumulative flow: cards that ever reached each column', x, y - 9, { color: C.muted, font: FONT.sans(11, 700), align: 'left', baseline: 'middle' });
  rect(ctx, x, y, w, h, { stroke: C.line, radius: 6 });
  if (samples.length < 2) return;

  const t1 = world.t;
  const t0 = Math.max(0, t1 - CFD_DAYS);
  const lo = samples[0].done;
  const hi = Math.max(lo + 5, ...samples.map((s) => s.arrived));
  const px = (t: number) => x + ((t - t0) / Math.max(1, t1 - t0)) * w;
  const py = (n: number) => y + h - ((n - lo) / (hi - lo)) * (h - 6);

  const band = (top: (s: Counts) => number, bottom: (s: Counts) => number, color: string) => {
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(px(s.t), py(top(s))) : ctx.moveTo(px(s.t), py(top(s)))));
    for (let i = samples.length - 1; i >= 0; i--) ctx.lineTo(px(samples[i].t), py(bottom(samples[i])));
    ctx.closePath();
    ctx.fillStyle = alpha(color, 0.3);
    ctx.fill();
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(px(s.t), py(top(s))) : ctx.moveTo(px(s.t), py(top(s)))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  band((s) => s.done, () => lo, COLUMN_COLOR.done);
  band((s) => s.reviewing, (s) => s.done, COLUMN_COLOR.review);
  band((s) => s.started, (s) => s.reviewing, COLUMN_COLOR.dev);
  band((s) => s.arrived, (s) => s.started, COLUMN_COLOR.backlog);

  // Scrum: sprint boundaries (planning, and the review that demos the sprint's Done cards).
  if (world.process === 'scrum') {
    ctx.setLineDash([4, 4]);
    for (const m of world.sprints.filter((s) => s.t >= t0)) {
      ctx.beginPath();
      ctx.moveTo(px(m.t), y);
      ctx.lineTo(px(m.t), y + h);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, `review: ${m.demoed} demoed`, px(m.t) + 4, y + 11, { color: C.text, font: FONT.mono(10), align: 'left', baseline: 'middle' });
    }
    ctx.setLineDash([]);
  }

  // Now: WIP is the vertical thickness of the started-but-not-done bands...
  const now = samples[samples.length - 1];
  const nx = px(now.t);
  const yDone = py(now.done);
  const yStarted = py(now.started);
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nx + 6, yStarted);
  ctx.lineTo(nx + 6, yDone);
  ctx.moveTo(nx + 2, yStarted);
  ctx.lineTo(nx + 10, yStarted);
  ctx.moveTo(nx + 2, yDone);
  ctx.lineTo(nx + 10, yDone);
  ctx.stroke();
  text(ctx, `WIP ${now.started - now.done}`, nx + 14, Math.min((yStarted + yDone) / 2, yDone - 8), { color: C.text, font: FONT.mono(10, 700), align: 'left', baseline: 'middle' });

  // ...and cycle time is the horizontal gap between starting a card and finishing it.
  const startedThen = samples.find((s) => s.started >= now.done);
  if (startedThen && now.t - startedThen.t > 0.5) {
    const sx = px(startedThen.t);
    ctx.beginPath();
    ctx.moveTo(sx, yDone);
    ctx.lineTo(nx, yDone);
    ctx.stroke();
    text(ctx, `≈ cycle ${(now.t - startedThen.t).toFixed(1)} d`, nx + 14, yDone + 11, { color: C.text, font: FONT.mono(10, 700), align: 'left', baseline: 'middle' });
  }

  const firstTick = Math.ceil(t0 / 10) * 10;
  const tickLimit = x + fullW - (world.process === 'scrum' ? SPRINT_LABEL_ROOM : 0);
  for (let d = firstTick; d <= t1 && px(d) <= tickLimit; d += 10) {
    text(ctx, `day ${d}`, px(d), y + h + 13, { color: C.faint, font: FONT.mono(10), align: d === 0 ? 'left' : 'center', baseline: 'middle' });
  }
  if (world.process === 'scrum') {
    text(ctx, `sprints: ${SPRINT_DAYS} days`, x + fullW, y + h + 13, { color: C.faint, font: FONT.mono(10), align: 'right', baseline: 'middle' });
  }
}
