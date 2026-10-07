import type { ReactNode } from 'react';
import { pct, plural, times } from '../../core/format';
import { MAX_CORES, amdahl, bestWholeCores, ceiling, doublingCut, gustafson, peakCores, withOverhead } from './model';

export type Law = 'amdahl' | 'gustafson';

/** A speedup: two decimals below 10× (so a peak and its neighbour differ), else one; whole when it rounds to one. */
export function fmtSpeed(v: number): string {
  const dp = v < 10 ? 2 : 1;
  const r = Number(v.toFixed(dp));
  return times(Number.isInteger(r) ? String(r) : r.toFixed(dp));
}

export interface View {
  law: Law;
  s: number;
  n: number;
  /** Coordination cost per extra core (Amdahl only); 0 = none. */
  c: number;
}

/** What the current settings say, in one caption: every number from the model. */
export function viewCaption({ law, s, n, c }: View): ReactNode {
  const give = n === 1 ? 'gives' : 'give';
  const serial = <span className="hl orange">{pct(s)} serial</span>;
  if (law === 'gustafson')
    return (
      <>
        Gustafson: keep the time fixed and grow the job with the cores. With {serial}, {plural(n, 'core')} {n === 1 ? 'gets' : 'get'} through {fmtSpeed(gustafson(s, n))} the
        work one core could in the same time, against a perfect {times(n)}. The loss is only the serial share of each core's time, so big
        clusters pay off when the work grows with them.
      </>
    );
  if (c > 0) {
    const best = bestWholeCores(s, c, MAX_CORES);
    if (peakCores(s, c) > MAX_CORES)
      return (
        <>
          With this small a coordination cost, the speedup still rises all the way to {MAX_CORES} cores ({fmtSpeed(withOverhead(s, MAX_CORES, c))}); its
          peak would come at about {Math.round(peakCores(s, c))} cores. {plural(n, 'core')} {give} {fmtSpeed(withOverhead(s, n, c))}.
        </>
      );
    return (
      <>
        With a coordination cost per core, the speedup <span className="hl ok">peaks at {plural(best, 'core')}</span> ({fmtSpeed(withOverhead(s, best, c))}) and
        falls after that; {plural(n, 'core')} {give} {fmtSpeed(withOverhead(s, n, c))}. Past the peak, adding cores makes the job slower.
      </>
    );
  }
  if (s === 0)
    return <>Nothing serial: {plural(n, 'core')} {give} {fmtSpeed(amdahl(s, n))}, and doubling the cores halves the time. Real jobs are never quite this tidy.</>;
  const cut = doublingCut(s, n);
  return (
    <>
      With {serial}, {plural(n, 'core')} {give} {fmtSpeed(amdahl(s, n))}, and no number of cores gets past {fmtSpeed(ceiling(s))} (1 / s). Doubling to{' '}
      {2 * n} cores would cut the time by {pct(cut, 1)}, not 50%.
    </>
  );
}
