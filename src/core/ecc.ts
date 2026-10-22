/**
 * Elliptic curves in short Weierstrass form y^2 = x^3 + ax + b over F_p, on `bigint`, for the
 * elliptic-curves, post-quantum-crypto and e2ee-forward-secrecy lessons. Affine coordinates: add,
 * double, scalar multiply by double-and-add WITH its step trace, membership, and (for toy fields only)
 * the point order, the point count and the full point list.
 *
 * Teaching code: BigInt arithmetic is NOT constant-time and nothing here is safe for real keys.
 * The toy curve is a 5-bit field; secp256k1 and P-256 are the real parameters, typed from memory and
 * proved right by core/ecc.test.ts (on-curve generator, n·G = O, prime p and n, and equality with
 * `node:crypto` ECDH on 50 seeded scalars each), never trusted unchecked.
 */
import { ecdhKeyPair, exportPrivateScalar, exportPublicPoint } from './crypto';
import { Fp, type PrimeField } from './field';
import { isqrt } from './numberTheory';

export interface AffinePoint {
  x: bigint;
  y: bigint;
}
/** A curve point; `null` is the point at infinity O, the group's identity. */
export type Point = AffinePoint | null;
export const INFINITY: Point = null;

/** The curve y^2 = x^3 + ax + b over F_p. */
export interface Curve {
  readonly name: string;
  readonly p: bigint;
  readonly a: bigint;
  readonly b: bigint;
  readonly field: PrimeField;
}

/** A curve with a named generator G of prime order n and cofactor h (#E = n · h). */
export interface CurveParams extends Curve {
  readonly G: AffinePoint;
  readonly n: bigint;
  readonly h: bigint;
  /** Bit size of the field prime. */
  readonly bits: number;
  /** True for the toy curve: a field far below 128 bits, never to be called secure. */
  readonly toy: boolean;
}

/** 4a^3 + 27b^2 = 0 mod p: the curve has a sharp point and is not an elliptic curve. */
export const isSingular = (p: bigint, a: bigint, b: bigint): boolean => (4n * a ** 3n + 27n * b ** 2n) % p === 0n;

/**
 * A curve over F_p. Refuses p ≤ 3 or composite, a or b outside 0..p-1, and a singular curve unless
 * `allowSingular` (the lesson shows the failing group law on a singular curve on purpose).
 */
export function weierstrass(name: string, p: bigint, a: bigint, b: bigint, o: { allowSingular?: boolean } = {}): Curve {
  if (p <= 3n) throw new RangeError(`weierstrass: p = ${p} must be a prime above 3`);
  const field = Fp(p);
  if (a < 0n || a >= p) throw new RangeError(`weierstrass: a = ${a} is outside 0..${p - 1n}`);
  if (b < 0n || b >= p) throw new RangeError(`weierstrass: b = ${b} is outside 0..${p - 1n}`);
  if (!o.allowSingular && isSingular(p, a, b)) throw new RangeError(`weierstrass: 4a^3 + 27b^2 = 0 mod ${p}: the curve has a sharp point where the tangent is undefined`);
  return { name, p, a, b, field };
}

const hex = (groups: string) => BigInt(`0x${groups.replace(/\s+/g, '')}`);

function named(name: string, p: bigint, a: bigint, b: bigint, G: AffinePoint, n: bigint, h: bigint, toy: boolean): CurveParams {
  return { ...weierstrass(name, p, a, b), G, n, h, bits: p.toString(2).length, toy };
}

/** TOY (5-bit field, 19 points): the textbook y^2 = x^3 + 2x + 2 over F17, generator (5, 1) of order 19. */
export const TOY_F17 = named('toy F17', 17n, 2n, 2n, { x: 5n, y: 1n }, 19n, 1n, true);

/** secp256k1 (SEC 2): y^2 = x^3 + 7 over a 256-bit prime. Constants typed from memory; verified by the tests. */
export const SECP256K1 = named(
  'secp256k1',
  2n ** 256n - 2n ** 32n - 977n,
  0n,
  7n,
  {
    x: hex('79BE667E F9DCBBAC 55A06295 CE870B07 029BFCDB 2DCE28D9 59F2815B 16F81798'),
    y: hex('483ADA77 26A3C465 5DA4FBFC 0E1108A8 FD17B448 A6855419 9C47D08F FB10D4B8'),
  },
  hex('FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE BAAEDCE6 AF48A03B BFD25E8C D0364141'),
  1n,
  false,
);

const P256_P = hex('FFFFFFFF 00000001 00000000 00000000 00000000 FFFFFFFF FFFFFFFF FFFFFFFF');

/** NIST P-256 (secp256r1, prime256v1): a = -3. Constants typed from memory; verified by the tests. */
export const P256 = named(
  'P-256',
  P256_P,
  P256_P - 3n,
  hex('5AC635D8 AA3A93E7 B3EBBD55 769886BC 651D06B0 CC53B0F6 3BCE3C3E 27D2604B'),
  {
    x: hex('6B17D1F2 E12C4247 F8BCE6E5 63A440F2 77037D81 2DEB33A0 F4A13945 D898C296'),
    y: hex('4FE342E2 FE1A7F9B 8EE7EB4A 7C0F9E16 2BCE3357 6B315ECE CBB64068 37BF51F5'),
  },
  hex('FFFFFFFF 00000000 FFFFFFFF FFFFFFFF BCE6FAAD A7179E84 F3B9CAC2 FC632551'),
  1n,
  false,
);

/** "(5, 1)" or "O" for the point at infinity. */
export const formatPoint = (P: Point): string => (P ? `(${P.x}, ${P.y})` : 'O');

export const samePoint = (P: Point, Q: Point): boolean => (P === null || Q === null ? P === Q : P.x === Q.x && P.y === Q.y);

/** Both sides of the curve equation at P: y^2 and x^3 + ax + b, for the "(5, 2): y^2 = 4 but … = 1" message. */
export function curveSides(c: Curve, P: AffinePoint): { lhs: bigint; rhs: bigint } {
  const { p } = c;
  return { lhs: (P.y * P.y) % p, rhs: (P.x ** 3n + c.a * P.x + c.b) % p };
}

const inField = (c: Curve, v: bigint) => typeof v === 'bigint' && v >= 0n && v < c.p;

/** Whether P is on the curve. O is; a point with a coordinate outside 0..p-1 is not. */
export function onCurve(c: Curve, P: Point): boolean {
  if (P === null) return true;
  if (!inField(c, P.x) || !inField(c, P.y)) return false;
  const { lhs, rhs } = curveSides(c, P);
  return lhs === rhs;
}

/** The refusal text for a point that is not on the curve, naming both sides of the equation. */
function refusal(op: string, position: number, c: Curve, P: AffinePoint): string {
  if (!inField(c, P.x) || !inField(c, P.y)) return `${op}: point ${position} ${formatPoint(P)} has a coordinate outside 0..${c.p - 1n}`;
  const { lhs, rhs } = curveSides(c, P);
  return `${op}: point ${position} ${formatPoint(P)} is not on ${c.name}: y^2 = ${lhs} but x^3 + ax + b = ${rhs} mod ${c.p}`;
}

function assertOn(op: string, position: number, c: Curve, P: Point): void {
  if (!onCurve(c, P)) throw new RangeError(refusal(op, position, c, P!));
}

/** -P: same x, y negated. */
export function neg(c: Curve, P: Point): Point {
  assertOn('neg', 1, c, P);
  return P === null || P.y === 0n ? P : { x: P.x, y: c.p - P.y };
}

/** Which rule of the group law produced a sum. */
export type AddRule = 'identity-left' | 'identity-right' | 'inverse' | 'vertical-tangent' | 'double' | 'add';

/** One addition with its working: the slope as numerator / denominator, the inverse of the denominator, and the slope. */
export interface AddWorking {
  result: Point;
  rule: AddRule;
  /** Slope numerator and denominator (mod p); absent for the identity and inverse rules. */
  num?: bigint;
  den?: bigint;
  /** den^-1 mod p. */
  inverse?: bigint;
  slope?: bigint;
}

/** P + Q with the working shown: chord for P ≠ ±Q, tangent for P = Q, O for opposite points. */
export function addWithWorking(c: Curve, P: Point, Q: Point): AddWorking {
  assertOn('add', 1, c, P);
  assertOn('add', 2, c, Q);
  if (P === null) return { result: Q, rule: 'identity-left' };
  if (Q === null) return { result: P, rule: 'identity-right' };
  const F = c.field;
  const isDouble = P.x === Q.x && P.y === Q.y;
  if (P.x === Q.x && !isDouble) return { result: INFINITY, rule: 'inverse' };
  if (isDouble && P.y === 0n) return { result: INFINITY, rule: 'vertical-tangent' };
  const num = isDouble ? F.add(F.mul(3n, F.mul(P.x, P.x)), c.a) : F.sub(Q.y, P.y);
  const den = isDouble ? F.mul(2n, P.y) : F.sub(Q.x, P.x);
  const inverse = F.inv(den);
  const slope = F.mul(num, inverse);
  const x3 = F.sub(F.sub(F.mul(slope, slope), P.x), Q.x);
  const y3 = F.sub(F.mul(slope, F.sub(P.x, x3)), P.y);
  return { result: { x: x3, y: y3 }, rule: isDouble ? 'double' : 'add', num, den, inverse, slope };
}

/** P + Q. */
export const add = (c: Curve, P: Point, Q: Point): Point => addWithWorking(c, P, Q).result;

/** 2P. */
export const double = (c: Curve, P: Point): Point => add(c, P, P);

/** One line of the double-and-add trace: the operation and the running point after it. */
export interface MulStep {
  /** `start` loads P at the leading bit; then each lower bit doubles, and adds P when the bit is 1. */
  op: 'start' | 'double' | 'add';
  /** Index of the scalar bit being processed, 0 = the leading (most significant) bit. */
  bitIndex: number;
  /** That bit's value (the `add` after a `double` belongs to a 1 bit). */
  bit: 0 | 1;
  result: Point;
}

export interface MulResult {
  point: Point;
  steps: MulStep[];
  doublings: number;
  additions: number;
}

/**
 * k·P by left-to-right double-and-add, recording every step. k = 0 gives O with no steps; k = 1 is
 * just `start`. k may exceed the group order (the point repeats with period n). Refuses a negative or
 * non-bigint k and a P not on the curve.
 */
export function mul(c: Curve, k: bigint, P: Point): MulResult {
  if (typeof k !== 'bigint' || k < 0n) throw new RangeError(`mul: scalar ${String(k)} must be a non-negative bigint`);
  assertOn('mul', 2, c, P);
  if (k === 0n) return { point: INFINITY, steps: [], doublings: 0, additions: 0 };
  const bits = k.toString(2);
  const steps: MulStep[] = [{ op: 'start', bitIndex: 0, bit: 1, result: P }];
  let R: Point = P;
  let doublings = 0;
  let additions = 0;
  for (let i = 1; i < bits.length; i++) {
    const bit = bits[i] === '1' ? 1 : 0;
    R = double(c, R);
    doublings++;
    steps.push({ op: 'double', bitIndex: i, bit, result: R });
    if (bit) {
      R = add(c, R, P);
      additions++;
      steps.push({ op: 'add', bitIndex: i, bit, result: R });
    }
  }
  return { point: R, steps, doublings, additions };
}

/** The largest field the enumeration helpers (point list, count, order) accept: they are for toy curves. */
export const TOY_FIELD_LIMIT = 100_003n;

function assertToy(op: string, c: Curve): void {
  if (c.p > TOY_FIELD_LIMIT) throw new RangeError(`${op}: p = ${c.p} is not a toy field; enumeration is only offered up to ${TOY_FIELD_LIMIT}`);
}

/** Every affine point of a toy curve, by brute force over x with the Legendre symbol (x ascending, then y). */
export function allPoints(c: Curve): AffinePoint[] {
  assertToy('allPoints', c);
  const F = c.field;
  const out: AffinePoint[] = [];
  for (let x = 0n; x < c.p; x++) {
    const rhs = F.add(F.add(F.mul(F.mul(x, x), x), F.mul(c.a, x)), c.b);
    const y = F.sqrt(rhs);
    if (y === null) continue;
    out.push({ x, y });
    if (y !== 0n) out.push({ x, y: c.p - y });
  }
  return out.sort((P, Q) => (P.x === Q.x ? (P.y < Q.y ? -1 : 1) : P.x < Q.x ? -1 : 1));
}

/** The group order N of a toy curve: affine points plus O. */
export const pointCount = (c: Curve): bigint => BigInt(allPoints(c).length) + 1n;

/** floor(2·sqrt(p)): the Hasse bound, as an exact integer (|N - (p + 1)| ≤ 2√p ⟺ |N - (p + 1)| ≤ this). */
export const hasseBound = (p: bigint): bigint => isqrt(4n * p);

/** Whether a group order N respects the Hasse bound for F_p. */
export const hasseHolds = (p: bigint, N: bigint): boolean => {
  const d = N - (p + 1n);
  return (d < 0n ? -d : d) <= hasseBound(p);
};

/** The order of P on a toy curve: the least m ≥ 1 with m·P = O, by repeated addition. O has order 1. */
export function orderOf(c: Curve, P: Point): bigint {
  assertToy('orderOf', c);
  assertOn('orderOf', 1, c, P);
  let R: Point = P;
  let m = 1n;
  while (R !== null) {
    R = add(c, R, P);
    m++;
  }
  return m;
}

/** What the live P-256 cross-check reports. */
export interface P256CrossCheck {
  /** Our d·G equals the browser's public point. A false here is a bug report, never expected. */
  equal: boolean;
  /** Bit length of the private scalar d. */
  bits: number;
  doublings: number;
  additions: number;
  /** First 8 hex digits of the browser's public x (the only part of the key the page may show). */
  publicXPrefix: string;
}

/**
 * Generates a P-256 ECDH key pair with `crypto.subtle` (extractable, so d is readable), computes d·G
 * with this module and compares it to the browser's public point. Null without crypto.subtle. The key
 * is never used for anything and the caller should show only these summary fields.
 */
export async function crossCheckP256(): Promise<P256CrossCheck | null> {
  const pair = await ecdhKeyPair({ extractable: true });
  if (!pair) return null;
  const d = (await exportPrivateScalar(pair.privateKey))!;
  const pub = (await exportPublicPoint(pair.publicKey))!;
  const { point, doublings, additions } = mul(P256, d, P256.G);
  return {
    equal: point !== null && point.x === pub.x && point.y === pub.y,
    bits: d.toString(2).length,
    doublings,
    additions,
    publicXPrefix: pub.x.toString(16).padStart(64, '0').slice(0, 8),
  };
}
