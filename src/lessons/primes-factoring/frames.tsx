import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { power } from '../../core/format';
import {
  STEP_CAP, belowSquare, type SievePhase, digitsOf, extrapolateSeconds, longTime, type Primality, type SievePlan, type TrialRun,
} from './model';

export const group = (n: number | bigint) => n.toLocaleString('en-US');

export interface SieveFrame extends Frame {
  /** Index of the prime's pass; −1 before the first, passes.length once finished. */
  pass: number;
  phase: SievePhase;
}

/** Below this many, the caption lists the multiples a 2p start would redo. */
const LIST_MAX = 4;

export function sieveFrames(plan: SievePlan): SieveFrame[] {
  const { n, passes, primes, stopPrime } = plan;
  const r = createRecorder<SieveFrame>({ pass: -1, phase: 'start' });
  r.snap(<>The numbers 2 to {n}. Take the smallest number not crossed out: it's prime. Cross out its multiples, then repeat. (1 is
    neither prime nor composite.)</>);
  passes.forEach(({ prime: p, crossed }, i) => {
    r.snap(
      i === 0
        ? <><span className="hl">2</span> is the first prime.</>
        : <><span className="hl">{p}</span> wasn't crossed out by anything smaller, so it's prime.</>,
      1,
      { pass: i, phase: 'light' },
    );
    const wasted = belowSquare(p);
    const skipped = p === 2
      ? null
      : <> Not from 2·{p}: {wasted.length <= LIST_MAX ? wasted.join(', ') : `${wasted.slice(0, LIST_MAX).join(', ')} …`}{' '}
          {wasted.length === 1 ? 'was already crossed by a smaller prime' : 'were already crossed by smaller primes'}.</>;
    r.snap(<>Cross out multiples of {p} starting at {p}² = <span className="hl bad">{p * p}</span>:{' '}
      {crossed.length} new {crossed.length === 1 ? 'number' : 'numbers'} gone.{skipped}</>, 1.5, { pass: i, phase: 'cross' });
  });
  r.set({ pass: passes.length, phase: 'done' });
  r.close(<>The next prime is {stopPrime}, and {stopPrime}² = {stopPrime * stopPrime} &gt; {n}: any multiple of it up to {n} has a
    smaller factor and is already gone. Stop: all <span className="hl ok">{primes.length}</span> survivors are prime.</>, 2.2);
  return r.frames;
}

// ── Multiply vs factor ───────────────────────────────────────────────

export const rate = (stepsPerSecond: number) => `${group(Math.round(stepsPerSecond))}/s`;

/** What the caption says when a run ends; every number comes from the run itself. */
export function runCaption(run: TrialRun, seconds: number): ReactNode {
  const speed = run.steps / Math.max(seconds, 1e-6);
  if (run.status === 'found') {
    return <>Found <span className="hl ok">{group(run.factor!)}</span> after {group(run.steps)} divisions in {longTime(seconds)}.
      Multiplying took one step; undoing it took {group(run.steps)}.</>;
  }
  if (run.status === 'capped') {
    return <>Stopped at {power(Math.log10(STEP_CAP), 10)} divisions after {longTime(seconds)}: too big to try here. At your browser's
      {' '}{rate(speed)}, trying every divisor up to √n would take {longTime(extrapolateSeconds(digitsOf(run.n), speed))}{' '}
      (extrapolated).</>;
  }
  if (run.status === 'prime') return <>No divisor up to √{group(run.n)}: it's prime.</>;
  return <>Trying 2, 3, 5, 7, 9 … up to √n, one division at a time.</>;
}

// ── Primality ────────────────────────────────────────────────────────

export function primalityCaption(n: bigint, r: Primality): ReactNode {
  const factors = r.trial !== 'too-big' && r.trial.factors.length > 1 ? r.trial.factors.map(String).join(' × ') : null;
  if (r.fermat && r.truth === false) {
    return <>{group(n)}{factors && <> = {factors}</>} fools Fermat's test: 2^(n − 1) ≡ 1 (mod n) even though it's composite.
      Miller-Rabin catches it.</>;
  }
  if (r.truth === true) {
    return r.trial === 'too-big'
      ? <>{group(n)} is prime: Miller-Rabin proves it below its bound in a blink, while trial division is too big to try here.</>
      : <>{group(n)} is prime: all three agree.</>;
  }
  if (r.truth === false) {
    return factors
      ? <>{group(n)} = {factors}: composite, and every test says so.</>
      : <>{group(n)} is composite: Miller-Rabin found a witness. Trial division is too big to try here.</>;
  }
  return <>Miller-Rabin says probably prime. Above 3.3·10²⁴ its 13 bases are no longer a proof, and trial division is too big to
    try here.</>;
}
