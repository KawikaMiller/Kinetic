import { describe, expect, it } from 'vitest';
import { normal, normalCdf } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { SEED_MAX } from '../../core/seed';
import {
  CANDIDATES_EACH, DEFAULT_STAGES, FUNNEL_POOL, HIRE_BAR, INTERVIEWERS, K_MAX, LENIENT, PANEL_BOUNDS, POOL_SIZE, SIGMA_B, SIGMA_B_ANCHORED, SIGMA_Q, SINGLE_CANDIDATE_SKILL,
  bivariateTail, correlationFormula, effectiveInterviewers, expectedSpread, hiredShare, interviewerRows, keepRecallFormula, makeFunnelDraws, makeInterviewerDraws, makePool, panelErrorVariance,
  panelScores, passChance, pearson, recallFormula, runFunnel, runPanel, spreadOf, topIndices, totalSigma, type Panel, type StageSpec,
} from './model';

/** About three standard errors of the difference of two 200,000-candidate funnels at the last stage (the spec's 0.01 is under two). */
const MC_TOLERANCE = 0.02;
const panel = (k: number, sigma: number, rho = 0): Panel => ({ k, sigma, rho });

describe('the closed forms (hand-worked vectors from the spec)', () => {
  it('correlation: sigma 1 gives 0.7071 for k = 1, 0.8944 for k = 4, 0.9487 for k = 9', () => {
    expect(correlationFormula(panel(1, 1))).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(correlationFormula(panel(4, 1))).toBeCloseTo(0.8944, 4);
    expect(correlationFormula(panel(9, 1))).toBeCloseTo(0.9487, 4);
  });

  it('quadrupling the panel is halving the noise: sigma 2, k 4 reads the same as sigma 1, k 1', () => {
    expect(correlationFormula(panel(4, 2))).toBeCloseTo(correlationFormula(panel(1, 1)), 12);
  });

  it('sigma 1.2 with k = 3 is 1 / sqrt(1.48) = 0.8220 and sigma 0.8 with k = 3 is 0.9078', () => {
    expect(correlationFormula(panel(3, 1.2))).toBeCloseTo(0.822, 3);
    expect(correlationFormula(panel(3, 1.2))).toBeCloseTo(1 / Math.sqrt(1.48), 12);
    expect(correlationFormula(panel(3, 0.8))).toBeCloseTo(0.9078, 4);
  });

  it('agreeing interviewers: k 4, sigma 1, rho 0.5 has error variance 0.625, r = 0.7845 and is worth 1.6 independent interviewers', () => {
    expect(panelErrorVariance(panel(4, 1, 0.5))).toBeCloseTo(0.625, 12);
    expect(correlationFormula(panel(4, 1, 0.5))).toBeCloseTo(0.7845, 4);
    expect(effectiveInterviewers(panel(4, 1, 0.5))).toBeCloseTo(1.6, 12);
    expect(effectiveInterviewers(panel(3, 1.2, 0.5))).toBeCloseTo(1.5, 12);
    expect(correlationFormula(panel(3, 1.2, 0.5))).toBeCloseTo(0.714, 3);
  });

  it('the rubric as an input: sigma_b 1.0 gives sigma 1.2207 and r 0.6337 (one) and 0.8174 (three); sigma_b 0.5 gives 0.8602, 0.7581 and 0.8956', () => {
    expect(totalSigma(SIGMA_B)).toBeCloseTo(1.2207, 4);
    expect(correlationFormula(panel(1, totalSigma(SIGMA_B)))).toBeCloseTo(0.6337, 4);
    expect(correlationFormula(panel(3, totalSigma(SIGMA_B)))).toBeCloseTo(0.8174, 4);
    expect(totalSigma(SIGMA_B_ANCHORED)).toBeCloseTo(0.8602, 4);
    expect(correlationFormula(panel(1, totalSigma(SIGMA_B_ANCHORED)))).toBeCloseTo(0.7581, 4);
    expect(correlationFormula(panel(3, totalSigma(SIGMA_B_ANCHORED)))).toBeCloseTo(0.8956, 4);
  });

  it('the spread of one interviewer\'s 40-candidate mean falls from 1.0185 to 0.536 when sigma_b halves', () => {
    expect(expectedSpread(SIGMA_B)).toBeCloseTo(1.0185, 4);
    expect(expectedSpread(SIGMA_B_ANCHORED)).toBeCloseTo(0.536, 3);
  });
});

describe('recall of the true top 10% (exact against scipy values from the spec, and against Monte Carlo)', () => {
  it('matches the spec\'s exact values: r 0.7071 gives 0.4739, 0.8944 gives 0.6802, 0.9487 gives 0.7763, 0.8220 gives 0.5866, 0.9078 gives 0.7010', () => {
    expect(recallFormula(correlationFormula(panel(1, 1)), 0.1)).toBeCloseTo(0.4739, 3);
    expect(recallFormula(correlationFormula(panel(4, 1)), 0.1)).toBeCloseTo(0.6802, 3);
    expect(recallFormula(correlationFormula(panel(9, 1)), 0.1)).toBeCloseTo(0.7763, 3);
    expect(recallFormula(correlationFormula(panel(3, 1.2)), 0.1)).toBeCloseTo(0.5866, 3);
    expect(recallFormula(correlationFormula(panel(3, 0.8)), 0.1)).toBeCloseTo(0.701, 3);
    expect(recallFormula(correlationFormula(panel(9, 1.2)), 0.1)).toBeCloseTo(0.7362, 3);
  });

  it('r = 1 recovers everyone, r = 0 is the base rate, and r = 0.0173 reads 0.1054', () => {
    expect(recallFormula(1, 0.1)).toBeCloseTo(1, 12);
    expect(recallFormula(0, 0.1)).toBeCloseTo(0.1, 9);
    expect(recallFormula(0.0173, 0.1)).toBeCloseTo(0.1054, 3);
    expect(recallFormula(0, 0.5)).toBeCloseTo(0.5, 9);
    expect(recallFormula(1, 0.5)).toBeCloseTo(1, 12);
  });

  it('agrees with a 2,000,000-draw Monte Carlo with a different seed (within 0.005) across r and the hire share', () => {
    const rnd = mulberry32(777_001);
    const DRAWS = 2_000_000;
    const z: [number, number][] = [];
    for (let i = 0; i < DRAWS; i += 1) z.push([normal(rnd), normal(rnd)]);
    for (const [r, p] of [[0.4, 0.1], [0.7071, 0.1], [0.9, 0.05], [0.64, 0.5], [0.82, 0.3]] as const) {
      const a = (() => { const sorted = z.map(([s]) => s).sort((x, y) => x - y); return sorted[Math.floor((1 - p) * DRAWS)]; })();
      let both = 0;
      let top = 0;
      for (const [s, e] of z) {
        const x = r * s + Math.sqrt(1 - r * r) * e;
        if (s > a) { top += 1; if (x > a) both += 1; }
      }
      expect(Math.abs(both / top - recallFormula(r, p)), `${r} ${p}`).toBeLessThan(0.005);
    }
  });

  it('bivariateTail handles the unequal cut-offs, r of 0 (a product) and r of 1 (the larger cut-off)', () => {
    expect(bivariateTail(0.5, -0.3, 0)).toBeCloseTo((1 - normalCdf(0.5)) * (1 - normalCdf(-0.3)), 9);
    expect(bivariateTail(0.5, -0.3, 1)).toBeCloseTo(1 - normalCdf(0.5), 12);
    expect(bivariateTail(0, 0, 0.5)).toBeCloseTo(1 / 4 + Math.asin(0.5) / (2 * Math.PI), 8);
    expect(keepRecallFormula(0.4472, 0.1, 0.5)).toBeGreaterThan(0.5);
  });
});

describe('the measured correlation against the formula', () => {
  it('lies within 3 standard errors over 100,000 seeded candidates for a grid of (k, sigma, rho)', () => {
    const N = 100_000;
    const pool = makePool(20_251, N);
    for (const p of [panel(1, 1), panel(3, 1.2), panel(9, 0.3), panel(4, 1, 0.5), panel(9, 3, 0.9), panel(1, 3), panel(5, 2, 0.3)]) {
      const r = correlationFormula(p);
      const se = (1 - r * r) / Math.sqrt(N);
      expect(Math.abs(pearson(pool.skill, panelScores(pool, p)) - r), JSON.stringify(p)).toBeLessThan(3 * se);
    }
  });

  it('pearson reads 1, -1 and 0 on vectors worked by hand', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 12);
    expect(pearson([-1, 0, 1], [1, -2, 1])).toBeCloseTo(0, 12);
  });

  it('a panel result is consistent: hired, hits, misses and false hires add up, and the pool is stable across k, sigma and rho', () => {
    const pool = makePool(1);
    const res = runPanel(pool, panel(3, 1.2), 0.1);
    expect(pool.n).toBe(POOL_SIZE);
    expect(res.hired).toBe(100);
    expect(res.hits + res.falseHires).toBe(res.hired);
    expect(res.recallPool).toBe(res.hits / 100);
    expect(res.hiredSet.size).toBe(100);
    expect(res.topSet.size).toBe(100);
    expect(res.rFormula).toBeCloseTo(0.822, 3);
    expect(res.recallFormula).toBeCloseTo(0.5866, 3);
    expect(Math.abs(res.rPool - res.rFormula)).toBeLessThan(0.05);
    for (const i of res.hiredSet) expect(res.scores[i]).toBeGreaterThan(res.cutoff);
    expect(makePool(1)).toBe(pool);
  });
});

/** Oracle: the funnel written independently, with its own PRNG, for a large pool. */
function monteCarloFunnel(seed: number, n: number, stages: readonly StageSpec[]): { recall: number; mean: number }[] {
  const rnd = mulberry32(seed);
  const skill = Array.from({ length: n }, () => normal(rnd));
  const order = skill.map((_, i) => i).sort((a, b) => skill[b] - skill[a]);
  const top = new Set(order.slice(0, n / 10));
  let alive = skill.map((_, i) => i);
  return stages.map((st) => {
    const score = alive.map((i) => {
      let e = 0;
      for (let j = 0; j < st.k; j += 1) e += normal(rnd);
      return st.noSignal ? e / st.k : skill[i] + (st.sigma * e) / st.k;
    });
    const rank = score.map((_, idx) => idx).sort((a, b) => score[b] - score[a]);
    alive = rank.slice(0, Math.round(st.keep * alive.length)).map((idx) => alive[idx]);
    return { recall: alive.filter((i) => top.has(i)).length / top.size, mean: alive.reduce((s, i) => s + skill[i], 0) / alive.length };
  });
}

describe('the funnel', () => {
  const NO_PHONE: StageSpec[] = DEFAULT_STAGES.map((s, i) => (i === 1 ? { ...s, noSignal: true } : s));

  it('keeps 50%, 20% and 5% of the pool: the hired share is the product of the keep shares', () => {
    expect(hiredShare(DEFAULT_STAGES)).toBeCloseTo(0.05, 12);
    const res = runFunnel(makeFunnelDraws(1), DEFAULT_STAGES);
    expect(res.map((r) => r.alive)).toEqual([10_000, 4_000, 1_000]);
    expect(res.map((r) => r.share)).toEqual([0.5, 0.2, 0.05]);
    expect(FUNNEL_POOL).toBe(20_000);
  });

  it('stage 1 recall equals the exact bivariate-normal value (r = 1 / sqrt(1 + 4), keep the top half) within the pool\'s sampling error', () => {
    const exact = keepRecallFormula(1 / Math.sqrt(1 + 4), 0.1, 0.5);
    expect(exact).toBeGreaterThan(0.79);
    expect(exact).toBeLessThan(0.82);
    expect(Math.abs(runFunnel(makeFunnelDraws(1), DEFAULT_STAGES)[0].recall - exact)).toBeLessThan(0.03);
  });

  it('matches an independent 200,000-candidate Monte Carlo (different seed) within 0.01 at the defaults: recall 0.805 / 0.641 / 0.392 and mean skill ending near 1.75', () => {
    const big = runFunnel(makeFunnelDraws(9_001, 200_000), DEFAULT_STAGES);
    const mc = monteCarloFunnel(424_242, 200_000, DEFAULT_STAGES);
    big.forEach((r, t) => {
      expect(Math.abs(r.recall - mc[t].recall), `recall ${t}`).toBeLessThan(MC_TOLERANCE);
      expect(Math.abs(r.meanSkill - mc[t].mean), `mean ${t}`).toBeLessThan(MC_TOLERANCE);
    });
    expect(big[0].recall).toBeCloseTo(0.805, 1);
    expect(big[2].recall).toBeGreaterThan(0.37);
    expect(big[2].recall).toBeLessThan(0.41);
    expect(big[2].meanSkill).toBeGreaterThan(1.72);
    expect(big[2].meanSkill).toBeLessThan(1.78);
  });

  it('with no signal at the phone screen the final recall falls to about 0.27 and the mean skill to about 1.37 (independent Monte Carlo and the spec\'s scratch values)', () => {
    const big = runFunnel(makeFunnelDraws(9_001, 200_000), NO_PHONE);
    const mc = monteCarloFunnel(424_243, 200_000, NO_PHONE);
    big.forEach((r, t) => {
      expect(Math.abs(r.recall - mc[t].recall), `recall ${t}`).toBeLessThan(MC_TOLERANCE);
      expect(Math.abs(r.meanSkill - mc[t].mean), `mean ${t}`).toBeLessThan(MC_TOLERANCE);
    });
    expect(Math.abs(big[1].recall - 0.328)).toBeLessThan(0.012);
    expect(Math.abs(big[2].recall - 0.269)).toBeLessThan(0.012);
    expect(Math.abs(big[2].meanSkill - 1.372)).toBeLessThan(0.02);
  });

  it('a stage may keep everyone (100%) and the funnel never reports NaN at the control extremes', () => {
    const draws = makeFunnelDraws(1);
    for (const keep of [PANEL_BOUNDS.keep.min / 100, 1]) for (const k of [1, K_MAX]) for (const sigma of [PANEL_BOUNDS.sigma.min, PANEL_BOUNDS.sigma.max]) for (const noSignal of [false, true]) {
      const stages = DEFAULT_STAGES.map((s) => ({ ...s, keep, k, sigma, noSignal }));
      for (const r of runFunnel(draws, stages)) {
        expect(Number.isFinite(r.recall) && Number.isFinite(r.meanSkill) && r.alive >= 1).toBe(true);
      }
    }
    const everyone = runFunnel(draws, DEFAULT_STAGES.map((s) => ({ ...s, keep: 1 })));
    expect(everyone.map((r) => r.recall)).toEqual([1, 1, 1]);
  });
});

describe('interviewers and leniency', () => {
  it('the same candidate clears the bar with probability 66.6% (lenient), 23.8% (neutral) and 3.2% (strict)', () => {
    // z = (1 - 0.5 - b) / 0.7: -0.4286, 0.7143, 1.8571.
    expect(passChance(SINGLE_CANDIDATE_SKILL, LENIENT)).toBeCloseTo(0.666, 3);
    expect(passChance(SINGLE_CANDIDATE_SKILL, 0)).toBeCloseTo(0.238, 3);
    expect(passChance(SINGLE_CANDIDATE_SKILL, -LENIENT)).toBeCloseTo(0.032, 3);
  });

  it('agrees with a 1,000,000-draw simulation within 3 standard errors', () => {
    const rnd = mulberry32(31_337);
    const N = 1_000_000;
    for (const b of [LENIENT, 0, -LENIENT]) {
      let pass = 0;
      for (let i = 0; i < N; i += 1) if (SINGLE_CANDIDATE_SKILL + b + SIGMA_Q * normal(rnd) >= HIRE_BAR) pass += 1;
      const p = passChance(SINGLE_CANDIDATE_SKILL, b);
      expect(Math.abs(pass / N - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / N));
    }
  });

  it('the observed variance of the eight interviewers\' means, averaged over 400 seeds, matches sigma_b^2 + (1 + sigma_q^2) / 40 within 6%', () => {
    for (const sigmaB of [SIGMA_B, SIGMA_B_ANCHORED]) {
      let total = 0;
      const seeds = 400;
      for (let seed = 1; seed <= seeds; seed += 1) total += spreadOf(interviewerRows(makeInterviewerDraws(seed), sigmaB)) ** 2;
      expect(Math.abs(total / seeds / expectedSpread(sigmaB) ** 2 - 1)).toBeLessThan(0.06);
    }
  });

  it('anchoring scales every leniency by one half and leaves the candidates alone, so the spread shrinks on any seed', () => {
    for (const seed of [1, 2, 3, 99, 0, SEED_MAX]) {
      const draws = makeInterviewerDraws(seed);
      const loose = interviewerRows(draws, SIGMA_B);
      const tight = interviewerRows(draws, SIGMA_B_ANCHORED);
      expect(loose).toHaveLength(INTERVIEWERS);
      tight.forEach((row, i) => expect(row.leniency).toBeCloseTo(loose[i].leniency / 2, 12));
      expect(spreadOf(tight), `seed ${seed}`).toBeLessThan(spreadOf(loose));
      for (const row of [...loose, ...tight]) expect(row.passed >= 0 && row.passed <= 1 && Number.isFinite(row.mean)).toBe(true);
    }
    expect(CANDIDATES_EACH).toBe(40);
  });
});

describe('extremes', () => {
  it('stays finite at k 1 and 9, sigma 0.3 and 3, hire 5% and 50%, rho 0 and 0.9, and seeds 0 and the largest', () => {
    for (const seed of [0, SEED_MAX]) {
      const pool = makePool(seed);
      for (const k of [PANEL_BOUNDS.k.min, PANEL_BOUNDS.k.max]) for (const sigma of [PANEL_BOUNDS.sigma.min, PANEL_BOUNDS.sigma.max]) {
        for (const hire of [PANEL_BOUNDS.hire.min / 100, PANEL_BOUNDS.hire.max / 100]) for (const rho of [PANEL_BOUNDS.rho.min, PANEL_BOUNDS.rho.max]) {
          const res = runPanel(pool, panel(k, sigma, rho), hire);
          for (const v of [res.rPool, res.rFormula, res.recallPool, res.recallFormula, res.effective, res.cutoff]) expect(Number.isFinite(v)).toBe(true);
          expect(res.recallFormula).toBeGreaterThan(0);
          expect(res.recallFormula).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('topIndices breaks ties by index and returns the whole set when asked for everything', () => {
    expect([...topIndices([1, 1, 1, 0], 2)]).toEqual([0, 1]);
    expect(topIndices([3, 1, 2], 3).size).toBe(3);
  });
});
