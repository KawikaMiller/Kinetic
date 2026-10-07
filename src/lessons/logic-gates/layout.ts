// Where each input, gate and output sits on the circuit board, per circuit. Pure, no React.
// Gate outlines, ports and wires come from components/scene (gateGeometry).
import type { GateBoard } from '../../components/scene';

export const BOARD = { width: 640, height: 310 };

export type LayoutId = 'half-adder' | 'nand-not' | 'nand-and' | 'nand-or' | 'de-morgan' | 'custom';

export type BoardLayout = GateBoard;

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
