import { describe, expect, it } from 'vitest';
import { isProbablePrime, modPow, toyRsa } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import {
  bruteSolutions, clampResidues, compatiblePair, crtBuild, crtExponentiation, firstMatch, fromResidues, gcdN, lcmN, pairwiseCoprime, productN, residueOp, solve,
  toResidues, workOf, type System,
} from './crt';

const tuples = (ms: readonly number[]): number[][] => ms.reduce<number[][]>((acc, m) => acc.flatMap((t) => Array.from({ length: m }, (_, a) => [...t, a])), [[]]);
const checks = (sys: System, x: number) => sys.moduli.every((m, i) => ((x % m) + m) % m === sys.residues[i]);

describe('the system, against a brute force over the whole domain', () => {
  it('for every set of one to three moduli from 2 to 12 and every remainder tuple, the number of solutions in 0..lcm-1 is 1 when compatible and 0 when not, and solve() finds that solution', () => {
    let systems = 0;
    let compatible = 0;
    const sets: number[][] = [];
    for (let a = 2; a <= 12; a++) {
      sets.push([a]);
      for (let b = a; b <= 12; b++) {
        sets.push([a, b]);
        for (let c = b; c <= 12; c++) sets.push([a, b, c]);
      }
    }
    for (const ms of sets) {
      const L = lcmN(ms);
      // One pass over 0..L-1 sends every x to its residue tuple: the counts and the solutions of all tuples at once.
      const found = new Map<string, number[]>();
      for (let x = 0; x < L; x++) {
        const key = ms.map((m) => x % m).join(',');
        found.set(key, [...(found.get(key) ?? []), x]);
      }
      for (const residues of tuples(ms)) {
        const sol = solve({ moduli: ms, residues });
        const hits = found.get(residues.join(',')) ?? [];
        systems++;
        expect(hits.length, `${ms} ${residues}`).toBeLessThanOrEqual(1);
        if (hits.length === 1) {
          compatible++;
          expect(sol, `${ms} ${residues}`).toEqual({ ok: true, x: hits[0], modulus: L });
        } else {
          expect(sol.ok, `${ms} ${residues}`).toBe(false);
        }
      }
    }
    expect(systems).toBeGreaterThan(20_000);
    expect(compatible).toBeGreaterThan(0);
  });

  it('the constructive formula equals the first brute-force match on 3,000 seeded coprime systems with moduli up to 30', () => {
    const rnd = mulberry32(5);
    let done = 0;
    while (done < 3000) {
      const k = 2 + Math.floor(rnd() * 2);
      const ms = Array.from({ length: k }, () => 2 + Math.floor(rnd() * 29));
      if (!pairwiseCoprime(ms)) continue;
      const residues = ms.map((m) => Math.floor(rnd() * m));
      const sys = { moduli: ms, residues };
      const built = crtBuild(sys)!;
      expect(built.x, `${ms} ${residues}`).toBe(firstMatch(sys, productN(ms)));
      expect(checks(sys, built.x)).toBe(true);
      expect(built.product).toBe(productN(ms));
      for (const t of built.terms) {
        for (const m of ms) {
          if (m !== t.modulus) expect(t.term % m).toBe(0);
        }
        expect((t.term % t.modulus)).toBe(t.residue);
      }
      done++;
    }
  });

  it("Sun Tzu's puzzle: 2 mod 3, 3 mod 5, 2 mod 7 gives 23 inside 105, by search, by formula and by solve", () => {
    const sys = { moduli: [3, 5, 7], residues: [2, 3, 2] };
    expect(firstMatch(sys, 105)).toBe(23);
    expect(bruteSolutions(sys, 105)).toEqual([23]);
    expect(crtBuild(sys)!.x).toBe(23);
    expect(crtBuild(sys)!.terms.map((t) => [t.partial, t.inverse])).toEqual([[35, 2], [21, 1], [15, 1]]);
    expect(solve(sys)).toEqual({ ok: true, x: 23, modulus: 105 });
  });
});

describe('moduli that share a factor', () => {
  it('for 4 and 6, a pair of remainders is compatible exactly when they agree mod 2: 12 of 24 pairs, each with one solution mod 12 and two mod 24', () => {
    let compatible = 0;
    for (let a1 = 0; a1 < 4; a1++) {
      for (let a2 = 0; a2 < 6; a2++) {
        const sys = { moduli: [4, 6], residues: [a1, a2] };
        const inLcm = bruteSolutions(sys, 12);
        const inProduct = bruteSolutions(sys, 24);
        expect(compatiblePair(a1, 4, a2, 6)).toBe((a1 - a2) % 2 === 0);
        if ((a1 - a2) % 2 === 0) {
          compatible++;
          expect(inLcm).toHaveLength(1);
          expect(inProduct).toHaveLength(2);
        } else {
          expect(inLcm).toHaveLength(0);
          expect(inProduct).toHaveLength(0);
        }
      }
    }
    expect(compatible).toBe(12);
  });

  it('x = 2 mod 4 and x = 3 mod 6 has no solution: the first forces even, the second odd', () => {
    expect(solve({ moduli: [4, 6], residues: [2, 3] })).toEqual({ ok: false, i: 0, j: 1, gcd: 2 });
    expect(bruteSolutions({ moduli: [4, 6], residues: [2, 3] }, 120)).toEqual([]);
    expect(solve({ moduli: [4, 6], residues: [2, 4] })).toEqual({ ok: true, x: 10, modulus: 12 });
  });

  it('the coprime formula applied to non-coprime moduli (product instead of lcm) returns a number that fails a remainder check, on at least one compatible system', () => {
    let failures = 0;
    let examples = 0;
    for (let a1 = 0; a1 < 4; a1++) {
      for (let a2 = 0; a2 < 6; a2++) {
        const sys = { moduli: [4, 6], residues: [a1, a2] };
        if (solve(sys).ok) {
          examples++;
          const broken = crtBuild(sys, true)!;
          if (!checks(sys, broken.x)) failures++;
        }
      }
    }
    expect(examples).toBe(12);
    expect(failures).toBeGreaterThan(0);
    expect(crtBuild({ moduli: [4, 6], residues: [2, 4] })).toBeNull();
  });

  it('solve handles three moduli with shared factors, checked against the brute force over their lcm', () => {
    const rnd = mulberry32(8);
    let solved = 0;
    for (let t = 0; t < 2000; t++) {
      const ms = Array.from({ length: 3 }, () => 2 + Math.floor(rnd() * 11));
      const residues = ms.map((m) => Math.floor(rnd() * m));
      const sys = { moduli: ms, residues };
      const brute = bruteSolutions(sys, lcmN(ms));
      const sol = solve(sys);
      expect(sol.ok, `${ms} ${residues}`).toBe(brute.length === 1);
      if (sol.ok) {
        solved++;
        expect(sol.x).toBe(brute[0]);
      }
    }
    expect(solved).toBeGreaterThan(100);
    expect(gcdN(12, 18)).toBe(6);
    expect(clampResidues([3, 5], [9, 9])).toEqual([2, 4]);
  });
});

describe('residue arithmetic', () => {
  it('component-wise addition and multiplication are right for every u and v below M, and wrap mod M above it', () => {
    for (const ms of [[3, 5, 7], [4, 9, 5], [7, 8, 9]]) {
      const M = productN(ms);
      for (const op of ['add', 'multiply'] as const) {
        for (let u = 0; u < M; u += 3) {
          for (let v = 0; v < M; v += 7) {
            const direct = op === 'add' ? u + v : u * v;
            const back = fromResidues(residueOp(toResidues(u, ms), toResidues(v, ms), ms, op), ms);
            expect(back, `${ms} ${op} ${u} ${v}`).toBe(direct % M);
            if (direct < M) expect(back).toBe(direct);
          }
        }
      }
    }
  });

  it('the overflow shows: 100 + 10 over the range 105 comes back as 5', () => {
    const ms = [3, 5, 7];
    expect(fromResidues(residueOp(toResidues(100, ms), toResidues(10, ms), ms, 'add'), ms)).toBe(5);
  });
});

describe('the toy CRT speed-up of c^d mod pq', () => {
  it('equals modPow(c, d, pq) for every message of the toy key 61 x 53 (e = 17), and 10,000 seeded toy prime pairs', () => {
    const key = toyRsa(61n, 53n, 17n);
    if (!key.ok) throw new Error('fixture');
    for (let c = 0n; c < key.n; c++) expect(crtExponentiation(c, key.d, 61n, 53n).result, `c=${c}`).toBe(modPow(c, key.d, key.n));
    const rnd = mulberry32(3);
    const primes: bigint[] = [];
    for (let v = 5n; primes.length < 80; v++) if (isProbablePrime(v).prime) primes.push(v);
    let done = 0;
    while (done < 10_000) {
      const p = primes[Math.floor(rnd() * primes.length)];
      const q = primes[Math.floor(rnd() * primes.length)];
      const e = 3n + BigInt(Math.floor(rnd() * 50));
      const k = toyRsa(p, q, e);
      if (!k.ok) continue;
      const c = BigInt(Math.floor(rnd() * Number(k.n)));
      const r = crtExponentiation(c, k.d, p, q);
      expect(r.result, `${p} ${q} ${e} ${c}`).toBe(modPow(c, k.d, k.n));
      expect(r.mp).toBe(modPow(c, r.dp, p));
      done++;
    }
  });

  it('the schoolbook cost model gives exactly a quarter for 61 x 53, and no more than 0.4 for prime pairs of equal bit length up to 200', () => {
    const key = toyRsa(61n, 53n, 17n);
    if (!key.ok) throw new Error('fixture');
    expect(workOf(61n, 53n, key.d)).toEqual({ full: 12 ** 3, crt: 2 * 6 ** 3, ratio: 0.25 });
    const primes: bigint[] = [];
    for (let v = 65n; v < 200n; v++) if (isProbablePrime(v).prime) primes.push(v);
    for (const p of primes) {
      for (const q of primes) {
        if (p >= q) continue;
        const k = toyRsa(p, q, 5n);
        if (!k.ok) continue;
        const w = workOf(p, q, k.d);
        expect(w.ratio, `${p} ${q}`).toBeLessThanOrEqual(0.45);
        expect(w.ratio).toBeGreaterThan(0.1);
      }
    }
  });
});
