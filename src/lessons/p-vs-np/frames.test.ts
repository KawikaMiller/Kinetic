import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { dpCaption, solveCaption, verifyCaption } from './frames';
import { createSolver, dpSolve, seededInstance, verify } from './subset';

describe('captions', () => {
  it('verify: says passed or failed from the real sum, always n steps', () => {
    const v = verify([3, 5, 8], [true, false, true], 11);
    expect(text(verifyCaption(v, 11, 2))).toContain('Verified in 3 steps');
    const w = verify([3, 5, 8], [true, true, false], 11);
    expect(text(verifyCaption(w, 11, 2))).toContain('they add up to 8, not 11');
  });

  it('solve: counts and the extrapolation come from the run and the rate', () => {
    const s = createSolver([1, 2, 3], 3).advance(Infinity);
    const t = text(solveCaption(s, 3, 1000));
    expect(t).toContain('all 8 = 2³ subsets: 2 subsets hit the target');
    // 2^60 subsets / (1,000 per ms) = 1.15e12 s; / 31,557,600 s per year = 36,533.9 years
    expect(t).toContain('n = 60 would take about 36534 years');
  });

  it('dp: never claims the table beat brute force when it did more work', () => {
    const small = seededInstance(1, 6);
    const r = dpSolve(small.numbers, small.target);
    const t = text(dpCaption(r.cells, 6, r.possible));
    expect(r.cells).toBeGreaterThan(64);
    expect(t).toContain('brute force is the cheaper one');
    expect(t).not.toContain('Fast because');
    const big = seededInstance(1, 24);
    const rb = dpSolve(big.numbers, big.target);
    expect(text(dpCaption(rb.cells, 24, rb.possible))).toContain('far fewer than the 16,777,216 subsets');
  });
});
