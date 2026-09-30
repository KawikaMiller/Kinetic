import { describe, expect, it } from 'vitest';
import { truthRows } from '../../core/truth';
import {
  CUSTOM_START, GATE_TYPES, HALF_ADDER, NAND_AND, NAND_NOT, NAND_OR, customCircuit, deMorgan, evalGate, evaluate, gateDepth,
  outputValues, withGateType, type GateType,
} from './model';

const BITS = [false, true];

describe('evalGate matches each gate’s definition on every input', () => {
  const truth: Record<GateType, (a: boolean, b: boolean) => boolean> = {
    AND: (a, b) => a && b,
    OR: (a, b) => a || b,
    NOT: (a) => !a,
    NAND: (a, b) => !(a && b),
    NOR: (a, b) => !(a || b),
    XOR: (a, b) => (a ? 1 : 0) + (b ? 1 : 0) === 1,
  };
  for (const type of GATE_TYPES) {
    it(type, () => {
      for (const a of BITS) for (const b of BITS) expect(evalGate(type, a, b)).toBe(truth[type](a, b));
    });
  }
  it('NAND and NOR are the negations of AND and OR', () => {
    for (const a of BITS) for (const b of BITS) {
      expect(evalGate('NAND', a, b)).toBe(!evalGate('AND', a, b));
      expect(evalGate('NOR', a, b)).toBe(!evalGate('OR', a, b));
    }
  });
});

describe('half adder', () => {
  it('sum and carry are the two bits of A + B, on every row', () => {
    for (const row of truthRows(['A', 'B'])) {
      const [sum, carry] = outputValues(HALF_ADDER, row);
      const total = Number(row.A) + Number(row.B);
      expect(Number(sum)).toBe(total % 2);
      expect(Number(carry)).toBe(total >> 1);
    }
  });
});

describe('NAND is universal: the NAND-only constructions equal the real gates', () => {
  it('NAND(A, A) is NOT A', () => {
    for (const row of truthRows(['A'])) expect(outputValues(NAND_NOT, row)[0]).toBe(!row.A);
  });
  it('NAND(NAND(A, B), NAND(A, B)) is A AND B', () => {
    for (const row of truthRows(['A', 'B'])) expect(outputValues(NAND_AND, row)[0]).toBe(row.A && row.B);
  });
  it('NAND(NAND(A, A), NAND(B, B)) is A OR B', () => {
    for (const row of truthRows(['A', 'B'])) expect(outputValues(NAND_OR, row)[0]).toBe(row.A || row.B);
  });
  it('uses nothing but NAND gates', () => {
    for (const c of [NAND_NOT, NAND_AND, NAND_OR]) expect(c.gates.every((g) => g.type === 'NAND')).toBe(true);
  });
});

describe("De Morgan's law", () => {
  it('¬(A ∧ B) equals ¬A ∨ ¬B on every row', () => {
    for (const row of truthRows(['A', 'B'])) {
      const [x, y] = outputValues(deMorgan('OR'), row);
      expect(x).toBe(!(row.A && row.B));
      expect(y).toBe(x);
    }
  });
  it('the "negate each part" rewrite ¬A ∧ ¬B is wrong exactly when A and B differ', () => {
    const wrongRows = truthRows(['A', 'B']).filter((row) => {
      const [x, y] = outputValues(deMorgan('AND'), row);
      return x !== y;
    });
    expect(wrongRows).toEqual([{ A: false, B: true }, { A: true, B: false }]);
  });
  it('the dual law also holds: ¬(A ∨ B) = ¬A ∧ ¬B', () => {
    for (const a of BITS) for (const b of BITS) expect(evalGate('NOR', a, b)).toBe(evalGate('AND', !a, !b));
  });
});

describe('the four-slot custom board', () => {
  it('evaluates every one of the 6⁴ type choices like the hand-written composition, on every row', () => {
    for (const t1 of GATE_TYPES) for (const t2 of GATE_TYPES) for (const t3 of GATE_TYPES) for (const t4 of GATE_TYPES) {
      const c = customCircuit([t1, t2, t3, t4]);
      for (const { A, B, C } of truthRows(['A', 'B', 'C'])) {
        const g1 = evalGate(t1, A, B);
        const g2 = evalGate(t2, B, C);
        const g3 = evalGate(t3, g1, g2);
        const g4 = evalGate(t4, g3, C);
        expect(evaluate(c, { A, B, C })).toEqual({ A, B, C, G1: g1, G2: g2, G3: g3, G4: g4 });
      }
    }
  });
  it('withGateType changes one slot and leaves the rest alone', () => {
    const c = withGateType(customCircuit(CUSTOM_START), 'G2', 'NOR');
    expect(c.gates.map((g) => g.type)).toEqual(['AND', 'NOR', 'XOR', 'AND']);
  });
  it('gateDepth counts the longest path from an input', () => {
    expect(gateDepth(customCircuit(CUSTOM_START))).toMatchObject({ A: 0, G1: 1, G2: 1, G3: 2, G4: 3 });
    // a NOT only reads its first port, so a slot turned into NOT drops the other path
    expect(gateDepth(customCircuit(['AND', 'OR', 'NOT', 'AND'])).G3).toBe(2);
  });
  it('refuses a gate that reads a signal before it exists', () => {
    expect(() => evaluate({ inputs: ['A'], gates: [{ id: 'g', type: 'AND', inputs: ['A', 'later'] }], outputs: [] }, { A: true })).toThrow();
  });
});
