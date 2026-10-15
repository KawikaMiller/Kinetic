import { describe, expect, it } from 'vitest';
import { poissonCdf, poissonPmf } from './distributions';
import { erlangC } from './queueing';

describe('erlangC', () => {
  it('c = 2, λ = 1, μ = 1 gives P(wait) = 1/3, Wq = 1/3, W = 4/3', () => {
    const c = erlangC(2, 1);
    expect(c).toBeCloseTo(1 / 3, 12);
    const wq = c / (2 - 1);
    expect(wq).toBeCloseTo(1 / 3, 12);
    expect(wq + 1).toBeCloseTo(4 / 3, 12);
    expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 12);
    expect(erlangC(3, 3)).toBe(1);
  });

  it('equals the same sum written with the kit Poisson pmf and cdf (a different code path) at c = 4', () => {
    for (const a of [0.4, 1.2, 2.4, 3.2, 3.8]) {
      const c = 4;
      const rho = a / c;
      // Dividing numerator and denominator of Erlang C by e^a turns the powers into Poisson probabilities.
      const atC = poissonPmf(c, a) / (1 - rho);
      const viaPoisson = atC / (poissonCdf(c - 1, a) + atC);
      expect(erlangC(c, a), `a=${a}`).toBeCloseTo(viaPoisson, 10);
    }
  });
});
