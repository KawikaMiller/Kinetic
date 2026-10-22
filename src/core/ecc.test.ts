import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  add, addWithWorking, allPoints, crossCheckP256, curveSides, double, formatPoint, hasseBound, hasseHolds, INFINITY, isSingular, mul, neg, onCurve, orderOf,
  P256, pointCount, samePoint, SECP256K1, TOY_F17, weierstrass, type Curve, type CurveParams, type Point,
} from './ecc';
import { isProbablePrime } from './numberTheory';
import { mulberry32 } from './random';
import { nodeEcdhPublic } from './testing/nodeCrypto';

const CURVES: CurveParams[] = [TOY_F17, SECP256K1, P256];
const NODE_NAME = { 'secp256k1': 'secp256k1', 'P-256': 'prime256v1' } as const;

afterEach(() => vi.unstubAllGlobals());

describe('named constants are self-consistent', () => {
  it.each(CURVES)('$name: p and n prime, G on the curve, n·G = O, (n-1)·G = -G, #E = n·h within Hasse', (c) => {
    expect(isProbablePrime(c.p).prime).toBe(true);
    expect(isProbablePrime(c.n).prime).toBe(true);
    expect(c.p.toString(2)).toHaveLength(c.bits);
    expect(onCurve(c, c.G)).toBe(true);
    expect(mul(c, c.n, c.G).point).toBeNull();
    expect(samePoint(mul(c, c.n - 1n, c.G).point, neg(c, c.G))).toBe(true);
    expect(c.h).toBe(1n);
    expect(hasseHolds(c.p, c.n * c.h)).toBe(true);
  });

  it('flags the real curves as not toy, the F17 curve as toy, and a = p - 3 for P-256', () => {
    expect([TOY_F17.toy, SECP256K1.toy, P256.toy]).toEqual([true, false, false]);
    expect([TOY_F17.bits, SECP256K1.bits, P256.bits]).toEqual([5, 256, 256]);
    expect(P256.a).toBe(P256.p - 3n);
    expect(SECP256K1.p).toBe(2n ** 256n - 2n ** 32n - 977n);
  });

  it('the toy curve has 19 points by brute force and G has order 19', () => {
    // an independent count: every (x, y) pair against the curve equation, no square roots involved
    let affine = 0;
    for (let x = 0n; x < 17n; x++) for (let y = 0n; y < 17n; y++) if ((y * y) % 17n === (x ** 3n + 2n * x + 2n) % 17n) affine++;
    expect(affine).toBe(18);
    expect(pointCount(TOY_F17)).toBe(19n);
    expect(orderOf(TOY_F17, TOY_F17.G)).toBe(TOY_F17.n);
  });
});

describe('scalar multiplication equals node:crypto ECDH', () => {
  const pointHex = (P: Point) => `04${P!.x.toString(16).padStart(64, '0')}${P!.y.toString(16).padStart(64, '0')}`;
  const seededScalars = (c: CurveParams, count: number, seed: number) => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }, () => {
      let k = 0n;
      for (let i = 0; i < 8; i++) k = (k << 32n) | BigInt(Math.floor(rnd() * 2 ** 32));
      return (k % (c.n - 1n)) + 1n;
    });
  };

  it.each([SECP256K1, P256])('$name: k·G equals createECDH for 50 seeded scalars and for 1, 2, 3, 7, n-1', (c) => {
    const edge = [1n, 2n, 3n, 7n, c.n - 1n];
    for (const k of [...edge, ...seededScalars(c, 50, 17)]) {
      expect(pointHex(mul(c, k, c.G).point)).toBe(nodeEcdhPublic(NODE_NAME[c.name as keyof typeof NODE_NAME], k));
    }
  });

  it('P-256 2G and 3G x-coordinates (from node) and the double-and-add step counts', () => {
    expect(mul(P256, 2n, P256.G).point!.x.toString(16)).toBe('7cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978');
    expect(mul(P256, 3n, P256.G).point!.x.toString(16)).toBe('5ecbe4d1a6330a44c8f7ef951d4bf165e6c6b721efada985fb41661bc6e7fd6c');
    const last = mul(P256, P256.n - 1n, P256.G);
    expect([last.doublings, last.additions]).toEqual([255, 165]);
    const seven = mul(P256, 7n, P256.G);
    expect([seven.doublings, seven.additions]).toEqual([2, 2]);
  });
});

describe('the F17 toy group law, exhaustively', () => {
  const c = TOY_F17;
  const group: Point[] = [INFINITY, ...allPoints(c)];

  it('hand-worked slopes: 2G, G + 2G, 2·(6, 3)', () => {
    const two = addWithWorking(c, c.G, c.G);
    expect([two.rule, two.num, two.den, two.inverse, two.slope, formatPoint(two.result)]).toEqual(['double', 77n % 17n, 2n, 9n, 13n, '(6, 3)']);
    const three = addWithWorking(c, c.G, two.result);
    expect([three.rule, three.slope, formatPoint(three.result)]).toEqual(['add', 2n, '(10, 6)']);
    const four = addWithWorking(c, two.result, two.result);
    expect([four.slope, formatPoint(four.result)]).toEqual([7n, '(3, 1)']);
  });

  it('matches the spec multiples table 1G..19G and 20G = G', () => {
    const table = ['(5, 1)', '(6, 3)', '(10, 6)', '(3, 1)', '(9, 16)', '(16, 13)', '(0, 6)', '(13, 7)', '(7, 6)', '(7, 11)', '(13, 10)', '(0, 11)', '(16, 4)', '(9, 1)', '(3, 16)', '(10, 11)', '(6, 14)', '(5, 16)', 'O', '(5, 1)'];
    table.forEach((text, i) => expect(formatPoint(mul(c, BigInt(i + 1), c.G).point)).toBe(text));
  });

  it('records k = 13 as 3 doublings and 2 additions through 2G, 3G, 6G, 12G, 13G', () => {
    const r = mul(c, 13n, c.G);
    expect(r.steps.map((s) => `${s.op}:${formatPoint(s.result)}`)).toEqual(['start:(5, 1)', 'double:(6, 3)', 'add:(10, 6)', 'double:(16, 13)', 'double:(0, 11)', 'add:(16, 4)']);
    expect([r.doublings, r.additions, formatPoint(r.point)]).toEqual([3, 2, '(16, 4)']);
    expect(mul(c, 0n, c.G)).toMatchObject({ point: null, steps: [], doublings: 0, additions: 0 });
  });

  it('has 19 elements, closure, identity, inverses, commutativity and all 19^3 = 6,859 associativity triples', () => {
    expect(group).toHaveLength(19);
    const inGroup = (P: Point) => group.some((Q) => samePoint(P, Q));
    for (const P of group) {
      expect(samePoint(add(c, P, INFINITY), P)).toBe(true);
      expect(samePoint(add(c, P, neg(c, P)), INFINITY)).toBe(true);
      for (const Q of group) {
        const s = add(c, P, Q);
        expect(inGroup(s)).toBe(true);
        expect(samePoint(s, add(c, Q, P))).toBe(true);
      }
    }
    let triples = 0;
    for (const P of group) {
      for (const Q of group) {
        const PQ = add(c, P, Q);
        for (const R of group) {
          expect(samePoint(add(c, PQ, R), add(c, P, add(c, Q, R)))).toBe(true);
          triples++;
        }
      }
    }
    expect(triples).toBe(6859);
  });

  it('every point order divides the group order, and Hasse holds', () => {
    expect(pointCount(c)).toBe(19n);
    expect(hasseHolds(17n, 19n)).toBe(true);
    expect(hasseBound(17n)).toBe(8n);
    for (const P of group) expect(19n % orderOf(c, P)).toBe(0n);
    expect(orderOf(c, INFINITY)).toBe(1n);
  });

  it('adding a point to itself on a y = 0 point and adding opposite points give O, with the named rule', () => {
    expect(addWithWorking(c, c.G, neg(c, c.G))).toMatchObject({ rule: 'inverse', result: null });
    const curve = weierstrass('y=0 demo', 11n, 1n, 0n); // y^2 = x^3 + x has the point (0, 0)
    expect(addWithWorking(curve, { x: 0n, y: 0n }, { x: 0n, y: 0n })).toMatchObject({ rule: 'vertical-tangent', result: null });
  });
});

describe('every curve of the lesson picker', () => {
  const PRIMES = [11n, 13n, 17n, 19n, 23n];

  it('is singular exactly when 4a^3 + 27b^2 = 0 mod p, and every other curve keeps Hasse and brute-force counts', () => {
    for (const p of PRIMES) {
      for (let a = 0n; a < p; a++) {
        for (let b = 0n; b < p; b++) {
          const singular = (4n * a ** 3n + 27n * b ** 2n) % p === 0n;
          expect(isSingular(p, a, b)).toBe(singular);
          if (singular) {
            expect(() => weierstrass('s', p, a, b)).toThrow('has a sharp point');
            continue;
          }
          const curve = weierstrass('t', p, a, b);
          let affine = 0n;
          for (let x = 0n; x < p; x++) for (let y = 0n; y < p; y++) if ((y * y) % p === (x ** 3n + a * x + b) % p) affine++;
          const N = pointCount(curve);
          expect(N).toBe(affine + 1n);
          expect(hasseHolds(p, N)).toBe(true);
        }
      }
    }
  });

  it('point orders divide the group order on every non-singular curve over F11 and F13', () => {
    for (const p of [11n, 13n]) {
      for (let a = 0n; a < p; a++) {
        for (let b = 0n; b < p; b++) {
          if (isSingular(p, a, b)) continue;
          const curve = weierstrass('t', p, a, b);
          const N = pointCount(curve);
          for (const P of allPoints(curve)) expect(N % orderOf(curve, P)).toBe(0n);
        }
      }
    }
  });

  it('keeps associativity on a second curve (y^2 = x^3 + x + 1 over F23) over all triples', () => {
    const curve = weierstrass('F23', 23n, 1n, 1n);
    const group: Point[] = [INFINITY, ...allPoints(curve)];
    for (const P of group) for (const Q of group) for (const R of group) expect(samePoint(add(curve, add(curve, P, Q), R), add(curve, P, add(curve, Q, R)))).toBe(true);
  });

  it('on a singular curve (a = b = 0 over F17) the group law is refused unless allowed', () => {
    expect(() => weierstrass('cusp', 17n, 0n, 0n)).toThrow('4a^3 + 27b^2 = 0 mod 17');
    const cusp: Curve = weierstrass('cusp', 17n, 0n, 0n, { allowSingular: true });
    expect(onCurve(cusp, { x: 0n, y: 0n })).toBe(true);
  });
});

describe('hostile input is refused with a positioned message', () => {
  it('names both sides of the equation for a point off the curve, and the position', () => {
    expect(onCurve(TOY_F17, { x: 5n, y: 2n })).toBe(false);
    expect(curveSides(TOY_F17, { x: 5n, y: 2n })).toEqual({ lhs: 4n, rhs: 1n });
    expect(() => add(TOY_F17, TOY_F17.G, { x: 5n, y: 2n })).toThrow('add: point 2 (5, 2) is not on toy F17: y^2 = 4 but x^3 + ax + b = 1 mod 17');
    expect(() => mul(TOY_F17, 3n, { x: 5n, y: 2n })).toThrow('mul: point 2');
    expect(() => neg(TOY_F17, { x: 99n, y: 1n })).toThrow('neg: point 1 (99, 1) has a coordinate outside 0..16');
  });

  it('refuses a negative scalar, a bad modulus or coefficient, and enumeration on a real-size field', () => {
    expect(() => mul(TOY_F17, -1n, TOY_F17.G)).toThrow('mul: scalar -1 must be a non-negative bigint');
    expect(() => weierstrass('x', 3n, 1n, 1n)).toThrow('must be a prime above 3');
    expect(() => weierstrass('x', 15n, 1n, 1n)).toThrow('not prime');
    expect(() => weierstrass('x', 17n, 17n, 1n)).toThrow('a = 17 is outside 0..16');
    expect(() => orderOf(P256, P256.G)).toThrow('not a toy field');
    expect(() => allPoints(SECP256K1)).toThrow('not a toy field');
  });
});

describe('the live crypto.subtle P-256 cross-check', () => {
  it('our d·G equals the browser public point for a fresh key, and reports only summary fields', async () => {
    const result = await crossCheckP256();
    expect(result).not.toBeNull();
    expect(result!.equal).toBe(true);
    expect(result!.bits).toBeLessThanOrEqual(256);
    expect(result!.doublings).toBe(result!.bits - 1);
    expect(result!.publicXPrefix).toMatch(/^[0-9a-f]{8}$/);
    expect(Object.keys(result!).sort()).toEqual(['additions', 'bits', 'doublings', 'equal', 'publicXPrefix']);
  });

  it('is null without crypto.subtle', async () => {
    vi.stubGlobal('crypto', {});
    expect(await crossCheckP256()).toBeNull();
  });
});

describe('double', () => {
  it('is add(P, P)', () => {
    expect(samePoint(double(TOY_F17, TOY_F17.G), { x: 6n, y: 3n })).toBe(true);
  });
});
