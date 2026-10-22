import { describe, expect, it } from 'vitest';
import { exhaustiveText, livenessText, sampledText, truncatedText } from './checkPhrases';

// These strings were captured from the six per-lesson checkText.ts copies (flp-impossibility, paxos,
// byzantine-faults, distributed-snapshots, hybrid-logical-clocks, distributed-sql-truetime) BEFORE they
// were merged into this module; all six produced them byte for byte, so on-screen text did not change.
describe('check phrases (captured from the six lesson copies)', () => {
  it('exhaustive', () => {
    expect(exhaustiveText(0, 'b')).toBe('holds in all 0 reachable states of this model (b)');
    expect(exhaustiveText(2905, '2 ballots')).toBe('holds in all 2,905 reachable states of this model (2 ballots)');
    expect(exhaustiveText(1234567, 'x y')).toBe('holds in all 1,234,567 reachable states of this model (x y)');
  });
  it('truncated never says holds', () => {
    expect(truncatedText(250000)).toBe('no violation in the first 250,000 states explored; not exhaustive');
    expect(truncatedText(1)).toBe('no violation in the first 1 states explored; not exhaustive');
    expect(truncatedText(5)).not.toContain('holds');
  });
  it('sampled', () => {
    expect(sampledText(200, 200, 1, 200)).toBe('held on 200 of 200 seeded schedules (seeds 1 to 200); sampled, not exhaustive');
    expect(sampledText(0, 3, 5, 7)).toBe('held on 0 of 3 seeded schedules (seeds 5 to 7); sampled, not exhaustive');
  });
  it('liveness', () => {
    expect(livenessText(12, 200, 't=300 ms')).toBe('no decision by t=300 ms on 12 of 200 seeds');
    expect(livenessText(0, 1, 'T')).toBe('no decision by T on 0 of 1 seeds');
  });
});
