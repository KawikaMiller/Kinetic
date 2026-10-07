// Scene geometry for the gate diagrams: where each input, gate and output lamp sits, the gate
// outlines, and the wires between them. Pure, no React. The glyphs follow logic-gates' drawing
// (that lesson keeps its own copy local; a shared scene version is a Phase 2 request).
import type { Pt } from '../../core/geometry';
import type { Circuit, GateType } from './model';

export const IO_R = 18;
const PORT_DY = 11;
const WIRE_SAMPLES = 16;

export interface BoardLayout {
  width: number;
  height: number;
  at: Record<string, Pt>;
  outputs: Pt[];
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

const isOrShaped = (t: GateType) => t === 'OR' || t === 'XOR';

/** Outline of the gate's standard symbol, centred on (0, 0). */
export function gateBodyPath(t: GateType): string {
  if (isOrShaped(t)) return 'M -28 -22 Q -14 0 -28 22 Q 6 22 24 0 Q 6 -22 -28 -22 Z';
  return 'M -28 -22 H 2 A 22 22 0 0 1 2 22 H -28 Z';
}

/** XOR's extra curve behind the body. */
export const XOR_BACK_PATH = 'M -35 -22 Q -21 0 -35 22';

const outputPort = (at: Pt): Pt => ({ x: at.x + 24, y: at.y });

function inputPort(t: GateType, at: Pt, port: number): Pt {
  return { x: at.x + (isOrShaped(t) ? -23 : -28), y: at.y + (port === 0 ? -PORT_DY : PORT_DY) };
}

function sourcePort(c: Circuit, layout: BoardLayout, s: string): Pt {
  const at = layout.at[s];
  return c.gates.some((g) => g.id === s) ? outputPort(at) : { x: at.x + IO_R, y: at.y };
}

function bezier(from: Pt, to: Pt) {
  const dx = Math.max(30, (to.x - from.x) / 2);
  return { c1: { x: from.x + dx, y: from.y }, c2: { x: to.x - dx, y: to.y } };
}

export function wirePath(from: Pt, to: Pt): string {
  const { c1, c2 } = bezier(from, to);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/** The same wire sampled into points, for a TravelDot to follow. */
export function wirePoints(from: Pt, to: Pt): Pt[] {
  const { c1, c2 } = bezier(from, to);
  return Array.from({ length: WIRE_SAMPLES + 1 }, (_, i) => {
    const t = i / WIRE_SAMPLES;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return { x: k[0] * from.x + k[1] * c1.x + k[2] * c2.x + k[3] * to.x, y: k[0] * from.y + k[1] * c1.y + k[2] * c2.y + k[3] * to.y };
  });
}

export interface Wire {
  key: string;
  from: string;
  start: Pt;
  end: Pt;
}

/** Every wire: gate inputs, then the output lamps. */
export function wiresOf(c: Circuit, layout: BoardLayout): Wire[] {
  const wires: Wire[] = c.gates.flatMap((g) =>
    g.inputs.map((s, port) => ({ key: `${g.id}:${port}`, from: s, start: sourcePort(c, layout, s), end: inputPort(g.type, layout.at[g.id], port) })),
  );
  c.outputs.forEach((o, i) => {
    const lamp = layout.outputs[i];
    wires.push({ key: `out:${i}`, from: o.from, start: sourcePort(c, layout, o.from), end: { x: lamp.x - IO_R, y: lamp.y } });
  });
  return wires;
}

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
