import type { ReactNode } from 'react';
import type { Bit } from '../../core/bits';
import { naiveMultiplications, operationCount, type PowRun, type PowStep } from './modpow';

export interface PowFrame {
  say: ReactNode;
  /** Steps of the run done so far. */
  ops: number;
}

export interface Held {
  /** The result so far (the running value left to right). */
  result: bigint;
  /** The running power base^(2^i), right to left only. */
  power: bigint | null;
}

/** What the method holds after `ops` steps, for the stats beside the strip. */
export function heldAt(run: PowRun, ops: number, exponent: bigint, modulus: bigint): Held {
  const rtl = run.direction === 'rtl';
  if (ops >= run.steps.length) return { result: run.result, power: rtl ? run.steps.at(-1)?.power ?? run.reduced : null };
  if (ops === 0) return { result: rtl || exponent === 0n ? (modulus === 1n ? 0n : 1n) : run.reduced, power: rtl ? run.reduced : null };
  const s = run.steps[ops - 1];
  return { result: s.result, power: rtl ? s.power : null };
}

/** The bit index a step works on, with the step kind, or null before the first step. */
export const currentOf = (run: PowRun, ops: number): PowStep | null => (ops > 0 ? run.steps[ops - 1] : null);

function stepSay(run: PowRun, s: PowStep, bits: readonly Bit[], n: bigint): ReactNode {
  const bit = bits[s.bit];
  if (s.kind === 'square') {
    return run.direction === 'ltr'
      ? <>Bit {s.bit + 1} of {bits.length} is {bit}. Square the running value: {s.before.toString()} x {s.before.toString()} mod {n.toString()} = {s.after.toString()}.</>
      : <>Bit {s.bit + 1} of {bits.length} is done. Square the running power: {s.before.toString()} x {s.before.toString()} mod {n.toString()} = {s.after.toString()}.</>;
  }
  return run.direction === 'ltr'
    ? <>The bit is 1, so multiply by the base: {s.before.toString()} x {s.factor.toString()} mod {n.toString()} = {s.after.toString()}.</>
    : <>Bit {s.bit + 1} is 1, so multiply the running power into the result: {s.before.toString()} x {s.factor.toString()} mod {n.toString()} = {s.after.toString()}.</>;
}

/** One frame for the opening, one per modular multiplication, and a closing frame with the count against the naive one. */
export function powFrames(run: PowRun, bits: readonly Bit[], exponent: bigint, modulus: bigint): PowFrame[] {
  const total = operationCount(run);
  const naive = naiveMultiplications(exponent);
  const opening: ReactNode =
    exponent === 0n
      ? <>The exponent is 0, so there is nothing to multiply: the answer is {modulus === 1n ? '0 (everything is 0 mod 1)' : '1'}.</>
      : run.direction === 'ltr'
        ? <>Scan the exponent's {bits.length} bits from the left. The leading bit (always 1) starts the result at the base, {run.reduced.toString()} mod {modulus.toString()}; each later bit squares it, and a 1 also multiplies by the base. Every product is reduced mod {modulus.toString()} straight away.</>
        : <>Scan the exponent's {bits.length} bits from the right, keeping the running power base^(2^i). A 1 multiplies the power into the result; every bit squares the power for the next one. Two numbers are held, not one.</>;
  const frames: PowFrame[] = [{ say: opening, ops: 0 }];
  run.steps.forEach((s, k) => frames.push({ say: stepSay(run, s, bits, modulus), ops: k + 1 }));
  frames.push({
    say: <>Done: the result is {run.result.toString()} after {run.squarings} squaring{run.squarings === 1 ? '' : 's'} and {run.multiplications} multiplication{run.multiplications === 1 ? '' : 's'}, {total} in all, against {naive.toLocaleString('en-US')} for repeated multiplication.</>,
    ops: run.steps.length,
  });
  return frames;
}
