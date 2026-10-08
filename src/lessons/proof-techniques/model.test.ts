import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { truthRows } from '../../core/truth';
import { CLAIMS } from './claims';
import { proofFrames } from './frames';
import { accepted, checkEuler, displayOrder, euler, EULER_MAX_N, firstFailure, FORMS, TECHNIQUES, type Script } from './model';

/** Independent primality: plain trial division, no Miller-Rabin. */
const isPrimeSlow = (v: number) => {
  if (v < 2) return false;
  for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
  return true;
};

describe('claims data', () => {
  it('offers every technique for every claim, as either a script or a stall with a reason', () => {
    for (const c of CLAIMS) {
      for (const t of TECHNIQUES) {
        const r = c.routes[t];
        expect(r, `${c.id}/${t}`).toBeDefined();
        if (r.kind === 'stall') expect(r.why.length).toBeGreaterThan(40);
      }
    }
  });

  it('every script line has exactly one accepting step, so each script has exactly one accepting path', () => {
    for (const c of CLAIMS) {
      for (const t of TECHNIQUES) {
        const r = c.routes[t];
        if (r.kind !== 'script') continue;
        for (const [i, l] of r.lines.entries()) {
          expect(l.candidates.filter((x) => x.ok), `${c.id}/${t} line ${i + 1}`).toHaveLength(1);
          expect(l.candidates.length).toBeGreaterThanOrEqual(3);
          expect(l.candidates.length).toBeLessThanOrEqual(4);
          expect(new Set(l.candidates.map((x) => x.text)).size).toBe(l.candidates.length);
        }
      }
    }
  });

  it('gives every candidate, accepted or rejected, a reason string', () => {
    for (const c of CLAIMS) for (const t of TECHNIQUES) {
      const r = c.routes[t];
      if (r.kind === 'script') for (const l of r.lines) for (const x of l.candidates) expect(x.reason.trim().length, x.text).toBeGreaterThan(5);
    }
  });

  it('scripts each claim with the technique the lesson teaches for it, and stalls direct on n² even', () => {
    const kinds = Object.fromEntries(CLAIMS.map((c) => [c.id, TECHNIQUES.filter((t) => c.routes[t].kind === 'script')]));
    expect(kinds).toEqual({ 'odd-sum': ['direct'], 'even-square': ['contrapositive'], sqrt2: ['contradiction'], euler: ['counterexample'] });
    const direct = CLAIMS[1].routes.direct;
    expect(direct.kind === 'stall' && direct.why).toContain('stalls');
  });

  it('a contradiction proof opens with an assumption and has a clash line before its conclusion', () => {
    const s = CLAIMS.find((c) => c.id === 'sqrt2')!.routes.contradiction as Script;
    expect(s.lines[0].role).toBe('assume');
    expect(s.lines.at(-2)!.role).toBe('clash');
    expect(s.lines.at(-1)!.role).toBe('conclude');
  });
});

describe("Euler's n² + n + 41", () => {
  it('is prime for n = 0..39 and composite at 40, where it is 41²', () => {
    for (let n = 0; n <= 39; n++) {
      expect(checkEuler(n).prime, `n = ${n}`).toBe(true);
      expect(isPrimeSlow(euler(n))).toBe(true);
    }
    expect(checkEuler(40)).toEqual({ n: 40, value: 1681, prime: false, factors: [41, 41] });
    expect(firstFailure()).toBe(40);
  });

  it('agrees with trial division on every value the slider offers, and factors multiply back', () => {
    for (let n = 0; n <= EULER_MAX_N; n++) {
      const c = checkEuler(n);
      expect(c.prime).toBe(isPrimeSlow(c.value));
      expect(c.factors.reduce((a, b) => a * b, 1)).toBe(c.value);
    }
    expect(checkEuler(41).factors).toEqual([41, 43]); // the rejection reason for "fails only at 40"
  });

  it("matches the script's counterexample and the passing values its distractors cite", () => {
    const s = CLAIMS.find((c) => c.id === 'euler')!.routes.counterexample as Script;
    expect(accepted(s.lines[1]).text).toContain(`n = ${firstFailure()}`);
    expect(accepted(s.lines[1]).text).toContain(String(euler(40)));
    expect(checkEuler(39)).toMatchObject({ value: 1601, prime: true });
    expect(checkEuler(10)).toMatchObject({ value: 151, prime: true });
  });
});

describe('propositional forms', () => {
  it('contrapositive and contradiction columns agree on every row; p → q is false only on p = T, q = F', () => {
    for (const key of ['contrapositive', 'contradiction'] as const) {
      const { vars, columns } = FORMS[key];
      for (const r of truthRows(vars)) expect(columns[0].fn(r)).toBe(columns[1].fn(r));
    }
    const falseRows = truthRows(['p', 'q']).filter((r) => !FORMS.implies.columns[0].fn(r));
    expect(falseRows).toEqual([{ p: true, q: false }]);
  });

  it('the converse is not equivalent (the reason a rejected chip gives)', () => {
    const converse = (r: Record<string, boolean>) => !r.q || r.p;
    expect(truthRows(['p', 'q']).some((r) => converse(r) !== FORMS.implies.columns[0].fn(r))).toBe(true);
  });
});

describe('proofFrames', () => {
  it('has one frame per locked line, plus a closing reading once complete, for every claim and technique', () => {
    for (const c of CLAIMS) for (const t of TECHNIQUES) {
      const r = c.routes[t];
      if (r.kind === 'stall') {
        const f = proofFrames(c, t, 0);
        expect(f).toHaveLength(1);
        expect(text(f[0].say)).toContain(r.why.slice(0, 30));
        continue;
      }
      for (let k = 0; k <= r.lines.length; k++) {
        const f = proofFrames(c, t, k);
        const done = k === r.lines.length;
        expect(f).toHaveLength(k + 1 + (done ? 1 : 0));
        expect(f.every((x) => x.say != null)).toBe(true);
        expect(f.at(-1)!.complete).toBe(done);
        if (done) expect(text(f.at(-1)!.say)).toMatch(/^Proof complete\./);
        f.slice(1, k + 1).forEach((x, i) => expect(text(x.say)).toContain(accepted(r.lines[i]).reason));
      }
    }
  });
});

describe('displayOrder', () => {
  it('is a permutation, and puts the accepted step in more than one position across the scripts', () => {
    const positions = new Set<number>();
    for (const c of CLAIMS) for (const t of TECHNIQUES) {
      const r = c.routes[t];
      if (r.kind !== 'script') continue;
      for (const l of r.lines) {
        const order = displayOrder(l);
        expect([...order].sort()).toEqual(l.candidates.map((_, i) => i));
        positions.add(order.findIndex((i) => l.candidates[i].ok));
      }
    }
    expect(positions.size).toBe(3);
  });
});

describe('review B15 regressions', () => {
  it('never claims n² + n + 41 fails for only a few n: it is composite for most n', () => {
    let composite = 0;
    for (let n = 0; n < 10_000; n++) if (!isPrimeSlow(euler(n))) composite++;
    expect(composite / 10_000).toBeGreaterThan(0.5); // so "fails for most n" is TRUE, not false
    const s = CLAIMS.find((c) => c.id === 'euler')!.routes.counterexample as Script;
    const reasons = s.lines.flatMap((l) => l.candidates.map((c) => c.reason)).join(' | ');
    expect(reasons).not.toMatch(/not true|nor true|rarely fails|almost always prime/);
  });

  it('keeps p for the proposition only: the √2 proof names its integers a, b, c', () => {
    const s = CLAIMS.find((c) => c.id === 'sqrt2')!.routes.contradiction as Script;
    for (const l of s.lines) for (const c of l.candidates) expect(c.text, c.text).not.toMatch(/(^|[^A-Za-z])[pqr]([^A-Za-z]|$)/);
    expect(CLAIMS.find((c) => c.id === 'sqrt2')!.statement).toContain('a/b');
  });

  it('says the direct route on "n² even ⇒ n even" stalls only without a lemma', () => {
    const r = CLAIMS.find((c) => c.id === 'even-square')!.routes.direct;
    expect(r.kind === 'stall' && r.why).toMatch(/lemma/);
    expect(r.kind === 'stall' && r.why).toContain('stalls');
  });
});
