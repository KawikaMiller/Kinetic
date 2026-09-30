// Scene geometry for the circuit board: where each input, gate and output sits,
// the gate outlines, and the wires between them. Pure, no React.
import type { Pt } from '../../core/geometry';
import type { Circuit, GateType, Signal } from './model';

export const BOARD = { width: 640, height: 310 };
export const IO_R = 18;
export const BUBBLE_R = 4;
const PORT_DY = 11;
const WIRE_SAMPLES = 16;

export type LayoutId = 'half-adder' | 'nand-not' | 'nand-and' | 'nand-or' | 'de-morgan' | 'custom';

export interface BoardLayout {
  at: Record<Signal, Pt>;
  outputs: Pt[];
}

export const LAYOUTS: Record<LayoutId, BoardLayout> = {
  'half-adder': {
    at: { A: { x: 60, y: 100 }, B: { x: 60, y: 210 }, sum: { x: 330, y: 100 }, carry: { x: 330, y: 210 } },
    outputs: [{ x: 560, y: 100 }, { x: 560, y: 210 }],
  },
  'nand-not': {
    at: { A: { x: 80, y: 155 }, n1: { x: 330, y: 155 } },
    outputs: [{ x: 560, y: 155 }],
  },
  'nand-and': {
    at: { A: { x: 60, y: 110 }, B: { x: 60, y: 200 }, n1: { x: 250, y: 155 }, n2: { x: 420, y: 155 } },
    outputs: [{ x: 570, y: 155 }],
  },
  'nand-or': {
    at: { A: { x: 60, y: 90 }, B: { x: 60, y: 220 }, n1: { x: 240, y: 90 }, n2: { x: 240, y: 220 }, n3: { x: 420, y: 155 } },
    outputs: [{ x: 570, y: 155 }],
  },
  'de-morgan': {
    at: {
      A: { x: 60, y: 125 }, B: { x: 60, y: 205 },
      and: { x: 240, y: 60 }, notAnd: { x: 400, y: 60 },
      notA: { x: 240, y: 175 }, notB: { x: 240, y: 260 }, rewrite: { x: 400, y: 218 },
    },
    outputs: [{ x: 570, y: 60 }, { x: 570, y: 218 }],
  },
  custom: {
    at: {
      A: { x: 55, y: 70 }, B: { x: 55, y: 160 }, C: { x: 55, y: 250 },
      G1: { x: 215, y: 92 }, G2: { x: 215, y: 205 }, G3: { x: 370, y: 148 }, G4: { x: 505, y: 185 },
    },
    outputs: [{ x: 600, y: 185 }],
  },
};

const hasBubble = (t: GateType) => t === 'NAND' || t === 'NOR' || t === 'NOT';
const isOrShaped = (t: GateType) => t === 'OR' || t === 'NOR' || t === 'XOR';

/** Outline of the gate's standard symbol, centred on (0, 0). */
export function gateBodyPath(t: GateType): string {
  if (t === 'NOT') return 'M -20 -18 L 16 0 L -20 18 Z';
  if (isOrShaped(t)) return 'M -28 -22 Q -14 0 -28 22 Q 6 22 24 0 Q 6 -22 -28 -22 Z';
  return 'M -28 -22 H 2 A 22 22 0 0 1 2 22 H -28 Z';
}

/** XOR's extra curve behind the body. */
export const XOR_BACK_PATH = 'M -35 -22 Q -21 0 -35 22';

/** The inversion bubble's centre, for gates that have one. */
export function bubbleAt(t: GateType): Pt | null {
  if (!hasBubble(t)) return null;
  return { x: (t === 'NOT' ? 16 : 24) + BUBBLE_R, y: 0 };
}

export function outputPort(t: GateType, at: Pt): Pt {
  const bubble = bubbleAt(t);
  return { x: at.x + (bubble ? bubble.x + BUBBLE_R : 24), y: at.y };
}

/** Where wire `port` (of `count`) meets the gate's back edge. */
export function inputPort(t: GateType, at: Pt, port: number, count: number): Pt {
  const dy = t === 'NOT' || count === 1 ? 0 : port === 0 ? -PORT_DY : PORT_DY;
  const x = t === 'NOT' ? -20 : isOrShaped(t) ? -23 : -28;
  return { x: at.x + x, y: at.y + dy };
}

/** Where a signal leaves its source: an input's right edge or a gate's output. */
export function sourcePort(c: Circuit, layout: BoardLayout, s: Signal): Pt {
  const at = layout.at[s];
  const gate = c.gates.find((g) => g.id === s);
  return gate ? outputPort(gate.type, at) : { x: at.x + IO_R, y: at.y };
}

function bezier(from: Pt, to: Pt) {
  const dx = Math.max(30, (to.x - from.x) / 2);
  return { c1: { x: from.x + dx, y: from.y }, c2: { x: to.x - dx, y: to.y } };
}

/** A smooth S-shaped wire. */
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
    return {
      x: k[0] * from.x + k[1] * c1.x + k[2] * c2.x + k[3] * to.x,
      y: k[0] * from.y + k[1] * c1.y + k[2] * c2.y + k[3] * to.y,
    };
  });
}

export interface Wire {
  key: string;
  from: Signal;
  /** The gate it feeds, or null for a wire into an output lamp. */
  to: string | null;
  start: Pt;
  end: Pt;
  /** A NOT gate on a two-input slot leaves its second wire unused. */
  unused: boolean;
}

/** Every wire on the board: gate inputs, then the output lamps. */
export function wiresOf(c: Circuit, layout: BoardLayout): Wire[] {
  const wires: Wire[] = [];
  for (const g of c.gates) {
    g.inputs.forEach((s, port) => {
      wires.push({
        key: `${g.id}:${port}`,
        from: s,
        to: g.id,
        start: sourcePort(c, layout, s),
        end: inputPort(g.type, layout.at[g.id], port, g.inputs.length),
        unused: g.type === 'NOT' && port > 0,
      });
    });
  }
  c.outputs.forEach((o, i) => {
    const lamp = layout.outputs[i];
    wires.push({ key: `out:${i}`, from: o.from, to: null, start: sourcePort(c, layout, o.from), end: { x: lamp.x - IO_R, y: lamp.y }, unused: false });
  });
  return wires;
}
