/** Captions and labels built from the model's numbers, so tests can pin the sentences. */
import { pctText } from '../../core/format';
import type { Analysis, Lambdas } from './model';

/** A probability to at most three decimals, with trailing zeros dropped ("0.15", "0.333"). */
export const prob = (p: number): string => String(Number(p.toFixed(3)));
/** An edge label: a chance that would round to 0 says so instead of printing a 0 on a drawn arrow. */
export const edgeLabel = (p: number): string => (p < 0.0005 ? '<0.001' : prob(p));
export const num3 = (x: number): string => x.toFixed(3);
const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Visits closer than this to pi count as converged, once the walk is long enough. */
export const CONVERGED_TOLERANCE = 0.01;
export const CONVERGED_AFTER = 1000;

// ── Scene 1 ──────────────────────────────────────────────────────────

export interface WalkReadout {
  states: readonly string[];
  t: number;
  at: number;
  fractions: readonly number[];
  /** Null when the chain has no unique stationary distribution. */
  pi: readonly number[] | null;
  seed: number;
}

export function gapToPi(fractions: readonly number[], pi: readonly number[]): number {
  return Math.max(...fractions.map((f, i) => Math.abs(f - pi[i])));
}

/** One state's share is converged: the walk is long enough and the share is within tolerance of pi. */
export const stateConverged = (t: number, share: number, pi: number): boolean => t >= CONVERGED_AFTER && Math.abs(share - pi) < CONVERGED_TOLERANCE;

export const isConverged = (r: WalkReadout): boolean => !!r.pi && r.t >= CONVERGED_AFTER && gapToPi(r.fractions, r.pi) < CONVERGED_TOLERANCE;

export function walkCaption(r: WalkReadout): string {
  if (r.t === 0) {
    return r.pi
      ? `The token starts on ${r.states[r.at]}. Each step it hops by the row of the state it is on, and the bars show how much time it has spent in each state. The violet lines mark the stationary distribution, ${r.pi.map((p, i) => `${r.states[i]} ${pctText(p)}`).join(', ')}.`
      : `The token starts on ${r.states[r.at]}. This matrix has no unique stationary distribution, so there are no reference lines to compare with.`;
  }
  const shares = r.states.map((s, i) => `${s} ${pctText(r.fractions[i])}`).join(', ');
  const head = `After ${r.t.toLocaleString('en-US')} ${r.t === 1 ? 'step' : 'steps'} (seed ${r.seed}) the token is on ${r.states[r.at]} and has spent ${shares} of its time in each state.`;
  if (!r.pi) return `${head} There is no unique stationary distribution to compare with.`;
  const gap = gapToPi(r.fractions, r.pi);
  if (isConverged(r)) return `${head} Every share is within ${CONVERGED_TOLERANCE} of the stationary distribution (largest gap ${gap.toFixed(4)}).`;
  return `${head} The largest gap to the stationary distribution is ${gap.toFixed(4)}.`;
}

// ── Scene 2 ──────────────────────────────────────────────────────────

export function lambdaText(l: Lambdas): string {
  if (l.kind === 'complex') return `a complex pair ${num3(l.re)} ± ${num3(Math.abs(l.im))}i, modulus ${num3(l.modulus)}`;
  return `${num3(l.l2)} and ${num3(l.l3)}`;
}

export interface ForgetReadout {
  t: number;
  tv: number | null;
  prevTv: number | null;
  lambdas: Lambdas;
  settles: boolean;
  uniquePi: boolean;
}

/** The ratio of successive distances, when both exist and are large enough to mean something. */
export function measuredRatio(prev: number | null, now: number | null): number | null {
  if (prev === null || now === null || prev < 1e-10) return null;
  return now / prev;
}

export function forgetCaption(r: ForgetReadout): string {
  const lam = `The second eigenvalues are ${lambdaText(r.lambdas)}, from trace ${num3(r.lambdas.tr)} and determinant ${num3(r.lambdas.det)}.`;
  if (!r.uniquePi) return `${lam} This matrix has more than one stationary distribution, so there is no single distribution to measure the distance to.`;
  if (!r.settles || r.lambdas.slem >= 1 - 1e-9) return `${lam} The decay rate is ${num3(r.lambdas.slem)}: this chain does not forget its start, so the distance does not shrink to zero.`;
  const ratio = measuredRatio(r.prevTv, r.tv);
  const complex = r.lambdas.kind === 'complex' ? ' The pair is complex, so the distance wobbles as it falls and the guide follows the modulus.' : '';
  const step = r.tv === null ? '' : ` At step ${r.t} the distance is ${r.tv.toExponential(2)}${ratio !== null ? ` and it is ${num3(ratio)} times the previous step's, against the guide's ${num3(r.lambdas.slem)}` : ''}.`;
  const shrink = r.lambdas.kind === 'complex'
    ? `On average each step shrinks the distance by about the modulus ${num3(r.lambdas.slem)}.`
    : `Each step shrinks the distance by about ${num3(r.lambdas.slem)}, the larger modulus.`;
  return `${lam} ${shrink}${complex}${step}`;
}

// ── Scene 3 ──────────────────────────────────────────────────────────

export type Verdict = { text: string; tone: 'ok' | 'orange' };

const names = (states: readonly string[], ids: readonly number[]) => ids.map((i) => states[i]).join(', ');

export function verdictOf(a: Analysis, states: readonly string[]): Verdict {
  if (a.ergodic) return { tone: 'ok', text: 'Irreducible, aperiodic and finite: one stationary distribution, and the distribution settles to it from any start.' };
  if (a.irreducible) {
    return { tone: 'orange', text: `Irreducible but periodic with period ${a.period}: a stationary distribution exists, and the long-run share of time in each state still reaches it, but the distribution at step t cycles forever instead of settling.` };
  }
  if (a.closedClasses.length > 1) {
    return { tone: 'orange', text: `Reducible with ${a.closedClasses.length} closed classes (${a.closedClasses.map((c) => `{${names(states, c.states)}}`).join(' and ')}): the stationary distribution is not unique, and where the mass ends depends on the start.` };
  }
  if (a.absorbing.length > 0) {
    return { tone: 'orange', text: `Reducible with an absorbing state (${names(states, a.absorbing)}): from any start, all the mass ends there, so it is the only stationary distribution and the chain is not irreducible.` };
  }
  return { tone: 'orange', text: 'Reducible: some states cannot be reached from others.' };
}

/** The Verdict stat, derived from the same flags as the stationary-distribution stat and the verdict sentence, so the three cannot disagree. */
export function verdictStat(a: Analysis): { value: string; sub: string } {
  const classes = noun(a.closedClasses.length, 'closed class', 'closed classes');
  if (a.ergodic) return { value: 'settles', sub: 'irreducible and aperiodic' };
  if (!a.uniqueStationary) return { value: 'not unique', sub: classes };
  if (a.settles) return { value: 'settles, not irreducible', sub: classes };
  return { value: `cycles, period ${a.closedClasses[0].period}`, sub: a.irreducible ? 'irreducible but periodic' : classes };
}

export interface Condition {
  name: string;
  /** False when the condition does not apply (aperiodicity is only asked of an irreducible chain). */
  asked: boolean;
  met: boolean;
  detail: string;
}

export function conditionsOf(a: Analysis, states: readonly string[]): Condition[] {
  const classes = a.classes.map((c) => `{${names(states, c)}}`).join(' ');
  return [
    { name: 'Irreducible', asked: true, met: a.irreducible, detail: a.irreducible ? 'every state can reach every other' : `${noun(a.classes.length, 'communicating class', 'communicating classes')}: ${classes}` },
    { name: 'Aperiodic', asked: a.period !== null, met: a.period === 1, detail: a.period === null ? 'not asked: the chain is not irreducible' : a.period === 1 ? 'return times have gcd 1' : `return times have gcd ${a.period}` },
    { name: 'Finite', asked: true, met: true, detail: `${noun(states.length, 'state')}` },
  ];
}

export function failureCaption(label: string, a: Analysis, states: readonly string[], t: number, startName: string): string {
  const v = verdictOf(a, states);
  return `${label}, starting on ${startName}, after ${noun(t, 'step')}. ${v.text}`;
}

// ── Scene 4 ──────────────────────────────────────────────────────────

export function textCaption(wordsCount: number, distinct: number, fresh: number, total: number): string {
  return `${noun(wordsCount, 'word')} make ${noun(distinct, 'state')}: the chain's state is just the word it is on. ${fresh} of ${total} generated sentences are not in the corpus${fresh > 0 ? ', because the chain recombines the transitions it has seen' : ''}.`;
}
