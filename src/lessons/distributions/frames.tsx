import type { ReactNode } from 'react';
import { pctText, ratioText, sig } from './fmt';
import {
  FAMILY_NAME, distMean, type ArrivalSummary, type CltReport, type Family, type Mystery, type ShapeView,
} from './model';

/** Where the mean sits relative to the median, said from the two numbers (a 5% band counts as "at"). */
const SKEW_BAND = 0.05;

export function meanPosition(mean: number, median: number): 'above' | 'at' | 'below' {
  const ratio = mean / median;
  if (ratio > 1 + SKEW_BAND) return 'above';
  if (ratio < 1 - SKEW_BAND) return 'below';
  return 'at';
}

export function shapeCaption(v: ShapeView): ReactNode {
  const name = FAMILY_NAME[v.dist.family];
  const head = (
    <>
      {name}, {v.n.toLocaleString('en-US')} draws, seed {v.seed}: the sample median is <span className="hl info">{sig(v.median)}</span>, p99{' '}
      <span className="hl orange">{sig(v.p99)}</span> ({sig(v.p99 / v.median)}× the median) and p99.9{' '}
      <span className="hl bad">{sig(v.p999)}</span> ({sig(v.p999 / v.median)}× the median).{' '}
    </>
  );
  if (!Number.isFinite(distMean(v.dist))) {
    return (
      <>
        {head}This Pareto has <span className="hl bad">no finite mean</span> (α ≤ 1), so the sample mean of {sig(v.mean)} is only what
        these draws happened to give.
      </>
    );
  }
  const where = meanPosition(v.mean, v.median);
  return (
    <>
      {head}The sample mean is <span className="hl">{sig(v.mean)}</span>, {where === 'at' ? 'about at' : `${where}`} the median
      {where === 'at' ? '' : ` (${sig(v.mean / v.median)}×)`}, and {pctText(v.belowMeanSample)} of the draws fall below it (exact{' '}
      {pctText(v.belowMeanExact)}).
    </>
  );
}

/** How the dispersion index reads: 'poisson' within 0.15 of 1, 'clumped' from 1.5, 'above' between. */
const POISSON_BAND = 0.15;
const CLUMPED_FROM = 1.5;

export function dispersionVerdict(dispersion: number): 'poisson' | 'above' | 'clumped' | 'below' {
  if (Math.abs(dispersion - 1) <= POISSON_BAND) return 'poisson';
  if (dispersion < 1) return 'below';
  return dispersion >= CLUMPED_FROM ? 'clumped' : 'above';
}

const DISPERSION_SAYS: Record<ReturnType<typeof dispersionVerdict>, string> = {
  poisson: 'about 1: the variance matches the mean, as a Poisson count requires.',
  above: 'above 1: more spread than a Poisson count would have.',
  clumped: 'well above 1: arrivals come in clumps, so these counts are not Poisson.',
  below: 'below 1: more regular than a Poisson count would be.',
};

export function poissonCaption(s: ArrivalSummary): ReactNode {
  const verdict = dispersionVerdict(s.dispersion);
  return (
    <>
      Mean arrivals per window {sig(s.mean)} (λ = {sig(s.lambda)}), variance {sig(s.variance)}: a dispersion index of{' '}
      <span className={`hl ${verdict === 'poisson' ? 'ok' : 'bad'}`}>{sig(s.dispersion)}</span>, {DISPERSION_SAYS[verdict]}
    </>
  );
}

export function cltCaption(r: CltReport, family: Family, n: number): ReactNode {
  const name = FAMILY_NAME[family];
  if (r.moments === 'infinite-mean') {
    return (
      <>
        {name} with α ≤ 1 has <span className="hl bad">no finite mean</span>, so the means of n = {n.toLocaleString('en-US')} draws have nothing to settle on:
        their spread of {sig(r.spread)} is just what these draws gave.
      </>
    );
  }
  if (r.predicted === null || r.ratio === null) {
    return (
      <>
        σ is <span className="hl bad">infinite</span> here, so the σ/√n formula does not apply. The means of n = {n.toLocaleString('en-US')} draws spread{' '}
        {sig(r.spread)}.
      </>
    );
  }
  return (
    <>
      Means of n = {n.toLocaleString('en-US')} draws spread {sig(r.spread)}; σ/√n predicts {sig(r.predicted)}, so spread ÷ (σ/√n) is{' '}
      <span className="hl">{ratioText(r.ratio)}</span>.
    </>
  );
}

export function mysteryCaption(label: string): ReactNode {
  return <>Dataset {label}: read the three pictures, then pick the family you think drew it. Nothing here is a statistical test, only a look and some computed hints.</>;
}

export function revealCaption(sets: readonly Mystery[], guesses: Partial<Record<string, Family>>): ReactNode {
  const right = sets.filter((s) => guesses[s.label] === s.truth).length;
  return (
    <>
      Revealed: you got <span className={`hl ${right === sets.length ? 'ok' : 'bad'}`}>{right} of {sets.length}</span>.{' '}
      {sets.map((s) => `${s.label} was ${FAMILY_NAME[s.truth].toLowerCase()}${guesses[s.label] ? '' : ' (no guess)'}`).join('; ')}.
    </>
  );
}
