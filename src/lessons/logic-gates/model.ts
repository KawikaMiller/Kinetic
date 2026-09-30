// Pure logic for the logic-gates lesson: gates, fixed-slot circuits and the presets.

export type GateType = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR';
export const GATE_TYPES: readonly GateType[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'];

/** The Boolean-algebra spelling of each gate, for captions and table headers. */
export const GATE_FORMULA: Record<GateType, (a: string, b: string) => string> = {
  AND: (a, b) => `${a} ∧ ${b}`,
  OR: (a, b) => `${a} ∨ ${b}`,
  NOT: (a) => `¬${a}`,
  NAND: (a, b) => `¬(${a} ∧ ${b})`,
  NOR: (a, b) => `¬(${a} ∨ ${b})`,
  XOR: (a, b) => `${a} ⊕ ${b}`,
};

/** One gate's output. NOT ignores its second input. */
export function evalGate(type: GateType, a: boolean, b = false): boolean {
  switch (type) {
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'NOT':
      return !a;
    case 'NAND':
      return !(a && b);
    case 'NOR':
      return !(a || b);
    case 'XOR':
      return a !== b;
  }
}

/** A wire's source: an input name or a gate id. */
export type Signal = string;

export interface Gate {
  id: string;
  type: GateType;
  /** Wired sources, in port order. A NOT gate on a two-input slot uses only the first. */
  inputs: readonly Signal[];
  /** The learner can pick this slot's gate type. */
  editable?: boolean;
}

export interface CircuitOutput {
  label: string;
  from: Signal;
}

export interface Circuit {
  inputs: readonly string[];
  /** In evaluation order: every gate's sources are inputs or earlier gates. */
  gates: readonly Gate[];
  outputs: readonly CircuitOutput[];
}

/** How many of a gate's wired ports it actually reads. */
export function usedPorts(g: Gate): number {
  return g.type === 'NOT' ? 1 : g.inputs.length;
}

/** The value on every wire (inputs and gate outputs) for one assignment of the inputs. */
export function evaluate(c: Circuit, values: Record<string, boolean>): Record<Signal, boolean> {
  const out: Record<Signal, boolean> = {};
  for (const name of c.inputs) out[name] = values[name] ?? false;
  for (const g of c.gates) {
    const read = (s: Signal) => {
      if (!(s in out)) throw new Error(`gate ${g.id} reads ${s} before it has a value`);
      return out[s];
    };
    const a = read(g.inputs[0]);
    const b = g.inputs.length > 1 && g.type !== 'NOT' ? read(g.inputs[1]) : false;
    out[g.id] = evalGate(g.type, a, b);
  }
  return out;
}

export function outputValues(c: Circuit, values: Record<string, boolean>): boolean[] {
  const all = evaluate(c, values);
  return c.outputs.map((o) => all[o.from]);
}

export function withGateType(c: Circuit, id: string, type: GateType): Circuit {
  return { ...c, gates: c.gates.map((g) => (g.id === id ? { ...g, type } : g)) };
}

/** Longest input-to-gate path, 1 for a gate fed only by inputs: how far a signal has travelled. */
export function gateDepth(c: Circuit): Record<Signal, number> {
  const depth: Record<Signal, number> = {};
  for (const name of c.inputs) depth[name] = 0;
  for (const g of c.gates) depth[g.id] = 1 + Math.max(...g.inputs.slice(0, usedPorts(g)).map((s) => depth[s] ?? 0));
  return depth;
}

// ── Presets ──────────────────────────────────────────────────────────

export const HALF_ADDER: Circuit = {
  inputs: ['A', 'B'],
  gates: [
    { id: 'sum', type: 'XOR', inputs: ['A', 'B'] },
    { id: 'carry', type: 'AND', inputs: ['A', 'B'] },
  ],
  outputs: [
    { label: 'sum', from: 'sum' },
    { label: 'carry', from: 'carry' },
  ],
};

export const NAND_NOT: Circuit = {
  inputs: ['A'],
  gates: [{ id: 'n1', type: 'NAND', inputs: ['A', 'A'] }],
  outputs: [{ label: 'out', from: 'n1' }],
};

export const NAND_AND: Circuit = {
  inputs: ['A', 'B'],
  gates: [
    { id: 'n1', type: 'NAND', inputs: ['A', 'B'] },
    { id: 'n2', type: 'NAND', inputs: ['n1', 'n1'] },
  ],
  outputs: [{ label: 'out', from: 'n2' }],
};

export const NAND_OR: Circuit = {
  inputs: ['A', 'B'],
  gates: [
    { id: 'n1', type: 'NAND', inputs: ['A', 'A'] },
    { id: 'n2', type: 'NAND', inputs: ['B', 'B'] },
    { id: 'n3', type: 'NAND', inputs: ['n1', 'n2'] },
  ],
  outputs: [{ label: 'out', from: 'n3' }],
};

/**
 * ¬(A ∧ B) on top, and a rewrite of it underneath built from ¬A and ¬B. The
 * rewrite's last gate is the learner's choice: AND is the tempting "negate
 * each part" mistake, OR is De Morgan's law.
 */
export function deMorgan(rewrite: GateType): Circuit {
  return {
    inputs: ['A', 'B'],
    gates: [
      { id: 'and', type: 'AND', inputs: ['A', 'B'] },
      { id: 'notAnd', type: 'NOT', inputs: ['and'] },
      { id: 'notA', type: 'NOT', inputs: ['A'] },
      { id: 'notB', type: 'NOT', inputs: ['B'] },
      { id: 'rewrite', type: rewrite, inputs: ['notA', 'notB'] },
    ],
    outputs: [
      { label: 'X', from: 'notAnd' },
      { label: 'Y', from: 'rewrite' },
    ],
  };
}

/** Three inputs, four fixed slots: G1(A,B), G2(B,C), G3(G1,G2), G4(G3,C). Types are the learner's. */
export function customCircuit(types: readonly [GateType, GateType, GateType, GateType]): Circuit {
  return {
    inputs: ['A', 'B', 'C'],
    gates: [
      { id: 'G1', type: types[0], inputs: ['A', 'B'], editable: true },
      { id: 'G2', type: types[1], inputs: ['B', 'C'], editable: true },
      { id: 'G3', type: types[2], inputs: ['G1', 'G2'], editable: true },
      { id: 'G4', type: types[3], inputs: ['G3', 'C'], editable: true },
    ],
    outputs: [{ label: 'Y', from: 'G4' }],
  };
}

export const CUSTOM_START: [GateType, GateType, GateType, GateType] = ['AND', 'OR', 'XOR', 'AND'];
