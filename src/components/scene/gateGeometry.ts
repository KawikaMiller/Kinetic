// Gate-circuit geometry shared by the digital-logic lessons (logic-gates, adders-alu,
// sequential-logic): standard gate outlines centred on (0, 0), their ports, and S-shaped
// wires between them. Pure, no React; Gates.tsx draws with it.
import type { Pt } from '../../core/geometry';

export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';

/** Radius of an input switch or output lamp. */
export const IO_R = 18;
/** Radius of an inversion bubble. */
export const BUBBLE_R = 4;
/** Vertical offset of a two-input gate's ports from its centre line. */
export const PORT_DY = 11;
const WIRE_SAMPLES = 16;
const OR_BACK_X = -23;
const AND_BACK_X = -28;
const NOT_BACK_X = -20;
const NOT_TIP_X = 16;
const BODY_TIP_X = 24;

const hasBubble = (t: GateKind) => t === 'NAND' || t === 'NOR' || t === 'NOT';
const isOrShaped = (t: GateKind) => t === 'OR' || t === 'NOR' || t === 'XOR';

/** Outline of the gate's standard symbol, centred on (0, 0). */
export function gateBodyPath(t: GateKind): string {
  if (t === 'NOT') return 'M -20 -18 L 16 0 L -20 18 Z';
  if (isOrShaped(t)) return 'M -28 -22 Q -14 0 -28 22 Q 6 22 24 0 Q 6 -22 -28 -22 Z';
  return 'M -28 -22 H 2 A 22 22 0 0 1 2 22 H -28 Z';
}

/** XOR's extra curve behind the body. */
export const XOR_BACK_PATH = 'M -35 -22 Q -21 0 -35 22';

/** The inversion bubble's centre, for gates that have one. */
export function bubbleAt(t: GateKind): Pt | null {
  if (!hasBubble(t)) return null;
  return { x: (t === 'NOT' ? NOT_TIP_X : BODY_TIP_X) + BUBBLE_R, y: 0 };
}

/** Where the type label (AND, NOR…) sits inside the body: a NOT's triangle is narrower. */
export const typeLabelX = (t: GateKind) => (t === 'NOT' ? -6 : -4);

/** Where the gate's output wire starts: the tip of the body, or past the bubble. */
export function outputPort(t: GateKind, at: Pt): Pt {
  const bubble = bubbleAt(t);
  return { x: at.x + (bubble ? bubble.x + BUBBLE_R : BODY_TIP_X), y: at.y };
}

/** Where input wire `port` (of `count`) meets the gate's back edge. */
export function inputPort(t: GateKind, at: Pt, port: number, count = 2): Pt {
  const dy = t === 'NOT' || count === 1 ? 0 : port === 0 ? -PORT_DY : PORT_DY;
  const x = t === 'NOT' ? NOT_BACK_X : isOrShaped(t) ? OR_BACK_X : AND_BACK_X;
  return { x: at.x + x, y: at.y + dy };
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

/** The shape of a gate circuit, as the lessons' models describe it. */
export interface GateCircuit {
  inputs: readonly string[];
  /** Each gate's sources (inputs or other gates), in port order. */
  gates: readonly { id: string; type: GateKind; inputs: readonly string[] }[];
  outputs: readonly { label: string; from: string }[];
}

/** Where everything sits: inputs and gates by name, then the output lamps in order. */
export interface GateBoard {
  at: Record<string, Pt>;
  outputs: readonly Pt[];
}

/** Where a signal leaves its source: an input's right edge or a gate's output. */
export function sourcePort(c: GateCircuit, board: GateBoard, s: string): Pt {
  const at = board.at[s];
  const gate = c.gates.find((g) => g.id === s);
  return gate ? outputPort(gate.type, at) : { x: at.x + IO_R, y: at.y };
}

export interface GateWire {
  key: string;
  from: string;
  /** The gate it feeds, or null for a wire into an output lamp. */
  to: string | null;
  start: Pt;
  end: Pt;
  /** A NOT gate on a two-input slot leaves its second wire unused. */
  unused: boolean;
}

/** Every wire on the board: gate inputs, then the output lamps. */
export function wiresOf(c: GateCircuit, board: GateBoard): GateWire[] {
  const wires: GateWire[] = [];
  for (const g of c.gates) {
    g.inputs.forEach((s, port) => {
      wires.push({
        key: `${g.id}:${port}`,
        from: s,
        to: g.id,
        start: sourcePort(c, board, s),
        end: inputPort(g.type, board.at[g.id], port, g.inputs.length),
        unused: g.type === 'NOT' && port > 0,
      });
    });
  }
  c.outputs.forEach((o, i) => {
    const lamp = board.outputs[i];
    wires.push({ key: `out:${i}`, from: o.from, to: null, start: sourcePort(c, board, o.from), end: { x: lamp.x - IO_R, y: lamp.y }, unused: false });
  });
  return wires;
}
