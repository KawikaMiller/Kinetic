import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { eventCaption, flakyCaption, replicaCaption, rollCaption } from './frames';
import { EVENTS, SLOS, eventSet, replicaRisk, rules, spaceSize } from './model';

describe('captions are computed from the model', () => {
  it('the independence verdict and the union sum, for every pair of presets', () => {
    for (const dice of [1, 2] as const) {
      for (const ea of EVENTS[dice]) {
        for (const eb of EVENTS[dice]) {
          const r = rules(eventSet(dice, ea), eventSet(dice, eb), spaceSize(dice));
          const c = text(eventCaption(ea.label, r, eb.label));
          expect(c.includes('Not independent')).toBe(!r.independent);
          expect(c).toContain(`= ${r.either}/${r.total}`);
        }
      }
    }
  });

  it('the roll caption shows the simulated frequency next to the exact chance', () => {
    const c = text(rollCaption('sum = 7', 100, 19, { a: 6, total: 36 }));
    expect(c).toBe('100 rolls: sum = 7 came up 19 times, a frequency of 19%. The exact chance is 16.7%, 2.3 points away. Small samples wander; keep rolling.');
  });

  it('the replica verdict follows the target for every n, p, target and model', () => {
    for (const correlated of [false, true]) {
      for (const slo of SLOS) {
        for (let n = 1; n <= 10; n++) {
          for (let pm = 0; pm <= 500; pm += 5) {
            const c = text(replicaCaption(n, pm / 1000, slo.budget, correlated));
            expect(c.includes('meets the target')).toBe(replicaRisk(n, pm / 1000, correlated).allDown <= slo.budget);
          }
        }
      }
    }
    expect(text(replicaCaption(3, 0.01, 1e-4, false))).toContain('= 1.0 × 10⁻⁶, which meets the target');
    expect(text(replicaCaption(3, 0.01, 1e-4, true))).toContain('The rack is most of that');
    expect(text(replicaCaption(1, 0.5, 1e-4, true))).toContain("own failures still dominate");
  });

  it('the flaky caption quotes the exact chance, then the simulated one', () => {
    expect(text(flakyCaption(200, 0.01, 0, 0))).toContain('= 86.6%');
    expect(text(flakyCaption(200, 0.01, 100, 85))).toContain('85 of 100 runs went red (85%)');
  });
});
