import { fromBits, toBits, type Bit } from '../../core/bits';
import { parseIntegers } from '../../core/parse';

// ── Half and full adders ─────────────────────────────────────────────────

export const halfAdd = (a: Bit, b: Bit) => ({ sum: (a ^ b) as Bit, carry: (a & b) as Bit });

/** A full adder built from two half adders and an OR: Sum = A ⊕ B ⊕ Cin, Cout = AB + Cin(A ⊕ B). */
export function fullAdd(a: Bit, b: Bit, cin: Bit) {
  const first = halfAdd(a, b);
  const second = halfAdd(first.sum, cin);
  return { sum: second.sum, carry: (first.carry | second.carry) as Bit, partial: first.sum, c1: first.carry, c2: second.carry };
}

// ── Gate circuits (half and full adder), for the diagram ─────────────────

export type GateType = 'AND' | 'OR' | 'XOR';

export interface Gate {
  id: string;
  type: GateType;
  inputs: string[];
}

export interface Circuit {
  inputs: string[];
  gates: Gate[];
  outputs: { label: string; from: string }[];
}

export const HALF_ADDER: Circuit = {
  inputs: ['A', 'B'],
  gates: [
    { id: 'sum', type: 'XOR', inputs: ['A', 'B'] },
    { id: 'carry', type: 'AND', inputs: ['A', 'B'] },
  ],
  outputs: [{ label: 'Sum', from: 'sum' }, { label: 'Carry', from: 'carry' }],
};

/** Two half adders (x1/a1, then sum/a2) and an OR joining their carries. */
export const FULL_ADDER: Circuit = {
  inputs: ['A', 'B', 'Cin'],
  gates: [
    { id: 'x1', type: 'XOR', inputs: ['A', 'B'] },
    { id: 'a1', type: 'AND', inputs: ['A', 'B'] },
    { id: 'sum', type: 'XOR', inputs: ['x1', 'Cin'] },
    { id: 'a2', type: 'AND', inputs: ['x1', 'Cin'] },
    { id: 'cout', type: 'OR', inputs: ['a2', 'a1'] },
  ],
  outputs: [{ label: 'Sum', from: 'sum' }, { label: 'Cout', from: 'cout' }],
};

const GATE_FN: Record<GateType, (a: boolean, b: boolean) => boolean> = {
  AND: (a, b) => a && b,
  OR: (a, b) => a || b,
  XOR: (a, b) => a !== b,
};

/** Every signal's value: the inputs, then each gate in order (gates only read earlier signals). */
export function evaluate(c: Circuit, inputs: Record<string, boolean>): Record<string, boolean> {
  const values: Record<string, boolean> = { ...inputs };
  for (const g of c.gates) values[g.id] = GATE_FN[g.type](values[g.inputs[0]], values[g.inputs[1]]);
  return values;
}

/** How many gates deep each signal is (inputs 0): when a pulse reaches it. */
export function depthOf(c: Circuit): Record<string, number> {
  const depth: Record<string, number> = Object.fromEntries(c.inputs.map((i) => [i, 0]));
  for (const g of c.gates) depth[g.id] = Math.max(...g.inputs.map((i) => depth[i])) + 1;
  return depth;
}

// ── 4-bit adders ─────────────────────────────────────────────────────────

export const BITS = 4;
export const MAX = 2 ** BITS - 1;

/**
 * Delay model, in illustrative ticks (not real gate delays):
 * - FIRST_TICK: every stage forms its generate Gᵢ = AᵢBᵢ and propagate Pᵢ = Aᵢ ⊕ Bᵢ at once,
 *   and the carry-in is ready. A stage with Gᵢ = 1 or Pᵢ = 0 has decided its carry out.
 * - HOP_TICKS: a propagating stage (Pᵢ = 1) can only pass its carry on once it arrives,
 *   one tick per stage. A sum bit is final in the same tick as the carry into its stage.
 * So a ripple adder settles after FIRST_TICK + HOP_TICKS × the longest propagate run.
 * The lookahead unit computes every carry from G, P and C₀ directly, in one more tick.
 */
export const FIRST_TICK = 1;
export const HOP_TICKS = 1;
export const LOOKAHEAD_TICKS = FIRST_TICK + 1;

/** Bit i of v, i = 0 the least significant. */
export const bitAt = (v: number, i: number) => ((v >> i) & 1) as Bit;

export interface Timed {
  value: Bit;
  /** Tick at which the value is final. */
  at: number;
}

export interface AdderRun {
  /** Sum bits, index 0 = least significant. */
  sum: Timed[];
  /** carries[i] is the carry into stage i; carries[BITS] is the carry out. */
  carries: Timed[];
  /** Tick when every output is final. */
  delay: number;
}

const generate = (a: number, b: number, i: number) => bitAt(a & b, i);
const propagate = (a: number, b: number, i: number) => bitAt(a ^ b, i);

function finish(a: number, b: number, carries: Timed[]): AdderRun {
  const sum = Array.from({ length: BITS }, (_, i) => ({ value: (propagate(a, b, i) ^ carries[i].value) as Bit, at: carries[i].at }));
  return { sum, carries, delay: Math.max(...carries.map((c) => c.at)) };
}

/** Four full adders in a row: Cᵢ₊₁ = Gᵢ + Pᵢ·Cᵢ, each carry waiting for the one before it when Pᵢ = 1. */
export function rippleAdd(a: number, b: number, cin: Bit = 0): AdderRun {
  const carries: Timed[] = [{ value: cin, at: FIRST_TICK }];
  for (let i = 0; i < BITS; i++) {
    const c = carries[i];
    const p = propagate(a, b, i);
    carries.push({ value: (generate(a, b, i) | (p & c.value)) as Bit, at: p ? c.at + HOP_TICKS : FIRST_TICK });
  }
  return finish(a, b, carries);
}

/**
 * Carry lookahead: Cᵢ₊₁ = Gᵢ + PᵢGᵢ₋₁ + PᵢPᵢ₋₁Gᵢ₋₂ + … + Pᵢ…P₀C₀, a sum of products of G, P
 * and C₀ only, so no carry waits for another: they all arrive together.
 */
export function lookaheadAdd(a: number, b: number, cin: Bit = 0): AdderRun {
  const carries: Timed[] = [{ value: cin, at: FIRST_TICK }];
  for (let i = 0; i < BITS; i++) {
    let c = generate(a, b, i);
    for (let j = i - 1; j >= -1; j--) {
      let term: number = j >= 0 ? generate(a, b, j) : cin;
      for (let k = j + 1; k <= i; k++) term &= propagate(a, b, k);
      c |= term;
    }
    carries.push({ value: c as Bit, at: LOOKAHEAD_TICKS });
  }
  return finish(a, b, carries);
}

export const valueOf = (bits: readonly Timed[]) => bits.reduce((v, s, i) => v | (s.value << i), 0);

/**
 * The longest carry-propagation chain: the most consecutive stages with Pᵢ = 1, which pass
 * their carry-in on instead of deciding it themselves.
 */
export function longestPropagateRun(a: number, b: number): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < BITS; i++) {
    run = propagate(a, b, i) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// ── Flags ────────────────────────────────────────────────────────────────

export interface Flags {
  /** Zero: the result is 0. */
  z: Bit;
  /** Negative: the top bit of the result, the sign in two's complement. */
  n: Bit;
  /** Carry: the adder's carry out. Unsigned wraparound for ADD; for SUB, 1 means no borrow. */
  c: Bit;
  /** Overflow: the carry into the top bit differs from the carry out of it: a signed result that doesn't fit. */
  v: Bit;
}

/** -8..7: a 4-bit value read as two's complement. */
export const signed4 = (v: number) => (v & 8 ? v - 16 : v);

export const bits4 = (v: number): Bit[] => toBits(v, BITS);
export const from4 = (bits: readonly Bit[]) => fromBits(bits);

export type AluOp = 'ADD' | 'SUB' | 'AND' | 'OR';
export const ALU_OPS: readonly AluOp[] = ['ADD', 'SUB', 'AND', 'OR'];

export interface AluResult {
  result: number;
  flags: Flags;
  /** The B the adder sees: B itself, or ~B for SUB. */
  bIn: number;
  cin: Bit;
}

/**
 * The mini ALU. ADD and SUB share the ripple adder: SUB feeds it ~B with carry-in 1, so
 * A − B is computed as A + ~B + 1. AND and OR bypass the adder; they clear C and V.
 */
export function alu(op: AluOp, a: number, b: number): AluResult {
  if (op === 'AND' || op === 'OR') {
    const result = op === 'AND' ? a & b : a | b;
    return { result, bIn: b, cin: 0, flags: { z: result === 0 ? 1 : 0, n: bitAt(result, BITS - 1), c: 0, v: 0 } };
  }
  const bIn = op === 'SUB' ? ~b & MAX : b;
  const cin: Bit = op === 'SUB' ? 1 : 0;
  const run = rippleAdd(a, bIn, cin);
  const result = valueOf(run.sum);
  return {
    result,
    bIn,
    cin,
    flags: { z: result === 0 ? 1 : 0, n: bitAt(result, BITS - 1), c: run.carries[BITS].value, v: (run.carries[BITS - 1].value ^ run.carries[BITS].value) as Bit },
  };
}

// ── Presets ──────────────────────────────────────────────────────────────

export interface Pair {
  label: string;
  a: number;
  b: number;
}

export const PAIRS: readonly Pair[] = [
  { label: '0111 + 0001', a: 0b0111, b: 0b0001 },
  { label: '1111 + 0001', a: 0b1111, b: 0b0001 },
  { label: '0011 + 0011', a: 0b0011, b: 0b0011 },
  { label: '1000 + 1000', a: 0b1000, b: 0b1000 },
];

export type ParsedPair = { ok: true; a: number; b: number } | { ok: false; error: string };

/** "7, 1" or "7 1": two whole numbers, each 0-15. Anything else is refused and the old values stay. */
export function parsePair(text: string): ParsedPair {
  const values = parseIntegers(text);
  if (!values || values.length !== 2) return { ok: false, error: 'Type two whole numbers, like 7, 1.' };
  const bad = values.find((v) => v < 0 || v > MAX);
  if (bad !== undefined) return { ok: false, error: `${bad} doesn't fit in ${BITS} bits: use 0 to ${MAX}.` };
  return { ok: true, a: values[0], b: values[1] };
}
