import { describe, expect, it } from 'vitest';
import { complexity, COMPLEXITIES, fmtOps, fmtOpsCount, fmtTime, tenTo, type CxId } from './complexities';

const ops = (id: CxId, n: number) => complexity(id).f(n);

describe('complexity functions', () => {
  it('compute the textbook operation counts', () => {
    expect(ops('c1', 1e6)).toBe(1);
    expect(ops('log', 1024)).toBe(10);
    expect(ops('n', 500)).toBe(500);
    expect(ops('nlogn', 1024)).toBe(10240);
    expect(ops('n2', 20)).toBe(400);
    expect(ops('exp', 24)).toBe(16_777_216); // the tour's "16 million ops"
  });

  it('log10 agrees with log10(f(n)) wherever f(n) is still a finite number', () => {
    for (const c of COMPLEXITIES) {
      for (const n of [1, 2, 7, 32, 1000, 1e6]) {
        const v = c.f(n);
        if (!Number.isFinite(v) || v < 1) continue;
        expect(c.log10(n), `${c.label} at n=${n}`).toBeCloseTo(Math.log10(v), 9);
      }
    }
  });

  it('keep their order from n = 5 on (below that 2ⁿ is still under n²: 8 < 9 at n = 3)', () => {
    expect(ops('exp', 3)).toBeLessThan(ops('n2', 3));
    for (let n = 5; n <= 32; n++) {
      const counts = COMPLEXITIES.map((c) => c.f(n));
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('use a curve colour for every caption chip, with no class borrowing --hi', () => {
    for (const c of COMPLEXITIES) expect(c.color).not.toBe('var(--hi)');
    expect(new Set(COMPLEXITIES.map((c) => c.color)).size).toBe(COMPLEXITIES.length);
  });
});

describe('the "1 operation = 1 µs" readout', () => {
  const at = (id: CxId, n: number) => fmtTime(complexity(id).log10(n));

  it('matches hand-computed times for n = 1 billion', () => {
    expect(at('c1', 1e9)).toBe('1 µs');
    expect(at('log', 1e9)).toBe('29.9 µs'); // log2(1e9) ≈ 29.9
    expect(at('n', 1e9)).toBe('16.7 min'); // 1,000 s
    expect(at('nlogn', 1e9)).toBe('8.3 hours'); // 29,897 s
    expect(at('n2', 1e9)).toBe('31,746 years'); // 1e12 s / 3.15e7
  });

  it('matches hand-computed times for n = 1 million', () => {
    expect(at('n', 1e6)).toBe('1 s');
    expect(at('nlogn', 1e6)).toBe('19.9 s');
    expect(at('n2', 1e6)).toBe('11.6 days'); // 1e6 s
  });

  it('expresses 2ⁿ at a million as a power of the age of the universe', () => {
    // 2^1e6 µs = 10^301,030 µs = 10^301,024 s; the universe is 4.35e17 s, so ≈ 10^301,006×
    expect(at('exp', 1e6)).toBe('10³⁰¹\u202F⁰⁰⁶× the age of the universe');
  });
});

describe('operation counts as text', () => {
  it('writes small counts in full and huge ones as powers of ten, with a correct unit', () => {
    expect(fmtOps(3)).toBe('1,000');
    expect(fmtOps(20)).toBe('10²⁰');
    expect(fmtOpsCount(0)).toBe('1 op');
    expect(fmtOpsCount(Math.log10(20))).toBe('20 ops');
    expect(fmtOpsCount(301_029.9)).toBe('10³⁰¹\u202F⁰²⁹ ops');
    expect(tenTo(301_029_972)).toBe('10³⁰¹\u202F⁰²⁹\u202F⁹⁷²');
  });
});
