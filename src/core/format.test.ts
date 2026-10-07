import { describe, expect, it } from 'vitest';
import { bytes, clock, duration, humanDuration, latency, pct, plural, power, superscript } from './format';

describe('superscript', () => {
  it('writes integers in superscript digits, including negatives', () => {
    expect(superscript(0)).toBe('⁰');
    expect(superscript(23)).toBe('²³');
    expect(superscript(-4)).toBe('⁻⁴');
    expect(superscript(1024)).toBe('¹⁰²⁴');
    expect(power(10)).toBe('2¹⁰');
    expect(power(-4, 10)).toBe('10⁻⁴');
  });

  it('can group long exponents in threes with a narrow no-break space (there is no superscript comma)', () => {
    expect(superscript(301_029_972, { grouped: true })).toBe('³⁰¹ ⁰²⁹ ⁹⁷²');
    expect(superscript(1024, { grouped: true })).toBe('¹ ⁰²⁴');
    expect(superscript(999, { grouped: true })).toBe('⁹⁹⁹');
    expect(superscript(-12_345, { grouped: true })).toBe('⁻¹² ³⁴⁵');
    expect(power(301_029_972, 10, { grouped: true })).toBe('10³⁰¹ ⁰²⁹ ⁹⁷²');
    expect(power(12, 10, { grouped: true })).toBe('10¹²');
  });
});

describe('latency and humanDuration', () => {
  it('prints nanosecond-scale times in the right unit', () => {
    expect(latency(0.3)).toBe('0.3 ns');
    expect(latency(100)).toBe('100 ns');
    expect(latency(50_000)).toBe('50 µs');
    expect(latency(5_000_000)).toBe('5 ms');
    expect(latency(150_000_000)).toBe('150 ms');
    expect(latency(2e9)).toBe('2 s');
  });

  it('prints long spans in the biggest sensible unit', () => {
    expect(humanDuration(1)).toBe('1 s');
    expect(humanDuration(100)).toBe('1.7 min');
    expect(humanDuration(50_000)).toBe('14 hours');
    expect(humanDuration(150_000_000)).toBe('4.8 years');
  });

  it('writes spans past a million years as a power of ten, never a raw float', () => {
    const YEAR = 365.25 * 24 * 3600;
    expect(humanDuration(999_000 * YEAR)).toBe('999000 years');
    expect(humanDuration(1e6 * YEAR)).toBe('1 × 10⁶ years');
    expect(humanDuration(3.24e292 * YEAR)).toBe('3.2 × 10²⁹² years');
    expect(humanDuration(9.97e30 * YEAR)).toBe('1 × 10³¹ years');
    expect(humanDuration(1e308)).toMatch(/^3\.2 × 10³⁰⁰ years$/);
    expect(humanDuration(Infinity)).toBe('∞ years');
  });

  it('uses the singular for exactly one of a unit', () => {
    expect(humanDuration(3600)).toBe('1 hour');
    expect(humanDuration(86_400)).toBe('1 day');
    expect(humanDuration(365.25 * 86_400)).toBe('1 year');
    expect(humanDuration(2 * 3600)).toBe('2 hours');
  });
});

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
