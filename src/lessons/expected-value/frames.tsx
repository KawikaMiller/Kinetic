import type { ReactNode } from 'react';
import { canEqual, exactFractions, exactMoments, expectedAttempts, modes, pmfOf, type Params, type Pmf, type VarId } from './model';

/** Float noise below this is shown as 0 (a variance of 10⁻¹⁶ is a rounding error, not a spread). */
const NOISE = 1e-9;
const BIG = 1000;

/** Four significant digits below 1,000 (3.5, 2.917); whole thousands keep every digit (989,019). */
export function num(v: number): string {
  const c = Math.abs(v) < NOISE ? 0 : v;
  return Math.abs(c) >= BIG
    ? c.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : c.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}
const fmt = (n: number) => n.toLocaleString('en-US');

/** Sum terms shown in full up to this many; beyond it the middle is elided. */
const MAX_TERMS = 12;

function terms(pmf: Pmf): string {
  const W = pmf.weights?.reduce((a, b) => a + b, 0);
  const term = (i: number) => `${num(pmf.values[i])}·${pmf.weights && W ? `${pmf.weights[i]}/${W}` : num(pmf.probs[i])}`;
  const idx = pmf.values.map((_, i) => i);
  const shown = idx.length <= MAX_TERMS ? idx.map(term) : [...idx.slice(0, 3).map(term), '…', term(idx.length - 1)];
  return shown.join(' + ');
}

/** The exact panel, line by line: E as Σ x·P(x) written out, then Var and SD. */
export function exactLines(id: VarId, prm: Params): string[] {
  const m = exactMoments(id, prm);
  const sd = `SD = √Var = ${num(Math.sqrt(m.variance))}`;
  if (id === 'geometric') {
    const p = prm.successPct / 100;
    const pk = (k: number) => num((1 - p) ** (k - 1) * p);
    return [
      'E[X] = Σ k·P(X = k), with P(X = k) = (1 − p)ᵏ⁻¹·p',
      `     = 1·${pk(1)} + 2·${pk(2)} + 3·${pk(3)} + … (forever)`,
      `     = 1/p = 1/${num(p)} = ${num(m.mean)}`,
      `Var(X) = (1 − p)/p² = ${num(m.variance)}`,
      sd,
    ];
  }
  const pmf = pmfOf(id, prm);
  const f = exactFractions(pmf);
  return [
    'E[X] = Σ x·P(x)',
    `     = ${terms(pmf)}`,
    `     = ${num(m.mean)}${f?.mean.includes('/') ? ` (exactly ${f.mean})` : ''}`,
    `Var(X) = Σ (x − E[X])²·P(x) = ${num(m.variance)}${f?.variance.includes('/') ? ` (exactly ${f.variance})` : ''}`,
    sd,
  ];
}

/** What E[X] is and isn't, computed from the pmf: the mode, and whether X can ever equal E. */
export function variableCaption(id: VarId, prm: Params, label: string): ReactNode {
  const m = exactMoments(id, prm);
  const pmf = pmfOf(id, prm);
  const top = modes(pmf);
  // The geometric pmf is cut at its 99.9% point, which always lies past the mean, so this check sees every value that matters.
  const never = !canEqual(pmf, m.mean);
  const modeText = top.length === 1 ? `the most likely value is ${num(top[0])}` : `the most likely values are ${top.map(num).join(', ')}`;
  return <>{label}: E[X] = <span className="hl ok">{num(m.mean)}</span> and {modeText}.{' '}
    {m.variance === 0
      ? <>X is the same every time, so its mean, its mode and every outcome agree, and its variance is 0.</>
      : never
      ? <>X never actually equals {num(m.mean)}: the expected value is the long-run average, not an outcome you should expect.</>
      : !top.some((t) => Math.abs(t - m.mean) < 1e-9)
        ? <>Here X can equal its mean, but the mean still isn't the most likely value.</>
        : <>Here the mean is also a likely value, which holds for this symmetric, single-peaked shape, not in general.</>}</>;
}

/** After drawing: the running mean against E, in standard errors of that mean. */
export function drawCaption(count: number, n: number, sampleMean: number, mean: number, variance: number): ReactNode {
  const se = Math.sqrt(variance / (n * count));
  const off = se > 0 ? Math.abs(sampleMean - mean) / se : 0;
  const what = n === 1 ? `${fmt(count)} ${count === 1 ? 'draw' : 'draws'}` : `${fmt(count)} averages of ${n} draws`;
  return <>{what}: running mean <span className="hl violet">{num(sampleMean)}</span>, exact E[X] = <span className="hl ok">{num(mean)}</span>.{' '}
    {se === 0
      ? <>X never varies, so every draw is exactly the mean.</>
      : <>The gap is {off < 0.1 ? 'under 0.1' : off.toFixed(1)} standard errors (σ/√{fmt(n * count)} = {num(se)}); the standard error shrinks like 1/√(draws).</>}</>;
}

/** The retry calculator's verdict. */
export function retryCaption(q: number, r: number): ReactNode {
  const load = expectedAttempts(q, r);
  const tone = load > 2 ? 'bad' : load > 1 ? 'orange' : 'ok';
  return <>Each attempt fails {Math.round(q * 100)}% of the time, with up to {r} {r === 1 ? 'retry' : 'retries'}: expected attempts per request = Σ qⁱ for
    i = 0…{r} = <span className={`hl ${tone}`}>{num(load)}×</span> the load you'd have with no retries.
    {load > 2 ? ' Retries more than double the traffic on a struggling service.' : ''}</>;
}
