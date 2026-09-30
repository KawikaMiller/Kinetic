import { describe, expect, it } from 'vitest';
import { DIFF, ISSUES, pageSliceFixed, pageSlicePr, planTierPr, scoreReview, type Comment } from './review';

const orders = Array.from({ length: 45 }, (_, i) => `order-${i + 1}`);

describe('the planted bugs are real', () => {
  it('off-by-one: page 1 skips the first 20 orders, and the PR\'s own test still passes', () => {
    const page1 = pageSlicePr(orders, 1, 20);
    expect(page1).toHaveLength(20); // what the PR's test checks: passes
    expect(page1[0]).toBe('order-21'); // but the first page starts at order 21
    expect(pageSliceFixed(orders, 1, 20)[0]).toBe('order-1');
    // The last real page (3) is empty with the bug.
    expect(pageSlicePr(orders, 3, 20)).toEqual([]);
    expect(pageSliceFixed(orders, 3, 20)).toEqual(['order-41', 'order-42', 'order-43', 'order-44', 'order-45']);
  });

  it('unhandled null: an unknown user throws', () => {
    expect(() => planTierPr(null)).toThrow(TypeError);
  });

  it('every issue points at its own added line of the diff', () => {
    expect(new Set(ISSUES.map((i) => i.line)).size).toBe(ISSUES.length);
    for (const issue of ISSUES) {
      expect(issue.line).toBeGreaterThan(0);
      expect(DIFF[issue.line].kind).toBe('add');
    }
    expect(DIFF.length).toBeGreaterThanOrEqual(24);
  });
});

describe('scoring', () => {
  const ideal: Comment[] = ISSUES.filter((i) => !i.linterJob).map((i) => ({ line: i.line, severity: i.accept[0] }));

  it('a thorough review finds every bug with no noise', () => {
    const s = scoreReview(ideal);
    expect(s.bugsFound).toBe(s.bugsTotal);
    expect(s.bugsTotal).toBe(3);
    expect(s.noise).toEqual([]);
  });

  it('a style-only review finds no bugs and is all noise', () => {
    const styleLine = ISSUES.find((i) => i.linterJob)!.line;
    const s = scoreReview([{ line: styleLine, severity: 'nit' }, { line: 1, severity: 'nit' }]);
    expect(s.bugsFound).toBe(0);
    expect(s.noise).toHaveLength(2);
  });

  it('marks a found issue with the wrong severity', () => {
    const offByOne = ISSUES.find((i) => i.id === 'offbyone')!;
    const v = scoreReview([{ line: offByOne.line, severity: 'nit' }]).verdicts.find((x) => x.issue.id === 'offbyone')!;
    expect(v.status).toBe('wrong-severity');
  });
});
