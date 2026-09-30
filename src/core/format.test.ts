import { describe, expect, it } from 'vitest';
import { bytes, clock, duration, pct, plural } from './format';

describe('format', () => {
  it('duration switches from ms to seconds at 1s', () => {
    expect(duration(0.3404)).toBe('340ms');
    expect(duration(1)).toBe('1.0s');
    expect(duration(12.34)).toBe('12.3s');
  });

  it('pct shows tiny non-zero ratios as a floor instead of rounding to zero', () => {
    expect(pct(0.123)).toBe('12%');
    expect(pct(0.0004, 1)).toBe('<0.1%');
    expect(pct(0, 1)).toBe('0.0%');
  });

  it('bytes uses binary units by default and decimal on request', () => {
    expect(bytes(512)).toBe('512 B');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(8 * 1024 ** 2)).toBe('8.0 MB');
    expect(bytes(1500, { base: 1000 })).toBe('1.5 KB');
  });

  it('plural picks the singular only for exactly one', () => {
    expect(plural(1, 'step')).toBe('1 step');
    expect(plural(0, 'step')).toBe('0 steps');
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
  });

  it('clock wraps past midnight in both directions', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(61)).toBe('01:01');
    expect(clock(1440 + 5)).toBe('00:05');
    expect(clock(-1)).toBe('23:59');
  });
});
