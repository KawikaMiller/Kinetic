import { describe, expect, it } from 'vitest';
import { IO_R, bubbleAt, inputPort, outputPort, typeLabelX, wirePath, wirePoints, wiresOf, type GateCircuit } from './gateGeometry';

const at = { x: 100, y: 50 };

describe('gate ports', () => {
  it('starts the output at the body tip, or past the inversion bubble', () => {
    expect(outputPort('AND', at)).toEqual({ x: 124, y: 50 });
    expect(outputPort('XOR', at)).toEqual({ x: 124, y: 50 });
    expect(outputPort('NOR', at)).toEqual({ x: 132, y: 50 }); // sequential-logic's OUT_X: 230 + 32
    expect(outputPort('NOT', at)).toEqual({ x: 124, y: 50 });
    expect(bubbleAt('AND')).toBeNull();
    expect(bubbleAt('NAND')).toEqual({ x: 28, y: 0 });
  });

  it('meets the back edge: curved for OR-shaped gates, two ports 11 apart, one centred port on a NOT', () => {
    expect(inputPort('AND', at, 0)).toEqual({ x: 72, y: 39 });
    expect(inputPort('OR', at, 1)).toEqual({ x: 77, y: 61 });
    expect(inputPort('NOR', at, 0)).toEqual({ x: 77, y: 39 });
    expect(inputPort('NOT', at, 1)).toEqual({ x: 80, y: 50 });
    expect(inputPort('AND', at, 0, 1)).toEqual({ x: 72, y: 50 });
    expect(typeLabelX('NOT')).toBe(-6);
    expect(typeLabelX('XOR')).toBe(-4);
  });
});

describe('wires', () => {
  const circuit: GateCircuit = {
    inputs: ['A', 'B'],
    gates: [
      { id: 'n', type: 'NOT', inputs: ['A', 'B'] },
      { id: 'x', type: 'XOR', inputs: ['n', 'B'] },
    ],
    outputs: [{ label: 'out', from: 'x' }],
  };
  const board = { at: { A: { x: 40, y: 40 }, B: { x: 40, y: 120 }, n: { x: 160, y: 40 }, x: { x: 300, y: 80 } }, outputs: [{ x: 420, y: 80 }] };

  it('wires every gate input, then the lamps, from the right source ports', () => {
    const w = wiresOf(circuit, board);
    expect(w.map((x) => x.key)).toEqual(['n:0', 'n:1', 'x:0', 'x:1', 'out:0']);
    expect(w[0].start).toEqual({ x: 40 + IO_R, y: 40 }); // from an input switch's edge
    expect(w[2].start).toEqual(outputPort('NOT', board.at.n)); // from a gate's output
    expect(w[4].end).toEqual({ x: 420 - IO_R, y: 80 });
  });

  it("marks a NOT gate's second wire unused", () => {
    expect(wiresOf(circuit, board).filter((x) => x.unused).map((x) => x.key)).toEqual(['n:1']);
  });

  it('samples the S-wire from its start to its end', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 40 };
    expect(wirePath(from, to)).toBe('M 0 0 C 50 0, 50 40, 100 40');
    const pts = wirePoints(from, to);
    expect(pts[0]).toEqual(from);
    expect(pts.at(-1)).toEqual(to);
  });
});
