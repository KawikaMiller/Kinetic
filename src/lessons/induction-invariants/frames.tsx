import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { dominoRun, DOMINOES, horseOverlap, oddSum, type DominoClaim } from './dominoes';
import { leafPrimes, proofOrder, type FactorNode } from './factorTree';
import { ABSENT_TARGETS } from './presets';
import { invariantHolds, ITERATION_CAP, LINE, runSearch, type Bug, type Check, type SearchRun, type Verdict } from './search';

const ok = (s: ReactNode) => <span className="hl ok">{s}</span>;
const bad = (s: ReactNode) => <span className="hl bad">{s}</span>;

/* ---------- scene 1: dominoes ---------- */

export interface DominoFrame extends Frame {
  fallen: number;
  /** The domino being checked now (1-based), or null. */
  current: number | null;
  /** The step k → k + 1 that turned out not to follow. */
  gapAt: number | null;
}

export function dominoFrames(claim: DominoClaim, base: boolean, step: boolean): DominoFrame[] {
  const rec = createRecorder<DominoFrame>({ fallen: 0, current: null, gapAt: null }, { transient: { current: null } });
  const run = dominoRun(claim, base, step);
  const proven = <>Base case {base ? ok('proven') : bad('not proven')}, step {step ? ok('claimed proven') : bad('not proven')}.</>;
  rec.snap(
    claim === 'odd'
      ? <>P(n): 1 + 3 + … + (2n − 1) = n². {proven} Push the first domino.</>
      : <>P(n): any n horses are all the same colour. {proven} Push the first domino.</>,
  );
  if (run.stop.kind === 'no-base') {
    rec.close(<>Nothing falls. Without the base case no domino is ever pushed: the step only says each one <i>would</i> knock over the next. P(1) is never established, so {bad('nothing is proven')}.</>, 2);
    return rec.frames;
  }
  rec.snap(
    claim === 'odd' ? <>P(1): 1 = 1². The base case, checked: domino 1 falls.</> : <>P(1): one horse is the same colour as itself. True: domino 1 falls.</>,
    1.2,
    { fallen: 1, current: 1 },
  );
  for (let k = 1; k < run.fallen; k++) {
    rec.snap(
      claim === 'odd' ? (
        <>Step {k} → {k + 1}: add the next odd number, {k}² + {2 * k + 1} = {(k + 1) ** 2} = {k + 1}². Domino {k + 1} falls (the sum, added up for real, is {oddSum(k + 1)}).</>
      ) : (
        <>Step {k} → {k + 1}: the two groups of {k} share {horseOverlap(k)} horses, so their colours are tied together. Domino {k + 1} falls.</>
      ),
      undefined,
      { fallen: k + 1, current: k + 1 },
    );
  }
  switch (run.stop.kind) {
    case 'all':
      rec.close(<>{ok(`All ${DOMINOES} dominoes fell`)}, and the same step works for every k, not just the {DOMINOES} drawn: the claim holds for every n ≥ 1.</>, 2);
      break;
    case 'no-step':
      rec.close(<>Only P(1) is proven. Without the inductive step nothing says P(1) ⇒ P(2), so {bad('domino 2 stays up')}: one true case is not a proof for every n.</>, 2);
      break;
    case 'gap': {
      const k = run.stop.at;
      rec.snap(
        <>
          Step {k} → {k + 1} {bad('breaks')}: with {k + 1} horses, "all but the last" is {'{'}horse 1{'}'} and "all but the first" is {'{'}horse 2{'}'}. They share {horseOverlap(k)} horses, so nothing ties
          the two colours together. Domino {k + 1} doesn't fall.
        </>,
        1.6,
        { gapAt: k, current: k + 1 },
      );
      rec.close(<>The argument works for every step from 2 → 3 on, but one broken link is enough: P(2) was never proven, and it's false (a black horse and a white one). So the "proof" proves nothing past n = 1.</>, 2);
      break;
    }
  }
  return rec.frames;
}

/* ---------- scene 2: binary search ---------- */

export type SearchPhase = 'init' | 'iter' | 'skip' | 'found' | 'exit' | 'verdict';

export interface SearchFrame extends Frame {
  phase: SearchPhase;
  lo: number;
  hi: number;
  mid: number | null;
  line: number | null;
  check: Check | null;
  /** Range size hi − lo + 1 at this point. */
  size: number;
  /** Iterations run so far. */
  iteration: number;
  /** On the closing frame only: did the invariant hold at every check of the run? */
  allHeld: boolean | null;
}

export const VERDICT_LABEL: Record<Verdict['kind'], string> = {
  ok: 'Correct',
  invariant: 'Invariant violated',
  'non-termination': 'Termination failed',
  exit: 'Exit check failed',
};

const checkText = (c: Check, n: number) =>
  invariantHolds(c) ? ok('invariant ✓') : bad(c.bounds ? 'invariant ✗: the target is outside [lo, hi]' : `invariant ✗: needs 0 ≤ lo ≤ hi + 1 ≤ ${n}`);

/** After the variant stalls, show this many repeats before summarising the rest up to the cap. */
const STALL_SHOWN = 2;

/** hi at the loop head where check number `at` was made (the iterations, then the exit). */
const hiAt = (run: SearchRun, at: number) => (run.iterations[at] ?? run.exit)!.hi;

/** The verdict's label. A passing run of code with a bug injected is not "Correct": it only passed this input. */
export const verdictLabel = (v: Verdict, bug: Bug) => (v.kind === 'ok' && bug !== 'none' ? 'Passed this run' : VERDICT_LABEL[v.kind]);

/** The first preset target on which this bug actually shows (some check fails). */
export function failingTarget(a: readonly number[], bug: Bug): number | null {
  if (bug === 'none') return null;
  return [...a, ...ABSENT_TARGETS].find((t) => runSearch(a, t, bug).verdict.kind !== 'ok') ?? null;
}

export function verdictCaption(run: SearchRun, n: number, a: readonly number[] = [], target = 0, bug: Bug = 'none'): ReactNode {
  const v = run.verdict;
  const label = <b>{verdictLabel(v, bug)}.</b>;
  if (v.kind === 'ok' && bug !== 'none') {
    const t = failingTarget(a, bug);
    return (
      <>
        {label} Every check held for target {target}, so this input doesn't exercise the injected bug. One passing run proves nothing about the code{t !== null ? <>: search for {t} to see it fail</> : null}.
      </>
    );
  }
  switch (v.kind) {
    case 'ok':
      return <>{label} Initialisation, maintenance at every iteration, and termination (the range shrank every time) all check out, so {run.result === -1 ? 'the -1 is justified' : `index ${run.result} is the answer`}.</>;
    case 'invariant':
      return v.part === 'bounds' ? (
        <>{label} {v.at === 0 ? 'Before the loop even starts' : `At iteration ${v.at + 1}`}, hi = {hiAt(run, v.at)}, so hi + 1 = {hiAt(run, v.at) + 1} is more than n = {n}: the range runs off the end of the array{run.outOfBounds ? `, and the loop reads a[${n}], which doesn't exist (JavaScript gives undefined; many languages would crash)` : ''}. {run.result !== null && run.result >= 0 ? 'The answer happens to be right, but nothing proves it.' : 'Whatever it returns, nothing proves it.'}</>
      ) : (
        <>{label} At iteration {v.at + 1} the target is no longer inside [lo, hi].</>
      );
    case 'non-termination':
      return <>{label} The invariant held every time, but the range stopped shrinking at iteration {v.at + 1}, so nothing guaranteed the loop would end; it was stopped after {ITERATION_CAP} iterations so you can see it.</>;
    case 'exit':
      return <>{label} The invariant held every time, but the loop stopped while [lo, hi] still had a cell, so "not found" was never justified{v.wrongAnswer ? ', and here it is wrong' : ' (here it happens to be right)'}.</>;
  }
}

export function searchFrames(a: readonly number[], target: number, bug: Bug): SearchFrame[] {
  const run = runSearch(a, target, bug);
  const n = a.length;
  const first = run.iterations[0] ?? run.exit!;
  const rec = createRecorder<SearchFrame>({ phase: 'init', lo: first.lo, hi: first.hi, mid: null, line: LINE.init, check: first.check, size: first.hi - first.lo + 1, iteration: 0, allHeld: null });
  rec.snap(<>Initialisation: lo = {first.lo}, hi = {first.hi}, looking for {target}. Before the loop: {checkText(first.check, n)}.</>);

  const stalledAt = run.verdict.kind === 'non-termination' ? run.verdict.at : -1;
  for (const [i, it] of run.iterations.entries()) {
    if (stalledAt >= 0 && i > stalledAt + STALL_SHOWN) {
      const rest = run.iterations.slice(i);
      rec.snap(
        <>Iterations {i + 1} to {ITERATION_CAP} are the same: lo = {rest[0].lo}, hi = {rest[0].hi}, mid = {rest[0].mid} every time. The infinite loop is stopped after {ITERATION_CAP} iterations so you can see it.</>,
        1.6,
        { phase: 'skip', lo: it.lo, hi: it.hi, mid: it.mid, line: LINE.loop, check: it.check, size: it.size, iteration: ITERATION_CAP },
      );
      break;
    }
    const read = it.value === undefined ? <>a[{it.mid}] is {bad('undefined')} (past the end)</> : <>a[{it.mid}] = {it.value}</>;
    const line = it.outcome === 'found' ? LINE.found : it.outcome === 'right' ? LINE.right : LINE.left;
    const update =
      it.outcome === 'found' ? <>, the target: {ok(`return ${it.mid}`)}</>
      : it.outcome === 'right' ? (bug === 'lo-mid' ? <> &lt; {target}, so lo = mid = {it.mid}</> : <> &lt; {target}, so lo = mid + 1 = {it.mid + 1}</>)
      : <>{it.value === undefined ? ', which is not < target' : ` > ${target}`}, so hi = mid − 1 = {it.mid - 1}</>;
    const shrink =
      it.sizeAfter === null ? null
      : it.sizeAfter < it.size ? <> Range {it.size} → {Math.max(0, it.sizeAfter)} cells.</>
      : <> Range {it.size} → {it.sizeAfter}: {bad('the variant did not shrink')}.</>;
    rec.snap(
      <>Iteration {i + 1}: [lo, hi] = [{it.lo}, {it.hi}], {checkText(it.check, n)}. mid = {it.mid}, {read}{update}.{shrink}</>,
      undefined,
      { phase: it.outcome === 'found' ? 'found' : 'iter', lo: it.lo, hi: it.hi, mid: it.mid, line, check: it.check, size: it.size, iteration: i + 1 },
    );
  }
  if (run.exit) {
    const { lo, hi, check } = run.exit;
    rec.snap(
      lo > hi ? (
        <>Loop ends: lo = {lo} &gt; hi = {hi}, the range is empty. {checkText(check, n)}, so the target can't be anywhere: return -1.</>
      ) : (
        <>Loop ends with lo = {lo} and hi = {hi}: {bad(`a[${lo}] = ${a[lo]} was never checked`)}, yet it returns -1.</>
      ),
      undefined,
      { phase: 'exit', lo, hi, mid: null, line: LINE.notFound, check, size: hi - lo + 1 },
    );
  }
  rec.set({ phase: 'verdict', line: null, check: null, allHeld: run.verdict.kind !== 'invariant' });
  rec.close(verdictCaption(run, n, a, target, bug), 2);
  return rec.frames;
}

/* ---------- scene 3: strong induction ---------- */

export interface FactorFrame extends Frame {
  proven: string[];
  current: string | null;
}

const product = (xs: number[]) => xs.join(' × ');

/** The primes under one node. */
function primesUnder(nodes: Map<string, FactorNode>, id: string): number[] {
  const node = nodes.get(id)!;
  return node.children.length ? node.children.flatMap((c) => primesUnder(nodes, c)).sort((a, b) => a - b) : [node.value];
}

export function factorFrames(nodes: Map<string, FactorNode>): FactorFrame[] {
  const rec = createRecorder<FactorFrame>({ proven: [], current: null }, { transient: { current: null } });
  const root = nodes.get('r')!;
  rec.snap(
    root.value <= 3 ? (
      <>Strong induction on n ≥ 2. {root.value} is prime and there is no smaller case to lean on: it is a base case, its own product of primes.</>
    ) : (
      <>Strong induction on n ≥ 2: to prove P({root.value}), we may assume P(m) for every m from 2 to {root.value - 1}, not just m = {root.value - 1}.</>
    ),
  );
  const proven: string[] = [];
  for (const id of proofOrder(nodes)) {
    const node = nodes.get(id)!;
    proven.push(id);
    if (!node.children.length) {
      rec.snap(<>{node.value} is prime: it is already a product of primes (just one).</>, undefined, { proven: [...proven], current: id });
      continue;
    }
    const [a, b] = node.children.map((c) => nodes.get(c)!.value);
    rec.snap(
      <>
        {node.value} = {a} × {b}, both smaller than {node.value} and already proven, so {node.value} = {product(primesUnder(nodes, id))}.
        {a !== node.value - 1 && b !== node.value - 1 ? <> It used P({a}) and P({b}), not P({node.value - 1}): that's what makes it strong induction.</> : null}
      </>,
      1.2,
      { proven: [...proven], current: id },
    );
  }
  rec.close(<>Every node was proven from smaller ones: {ok(`${root.value} = ${product(leafPrimes(nodes))}`)}.</>, 2);
  return rec.frames;
}
