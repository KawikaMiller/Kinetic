import type { Pt } from '../../core/geometry';
import { outlineDistance, type NodeBox } from '../../core/graphLayout';
import { mulberry32, shuffle } from '../../core/random';
import { EDGES, FN_IDS, SLOTS, membersOf, type Assignment, type FnId, type Slot } from './model';

/** The drawing's fixed viewBox, so the scale never changes between layouts. */
export const VIEW = { w: 880, h: 306 } as const;
export const NODE = { w: 116, h: 28 } as const;
const COL_STEP = 130;
const ROW_STEP = 50;
const PAD = 14;
/** Room for the module's name above its first row. */
const HEAD = 30;
const MODULE_GAP = 22;
const TOP = 10;
const MAX_ROWS = 5;
/** An edge must clear a node it doesn't connect by this much to count as passing it. */
const CLEARANCE = 3;
/** One edge hidden behind a node outweighs any amount of extra edge length. */
const PASS_PENALTY = 1e6;
/** Seeded restarts of the ordering search, besides the plain member order. */
const RESTARTS = 24;
const BOX: NodeBox = { shape: 'box', r: 0, w: NODE.w, h: NODE.h };

export interface ModuleBox {
  slot: Slot;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One or two functions in one column, up to eight in two, more in three (never more than
 * five rows). Two columns give every function diagonal neighbours, so a function that calls
 * three others in its own module can sit next to all of them.
 */
export const columnsFor = (n: number) => (n <= 2 ? 1 : n <= 8 ? 2 : 3);

const widthFor = (cols: number) => cols * COL_STEP - (COL_STEP - NODE.w) + 2 * PAD;
const BOX_H = HEAD + 2 * PAD + NODE.h + (MAX_ROWS - 1) * ROW_STEP;

function moduleBoxes(a: Assignment): ModuleBox[] {
  const widths = SLOTS.map((m) => widthFor(columnsFor(membersOf(a, m).length)));
  const total = widths.reduce((s, w) => s + w, 0) + MODULE_GAP * (SLOTS.length - 1);
  let x = (VIEW.w - total) / 2;
  return SLOTS.map((slot, i) => {
    const box = { slot, x, y: TOP, w: widths[i], h: BOX_H };
    x += widths[i] + MODULE_GAP;
    return box;
  });
}

/** A module's grid: cols × MAX_ROWS cells, each holding a function or nothing. */
type Cells = Record<Slot, (FnId | null)[]>;

/** Centres of the filled cells; cell k is column ⌊k / MAX_ROWS⌋, row k mod MAX_ROWS. */
function place(boxes: readonly ModuleBox[], cells: Cells): Record<FnId, Pt> {
  const at = {} as Record<FnId, Pt>;
  for (const m of SLOTS) {
    cells[m].forEach((id, k) => {
      if (!id) return;
      at[id] = {
        x: boxes[m].x + PAD + NODE.w / 2 + Math.floor(k / MAX_ROWS) * COL_STEP,
        y: boxes[m].y + HEAD + PAD + NODE.h / 2 + (k % MAX_ROWS) * ROW_STEP,
      };
    });
  }
  return at;
}

/** Members laid out row by row from the top-left, the rest of the grid empty. */
function initialCells(members: readonly FnId[]): (FnId | null)[] {
  const cols = columnsFor(members.length);
  const cells: (FnId | null)[] = Array(cols * MAX_ROWS).fill(null);
  members.forEach((id, k) => {
    cells[(k % cols) * MAX_ROWS + Math.floor(k / cols)] = id;
  });
  return cells;
}

/** Does segment a→b pass through the box centred on c (Liang–Barsky clipping)? */
export function segmentHitsBox(a: Pt, b: Pt, c: Pt, halfW: number, halfH: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - (c.x - halfW)],
    [dx, c.x + halfW - a.x],
    [-dy, a.y - (c.y - halfH)],
    [dy, c.y + halfH - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** The part of an edge GraphView draws: from one box outline to the other. */
function drawnSegment(a: Pt, b: Pt): [Pt, Pt] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const d = outlineDistance(BOX, ux, uy);
  return [
    { x: a.x + ux * d, y: a.y + uy * d },
    { x: b.x - ux * d, y: b.y - uy * d },
  ];
}

/** Edges drawn through a node they don't connect: each one would look like a call that isn't there. */
export function passThroughs(at: Record<FnId, Pt>): { edge: number; fn: FnId }[] {
  const hits: { edge: number; fn: FnId }[] = [];
  EDGES.forEach((e, i) => {
    const [p, q] = drawnSegment(at[e.from], at[e.to]);
    for (const fn of FN_IDS) {
      if (fn === e.from || fn === e.to) continue;
      if (segmentHitsBox(p, q, at[fn], NODE.w / 2 + CLEARANCE, NODE.h / 2 + CLEARANCE)) hits.push({ edge: i, fn });
    }
  });
  return hits;
}

const cost = (at: Record<FnId, Pt>) =>
  passThroughs(at).length * PASS_PENALTY + EDGES.reduce((s, e) => s + Math.hypot(at[e.from].x - at[e.to].x, at[e.from].y - at[e.to].y), 0);

/** Swap cells (a function with another, or with an empty cell) while that lowers the cost. */
function climb(boxes: readonly ModuleBox[], cells: Cells): number {
  let best = cost(place(boxes, cells));
  let improved = true;
  while (improved) {
    improved = false;
    for (const m of SLOTS) {
      const grid = cells[m];
      for (let i = 0; i < grid.length; i++) {
        for (let j = i + 1; j < grid.length; j++) {
          if (!grid[i] && !grid[j]) continue;
          [grid[i], grid[j]] = [grid[j], grid[i]];
          const c = cost(place(boxes, cells));
          if (c < best - 1e-9) {
            best = c;
            improved = true;
          } else {
            [grid[i], grid[j]] = [grid[j], grid[i]];
          }
        }
      }
    }
  }
  return best;
}

/**
 * Module boxes side by side, centred in the view, and every function's centre inside its box.
 * Where each function sits in its module's grid comes from a hill climb over cell swaps,
 * started from the plain member order and from seeded shuffles: first avoid edges hidden
 * behind nodes (empty cells become corridors for long edges), then keep edges short. The
 * seed is fixed, so the same assignment always gives the same drawing.
 */
export function layoutModules(a: Assignment): { boxes: ModuleBox[]; at: Record<FnId, Pt> } {
  const boxes = moduleBoxes(a);
  const rnd = mulberry32(1);
  let best: { cost: number; cells: Cells } | null = null;
  for (let r = 0; r <= RESTARTS; r++) {
    const cells = Object.fromEntries(
      SLOTS.map((m) => [m, r ? shuffle(initialCells(membersOf(a, m)), rnd) : initialCells(membersOf(a, m))]),
    ) as Cells;
    const c = climb(boxes, cells);
    if (!best || c < best.cost - 1e-9) best = { cost: c, cells };
    if (best.cost < PASS_PENALTY) break;
  }
  return { boxes, at: place(boxes, best!.cells) };
}

/** The module box under a point in view coordinates, if any. */
export function moduleAt(boxes: readonly ModuleBox[], p: Pt): Slot | null {
  return boxes.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)?.slot ?? null;
}
