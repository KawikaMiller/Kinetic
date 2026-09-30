// Canvas drawing for the CDN world map. The land-dot background is rendered once
// per canvas size and reused every frame.
import { dot, drawSpark, FONT, rect, text } from '../../core/canvas';
import { alpha, TOKENS as C } from '../../core/palette';
import { getLandDots, project, type LonLat } from './map';
import { ASSETS, EDGES, ORIGIN, ORIGIN_HISTORY, SHIELD, type Cdn, type LegKind } from './sim';

type Ctx = CanvasRenderingContext2D;

export const LEG_COLOR: Record<LegKind, string> = { req: C.info, hit: C.ok, miss: C.hi };
export const SHIELD_COLOR = C.orange;

const TRAIL_ALPHA = 0x44 / 255; // the faint line behind each request
const EDGE_R = 8;
const RING_R = 12;
const HIT_RADIUS_PX = 26; // how close a click must be to select an edge
const LABEL = FONT.sans(10.5);

/** Index of the edge nearest the pixel (x, y) within click range, or -1. */
export function edgeAt(x: number, y: number, w: number, h: number) {
  let best = -1;
  let bestD = HIT_RADIUS_PX;
  EDGES.forEach((edge, i) => {
    const p = project(edge, w, h);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Returns a draw function that caches the map background per canvas size. */
export function createRenderer() {
  let map: { w: number; h: number; img: HTMLCanvasElement } | null = null;

  const mapImage = (w: number, h: number) => {
    if (map && map.w === w && map.h === h) return map.img;
    const img = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    img.width = Math.round(w * dpr);
    img.height = Math.round(h * dpr);
    const g = img.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = C.land;
    const r = Math.max(1.1, w / 520);
    for (const [lon, lat] of getLandDots()) {
      const { x, y } = project({ lon, lat }, w, h);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    map = { w, h, img };
    return img;
  };

  return function drawScene(ctx: Ctx, w: number, h: number, s: Cdn) {
    ctx.drawImage(mapImage(w, h), 0, 0, w, h);
    const P = (p: LonLat) => project(p, w, h);
    drawParticles(ctx, s, P);
    ctx.font = LABEL;
    ctx.textAlign = 'center';
    drawOrigin(ctx, s, P);
    drawEdges(ctx, s, P);
    drawOriginLoad(ctx, w, h, s);
  };
}

type Project = (p: LonLat) => { x: number; y: number };

/** Requests in flight: a dot on its current leg with a faint trail back to the leg's start. */
function drawParticles(ctx: Ctx, s: Cdn, P: Project) {
  const now = s.now;
  for (const part of s.particles) {
    const leg = part.legs.find((l) => now >= l.start && now < l.start + l.dur);
    if (!leg) continue;
    const k = (now - leg.start) / leg.dur;
    const a = P(leg.from);
    const b = P(leg.to);
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const col = LEG_COLOR[leg.kind];
    ctx.strokeStyle = alpha(col, TRAIL_ALPHA);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    dot(ctx, x, y, 2.6, col, { glow: 8 });
  }
}

function drawOrigin(ctx: Ctx, s: Cdn, P: Project) {
  const o = P(ORIGIN);
  const pulse = Math.max(0, 1 - (s.now - s.originFlash) * 3);
  ctx.fillStyle = C.violet;
  ctx.shadowColor = C.violet;
  ctx.shadowBlur = 10 + pulse * 18;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y - 10);
  ctx.lineTo(o.x + 10, o.y);
  ctx.lineTo(o.x, o.y + 10);
  ctx.lineTo(o.x - 10, o.y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  text(ctx, 'ORIGIN', o.x + 13, o.y + 4, { color: C.violet, font: LABEL, align: 'left' });

  if (s.settings.cdn && s.settings.shield) {
    const sp = P(SHIELD);
    dot(ctx, sp.x, sp.y, 6, SHIELD_COLOR);
    text(ctx, 'shield', sp.x, sp.y + 18, { color: SHIELD_COLOR, font: LABEL });
  }
}

/** Edge PoPs: a glow on each hit and a ring showing how full the cache is. */
function drawEdges(ctx: Ctx, s: Cdn, P: Project) {
  const on = s.settings.cdn;
  EDGES.forEach((e, i) => {
    const p = P(e);
    const selected = i === s.selected;
    const fill = s.cachedCount(i) / ASSETS;
    const glow = Math.max(0, 1 - (s.now - s.flash[i]) * 4);
    ctx.globalAlpha = on ? 1 : 0.3;
    ctx.fillStyle = C.panel;
    ctx.strokeStyle = selected ? C.text : C.info;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.shadowColor = C.ok;
    ctx.shadowBlur = glow * 16;
    ctx.beginPath();
    ctx.arc(p.x, p.y, EDGE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (on && fill > 0) {
      ctx.strokeStyle = C.ok;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, RING_R, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
      ctx.stroke();
    }
    text(ctx, e.name, p.x, p.y - 17, { color: selected ? C.text : C.muted, font: LABEL });
    ctx.globalAlpha = 1;
  });
}

/** The origin-load sparkline in the bottom-left corner. */
function drawOriginLoad(ctx: Ctx, w: number, h: number, s: Cdn) {
  const bx = 14;
  const bw = Math.min(220, w * 0.26);
  const bh = 46;
  const by = h - bh - 12;
  rect(ctx, bx, by, bw, bh, { fill: alpha(C.bg, 0.82), stroke: C.line, lineWidth: 1, radius: 8 });
  text(ctx, 'ORIGIN LOAD (req/s)', bx + 8, by + 14, { font: FONT.sans(10), align: 'left' });
  drawSpark(ctx, { x: bx + 8, y: by + 18, w: bw - 16, h: bh - 24 }, s.originHistory.values, {
    cap: ORIGIN_HISTORY,
    minMax: 5,
    align: 'left',
    color: C.violet,
    width: 1.6,
  });
}
