import type { Pt } from '../../core/geometry';
import { routeEdge, type NodeBox } from '../../core/graphLayout';
import type { DEdge } from './diagram';
import type { Level } from './model';

export const BOX = { w: 160, h: 48, rx: 8 } as const;
export const VIEW_W = 760;
/** GraphView's default gap between an arrowhead and its target. */
export const ARROW_GAP = 3;
/** Edge label size: 11px mono is about 6.6px a character; the lesson CSS sets the font size to match. */
export const LABEL_CHAR = 6.6;
const LABEL_H = 14;
/** The label's text sits this far above its anchor y (the baseline). */
const LABEL_BASELINE = 3.5;
const NODE_BOX: NodeBox = { shape: 'box', r: 0, w: BOX.w, h: BOX.h };

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the frame's title text starts (left edge, baseline). */
  title: Pt;
}

export interface ViewLayout {
  h: number;
  at: Record<string, Pt>;
  /** The dashed boundary of the element zoomed into (none at the top level). */
  frame: Frame | null;
  /** Where a label sits along its edge, 0 at the caller .. 1 at the callee (default the middle), by "from>to". */
  labelAt: Record<string, number>;
}

export const VIEWS: Record<Level, ViewLayout> = {
  1: {
    h: 400,
    at: { diner: { x: 160, y: 60 }, staff: { x: 600, y: 60 }, book: { x: 380, y: 200 }, payments: { x: 160, y: 340 }, email: { x: 600, y: 340 } },
    frame: null,
    labelAt: {},
  },
  2: {
    h: 560,
    at: {
      diner: { x: 150, y: 40 }, staff: { x: 610, y: 40 },
      web: { x: 380, y: 150 }, api: { x: 380, y: 265 }, db: { x: 285, y: 385 }, queue: { x: 475, y: 385 }, worker: { x: 475, y: 490 },
      payments: { x: 660, y: 330 }, email: { x: 660, y: 420 },
    },
    frame: { x: 190, y: 100, w: 380, h: 440, title: { x: 202, y: 530 } },
    labelAt: { 'api>db': 0.4, 'api>queue': 0.6, 'api>payments': 0.6, 'worker>email': 0.35 },
  },
  3: {
    h: 600,
    at: {
      web: { x: 380, y: 40 },
      bookingApi: { x: 380, y: 170 }, availability: { x: 170, y: 290 }, reservations: { x: 170, y: 420 }, paymentClient: { x: 400, y: 300 }, eventPublisher: { x: 610, y: 300 },
      db: { x: 170, y: 540 }, payments: { x: 400, y: 540 }, queue: { x: 610, y: 540 },
    },
    frame: { x: 40, y: 115, w: 680, h: 355, title: { x: 52, y: 460 } },
    labelAt: { 'bookingApi>reservations': 0.7, 'availability>reservations': 0.7, 'reservations>db': 0.6, 'bookingApi>paymentClient': 0.4, 'bookingApi>eventPublisher': 0.6 },
  },
  4: {
    h: 560,
    at: {
      bookingApi: { x: 380, y: 40 },
      availabilityService: { x: 380, y: 170 }, slotPolicy: { x: 230, y: 290 }, tableCalendar: { x: 530, y: 290 }, openingHours: { x: 230, y: 400 },
      reservations: { x: 530, y: 510 },
    },
    frame: { x: 100, y: 100, w: 560, h: 350, title: { x: 112, y: 440 } },
    labelAt: {},
  },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boxRect = (c: Pt): Rect => ({ x: c.x - BOX.w / 2, y: c.y - BOX.h / 2, w: BOX.w, h: BOX.h });

export const rectsOverlap = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Where GraphView puts an edge's label (the kit's own router), as the text's anchor point. */
export function labelPoint(a: Pt, b: Pt, labelAt?: number): Pt {
  const route = routeEdge(a, b, NODE_BOX, NODE_BOX, { directed: true, arrowGap: ARROW_GAP, labelAt });
  return route.label;
}

/** The rectangle a label's text covers. */
export function labelRect(anchor: Pt, text: string): Rect {
  const w = text.length * LABEL_CHAR + 4;
  return { x: anchor.x - w / 2, y: anchor.y - LABEL_BASELINE - LABEL_H / 2, w, h: LABEL_H };
}

export const edgeKey = (e: Pick<DEdge, 'from' | 'to'>) => `${e.from}>${e.to}`;

/** The frame's title text as a rectangle (uppercase mono at 12px, about 7.2px a character). */
export const frameTitleRect = (f: Frame, text: string): Rect => ({ x: f.title.x, y: f.title.y - 12, w: text.length * 7.2, h: 14 });

// ---- the "bad diagram" scene ----

export const FIX_VIEW = { w: VIEW_W, h: 380 } as const;
export const FIX_AT: Record<string, Pt> = {
  diner: { x: 380, y: 40 }, web: { x: 380, y: 130 }, api: { x: 380, y: 220 },
  resTable: { x: 170, y: 320 }, db: { x: 170, y: 320 }, payments: { x: 590, y: 320 },
};
/** Where the title is drawn in the fix scene (left edge, baseline). */
export const FIX_TITLE: Pt = { x: 12, y: 22 };
