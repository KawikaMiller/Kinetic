/**
 * The Chiu-Jain picture: two flows share a link of capacity 100 and both react to the same one-bit signal, "the link is over
 * capacity" (x1 + x2 > 100). Each rule is an increase rule paired with a decrease rule. Rates are in percent of capacity.
 */
export type Rule = 'aiad' | 'miad' | 'mimd' | 'aimd';
export type Rates = readonly [number, number];

export const CAPACITY = 100;
/** Additive increase and additive decrease, in percent of capacity per step. */
export const ADD = 2;
export const SUB = 5;
/** Multiplicative increase factor, and the multiplicative decrease factor beta (Reno halves). */
export const MUL_UP = 1.1;
export const BETA = 0.5;
export const STEPS = 80;
/** The plane both axes run over: a little past capacity, because a multiplicative increase can overshoot it. */
export const PLANE = 120;

export const RULES: readonly Rule[] = ['aimd', 'aiad', 'miad', 'mimd'];
export const RULE_LABEL: Record<Rule, string> = { aiad: 'AIAD', miad: 'MIAD', mimd: 'MIMD', aimd: 'AIMD' };
export const RULE_TEXT: Record<Rule, string> = {
  aiad: 'add when there is room, subtract when over capacity',
  miad: 'multiply when there is room, subtract when over capacity',
  mimd: 'multiply when there is room, multiply down when over capacity',
  aimd: 'add when there is room, multiply down when over capacity',
};
const INCREASE: Record<Rule, 'add' | 'mul'> = { aiad: 'add', miad: 'mul', mimd: 'mul', aimd: 'add' };
const DECREASE: Record<Rule, 'add' | 'mul'> = { aiad: 'add', miad: 'add', mimd: 'mul', aimd: 'mul' };

export const overCapacity = (r: Rates): boolean => r[0] + r[1] > CAPACITY;

/** One step of both flows under a rule, rates held at 0 or above. */
export function step(r: Rates, rule: Rule): Rates {
  const grow = (x: number) => (INCREASE[rule] === 'add' ? x + ADD : x * MUL_UP);
  const shrink = (x: number) => Math.max(0, DECREASE[rule] === 'add' ? x - SUB : x * BETA);
  const f = overCapacity(r) ? shrink : grow;
  return [f(r[0]), f(r[1])];
}

/** The start and the STEPS steps after it. */
export function trajectory(start: Rates, rule: Rule, steps = STEPS): Rates[] {
  const out: Rates[] = [start];
  for (let i = 0; i < steps; i++) out.push(step(out[out.length - 1], rule));
  return out;
}

export const gapOf = (r: Rates): number => Math.abs(r[0] - r[1]);

export interface FairnessReading {
  startGap: number;
  endGap: number;
  /** Fewest and most of the capacity the pair uses over the last 20 steps. */
  lowSum: number;
  highSum: number;
}

export function readTrajectory(t: readonly Rates[]): FairnessReading {
  const tail = t.slice(-20).map((r) => r[0] + r[1]);
  return { startGap: gapOf(t[0]), endGap: gapOf(t[t.length - 1]), lowSum: Math.min(...tail), highSum: Math.max(...tail) };
}
