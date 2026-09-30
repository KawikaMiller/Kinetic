import { describe, expect, it } from 'vitest';
import { bestOption, HARSH, QUALITIES } from './feedback';
import { MAX_LINES, MIN_LINES, relativeDefectRate, relativeReviewTime, verdictFor } from './size';

describe('comment rewrites', () => {
  it.each(HARSH.map((h) => [h.id, h] as const))('%s has exactly one option with every quality', (_, h) => {
    const complete = h.options.filter((o) => QUALITIES.every((q) => o.has.includes(q.id)));
    expect(complete).toHaveLength(1);
    expect(bestOption(h)).toBe(h.options.indexOf(complete[0]));
  });
});

describe('PR size curves', () => {
  it('review time only grows and the defect rate only falls as a PR gets bigger', () => {
    for (let l = MIN_LINES + 1; l <= MAX_LINES; l++) {
      expect(relativeReviewTime(l)).toBeGreaterThan(relativeReviewTime(l - 1));
      expect(relativeDefectRate(l)).toBeLessThan(relativeDefectRate(l - 1));
    }
  });

  it('calls small PRs small and huge ones large', () => {
    expect(verdictFor(80)).toBe('small');
    expect(verdictFor(300)).toBe('ok');
    expect(verdictFor(1200)).toBe('large');
  });
});
