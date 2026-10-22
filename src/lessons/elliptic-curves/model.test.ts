import { describe, expect, it } from 'vitest';
import { P256, SECP256K1, TOY_F17, formatPoint, isSingular, mul, onCurve, type CurveParams } from '../../core/ecc';
import { isProbablePrime } from '../../core/numberTheory';
import { nodeEcdhPublic } from '../../core/testing/nodeCrypto';
import {
  FIELD_PRIMES, FORGOT_FACTOR_2_WITNESS, P256_COST, SINGULAR_REFUSAL, claimField, checkGroupLaw, commutativityChecks, curveFacts, discriminant,
  fieldCurve, fieldSum, genericCost, integerPoints, isSingularField, isSingularReal, mulChecked, onRealCurve, p256XPrefix, p256Years, realAdd, realOrder,
  realPointFloat, realPointText, realWorkingText, scalarView, traceLines, walkToReverse, WALK_REFUSAL, type FieldCurveSpec, type RealCurve,
} from './model';
import { rat, ratText } from './rational';

// An independent implementation of the F17 group law with plain bigint % arithmetic, sharing nothing with core/ecc.
const P17 = 17n;
const md = (v: bigint) => ((v % P17) + P17) % P17;
const inv17 = (v: bigint): bigint => {
  for (let i = 1n; i < P17; i++) if (md(v * i) === 1n) return i;
  throw new Error('no inverse');
};
type Pair = readonly [bigint, bigint] | null;
const naiveAdd = (P: Pair, Q: Pair): Pair => {
  if (P === null) return Q;
  if (Q === null) return P;
  const [x1, y1] = P;
  const [x2, y2] = Q;
  if (x1 === x2 && md(y1 + y2) === 0n) return null;
  const s = x1 === x2 ? md((3n * x1 * x1 + 2n) * inv17(2n * y1)) : md((y2 - y1) * inv17(x2 - x1));
  const x3 = md(s * s - x1 - x2);
  return [x3, md(s * (x1 - x3) - y1)];
};

// The spec's table for y^2 = x^3 + 2x + 2 over F17 with G = (5, 1), worked by hand there for 1G..4G and 18G.
const F17_TABLE: Pair[] = [
  [5n, 1n], [6n, 3n], [10n, 6n], [3n, 1n], [9n, 16n], [16n, 13n], [0n, 6n], [13n, 7n], [7n, 6n], [7n, 11n],
  [13n, 10n], [0n, 11n], [16n, 4n], [9n, 1n], [3n, 16n], [10n, 11n], [6n, 14n], [5n, 16n], null,
];
const asPair = (P: { x: bigint; y: bigint } | null): Pair => (P ? [P.x, P.y] : null);

describe('constants of the three curves are self-consistent', () => {
  it.each([TOY_F17, SECP256K1, P256] as CurveParams[])('$name: p and n prime, G on the curve, n times G is O', (c) => {
    expect(isProbablePrime(c.p).prime).toBe(true);
    expect(isProbablePrime(c.n).prime).toBe(true);
    expect(onCurve(c, c.G)).toBe(true);
    expect(mul(c, c.n, c.G).point).toBeNull();
  });
});

describe('the F17 table, against an independent implementation', () => {
  it('kG for k = 1..19 equals the spec table and a naive repeated addition that shares no code with core/ecc', () => {
    let naive: Pair = null;
    for (let k = 1; k <= 19; k++) {
      naive = naiveAdd(naive, [5n, 1n]);
      expect(naive, `naive ${k}G`).toEqual(F17_TABLE[k - 1]);
      expect(asPair(mul(TOY_F17, BigInt(k), TOY_F17.G).point), `core ${k}G`).toEqual(F17_TABLE[k - 1]);
    }
  });

  it('by hand: 2G slope 77/2 = 9 * 9 = 81 = 13, x3 = 169 - 10 = 159 = 6, y3 = 13(5 - 6) - 1 = -14 = 3', () => {
    const w = fieldSum({ p: 17, a: 2, b: 2 }, { x: 5n, y: 1n }, { x: 5n, y: 1n });
    expect(formatPoint(w.result)).toBe('(6, 3)');
    expect(w.lines[2]).toBe('slope = 9 * 9 = 13 mod 17');
    expect(w.lines[0]).toBe('slope = (3x^2 + a) / (2y) = (3*5^2 + 2) / (2*1) = 9 / 2 mod 17');
  });

  it('G + 2G = (10, 6) with slope 2, and 4G = (3, 1) with slope 7', () => {
    expect(fieldSum({ p: 17, a: 2, b: 2 }, { x: 5n, y: 1n }, { x: 6n, y: 3n }).lines[2]).toBe('slope = 2 * 1 = 2 mod 17');
    expect(formatPoint(fieldSum({ p: 17, a: 2, b: 2 }, { x: 5n, y: 1n }, { x: 6n, y: 3n }).result)).toBe('(10, 6)');
    expect(fieldSum({ p: 17, a: 2, b: 2 }, { x: 6n, y: 3n }, { x: 6n, y: 3n }).lines[2]).toBe('slope = 8 * 3 = 7 mod 17');
  });
});

describe('the group law over F_p, exhaustively', () => {
  it('the toy curve passes closure, identity, inverses and associativity over all 19^3 = 6,859 triples', () => {
    const r = checkGroupLaw({ p: 17, a: 2, b: 2 });
    expect([r.order, r.triples, r.ok, r.failure]).toEqual([19, 6859, true, null]);
  });

  it('every (p, a, b) of the picker: singular exactly when 4a^3 + 27b^2 = 0 mod p; non-singular curves match a brute-force count, Hasse and the group check; singular ones fail it', () => {
    let nonSingular = 0;
    let singular = 0;
    for (const p of FIELD_PRIMES) {
      for (let a = 0; a < p; a++) {
        for (let b = 0; b < p; b++) {
          const spec: FieldCurveSpec = { p, a, b };
          const sharp = (4 * a ** 3 + 27 * b ** 2) % p === 0;
          expect(isSingularField(spec)).toBe(sharp);
          expect(isSingular(BigInt(p), BigInt(a), BigInt(b))).toBe(sharp);
          let affine = 0;
          for (let x = 0; x < p; x++) for (let y = 0; y < p; y++) if ((y * y) % p === (x ** 3 + a * x + b) % p) affine++;
          const facts = curveFacts(spec);
          expect(facts.count).toBe(affine + 1);
          if (sharp) {
            singular++;
            expect(checkGroupLaw(spec).ok, `singular ${p},${a},${b}`).toBe(false);
          } else {
            nonSingular++;
            expect(Math.abs(facts.count - (p + 1))).toBeLessThanOrEqual(Math.floor(2 * Math.sqrt(p)));
            expect(checkGroupLaw(spec).ok, `non-singular ${p},${a},${b}`).toBe(true);
          }
        }
      }
    }
    expect(nonSingular + singular).toBe(11 * 11 + 13 * 13 + 17 * 17 + 19 * 19 + 23 * 23);
  }, 240_000);

  it('Hasse for the toy curve: 19 points, |19 - 18| = 1 <= 8.25', () => {
    const f = curveFacts({ p: 17, a: 2, b: 2 });
    expect(f.count).toBe(19);
    expect(f.hasse).toEqual({ lo: 10, hi: 26, width: 8 });
  });

  it('a clicked cell that is off the curve is refused with both sides of the equation', () => {
    const r = claimField({ p: 17, a: 2, b: 2 }, 5, 2);
    // 5^3 + 2*5 + 2 = 137 = 8 * 17 + 1 and 2^2 = 4... the cell is (5, 2): y^2 = 4
    expect(r).toEqual({ ok: false, message: '(5, 2): y^2 = 4 but x^3 + 2x + 2 = 1 mod 17, not on the curve' });
    expect(claimField({ p: 17, a: 2, b: 2 }, 5, 1)).toEqual({ ok: true, point: { x: 5n, y: 1n } });
  });
});

describe('the real plane, in exact fractions', () => {
  const curve: RealCurve = { a: -2, b: 1 };
  const P = { x: rat(0n), y: rat(1n) };
  const Q = { x: rat(1n), y: rat(0n) };

  it('discriminant 4(-8) + 27 = -5 and the hand vector: P + Q = (0, -1) = -P, 2P = (1, 0) = Q, 2Q = O, so P has order 4', () => {
    expect(discriminant(curve)).toBe(-5);
    expect([onRealCurve(curve, P), onRealCurve(curve, Q)]).toEqual([true, true]);
    expect(realPointText(realAdd(curve, P, Q).result)).toBe('(0, -1)');
    expect(ratText(realAdd(curve, P, Q).slope!)).toBe('-1');
    expect(realPointText(realAdd(curve, P, P).result)).toBe('(1, 0)');
    expect(realAdd(curve, Q, Q).result).toBeNull();
    expect(realOrder(curve, P)).toBe(4);
    expect(realPointText(realAdd(curve, P, { x: rat(0n), y: rat(-1n) }).result)).toBe('O');
  });

  it('exact results lie on the curve and the float drawing agrees to 1e-9, for every pair of integer points on every curve of the steppers', () => {
    for (let a = -5; a <= 5; a++) {
      for (let b = -5; b <= 5; b++) {
        const c = { a, b };
        if (isSingularReal(c)) continue;
        const pts = integerPoints(c);
        for (const U of pts) {
          for (const V of pts) {
            const s = realAdd(c, U, V).result;
            expect(onRealCurve(c, s)).toBe(true);
            if (s) {
              const [x, y] = realPointFloat(s);
              expect(Math.abs(y * y - (x ** 3 + a * x + b))).toBeLessThan(1e-9 * Math.max(1, Math.abs(y * y)));
            }
          }
        }
      }
    }
  });

  it('manipulation 1: a = b = 0 is refused with the sharp-point message, and so is every singular pair', () => {
    expect(isSingularReal({ a: 0, b: 0 })).toBe(true);
    expect(SINGULAR_REFUSAL).toBe('4a^3 + 27b^2 = 0: the curve has a sharp point where the tangent is not defined, so it is not an elliptic curve');
    const singularPairs: [number, number][] = [];
    for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) if (4 * a ** 3 + 27 * b ** 2 === 0) singularPairs.push([a, b]);
    expect(singularPairs).toEqual([[-3, -2], [-3, 2], [0, 0]]);
    // over F17 the same pair has a failing group law at its sharp point
    const cusp = checkGroupLaw({ p: 17, a: 0, b: 0 });
    expect(cusp.ok).toBe(false);
    expect(cusp.failure!.kind).toBe('associativity');
    expect(cusp.failure!.text).toContain('(0, 0)');
  });

  it('the working sentence names the rule: chord, tangent, vertical line', () => {
    expect(realWorkingText(curve, P, Q)).toContain('Chord through (0, 1) and (1, 0): slope -1');
    expect(realWorkingText(curve, P, P)).toContain('Tangent at (0, 1): slope (3x^2 + a) / 2y = -1');
    expect(realWorkingText(curve, P, { x: rat(0n), y: rat(-1n) })).toContain('point at infinity O');
    expect(realWorkingText(curve, Q, Q)).toContain('order 2');
  });
});

describe('scalar multiplication on the toy curve', () => {
  it('manipulation 3: k = 13 takes 3 doublings and 2 additions and gives (16, 4); k = 19 is O; k = 20 is G again', () => {
    const v = scalarView(13n);
    expect([v.doublings, v.additions, formatPoint(v.point), v.bits]).toEqual([3, 2, '(16, 4)', '1101']);
    expect(traceLines(13n)).toEqual([
      'bit 1 = 1: start at G -> 1G = (5, 1)',
      'bit 2 = 1: double -> 2G = (6, 3)',
      'bit 2 = 1: add G -> 3G = (10, 6)',
      'bit 3 = 0: double -> 6G = (16, 13)',
      'bit 4 = 1: double -> 12G = (0, 11)',
      'bit 4 = 1: add G -> 13G = (16, 4)',
    ]);
    expect(scalarView(19n).point).toBeNull();
    expect(formatPoint(scalarView(20n).point)).toBe('(5, 1)');
    expect(scalarView(20n).reduced).toBe(1n);
  });

  it('control extremes: k = 0 is O with no steps, k = 10^6 stays on the curve, and the reduction mod 19 agrees', () => {
    expect(scalarView(0n).point).toBeNull();
    expect(scalarView(0n).doublings + scalarView(0n).additions).toBe(0);
    const big = scalarView(1_000_000n);
    expect(big.reduced).toBe(1_000_000n % 19n);
    expect(onCurve(TOY_F17, big.point)).toBe(true);
    expect(asPair(big.point)).toEqual(F17_TABLE[Number(1_000_000n % 19n) - 1] ?? null);
  });

  it('all 19 x 19 pairs: k1(k2 G), k2(k1 G) and (k1 k2) G agree', () => {
    expect(commutativityChecks()).toEqual({ checked: 361, agreed: 361 });
  });

  it('walking G, 2G, 3G, ... finds k in at most 19 steps for every multiple, and refuses the real curves', () => {
    for (let k = 1; k <= 19; k++) {
      const w = walkToReverse(TOY_F17, mul(TOY_F17, BigInt(k), TOY_F17.G).point);
      expect(w).toEqual({ k: BigInt(k), steps: k });
    }
    expect(() => walkToReverse(P256, P256.G)).toThrow(WALK_REFUSAL);
    expect(() => walkToReverse(SECP256K1, SECP256K1.G)).toThrow('only offered for toy sizes');
  });

  it('the P-256 cost line: about sqrt(n) = 2^128 steps and about 1e19 years at 10^12 steps per second', () => {
    expect(P256_COST.log2).toBe(128);
    // an independent route: floating sqrt of n
    expect(Number(P256_COST.steps) / Math.sqrt(Number(P256.n))).toBeCloseTo(1, 12);
    expect(P256_COST.seconds).toBeCloseTo(3.4e26, -25);
    expect(p256Years()).toBeGreaterThan(1.0e19);
    expect(p256Years()).toBeLessThan(1.2e19);
    expect(genericCost(19n).steps).toBe(4n);
  });
});

describe('the forgot-the-factor-2 doubling fails for the stated reason', () => {
  it('2G is off the curve under the broken rule (the pinned witness), and the correct rule passes the same scalars', () => {
    expect(FORGOT_FACTOR_2_WITNESS).toBe(2n);
    const bad = mulChecked('forgot-factor-2', 2n);
    expect(bad.failure!.multiple).toBe(2n);
    expect(formatPoint(bad.failure!.point)).toBe('(3, 0)');
    // hand: slope = 77 / 1 = 9, x3 = 81 - 10 = 71 = 3, y3 = 9(5 - 3) - 1 = 17 = 0; 0 != 27 + 6 + 2 = 35 = 1
    expect(bad.failure!.message).toBe('result is not on the curve: 2G came out as (3, 0), where y^2 = 0 but x^3 + 2x + 2 = 1 mod 17');
    for (let k = 0n; k <= 40n; k++) {
      expect(mulChecked('correct', k).failure, `correct ${k}`).toBeNull();
      expect(formatPoint(mulChecked('correct', k).point)).toBe(formatPoint(mul(TOY_F17, k, TOY_F17.G).point));
    }
  });

  it('k = 0 and k = 1 are unaffected, every k from 2 up fails at the same first doubling (a deterministic witness: no seed)', () => {
    expect(mulChecked('forgot-factor-2', 0n).failure).toBeNull();
    expect(mulChecked('forgot-factor-2', 1n).failure).toBeNull();
    for (let k = 2n; k <= 200n; k++) expect(mulChecked('forgot-factor-2', k).failure!.multiple, `k=${k}`).toBe(2n);
  });

  it('an addition that ignores P = -Q (treats it as a tangent) fails inverse closure, while the real law returns O', () => {
    const ignoresInverse = (P: Pair, Q: Pair): Pair => {
      if (P === null) return Q;
      if (Q === null) return P;
      const [x1, y1] = P;
      const [x2, y2] = Q;
      const s = x1 === x2 ? md((3n * x1 * x1 + 2n) * inv17(2n * y1)) : md((y2 - y1) * inv17(x2 - x1));
      const x3 = md(s * s - x1 - x2);
      return [x3, md(s * (x1 - x3) - y1)];
    };
    const G: Pair = [5n, 1n];
    const minusG: Pair = [5n, 16n];
    expect(naiveAdd(G, minusG)).toBeNull();
    expect(ignoresInverse(G, minusG)).not.toBeNull();
  });
});

describe('known answers against node:crypto', () => {
  it('the first 8 hex digits of 2G and 3G on P-256 equal node (7cf27b18, 5ecbe4d1)', () => {
    expect(p256XPrefix(2n)).toBe(nodeEcdhPublic('prime256v1', 2n).slice(2, 10));
    expect(p256XPrefix(3n)).toBe(nodeEcdhPublic('prime256v1', 3n).slice(2, 10));
    expect([p256XPrefix(2n), p256XPrefix(3n)]).toEqual(['7cf27b18', '5ecbe4d1']);
  });

  it('step counts: n - 1 takes 255 doublings and 165 additions, 7 takes 2 and 2', () => {
    const big = mul(P256, P256.n - 1n, P256.G);
    expect([big.doublings, big.additions]).toEqual([255, 165]);
    const small = mul(P256, 7n, P256.G);
    expect([small.doublings, small.additions]).toEqual([2, 2]);
  });
});

describe('integer points of the default curve', () => {
  it('are (0, 1), (0, -1) and (1, 0), the points the hand vector uses', () => {
    expect(integerPoints({ a: -2, b: 1 }).map(realPointText)).toEqual(['(0, -1)', '(0, 1)', '(1, 0)']);
  });
  it('the F17 field curve object has the picker values', () => {
    expect(fieldCurve({ p: 17, a: 2, b: 2 }).p).toBe(17n);
  });
});
