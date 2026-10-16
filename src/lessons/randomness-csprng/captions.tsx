import type { ReactNode } from 'react';
import { decimal, integer, plural, power } from '../../core/format';
import { favoured, isUnbiased, moduloCounts, rejectionLimit, BYTE_VALUES } from './bias';
import { EDGE_ON_DEGREES, hyperplaneBound, lcgSequence, planeIndex, RANDU, type LcgParams } from './lcg';
import { COARSENESS, NEXT_COUNT, OUTPUT_BITS, SYSTEM_SEED_BITS, WINDOWS, seedSpace, STATES, type Coarseness } from './recovery';

/** How many distinct lines the consecutive pairs lie on: a x + c - y is a whole multiple of m, and its quotient names the line. */
export function distinctLines(p: LcgParams, seed: number, count: number): number {
  const s = lcgSequence(p, seed, count + 1);
  const lines = new Set<number>();
  for (let i = 0; i < count; i++) lines.add(Math.floor((p.a * s[i] + p.c) / p.m));
  return lines.size;
}

/** Scene 1: how many lines the pairs of this generator lie on, against the bound, and the constant case. */
export function pairsCaption(p: LcgParams, seed: number, count: number): ReactNode {
  const seq = lcgSequence(p, seed, Math.min(count + 1, 50));
  const constant = new Set(seq).size === 1;
  const lines = distinctLines(p, seed, count);
  const bound = hyperplaneBound(2, p.m);
  if (constant) return <>Seed {seed} stays at {seq[0]} for this generator (c is 0), so every output is {seq[0]} and all {plural(count, 'pair')} sit on one point. The real source is a cloud.</>;
  return (
    <>
      The {plural(count, 'pair')} of this generator lie on {plural(lines, 'line')}; Marsaglia's bound allows at most {integer(bound)} for pairs with m = {integer(p.m)}.{' '}
      {lines <= 12 ? 'The structure is plain to see.' : 'At this scale the lines are too fine to see, but they are there.'} The real source on the right has none.
    </>
  );
}

/** Scene 2: the identity for the first triple and what the angle shows. */
export function planesCaption(seed: number, count: number, degrees: number, distinct: number): ReactNode {
  const [x0, x1, x2] = lcgSequence(RANDU, seed, 3);
  const k = planeIndex(x0, x1, x2);
  const edgeOn = Math.abs(degrees - EDGE_ON_DEGREES) <= 0.5;
  return (
    <>
      From the first three outputs {integer(x0)}, {integer(x1)}, {integer(x2)}: 9 x(n) - 6 x(n+1) + x(n+2) = {k} x {power(31)}, a whole number, so each triple lies on one of a few planes.{' '}
      {plural(count, 'triple')} use {distinct} of the 15 possible planes. {edgeOn ? 'At this angle the planes are seen edge on and the points fall on lines.' : <>Turn to {decimal(EDGE_ON_DEGREES, 1)} degrees to see the planes edge on.</>}
    </>
  );
}

/** Scene 3: how many seeds are still possible after the outputs seen, and when the rest is known. */
export function recoverCaption(revealed: number, counts: readonly number[], predicted: boolean): ReactNode {
  if (revealed === 0) return <>The generator has a hidden 16-bit state, so {integer(STATES)} states are possible. Reveal its outputs one at a time and count the states that still fit.</>;
  const left = counts[revealed - 1];
  if (left === 1) {
    return <>After {plural(revealed, 'output')} exactly one state fits. Every later output is now known: the next {NEXT_COUNT} predictions are below{predicted ? ', next to the real ones' : ''}. A generator whose state can be inferred from its outputs is not secret, however random it looks.</>;
  }
  return <>After {plural(revealed, 'output')}, {integer(left)} of {integer(STATES)} states still fit (the brute force over this toy's states counted them). On average each output cuts the number by a factor of about {2 ** OUTPUT_BITS}; a single step can cut more or less.</>;
}

/** Scene 4: the seeds an observer who knows roughly when it was made would try. */
export function seedCaption(c: Coarseness, windowId: string): ReactNode {
  const w = WINDOWS.find((x) => x.id === windowId)!;
  const { seeds, bits } = seedSpace(c, w.seconds);
  const name = COARSENESS.find((x) => x.id === c)!.label.toLowerCase();
  return c === 'system'
    ? <>{name}: {power(SYSTEM_SEED_BITS)} seeds, {SYSTEM_SEED_BITS} bits, whatever the window: far beyond reach.</>
    : <>For {name} and a guess of {w.label}, an observer considers {integer(seeds)} seeds, {decimal(bits, 1)} bits.</>;
}

/** Scene 6: the exact counts for the range, and what rejection does. */
export function biasCaption(n: number): ReactNode {
  const counts = moduloCounts(n);
  const top = favoured(counts);
  if (isUnbiased(n)) return <>n = {n} divides {BYTE_VALUES}, so every outcome has {BYTE_VALUES / n} byte values: byte % {n} is unbiased here, and rejection discards nothing.</>;
  return (
    <>
      byte % {n} gives {Math.max(...counts)} byte values to {plural(top.length, 'outcome')} ({top.join(', ')}) and {Math.min(...counts)} to the rest, because {BYTE_VALUES} = {Math.floor(BYTE_VALUES / n)} x {n} + {BYTE_VALUES % n}. Rejection sampling discards bytes at or above {rejectionLimit(n)} and draws again, giving {Math.floor(BYTE_VALUES / n)} each.
    </>
  );
}
