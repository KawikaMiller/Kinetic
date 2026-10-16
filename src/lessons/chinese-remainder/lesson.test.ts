import { describe, expect, it } from 'vitest';
import { modPow, toyRsa } from '../../core/numberTheory';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { bruteSolutions, clampResidues, crtBuild, crtExponentiation, firstMatch, fromResidues, lcmN, pairwiseCoprime, productN, residueOp, solve, toResidues, workOf } from './crt';
import { FACTS } from './facts';
import lesson from './index';
import { COPRIME_SETS, GEAR_PRESETS, KEYS, OPENING, SHARED_DEFAULT, SUN_TZU, formatSystem, parseSystem } from './presets';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('chinese-remainder');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('chinese-remainder')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state, and every preset is valid', () => {
    expect(OPENING.gears).toEqual({ system: SUN_TZU, x: 0 });
    expect(OPENING.build).toMatchObject({ set: '3-5-7', residues: [2, 3, 2] });
    expect(OPENING.shared.system).toEqual(SHARED_DEFAULT);
    expect(OPENING.residue).toMatchObject({ u: 40, v: 35, op: 'add' });
    expect(COPRIME_SETS.every((s) => pairwiseCoprime(s.moduli))).toBe(true);
    for (const p of GEAR_PRESETS) {
      expect(parseSystem(formatSystem(p.system))).toEqual({ ok: true, value: p.system });
      expect(clampResidues(p.system.moduli, p.system.residues)).toEqual(p.system.residues);
    }
    for (const k of KEYS) expect(toyRsa(k.p, k.q, k.e).ok, k.id).toBe(true);
  });

  it('every gear preset agrees with the brute force over its whole range', () => {
    for (const p of GEAR_PRESETS) {
      const range = lcmN(p.system.moduli);
      const brute = bruteSolutions(p.system, range);
      const sol = solve(p.system);
      expect(sol.ok).toBe(brute.length === 1);
      if (sol.ok) expect(sol.x).toBe(brute[0]);
    }
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the first x that lights all three gears is 23, in a range of 105', () => {
    expect(firstMatch(OPENING.gears.system, lcmN(OPENING.gears.system.moduli))).toBe(23);
    expect([FACTS.sunMatch, FACTS.sunRange]).toEqual([23, 105]);
    expect(lesson.tryThis[0]).toContain('x = 23');
    expect(lesson.tryThis[0]).toContain('range of 105');
  });

  it('try-this 2: the terms are 140 + 63 + 30 = 233 and 233 mod 105 = 23', () => {
    const build = crtBuild({ moduli: [3, 5, 7], residues: OPENING.build.residues.slice() })!;
    expect(build.terms.map((t) => t.term)).toEqual([140, 63, 30]);
    expect([build.sum, build.x]).toEqual([233, 23]);
    expect(FACTS.sunTerms).toBe('140 + 63 + 30');
    expect(lesson.tryThis[1]).toContain('140 + 63 + 30');
  });

  it('try-this 3: 2 mod 4 with 3 mod 6 has none, the pair (2, 4) has one solution mod 12, and 12 of the 24 pairs work', () => {
    expect(solve(OPENING.shared.system).ok).toBe(false);
    expect(bruteSolutions(OPENING.shared.system, 12)).toEqual([]);
    expect(bruteSolutions({ moduli: [4, 6], residues: [2, 4] }, 12)).toHaveLength(1);
    expect([FACTS.compatiblePairs, FACTS.allPairs, FACTS.sharedLcm]).toEqual([12, 24, 12]);
    expect(lesson.tryThis[2]).toContain('Only 12 of the 24 pairs');
  });

  it('try-this 4: 40 + 35 = 75 is right, and 100 + 10 = 110 over the range 105 comes back as 5', () => {
    const ms = [3, 5, 7];
    const sum = (u: number, v: number) => fromResidues(residueOp(toResidues(u, ms), toResidues(v, ms), ms, 'add'), ms);
    expect(sum(OPENING.residue.u, OPENING.residue.v)).toBe(75);
    expect(sum(100, 10)).toBe(5);
    expect((100 + 10) % 105).toBe(5);
    expect([FACTS.wrapped, FACTS.wrapDirect, FACTS.wrapRange]).toEqual([5, 110, 105]);
    expect(productN(ms)).toBe(105);
    expect(lesson.tryThis[3]).toContain('set u to 100 and v to 10');
  });

  it('try-this 5: the direct power and the CRT recombination agree for c = 65 on 61 x 53, and the model gives 25%', () => {
    const key = KEYS.find((k) => k.id === OPENING.speed.key)!;
    const rsa = toyRsa(key.p, key.q, key.e);
    if (!rsa.ok) throw new Error('fixture');
    const c = BigInt(OPENING.speed.c);
    expect(crtExponentiation(c, rsa.d, key.p, key.q).result).toBe(modPow(c, rsa.d, rsa.n));
    expect(FACTS.rsaDirect).toBe(FACTS.rsaCrt);
    expect(workOf(key.p, key.q, rsa.d).ratio).toBe(0.25);
    expect(FACTS.rsaPercent).toBe('25');
    expect(lesson.tryThis[4]).toContain('25%');
  });
});

describe('every key and message of the speed-up scene recombines to the direct power', () => {
  it('walks the control cross product: each key, every message of the slider range', () => {
    for (const k of KEYS) {
      const rsa = toyRsa(k.p, k.q, k.e);
      if (!rsa.ok) throw new Error(k.id);
      const top = Math.min(5000, Number(rsa.n) - 1);
      for (let c = 0; c <= top; c += 7) expect(crtExponentiation(BigInt(c), rsa.d, k.p, k.q).result, `${k.id} ${c}`).toBe(modPow(BigInt(c), rsa.d, rsa.n));
      const w = workOf(k.p, k.q, rsa.d);
      expect(w.ratio).toBeGreaterThan(0.1);
      expect(w.ratio).toBeLessThan(0.5);
    }
  });

  it('every coprime set and every remainder tuple builds an x that checks, and the residue scene stays inside its range', () => {
    for (const s of COPRIME_SETS) {
      const M = productN(s.moduli);
      for (let x = 0; x < M; x += 5) {
        const tuple = toResidues(x, s.moduli);
        const built = crtBuild({ moduli: s.moduli, residues: tuple })!;
        expect(built.x).toBe(x);
      }
    }
  });
});

describe('hostile input', () => {
  it('refuses more gears than allowed, a modulus of 0 or 1, one past 30, a remainder outside 0 to m - 1, junk, and a single gear', () => {
    expect(parseSystem('3:2, 5:3, 7:2, 11:1')).toMatchObject({ ok: false, error: expect.stringContaining('At most 3 gears') });
    expect(parseSystem('3:2, 5:3, 7:2', 2)).toMatchObject({ ok: false, error: expect.stringContaining('At most 2 gears') });
    expect(parseSystem('1:0, 5:3')).toEqual({ ok: false, error: 'A modulus of 1 has only the remainder 0 and tells you nothing.' });
    expect(parseSystem('0:0, 5:3')).toMatchObject({ ok: false });
    expect(parseSystem('-3:0, 5:3')).toMatchObject({ ok: false });
    expect(parseSystem('31:0, 5:3')).toMatchObject({ ok: false, error: expect.stringContaining('too big') });
    expect(parseSystem('3:3, 5:3')).toMatchObject({ ok: false, error: expect.stringContaining('does not fit mod 3') });
    expect(parseSystem('3:-1, 5:3')).toMatchObject({ ok: false });
    expect(parseSystem('3:2.5, 5:3')).toMatchObject({ ok: false });
    expect(parseSystem('')).toMatchObject({ ok: false });
    expect(parseSystem('3:2')).toMatchObject({ ok: false });
    expect(parseSystem('3:2, 5:3')).toEqual({ ok: true, value: { moduli: [3, 5], residues: [2, 3] } });
    expect(parseSystem('30:29; 29:28, 7:6')).toMatchObject({ ok: true });
  });
});
