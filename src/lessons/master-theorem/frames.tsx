import type { ReactNode } from 'react';
import { superscript } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { closestPair, type ClosestRun, type Pt } from './closest';
import { classify, critical, F, treeLevels, treeSum, type Case, type FId, type Theta } from './master';

/* ---------- number and formula text ---------- */

/** A count or total: exact with separators while small, else 3 significant figures × a power of ten. */
export function num(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e7) return v.toLocaleString('en');
  if (Math.abs(v) < 1e4) return v.toFixed(2).replace(/\.?0+$/, '');
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return `${m.toFixed(2)} × 10${superscript(e)}`;
}

/** An exponent: integers in superscript, anything else as ^x.xxx (no superscript decimal point exists). */
const exp = (p: number) => (Number.isInteger(p) ? (p === 1 ? '' : superscript(p)) : `^${p.toFixed(3)}`);

export function thetaText(t: Theta): string {
  const n = t.p === 0 ? '' : `n${exp(t.p)}`;
  if (t.loglog) return `${n} log log n`.trim();
  const log = t.q === 0 ? '' : `log${t.q === 1 ? '' : superscript(t.q)} n`;
  return [n, log].filter(Boolean).join(' ') || '1';
}

/** log_b a as text: a whole number when it is one, else 3 decimals. */
export function critText(a: number, b: number): string {
  const c = critical(a, b);
  return Math.abs(c - Math.round(c)) < 1e-9 ? String(Math.round(c)) : c.toFixed(3);
}

export const nCrit = (a: number, b: number) => {
  const c = critical(a, b);
  return Number.isInteger(c) ? thetaText({ p: c, q: 0 }) : `n^${c.toFixed(3)}`;
};

export const caseLabel = (c: Case) => (c.kind === 'gap' ? 'Not covered' : `Case ${c.kind}`);

export function caseText(a: number, b: number, f: FId, c: Case): ReactNode {
  const p = F[f].p2 / 2;
  const crit = nCrit(a, b);
  const theta = <b>Θ({thetaText(c.theta)})</b>;
  switch (c.kind) {
    case 1:
      return <>Case 1: f(n) = {F[f].label} grows polynomially slower than {crit} (exponent {p} &lt; {critText(a, b)}), so the leaves dominate: {theta}.</>;
    case 2:
      return (
        <>
          Case 2{c.k > 0 ? ' (extended form, with log' + superscript(c.k) + ' n)' : ''}: f(n) = {F[f].label} matches {crit}{c.k > 0 ? ` times log${c.k === 1 ? '' : superscript(c.k)} n` : ''}, so every level does about the same work and there are about log n levels: {theta}.
        </>
      );
    case 3:
      return (
        <>
          Case 3: f(n) = {F[f].label} grows polynomially faster than {crit} (exponent {p} &gt; {critText(a, b)}), and the regularity condition a·f(n/b) ≤ c·f(n) holds
          {c.regularity.exact ? ` with c = ${c.regularity.c.toFixed(3)} < 1` : ` for any c between ${c.regularity.c.toFixed(3)} and 1 once n is large`}, so the root dominates: {theta}.
        </>
      );
    case 'gap':
      return (
        <>
          Not covered by the basic theorem: f(n) = {F[f].label} is smaller than {crit} only by a log factor, not by any power n^ε, so neither case 1 nor case 2 applies. The tree still sums: T(n)/n = 1 + 1/2 + 1/3 + … + 1/log n, plus 1 for the leaves, which grows like log log n, so {theta}.
        </>
      );
  }
}

/* ---------- the recursion tree, level by level ---------- */

export interface TreeFrame extends Frame {
  /** The level being summed, or null on the intro and verdict. */
  level: number | null;
  /** Levels summed so far. */
  summed: number;
  done: boolean;
}

export function treeFrames(a: number, b: number, f: FId, K: number): TreeFrame[] {
  const levels = treeLevels(a, b, f, K);
  const n = b ** K;
  const rec = createRecorder<TreeFrame>({ level: null, summed: 0, done: false });
  rec.snap(<>T(n) = {a}·T(n/{b}) + {F[f].label}, with n = {b}{superscript(K)} = {num(n)} so every split is exact, and T(1) = 1. Sum the tree one level at a time.</>);
  let running = 0;
  for (const l of levels) {
    running += l.total;
    rec.snap(
      l.leaf ? (
        <>Leaves: {a}{superscript(K)} = {num(l.nodes)} subproblems of size 1, each T(1) = 1: total {num(l.total)}. That is n^(log_{b} {a}) = {nCrit(a, b)} at n = {num(n)}.</>
      ) : (
        <>Level {l.k}: {num(l.nodes)} node{l.nodes === 1 ? '' : 's'} of size {num(l.size)}, each doing f({num(l.size)}) = {num(l.total / l.nodes)}: level total {num(l.total)}. Running sum {num(running)}.</>
      ),
      1,
      { level: l.k, summed: l.k + 1 },
    );
  }
  const c = classify(a, b, f);
  rec.set({ level: null, done: true });
  rec.close(<>T({num(n)}) = {num(treeSum(a, b, f, K))}. {caseText(a, b, f, c)}</>, 2.5);
  return rec.frames;
}

/* ---------- closest pair ---------- */

export interface PairFrame extends Frame {
  /** Index into run.steps, or null for the intro and the summary. */
  step: number | null;
  done: boolean;
}

export function pairFrames(points: readonly Pt[]): { run: ClosestRun; frames: PairFrame[] } {
  const run = closestPair(points);
  const rec = createRecorder<PairFrame>({ step: null, done: false });
  rec.snap(<>{points.length} points. Split at the median x, solve each half, then only check the strip of half-width δ around the split line.</>);
  run.steps.forEach((s, i) => {
    rec.snap(
      <>
        Level {s.level}: {s.members.length} points split at x = {s.midX.toFixed(1)}. The halves' best is δ = {s.delta.toFixed(2)}. Strip: {s.strip.length} point{s.strip.length === 1 ? '' : 's'} within δ of the line, {s.checks} check{s.checks === 1 ? '' : 's'}. Best now {s.best.d.toFixed(2)}.
      </>,
      undefined,
      { step: i },
    );
  });
  const perLevel = run.stripChecks.map((c, l) => `level ${l}: ${c}`).join(', ');
  rec.set({ step: null, done: true });
  rec.close(
    <>
      Closest pair at distance {run.best.d.toFixed(2)}. Strip checks per level ({perLevel}) never exceed 7 per point, so the combine step is linear: T(n) = 2T(n/2) + O(n), the merge-sort case, Θ(n log n). (This demo re-sorts each strip by y, an extra log factor in sorting; merging y-sorted halves avoids it.)
    </>,
    2.5,
  );
  return { run, frames: rec.frames };
}
