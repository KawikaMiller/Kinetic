// Where each input, gate and output lamp sits in the gate diagrams, and the 4-stage adder's
// geometry. Pure, no React. Gate outlines, ports and wires come from components/scene.
import type { GateBoard } from '../../components/scene';

export interface BoardLayout extends GateBoard {
  width: number;
  height: number;
}

/** Half adder: narrow enough to fit a phone at a readable scale. */
export const HALF_LAYOUT: BoardLayout = {
  width: 420,
  height: 240,
  at: { A: { x: 40, y: 70 }, B: { x: 40, y: 170 }, sum: { x: 210, y: 70 }, carry: { x: 210, y: 170 } },
  outputs: [{ x: 370, y: 70 }, { x: 370, y: 170 }],
};

/** Full adder: a2 sits above a1 and feeds the OR's top input, so no wire crosses a gate. */
export const FULL_LAYOUT: BoardLayout = {
  width: 640,
  height: 300,
  at: {
    A: { x: 40, y: 60 }, B: { x: 40, y: 140 }, Cin: { x: 40, y: 265 },
    x1: { x: 170, y: 100 }, a1: { x: 170, y: 195 },
    sum: { x: 340, y: 85 }, a2: { x: 340, y: 170 },
    cout: { x: 480, y: 215 },
  },
  outputs: [{ x: 595, y: 85 }, { x: 595, y: 215 }],
};

// ── The 4-stage adder diagram ────────────────────────────────────────────

export const ADDER = {
  width: 640,
  height: 250,
  boxW: 100,
  boxTop: 78,
  boxH: 70,
  /** Left edge of the box for stage `i` (i = 0 is the rightmost, least significant). */
  boxX: (i: number) => 60 + (3 - i) * 140,
  carryY: 113,
  unitTop: 200,
  unitH: 34,
} as const;
