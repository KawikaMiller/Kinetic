import { FONT, box, rect, text } from '../../core/canvas';
import { clamp01, lerp } from '../../core/math';
import { TOKENS, alpha } from '../../core/palette';
import {
  ANIM_RTT_S, BANDWIDTH_STOPS, PIPE_SLOTS, RTT_STOPS, blockBytes, rateText, sizeText, timeText, type Link, type PipeWorld,
} from './model';

const PAD = 14;
const LABEL_FONT = FONT.mono(11);
/** The pipe's length and thickness follow log(RTT) and log(bandwidth) between these limits. */
const MIN_LENGTH_SHARE = 0.16;
const MIN_THICK = 22;
const MAX_THICK = 66;

const logShare = (v: number, lo: number, hi: number) => clamp01(Math.log(v / lo) / Math.log(hi / lo));

/** Where the pipe sits for this canvas and link. */
export function pipeGeometry(w: number, h: number, l: Link) {
  const boxW = w < 520 ? 58 : 78;
  const maxLen = w - 2 * PAD - 2 * boxW - 12;
  const len = lerp(maxLen * MIN_LENGTH_SHARE, maxLen, logShare(l.rtt, RTT_STOPS[0], RTT_STOPS.at(-1)!));
  const thick = lerp(MIN_THICK, MAX_THICK, logShare(l.bandwidth, BANDWIDTH_STOPS[0], BANDWIDTH_STOPS.at(-1)!));
  const x0 = PAD + boxW + 6;
  return { boxW, x0, x1: x0 + len, len, thick, cy: h / 2 - 4 };
}

export function drawPipe(ctx: CanvasRenderingContext2D, w: number, h: number, world: PipeWorld, l: Link) {
  const g = pipeGeometry(w, h, l);
  const lane = g.thick / 2;
  const boxH = Math.max(56, g.thick + 16);

  box(ctx, PAD + g.boxW / 2, g.cy, g.boxW, boxH, { stroke: TOKENS.line2, fill: TOKENS.cell, radius: 10 });
  text(ctx, 'sender', PAD + g.boxW / 2, g.cy, { color: TOKENS.text, font: FONT.sans(12, 600), align: 'center', baseline: 'middle' });
  const rx = g.x1 + 6 + g.boxW / 2;
  box(ctx, rx, g.cy, g.boxW, boxH, { stroke: TOKENS.line2, fill: TOKENS.cell, radius: 10 });
  text(ctx, 'receiver', rx, g.cy, { color: TOKENS.text, font: FONT.sans(12, 600), align: 'center', baseline: 'middle' });

  // The pipe: data lane on top, ACK lane underneath, empty space dim.
  rect(ctx, g.x0, g.cy - lane, g.len, g.thick, { fill: alpha(TOKENS.dim, 0.45), stroke: TOKENS.line2, radius: 6 });
  ctx.strokeStyle = TOKENS.line2;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(g.x0, g.cy);
  ctx.lineTo(g.x1, g.cy);
  ctx.stroke();
  ctx.setLineDash([]);

  const slotW = g.len / (PIPE_SLOTS / 2);
  const blockW = Math.max(2, slotW * 0.78);
  // Blocks slide in and out of the pipe's ends, so clip them to it rather than squash them.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, g.cy - lane, g.len, g.thick);
  ctx.clip();
  const ackH = Math.max(3, (lane - 6) * 0.5);
  for (const b of world.blocks) {
    if (b.u < 0.5) rect(ctx, g.x0 + (b.u / 0.5) * g.len - blockW, g.cy - lane + 3, blockW, lane - 6, { fill: TOKENS.info, radius: 2 });
    else rect(ctx, g.x1 - ((b.u - 0.5) / 0.5) * g.len, g.cy + (lane - ackH) / 2, blockW, ackH, { fill: TOKENS.violet, radius: 2 });
  }
  ctx.restore();

  const mid = (g.x0 + g.x1) / 2;
  text(ctx, `data →`, g.x0 + 4, g.cy - lane - 8, { color: TOKENS.info, font: LABEL_FONT });
  text(ctx, `← ACKs`, g.x1 - 4, g.cy + lane + 14, { color: TOKENS.violet, font: LABEL_FONT, align: 'right' });
  text(ctx, `RTT ${timeText(l.rtt)} = length`, mid, PAD + 4, { color: TOKENS.muted, font: LABEL_FONT, align: 'center', baseline: 'top' });
  text(ctx, `${rateText(l.bandwidth)} = thickness (both log scale)`, w / 2, h - PAD - 16, { color: TOKENS.muted, font: LABEL_FONT, align: 'center' });
  text(ctx, `1 block = ${sizeText(blockBytes(l))} · slowed: 1 round trip = ${ANIM_RTT_S} s`, w / 2, h - PAD, { color: TOKENS.faint, font: LABEL_FONT, align: 'center' });
}
