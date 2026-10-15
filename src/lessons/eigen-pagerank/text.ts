/** Captions and labels from the model's numbers, so tests can pin the sentences. */
import type { Behaviour } from './eigen';
import type { RankStep, Web } from './pagerank';
import { deadEndsOf, trapsOf } from './pagerank';

export const n3 = (x: number): string => x.toFixed(3);
export const n4 = (x: number): string => x.toFixed(4);
const noun = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Arrows ───────────────────────────────────────────────────────────

export function eigenvalueText(b: Behaviour): string {
  switch (b.kind) {
    case 'zero': return 'all zero';
    case 'all': return 'one repeated value, every direction';
    case 'converges': case 'ties': return `${n3(b.lambda1)} and ${n3(b.lambda2)}`;
    case 'complex': return `${n3(b.re)} ± ${n3(Math.abs(b.im))}i (complex)`;
    case 'shear': return `${n3(b.lambda)}, repeated, one direction`;
  }
}

export function arrowCaption(b: Behaviour, k: number): string {
  const times = k === 0 ? 'Press Apply A to multiply every arrow by the matrix and rescale it to length 1.' : `After ${noun(k, 'application')}`;
  switch (b.kind) {
    case 'zero':
      return 'This matrix sends every arrow to the zero vector, so there is nothing to rescale and no direction survives.';
    case 'all':
      return 'Every direction is an eigenvector here (the matrix just scales by one number), so applying it changes no arrow.';
    case 'converges': {
      const flip = b.flips ? ' The dominant eigenvalue is negative, so each arrow also flips to the other side every step.' : '';
      const body = `the arrows swing toward the line of the eigenvalue ${n3(b.lambda1)}; the other eigen-component shrinks by the factor |${n3(b.lambda2)} ÷ ${n3(b.lambda1)}| = ${n3(b.ratio)} each step.${flip}`;
      return k === 0 ? `${times} Then ${body}` : `${times}, ${body}`;
    }
    case 'ties':
      return `The eigenvalues ${n3(b.lambda1)} and ${n3(b.lambda2)} have the same size, so neither direction wins: an arrow on neither line alternates between two directions instead of settling.`;
    case 'complex':
      return `No real direction is kept: the eigenvalues are the complex pair ${n3(b.re)} ± ${n3(Math.abs(b.im))}i (modulus ${n3(b.modulus)}), so the arrows keep turning instead of settling.`;
    case 'shear':
      return `One eigen-direction only (the eigenvalue ${n3(b.lambda)} is repeated): arrows approach it like 1/k, slowly, not by a fixed factor each step.`;
  }
}

export function residualText(res: number, tolerance: number): string {
  return res < tolerance ? `${res.toExponential(1)}: an eigenvector` : `${n4(res)}: not an eigenvector`;
}

// ── PageRank ─────────────────────────────────────────────────────────

export const pageList = (w: Web, ids: readonly number[]): string => ids.map((i) => w.names[i]).join(', ');

export function rankCaption(w: Web, d: number, dead: 'drop' | 'spread', step: RankStep, i: number): string {
  const n = w.names.length;
  const top = step.r.indexOf(Math.max(...step.r));
  const deadEnds = deadEndsOf(w);
  const traps = trapsOf(w);
  const lead = i === 0
    ? `Every page starts with 1/${n} = ${n4(1 / n)}. Each step a page passes d = ${d.toFixed(2)} of its rank along its out-links and every page gets (1 − d)/${n} = ${n4((1 - d) / n)} from the teleport.`
    : `After ${noun(i, 'step')} the ranks changed by ${step.change.toExponential(2)} in total (L1); the largest is ${w.names[top]} at ${n4(step.r[top])}.`;
  const leak = step.total < 1 - 1e-9
    ? ` The ranks sum to ${n4(step.total)}, not 1: ${deadEnds.length > 0 && dead === 'drop' ? `the dead end ${pageList(w, deadEnds)} drops the rank it receives` : 'rank is leaking'}.`
    : '';
  const trap = traps.length > 0 && d === 1 ? ` The group ${traps.map((t) => `{${pageList(w, t)}}`).join(' and ')} only links to itself, so at d = 1 it keeps whatever rank reaches it.` : '';
  return `${lead}${leak}${trap}`;
}
