import type { ReactNode } from 'react';
import { TEST_SET, bestBy, coefficientWarning, degreeCurve, fitPoly, mseOf, type Peek, type Settings, type Split } from './model';

/** An MSE as the readouts show it: 3 significant figures, an exponent once it's huge or tiny. */
export function mseText(v: number): string {
  if (v !== 0 && (v >= 1e4 || v < 1e-3)) return v.toExponential(1).replace('-', '−');
  return String(Number(v.toPrecision(3)));
}

export const lambdaText = (lambda: number) => (lambda === 0 ? 'no λ' : `λ = ${Number(lambda.toPrecision(2))}`);

/** What the current fit says, computed from its errors and the validation-best degree. */
export function fitCaption(s: Settings, split: Split): ReactNode {
  const f = fitPoly(split.train, s.degree, s.lambda);
  if (!f.ok) return <>Degree {s.degree}, {lambdaText(s.lambda)}: <span className="hl bad">{f.reason}</span></>;
  const train = mseOf(f.coeffs, split.train);
  const val = mseOf(f.coeffs, split.val);
  const best = bestBy(degreeCurve(split, s.lambda))!;
  const head = <>Degree {s.degree}, {lambdaText(s.lambda)}, {split.train.length} training points: training MSE {mseText(train)}, validation MSE {mseText(val)}.</>;
  let verdict: ReactNode;
  if (best.at === s.degree) verdict = <> That's the <span className="hl ok">lowest validation error</span> of any degree here.</>;
  else if (s.degree > best.at) {
    verdict = train < best.train
      ? <> Training error is lower than degree {best.at}'s, but validation error is higher ({mseText(val)} vs {mseText(best.val)}): it's fitting the noise.</>
      : <> Degree {best.at} does better on validation ({mseText(best.val)}).</>;
  } else verdict = <> Too simple to follow the curve: degree {best.at} does better on validation ({mseText(best.val)}).</>;
  const warn = coefficientWarning(split.train.length, s.degree, s.lambda) === 'interpolates'
    ? <> {s.degree + 1} coefficients for {split.train.length} points: as many coefficients as points, so it can pass through every one.</>
    : null;
  const ill = f.illConditioned ? <> The normal equations here are ill-conditioned (κ above 10¹⁰), so the coefficients themselves are only good to a few digits.</> : null;
  return <>{head}{verdict}{warn}{ill}</>;
}

export function peekCaption(p: Peek): ReactNode {
  return <>
    Test MSE <span className="hl orange">{mseText(p.test)}</span> for degree {p.degree}, {lambdaText(p.lambda)} (validation said {mseText(p.val)}). It's an honest
    estimate only because nothing was chosen by looking at these {TEST_SET.length} points. Tune the model to lower it and it stops being one: you'd be fitting
    the test set too, and need a fresh one to know how the model really does.
  </>;
}
