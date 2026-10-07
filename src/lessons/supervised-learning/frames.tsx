import type { ReactNode } from 'react';
import { TEST_SET, bestBy, coefficientWarning, degreeCurve, fitPoly, mseOf, type Peek, type Settings, type Split } from './model';

/** An MSE as the readouts show it: 3 significant figures, an exponent once it's huge or tiny. */
export function mseText(v: number): string {
  if (v !== 0 && (v >= 1e4 || v < 1e-3)) return v.toExponential(1).replace('-', '−');
  return String(Number(v.toPrecision(3)));
}

export const lambdaText = (lambda: number) => (lambda === 0 ? 'no λ' : `λ = ${Number(lambda.toPrecision(2))}`);

/** Within this fraction of the best validation error counts as "about as good as the best". */
export const NEAR_BEST = 0.05;
/** More than this fraction above the best validation error is "fitting the noise"; between the two, "a little overfitting". */
export const OVERFIT = 0.5;

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
  else if (val <= best.val * (1 + NEAR_BEST)) {
    verdict = <> About as good as the best: degree {best.at}'s validation error is {mseText(best.val)}, within {Math.round(NEAR_BEST * 100)}% of this one.</>;
  } else if (s.degree > best.at) {
    const badly = val > best.val * (1 + OVERFIT);
    verdict = train >= best.train
      ? <> Degree {best.at} does better on validation ({mseText(best.val)}).</>
      : badly
        ? <> Training error is lower than degree {best.at}'s, but validation error is much higher ({mseText(val)} vs {mseText(best.val)}): it's fitting the noise.</>
        : <> Training error is lower than degree {best.at}'s and validation error a little higher ({mseText(val)} vs {mseText(best.val)}): a little overfitting is left.</>;
  } else verdict = <> Too simple to follow the curve: degree {best.at} does better on validation ({mseText(best.val)}).</>;
  const warning = coefficientWarning(split.train.length, s.degree, s.lambda);
  const warn = warning === 'interpolates'
    ? <> {s.degree + 1} coefficients for {split.train.length} points: as many coefficients as points, so it can pass through every one.</>
    : warning === 'underdetermined'
      ? <> {s.degree + 1} coefficients for {split.train.length} points: more coefficients than points, so only λ makes the fit unique.</>
      : null;
  const ill = f.illConditioned ? <> The problem is ill-conditioned (κ of the data matrix above 10⁵), so the coefficients themselves are only good to a few digits, even though the curve is fine.</> : null;
  const plain = s.lambda > 0 ? fitPoly(split.train, s.degree, 0) : null;
  const vsPlain = plain?.ok
    ? <> Compared with no λ at this degree, validation error went {mseOf(plain.coeffs, split.val) > val ? 'down' : 'up'} from {mseText(mseOf(plain.coeffs, split.val))} to {mseText(val)}.</>
    : null;
  return <>{head}{verdict}{vsPlain}{warn}{ill}</>;
}

export function peekCaption(p: Peek): ReactNode {
  return <>
    Test MSE <span className="hl orange">{mseText(p.test)}</span> for degree {p.degree}, {lambdaText(p.lambda)} (validation said {mseText(p.val)}). It's an honest
    estimate only because nothing was chosen by looking at these {TEST_SET.length} points. Tune the model to lower it and it stops being one: you'd be fitting
    the test set too, and need a fresh one to know how the model really does.
  </>;
}
