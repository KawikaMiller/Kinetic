// Scene geometry: a stack that grows upward from the bottom-left, and heap
// blocks scattered on the right (the heap has no order, and the drawing says so).
import type { Pt } from '../../core/geometry';
import { SLOT, stackBoxes } from '../../components/memory';
import { STACK_LIMIT } from './frames';
import type { StackFrame } from './model';

export const SCENE_W = 660;
export const SCENE_H = 500;
/** Wide enough that a block's title and its corner tag ("collectable") never overlap. */
export const BLOCK_W = 190;
export const FRAME_W = 176;
const STACK_X = 16;
const STACK_BOTTOM = SCENE_H - 20;
const FRAME_HEADER = 22;
const SLOT_ROW = SLOT.h + 8;
const FRAME_PAD = 10;
const FRAME_GAP = 6;

/** Deliberately scattered spots, in allocation order. */
const HEAP_SPOTS: Pt[] = [
  { x: 312, y: 92 },
  { x: 452, y: 212 },
  { x: 300, y: 318 },
  { x: 458, y: 70 },
];

export const frameHeight = (slotCount: number) => FRAME_HEADER + Math.max(1, slotCount) * SLOT_ROW + FRAME_PAD;

export interface FrameBox {
  frame: StackFrame;
  x: number;
  y: number;
  h: number;
}

/** Stack frames bottom-up in call order; `shown` are the frames to draw (live ones plus ghosts). */
export function layoutStack(shown: readonly StackFrame[]): FrameBox[] {
  const heights = shown.map((frame) => frameHeight(frame.slots.length));
  const { tops } = stackBoxes(heights, { start: STACK_BOTTOM, gap: FRAME_GAP, direction: 'up' });
  return shown.map((frame, i) => ({ frame, x: STACK_X, y: tops[i], h: heights[i] }));
}

/** Top-left of slot `index` inside a frame box. */
export const slotAt = (box: FrameBox, index: number): Pt => ({ x: box.x + (FRAME_W - SLOT.w) / 2, y: box.y + FRAME_HEADER + index * SLOT_ROW });

export const heapSpot = (index: number): Pt => HEAP_SPOTS[index % HEAP_SPOTS.length];

/** Where the drawn stack runs out (the overflow preset fills exactly this much). */
export const STACK_LIMIT_Y = STACK_BOTTOM - STACK_LIMIT * (frameHeight(1) + FRAME_GAP) + FRAME_GAP - 4;
