/**
 * Real divide-and-conquer algorithms with operation counters, so the presets' bounds are
 * checked against work actually done, not just against the recurrence.
 */

/** Binary search for a value larger than everything (the worst case): probes made. */
export function binarySearchProbes(n: number): number {
  const a = Array.from({ length: n }, (_, i) => i);
  const target = n;
  let lo = 0;
  let hi = n - 1;
  let probes = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    probes++;
    if (a[mid] === target) break;
    if (a[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return probes;
}

/** Merge sort on a real array: element writes made by the merges, and the sorted result. */
export function mergeSortWrites(input: readonly number[]): { writes: number; sorted: number[] } {
  let writes = 0;
  const sort = (xs: number[]): number[] => {
    if (xs.length <= 1) return xs;
    const mid = xs.length >> 1;
    const l = sort(xs.slice(0, mid));
    const r = sort(xs.slice(mid));
    const out: number[] = [];
    let i = 0;
    let j = 0;
    while (i < l.length || j < r.length) {
      out.push(j >= r.length || (i < l.length && l[i] <= r[j]) ? l[i++] : r[j++]);
      writes++;
    }
    return out;
  };
  const sorted = sort([...input]);
  return { writes, sorted };
}

/** Karatsuba on little-endian base-10 digit arrays of equal power-of-two length: base-case products made (3^K for 2^K digits). */
export function karatsuba(x: readonly number[], y: readonly number[]): { product: bigint; mults: number } {
  let mults = 0;
  const toBig = (d: readonly number[]) => d.reduceRight((acc, v) => acc * 10n + BigInt(v), 0n);
  const rec = (a: bigint, b: bigint, len: number): bigint => {
    if (len === 1) {
      mults++;
      return a * b;
    }
    const half = len / 2;
    const base = 10n ** BigInt(half);
    const [a1, a0] = [a / base, a % base];
    const [b1, b0] = [b / base, b % base];
    const hi = rec(a1, b1, half);
    const lo = rec(a0, b0, half);
    // a1 + a0 can carry into an extra digit; splitting still works (a = a1·base + a0 for any a),
    // so the count is exact; a base-case product can be of small numbers a little past one digit.
    const mid = rec(a1 + a0, b1 + b0, half) - hi - lo;
    return hi * base * base + mid * base + lo;
  };
  const len = x.length;
  return { product: rec(toBig(x), toBig(y), len), mults };
}

type Matrix = number[][];

const add = (A: Matrix, B: Matrix, sign = 1): Matrix => A.map((row, i) => row.map((v, j) => v + sign * B[i][j]));

/** Strassen's algorithm on n × n matrices, n a power of two: scalar multiplications made. */
export function strassen(A: Matrix, B: Matrix): { C: Matrix; mults: number } {
  let mults = 0;
  const rec = (X: Matrix, Y: Matrix): Matrix => {
    const n = X.length;
    if (n === 1) {
      mults++;
      return [[X[0][0] * Y[0][0]]];
    }
    const h = n / 2;
    const q = (M: Matrix, r: number, c: number) => M.slice(r * h, r * h + h).map((row) => row.slice(c * h, c * h + h));
    const [a, b, c, d] = [q(X, 0, 0), q(X, 0, 1), q(X, 1, 0), q(X, 1, 1)];
    const [e, f, g, k] = [q(Y, 0, 0), q(Y, 0, 1), q(Y, 1, 0), q(Y, 1, 1)];
    const m1 = rec(add(a, d), add(e, k));
    const m2 = rec(add(c, d), e);
    const m3 = rec(a, add(f, k, -1));
    const m4 = rec(d, add(g, e, -1));
    const m5 = rec(add(a, b), k);
    const m6 = rec(add(c, a, -1), add(e, f));
    const m7 = rec(add(b, d, -1), add(g, k));
    const c11 = add(add(m1, m4), add(m7, m5, -1));
    const c12 = add(m3, m5);
    const c21 = add(m2, m4);
    const c22 = add(add(m1, m2, -1), add(m3, m6));
    return [...c11.map((row, i) => [...row, ...c12[i]]), ...c21.map((row, i) => [...row, ...c22[i]])];
  };
  return { C: rec(A, B), mults };
}
