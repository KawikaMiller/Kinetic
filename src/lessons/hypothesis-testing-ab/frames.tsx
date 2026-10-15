import type { ReactNode } from 'react';
import { pctText, sig } from '../distributions/fmt';
import {
  ALPHA, MIN_VISITORS, SLICES, firstCrossing, lookAlpha, lookVerdict, sampleSizePerArm, verdictKind, type Arms, type ExperimentSpec, type Look,
  type PeekRates, type SliceResult, type VerdictKind, type ZTest,
} from './model';

/** A share written as percentage points: 0.0312 → "+3.12 pts". */
export const pointsText = (share: number): string => `${share > 0 ? '+' : share < 0 ? '−' : ''}${Math.abs(share * 100).toFixed(2)} pts`;

/** A p-value for display: "0.0355", or "<0.001" below that. */
export const pText = (p: number): string => (p < 0.001 ? '<0.001' : sig(p, 3));

/** A z statistic to two decimals: 2.1028 → "2.10", with a real minus sign. */
export const zText = (z: number): string => (z < 0 ? `−${Math.abs(z).toFixed(2)}` : z.toFixed(2));

/** The tone a verdict wears: ok only for a real win, bad for a false positive or a wrong-direction win, orange for a miss. */
export const VERDICT_TONE: Record<VerdictKind, string> = {
  'real-win': 'ok',
  'false-positive': 'bad',
  'wrong-sign': 'bad',
  miss: 'orange',
  'correct-null': '',
  significant: '',
  'not-significant': '',
  'no-verdict': '',
};

const VERDICT_SAYS: Record<VerdictKind, string> = {
  'real-win': 'significant, and the lift is real',
  'false-positive': 'significant, but a false positive: there is no true lift',
  'wrong-sign': 'significant, but in the wrong direction',
  miss: 'not significant, although the lift is real: a miss at this sample size',
  'correct-null': 'not significant, correctly: there is nothing to find',
  significant: 'significant at 0.05',
  'not-significant': 'not significant at 0.05',
  'no-verdict': 'no verdict',
};

export const verdictSays = (kind: VerdictKind): string => VERDICT_SAYS[kind];

function verdictSpan(kind: VerdictKind): ReactNode {
  const tone = VERDICT_TONE[kind];
  return <span className={`hl wrap${tone ? ` ${tone}` : ''}`}>{VERDICT_SAYS[kind]}</span>;
}

const armLine = (a: Arms, t: ZTest) => (
  <>
    A converted {a.conversionsA.toLocaleString('en-US')} of {a.visitorsA.toLocaleString('en-US')} ({pctText(t.rateA, 2)}), B {a.conversionsB.toLocaleString('en-US')} of{' '}
    {a.visitorsB.toLocaleString('en-US')} ({pctText(t.rateB, 2)}).
  </>
);

/** Below this many expected conversions in the smaller arm (pooled rate x visitors) the normal approximation of the z-test is poor. */
export const ROUGH_EXPECTED_CONVERSIONS = 5;

/** A warning that the p-value is only rough, when the counts are small; null otherwise. */
export function smallCountNote(a: Arms, t: ZTest): ReactNode | null {
  if (t.status !== 'ok') return null;
  const expected = t.pooled * Math.min(a.visitorsA, a.visitorsB);
  if (expected >= ROUGH_EXPECTED_CONVERSIONS) return null;
  return <> Only about {sig(expected, 2)} conversions are expected per arm (below {ROUGH_EXPECTED_CONVERSIONS}), so the normal approximation is poor: treat the p-value as rough.</>;
}

/** Why there is no p-value, when there is not one. */
function refusal(t: ZTest): ReactNode | null {
  if (t.status === 'too-few') return <>Under {MIN_VISITORS} visitors in an arm is too few for a z-test, so there is no p-value and no verdict.</>;
  if (t.status === 'undefined') return <>Both arms converted at the same extreme rate, so the variance is zero and the p-value is undefined (not 0, not 1).</>;
  return null;
}

export function runCaption(spec: ExperimentSpec, arms: Arms, t: ZTest): ReactNode {
  const none = refusal(t);
  if (none) return <>{armLine(arms, t)} {none}</>;
  const kind = verdictKind(t, spec.lift);
  return (
    <>
      {armLine(arms, t)} z = {zText(t.z!)}, p = <span className="hl violet">{pText(t.p!)}</span>: {verdictSpan(kind)}. The 95% interval for B − A is{' '}
      {pointsText(t.lo!)} to {pointsText(t.hi!)}; the true lift in this simulation is {pointsText(spec.lift / 100)}, which a real experiment never shows you.{smallCountNote(arms, t)}
    </>
  );
}

/** What scene 2 says about the share of replicates below α. */
export function repeatCaption(spec: ExperimentSpec, below: number, runs: number): ReactNode {
  const se = Math.sqrt((ALPHA * (1 - ALPHA)) / runs);
  const near = Math.abs(below - ALPHA) <= 3 * se;
  const head = (
    <>
      {runs.toLocaleString('en-US')} experiments at baseline {sig(spec.baseline)}%, true lift {pointsText(spec.lift / 100)} and {spec.visitors.toLocaleString('en-US')} visitors per arm:{' '}
      <span className="hl violet">{pctText(below)}</span> had p &lt; 0.05.{' '}
    </>
  );
  if (spec.lift === 0) {
    return (
      <>
        {head}With no true lift that is the false-positive rate, {near ? 'about the 5% the threshold promises' : `${below > ALPHA ? 'above' : 'below'} the 5% it promises (noise from only ${runs.toLocaleString('en-US')} runs)`}.
      </>
    );
  }
  return <>{head}With a real lift that share is the power: the chance this experiment reaches p &lt; 0.05.</>;
}

export function powerCaption(baseline: number, mde: number, power: number): ReactNode {
  const n = sampleSizePerArm(baseline / 100, mde / 100, ALPHA, power);
  return (
    <>
      To detect {baseline}% → {sig(baseline + mde)}% at α = 0.05 and {pctText(power, 0)} power takes about <span className="hl">{n.toLocaleString('en-US')}</span> visitors per arm: halve the
      effect and the number needed goes up about fourfold.
    </>
  );
}

export function peekCaption(run: readonly Look[], looks: number, bonferroni: boolean, lift: number, rates: PeekRates): ReactNode {
  const threshold = lookAlpha(looks, bonferroni);
  const k = firstCrossing(run, threshold);
  const last = run[run.length - 1];
  const crossKind: VerdictKind = k < 0 ? 'no-verdict' : lookVerdict(run[k], lift, threshold);
  return (
    <>
      {k < 0
        ? <>In this run p never fell below {sig(threshold, 2)} across {looks} looks (final p = {last.p === null ? '–' : pText(last.p)}).</>
        : <>In this run p first fell below {sig(threshold, 2)} at look {k + 1} of {looks} ({run[k].visitors.toLocaleString('en-US')} visitors per arm): stopping there is {verdictSpan(crossKind)}.</>}{' '}
      Over {rates.runs.toLocaleString('en-US')} such experiments, {pctText(rates.anyLook)} would have been stopped with a &quot;winner&quot; by stopping at the first p &lt; {sig(threshold, 2)}, against{' '}
      {pctText(rates.lastLook)} when looking once at the end.
      {bonferroni && rates.anyLook < ALPHA && <> Bonferroni is conservative here, because the looks share data: it lands below 5%, not at it.</>}
    </>
  );
}

export function sliceCaption(run: readonly SliceResult[], significant: number[], bWins: number[], threshold: number, empirical: number, total: number): ReactNode {
  return (
    <>
      {significant.length === 0
        ? <>None of the {run.length} slices of this A/A experiment reaches p &lt; {sig(threshold, 2)}.</>
        : <><span className="hl bad">{significant.length} of {run.length}</span> slices of this A/A experiment reach p &lt; {sig(threshold, 2)} ({bWins.length} with B ahead), and there is no true difference anywhere.</>}{' '}
      Chance of at least one among {SLICES} fair tests: 1 − (1 − {sig(threshold, 2)})^{SLICES} = {pctText(1 - (1 - threshold) ** SLICES)}; over {total.toLocaleString('en-US')} simulated A/A experiments{' '}
      {pctText(empirical)} had one.
    </>
  );
}

export function ownCaption(arms: Arms, t: ZTest): ReactNode {
  const none = refusal(t);
  if (none) return <>{armLine(arms, t)} {none}</>;
  const kind = verdictKind(t, null);
  return (
    <>
      {armLine(arms, t)} z = {zText(t.z!)}, p = <span className="hl violet">{pText(t.p!)}</span>: {verdictSpan(kind)}. The 95% interval for B − A is {pointsText(t.lo!)} to {pointsText(t.hi!)}. A p-value is not the chance
      that B is better.{smallCountNote(arms, t)}
    </>
  );
}
