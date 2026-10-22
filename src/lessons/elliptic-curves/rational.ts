/** Exact fractions on bigint for the real-plane group law: the drawing is a float, every number shown is one of these. */
export interface Rat {
  readonly n: bigint;
  readonly d: bigint;
}

const gcdBig = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
};

/** n / d in lowest terms with a positive denominator. */
export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new RangeError('rat: zero denominator');
  const g = gcdBig(n, d) || 1n;
  const s = d < 0n ? -1n : 1n;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const ratAdd = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
export const ratDiv = (a: Rat, b: Rat): Rat => rat(a.n * b.d, a.d * b.n);
export const ratNeg = (a: Rat): Rat => ({ n: -a.n, d: a.d });
export const ratEq = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d;
export const ratIsZero = (a: Rat): boolean => a.n === 0n;
export const ratToNumber = (a: Rat): number => Number(a.n) / Number(a.d);

/** "5", "-3/2". */
export const ratText = (a: Rat): string => (a.d === 1n ? String(a.n) : `${a.n}/${a.d}`);
