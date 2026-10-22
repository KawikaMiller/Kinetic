import {
  P256, TOY_F17, add, addWithWorking, allPoints, curveSides, formatPoint, hasseBound, mul, neg, onCurve, samePoint, weierstrass,
  type AddRule, type AffinePoint, type Curve, type CurveParams, type Point,
} from '../../core/ecc';
import { isqrt } from '../../core/numberTheory';
import { rat, ratAdd, ratDiv, ratEq, ratIsZero, ratMul, ratNeg, ratSub, ratText, ratToNumber, type Rat } from './rational';

/* ── Scene 1: the real plane, exact fractions ─────────────────────────────── */

export const A_MIN = -5;
export const A_MAX = 5;
export const B_MIN = -5;
export const B_MAX = 5;
/** The window the plot shows; integer points outside it are not offered. */
export const REAL_X: readonly [number, number] = [-5, 8];
export const REAL_Y: readonly [number, number] = [-16, 16];

export interface RealCurve {
  a: number;
  b: number;
}
/** A point with exact rational coordinates; null is the point at infinity O. */
export interface RealPoint {
  x: Rat;
  y: Rat;
}
export type RealPointOrO = RealPoint | null;

export const DEFAULT_REAL: RealCurve = { a: -2, b: 1 };

export const discriminant = (c: RealCurve): number => 4 * c.a ** 3 + 27 * c.b ** 2;
export const isSingularReal = (c: RealCurve): boolean => discriminant(c) === 0;

export const SINGULAR_REFUSAL = '4a^3 + 27b^2 = 0: the curve has a sharp point where the tangent is not defined, so it is not an elliptic curve';

/** The right-hand side x^3 + ax + b at a rational x. */
const rhsAt = (c: RealCurve, x: Rat): Rat => ratAdd(ratAdd(ratMul(ratMul(x, x), x), ratMul(rat(BigInt(c.a)), x)), rat(BigInt(c.b)));

export function onRealCurve(c: RealCurve, P: RealPointOrO): boolean {
  if (P === null) return true;
  return ratEq(ratMul(P.y, P.y), rhsAt(c, P.x));
}

/** Every point with integer coordinates inside the plot window, sorted by x then y. */
export function integerPoints(c: RealCurve): RealPoint[] {
  const found: RealPoint[] = [];
  for (let x = REAL_X[0]; x <= REAL_X[1]; x++) {
    const f = BigInt(x ** 3 + c.a * x + c.b);
    if (f < 0n) continue;
    const s = isqrt(f);
    if (s * s !== f) continue;
    const ys = s === 0n ? [0n] : [-s, s];
    for (const y of ys) if (Number(y) >= REAL_Y[0] && Number(y) <= REAL_Y[1]) found.push({ x: rat(BigInt(x)), y: rat(y) });
  }
  return found;
}

export interface RealSum {
  result: RealPointOrO;
  rule: AddRule;
  /** The slope of the chord or tangent; null for O's rules (vertical line) and when O is an operand. */
  slope: Rat | null;
}

/** P + Q on the real curve by the chord-and-tangent rule, in exact fractions. */
export function realAdd(c: RealCurve, P: RealPointOrO, Q: RealPointOrO): RealSum {
  if (P === null) return { result: Q, rule: 'identity-left', slope: null };
  if (Q === null) return { result: P, rule: 'identity-right', slope: null };
  const same = ratEq(P.x, Q.x) && ratEq(P.y, Q.y);
  if (ratEq(P.x, Q.x) && !same) return { result: null, rule: 'inverse', slope: null };
  if (same && ratIsZero(P.y)) return { result: null, rule: 'vertical-tangent', slope: null };
  const slope = same
    ? ratDiv(ratAdd(ratMul(rat(3n), ratMul(P.x, P.x)), rat(BigInt(c.a))), ratMul(rat(2n), P.y))
    : ratDiv(ratSub(Q.y, P.y), ratSub(Q.x, P.x));
  const x3 = ratSub(ratSub(ratMul(slope, slope), P.x), Q.x);
  const y3 = ratSub(ratMul(slope, ratSub(P.x, x3)), P.y);
  return { result: { x: x3, y: y3 }, rule: same ? 'double' : 'add', slope };
}

export const realNeg = (P: RealPointOrO): RealPointOrO => (P === null ? null : { x: P.x, y: ratNeg(P.y) });

export const realPointText = (P: RealPointOrO): string => (P === null ? 'O' : `(${ratText(P.x)}, ${ratText(P.y)})`);

export const realPointFloat = (P: RealPoint): [number, number] => [ratToNumber(P.x), ratToNumber(P.y)];

/** The sentence under the plot: which rule produced the sum, with the exact numbers. */
export function realWorkingText(c: RealCurve, P: RealPointOrO, Q: RealPointOrO): string {
  const s = realAdd(c, P, Q);
  const sum = realPointText(s.result);
  switch (s.rule) {
    case 'identity-left':
    case 'identity-right':
      return `O is the identity: ${realPointText(P)} + ${realPointText(Q)} = ${sum}.`;
    case 'inverse':
      return `${realPointText(P)} and ${realPointText(Q)} are opposite points (same x, opposite y): the line through them is vertical, so the sum is the point at infinity O, the identity.`;
    case 'vertical-tangent':
      return `${realPointText(P)} has y = 0, so its tangent is vertical: 2P = O, and P has order 2.`;
    case 'double':
      return `Tangent at ${realPointText(P)}: slope (3x^2 + a) / 2y = ${ratText(s.slope!)}. The line meets the curve again at the reflection of ${sum}, so 2P = ${sum}.`;
    default: {
      const base = `Chord through ${realPointText(P)} and ${realPointText(Q)}: slope ${ratText(s.slope!)}. The line meets the curve a third time at the reflection of ${sum}, so P + Q = ${sum}.`;
      const third = realPointText(realNeg(s.result!));
      const touched = third === realPointText(P) ? 'P' : third === realPointText(Q) ? 'Q' : null;
      return touched ? `${base} Here that third point is ${touched} itself ${third}: the line is tangent to the curve at ${touched}, so the three intersections are ${touched} twice and the point drawn on the line.` : base;
    }
  }
}

/** Order of a real point by repeated addition, or null when no multiple up to `limit` is O (rational points can have infinite order). */
/** The largest multiple tried is REAL_ORDER_LIMIT + 1: realOrder tests mP for m = 1..13. */
export const REAL_ORDER_LIMIT = 12;
export function realOrder(c: RealCurve, P: RealPoint, limit = REAL_ORDER_LIMIT): number | null {
  let R: RealPointOrO = P;
  for (let m = 1; m <= limit; m++) {
    if (R === null) return m;
    R = realAdd(c, R, P).result;
  }
  return R === null ? limit + 1 : null;
}

/* ── Scene 2: the same law over a finite field ────────────────────────────── */

export const FIELD_PRIMES: readonly number[] = [11, 13, 17, 19, 23];
export const DEFAULT_FIELD = { p: 17, a: 2, b: 2 } as const;

export interface FieldCurveSpec {
  p: number;
  a: number;
  b: number;
}

/** The curve over F_p; a singular one is allowed here because the lesson shows its failing group law on purpose. */
export const fieldCurve = (s: FieldCurveSpec): Curve => weierstrass(`F${s.p}`, BigInt(s.p), BigInt(s.a), BigInt(s.b), { allowSingular: true });

export const isSingularField = (s: FieldCurveSpec): boolean => (4 * s.a ** 3 + 27 * s.b ** 2) % s.p === 0;

export const fieldEquation = (s: FieldCurveSpec): string => `y^2 = x^3 + ${s.a}x + ${s.b} mod ${s.p}`;

export type PointClaim = { ok: true; point: AffinePoint } | { ok: false; message: string };

/** A clicked cell (x, y): the point, or a refusal naming both sides of the equation. */
export function claimField(s: FieldCurveSpec, x: number, y: number): PointClaim {
  const c = fieldCurve(s);
  const P = { x: BigInt(x), y: BigInt(y) };
  if (onCurve(c, P)) return { ok: true, point: P };
  const { lhs, rhs } = curveSides(c, P);
  return { ok: false, message: `(${x}, ${y}): y^2 = ${lhs} but x^3 + ${s.a}x + ${s.b} = ${rhs} mod ${s.p}, not on the curve` };
}

export interface Picks {
  P: AffinePoint | null;
  Q: AffinePoint | null;
}
export const NO_PICKS: Picks = { P: null, Q: null };

/** The click rule: the first click is P, the second is Q (the same cell again doubles P), a third click starts over with a new P. */
export const nextPicks = (picks: Picks, point: AffinePoint): Picks => (picks.P && !picks.Q ? { P: picks.P, Q: point } : { P: point, Q: null });

export interface FieldSum {
  result: Point;
  rule: AddRule;
  /** Working lines for the console: slope as a fraction, its inverse, then x3 and y3. */
  lines: string[];
}

/** P + Q over F_p with the working written out line by line. */
export function fieldSum(s: FieldCurveSpec, P: AffinePoint | null, Q: AffinePoint | null): FieldSum {
  const c = fieldCurve(s);
  const w = addWithWorking(c, P, Q);
  const p = c.p;
  const lines: string[] = [];
  if (w.rule === 'identity-left' || w.rule === 'identity-right') {
    lines.push(`O is the identity, so the sum is ${formatPoint(w.result)}`);
  } else if (w.rule === 'inverse') {
    lines.push(`same x = ${P!.x} and opposite y: ${P!.y} + ${Q!.y} = ${p} = 0 mod ${p}`, 'the line is vertical, so the sum is the point at infinity O');
  } else if (w.rule === 'vertical-tangent') {
    lines.push(`y = 0, so the tangent is vertical: the sum is the point at infinity O`);
  } else {
    const dbl = w.rule === 'double';
    lines.push(
      dbl
        ? `slope = (3x^2 + a) / (2y) = (3*${P!.x}^2 + ${s.a}) / (2*${P!.y}) = ${w.num} / ${w.den} mod ${p}`
        : `slope = (y2 - y1) / (x2 - x1) = (${Q!.y} - ${P!.y}) / (${Q!.x} - ${P!.x}) = ${w.num} / ${w.den} mod ${p}`,
      `${w.den}^-1 = ${w.inverse} mod ${p}`,
      `slope = ${w.num} * ${w.inverse} = ${w.slope} mod ${p}`,
      `x3 = slope^2 - x1 - x2 = ${w.result!.x} mod ${p}`,
      `y3 = slope * (x1 - x3) - y1 = ${w.result!.y} mod ${p}`,
    );
  }
  return { result: w.result, rule: w.rule, lines };
}

export interface GroupCheck {
  /** Affine points plus O. */
  order: number;
  triples: number;
  ok: boolean;
  /** The first failing check in a fixed order, or null when everything holds. */
  failure: null | { kind: 'closure' | 'identity' | 'inverse' | 'associativity'; text: string };
}

/** The point list of a curve with O first, and the index of each. */
function groupElements(c: Curve): { elements: Point[]; index: Map<string, number> } {
  const elements: Point[] = [null, ...allPoints(c)];
  const index = new Map(elements.map((P, i) => [formatPoint(P), i]));
  return { elements, index };
}

/**
 * Closure, identity, inverses and associativity over every pair and triple of the curve's points
 * (affine points plus O): N^3 triples, by an addition table. On a curve with a sharp point the same
 * check reports the first failure instead of "holds".
 */
export function checkGroupLaw(s: FieldCurveSpec): GroupCheck {
  const c = fieldCurve(s);
  const { elements, index } = groupElements(c);
  const N = elements.length;
  const table: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      const sum = add(c, elements[i], elements[j]);
      const k = index.get(formatPoint(sum));
      if (k === undefined) {
        return { order: N, triples: N ** 3, ok: false, failure: { kind: 'closure', text: `${formatPoint(elements[i])} + ${formatPoint(elements[j])} = ${formatPoint(sum)} is not one of the curve's ${N} points` } };
      }
      row.push(k);
    }
    table.push(row);
  }
  for (let i = 0; i < N; i++) {
    if (table[0][i] !== i || table[i][0] !== i) {
      return { order: N, triples: N ** 3, ok: false, failure: { kind: 'identity', text: `O + ${formatPoint(elements[i])} is not ${formatPoint(elements[i])}` } };
    }
    const inverse = index.get(formatPoint(neg(c, elements[i])))!;
    if (table[i][inverse] !== 0) {
      return { order: N, triples: N ** 3, ok: false, failure: { kind: 'inverse', text: `${formatPoint(elements[i])} + ${formatPoint(elements[inverse])} is not O` } };
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const left = table[table[i][j]][k];
        const right = table[i][table[j][k]];
        if (left !== right) {
          const [P, Q, R] = [elements[i], elements[j], elements[k]].map(formatPoint);
          return {
            order: N,
            triples: N ** 3,
            ok: false,
            failure: { kind: 'associativity', text: `(${P} + ${Q}) + ${R} = ${formatPoint(elements[left])} but ${P} + (${Q} + ${R}) = ${formatPoint(elements[right])}` },
          };
        }
      }
    }
  }
  return { order: N, triples: N ** 3, ok: true, failure: null };
}

export interface CurveFacts {
  /** Affine points plus O, by brute force over every (x, y). */
  count: number;
  /** [p + 1 - 2 sqrt(p), p + 1 + 2 sqrt(p)], with the integer part of 2 sqrt(p). */
  hasse: { lo: number; hi: number; width: number };
}

/** The point count and the Hasse interval of a curve in the picker. */
export function curveFacts(s: FieldCurveSpec): CurveFacts {
  const c = fieldCurve(s);
  const count = allPoints(c).length + 1;
  const width = Number(hasseBound(c.p));
  return { count, hasse: { lo: s.p + 1 - width, hi: s.p + 1 + width, width } };
}

/** The 2 sqrt(p) of the Hasse bound as a decimal, for the sentence "|N - (p + 1)| <= 2 sqrt(p) = 8.25". */
export const hasseDecimal = (p: number): string => (2 * Math.sqrt(p)).toFixed(2);

/* ── Scene 3: scalar multiplication on the toy curve ──────────────────────── */

export const TOY: CurveParams = TOY_F17;
export const SCALAR_MAX = 1_000_000;
export const WALK_REFUSAL = 'this search is only offered for toy sizes';
/** The made-up search speed of the cost line, in steps per second. */
export const ILLUSTRATIVE_RATE = 1e12;
export const SECONDS_PER_YEAR = 3.156e7;

export interface ScalarView {
  k: bigint;
  /** k reduced mod the group order: kG = (k mod n)G. */
  reduced: bigint;
  point: Point;
  doublings: number;
  additions: number;
  /** The scalar in binary, leading bit first. */
  bits: string;
}

export function scalarView(k: bigint): ScalarView {
  const r = mul(TOY, k, TOY.G);
  return { k, reduced: k % TOY.n, point: r.point, doublings: r.doublings, additions: r.additions, bits: k === 0n ? '0' : k.toString(2) };
}

/** The trace as lines: "start G", "double: 2G", "add G: 3G", each with the running point and its multiple. */
export function traceLines(k: bigint): string[] {
  const r = mul(TOY, k, TOY.G);
  let multiple = 0n;
  return r.steps.map((st) => {
    if (st.op === 'start') multiple = 1n;
    else if (st.op === 'double') multiple *= 2n;
    else multiple += 1n;
    const label = st.op === 'start' ? 'start at G' : st.op === 'double' ? 'double' : 'add G';
    return `bit ${st.bitIndex + 1} = ${st.bit}: ${label} -> ${multiple}G = ${formatPoint(st.result)}`;
  });
}

/** For every pair k1, k2 in 0..n-1: k1(k2 G), k2(k1 G) and (k1 k2) G agree. Returns how many pairs were checked and how many agreed. */
export function commutativityChecks(): { checked: number; agreed: number } {
  const n = Number(TOY.n);
  let agreed = 0;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const aG = mul(TOY, BigInt(a), TOY.G).point;
      const bG = mul(TOY, BigInt(b), TOY.G).point;
      const left = mul(TOY, BigInt(a), bG).point;
      const right = mul(TOY, BigInt(b), aG).point;
      const direct = mul(TOY, BigInt(a * b), TOY.G).point;
      if (samePoint(left, right) && samePoint(left, direct)) agreed++;
    }
  }
  return { checked: n * n, agreed };
}

export interface Walk {
  /** The k found: Q = kG, with 1 <= k <= n. */
  k: bigint;
  /** Additions of G made, which is the counter on screen. */
  steps: number;
}

/** Find k from Q = kG by walking G, 2G, 3G, ... Offered only for the toy curve: at most n steps. */
export function walkToReverse(c: CurveParams, Q: Point): Walk {
  if (!c.toy) throw new RangeError(WALK_REFUSAL);
  let R: Point = c.G;
  let steps = 0;
  for (let k = 1n; k <= c.n; k++) {
    steps++;
    if (samePoint(R, Q)) return { k, steps };
    R = add(c, R, c.G);
  }
  throw new RangeError('walkToReverse: Q is not a multiple of G');
}

export interface CostLine {
  /** Generic-search steps, about the square root of the group order. */
  steps: bigint;
  /** log2 of the steps, rounded. */
  log2: number;
  seconds: number;
}

/** The generic-method cost of the discrete-logarithm search in a group of order n: about sqrt(n) steps at the made-up rate. */
export function genericCost(n: bigint): CostLine {
  const steps = isqrt(n);
  return { steps, log2: Math.round(Math.log2(Number(steps))), seconds: Number(steps) / ILLUSTRATIVE_RATE };
}

export const P256_COST: CostLine = genericCost(P256.n);

/** Years for the P-256 line at the made-up rate, as a number. */
export const p256Years = (): number => P256_COST.seconds / SECONDS_PER_YEAR;

/** A group's size in bits: log2 of the order. */
export const groupBits = (n: bigint): string => Math.log2(Number(n)).toFixed(1);

/* ── The broken doubling: the tangent slope without its factor 2 ──────────── */

export type DoublingRule = 'correct' | 'forgot-factor-2';
/** The smallest multiple that goes wrong: 2G is the first doubling, and every k of 2 or more starts with it (a deterministic witness, no seed). */
export const FORGOT_FACTOR_2_WITNESS = 2n;

/** 2P with the tangent slope (3x^2 + a) / y: the denominator lost its 2. The result is a pair of residues that need not lie on the curve. */
function doubleForgotFactor2(c: Curve, P: AffinePoint): AffinePoint {
  const F = c.field;
  const slope = F.div(F.add(F.mul(3n, F.mul(P.x, P.x)), c.a), P.y);
  const x3 = F.sub(F.mul(slope, slope), F.mul(2n, P.x));
  return { x: x3, y: F.sub(F.mul(slope, F.sub(P.x, x3)), P.y) };
}

export interface CheckedMul {
  point: Point;
  /** The first multiple whose point is not on the curve, with the refusal text; null when every step stayed on the curve. */
  failure: null | { multiple: bigint; point: AffinePoint; message: string };
}

/** kG by double-and-add on the toy curve with the chosen doubling rule, checking after each step that the point is on the curve. */
export function mulChecked(rule: DoublingRule, k: bigint): CheckedMul {
  if (k === 0n) return { point: null, failure: null };
  const bits = k.toString(2);
  let R: Point = TOY.G;
  let multiple = 1n;
  for (let i = 1; i < bits.length; i++) {
    const next: Point = R === null ? null : rule === 'correct' ? add(TOY, R, R) : R.y === 0n ? null : doubleForgotFactor2(TOY, R);
    multiple *= 2n;
    const bad = offCurve(next);
    if (bad) return { point: next, failure: { multiple, point: bad, message: refusalText(bad, multiple) } };
    R = next;
    if (bits[i] === '1') {
      R = add(TOY, R, TOY.G);
      multiple += 1n;
    }
  }
  return { point: R, failure: null };
}

const offCurve = (P: Point): AffinePoint | null => (P !== null && !onCurve(TOY, P) ? P : null);

function refusalText(P: AffinePoint, multiple: bigint): string {
  const { lhs, rhs } = curveSides(TOY, P);
  return `result is not on the curve: ${multiple}G came out as ${formatPoint(P)}, where y^2 = ${lhs} but x^3 + 2x + 2 = ${rhs} mod 17`;
}

/* ── Scene 4: known answers ───────────────────────────────────────────────── */

export const KNOWN_MULTIPLES: readonly bigint[] = [2n, 3n];

/** The first 8 hex digits of the x-coordinate of kG on P-256, computed here. */
export function p256XPrefix(k: bigint): string {
  const P = mul(P256, k, P256.G).point;
  return P ? P.x.toString(16).padStart(64, '0').slice(0, 8) : 'O';
}

/* ── the scalar scene's words, derived from the model state ───────────────── */

export const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

export interface ScalarText {
  intro: string;
  doublings: { value: string | number; sub: string };
  additions: { value: string | number; sub: string };
  /** The forward cost line. */
  forward: string;
  /** A hint for the broken-rule toggle when it changes nothing (k below 2). */
  note: string | null;
}

/** Every sentence and count of the scalar scene for one (rule, k): a failed doubling blanks the counts of the correct rule instead of printing them beside "not on the curve". */
export function scalarText(rule: DoublingRule, k: bigint): ScalarText {
  const view = scalarView(k);
  const broken = mulChecked(rule, k).failure !== null;
  if (broken) {
    return {
      intro: `With the 2 forgotten, ${k}G is not on the curve: the first doubling already goes wrong (shown below).`,
      doublings: { value: '–', sub: 'the broken rule fails at the first doubling' },
      additions: { value: '–', sub: 'the broken rule fails at the first doubling' },
      forward: 'with the broken tangent slope the multiplication stops at its first doubling, so there is no cost to count',
      note: null,
    };
  }
  return {
    intro: `${k}G = ${formatPoint(view.point)}: ${plural(view.doublings, 'doubling')} and ${plural(view.additions, 'addition')}, and ${k} mod ${TOY.n} = ${view.reduced} gives the same point.`,
    doublings: { value: view.doublings, sub: 'left to right over the bits' },
    additions: { value: view.additions, sub: 'one per 1 bit after the first' },
    forward: `${plural(view.doublings + view.additions, 'group operation')} for k = ${k}`,
    note: rule === 'forgot-factor-2' ? 'k = 0 or 1 needs no doubling, so this rule cannot go wrong here: try k = 2 or more.' : null,
  };
}
