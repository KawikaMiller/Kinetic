/** A point with integer coordinates (exact in doubles while products stay below 2^53). */
export interface P {
  x: number;
  y: number;
}

export type Policy = 'drop' | 'keep';
export type Algo = 'graham' | 'andrew' | 'jarvis';

/** An orientation predicate: positive for a left turn, negative for a right turn, zero for collinear. */
export type Orient = (o: P, a: P, b: P) => number;

/** Counts orientation tests (cross-product sign evaluations), the unit the comparison panel uses. */
export interface Tally {
  orientations: number;
  /** When present, the algorithm appends what it does, so a stepper can narrate the real run. */
  events?: HullEvent[];
}

/** What a hull algorithm did, in order. A test's `value` is the cross product; `pop` says the stack lost its top. */
export type HullEvent =
  | { kind: 'pivot'; pivot: P; sorted: P[]; sortTests: number }
  | { kind: 'chain'; name: 'lower' | 'upper' }
  | { kind: 'test'; a: P; b: P; c: P; value: number; pop: boolean }
  | { kind: 'push'; p: P; stack: P[] }
  | { kind: 'wrap-start'; start: P }
  | { kind: 'wrap-test'; cur: P; best: P; p: P; value: number; replace: boolean }
  | { kind: 'wrap-edge'; from: P; to: P };

/** Twice the signed area of the triangle o, a, b: positive when o -> a -> b turns left (counter-clockwise), zero when collinear. */
export const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const counted = (t: Tally | undefined, o: P, a: P, b: P): number => {
  if (t) t.orientations++;
  return cross(o, a, b);
};

const same = (a: P, b: P) => a.x === b.x && a.y === b.y;
const lowestLeft = (a: P, b: P) => a.y - b.y || a.x - b.x;
const leftLow = (a: P, b: P) => a.x - b.x || a.y - b.y;
const dist2 = (a: P, b: P) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Distinct points only, in first-seen order. */
export const dedupe = (pts: readonly P[]): P[] => pts.filter((p, i) => pts.findIndex((q) => same(p, q)) === i);

/** Merge sort: each comparison in Graham's angle sort is an orientation test, counted by the comparator itself. */
function sortCounted(items: P[], cmp: (a: P, b: P) => number): P[] {
  if (items.length <= 1) return items;
  const mid = items.length >> 1;
  const a = sortCounted(items.slice(0, mid), cmp);
  const b = sortCounted(items.slice(mid), cmp);
  const out: P[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (cmp(a[i], b[j]) <= 0) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return [...out, ...a.slice(i), ...b.slice(j)];
}

/** Rotate a counter-clockwise polygon so it starts at the lowest point, leftmost among ties. */
export function startAtLowestLeft(poly: readonly P[]): P[] {
  if (poly.length === 0) return [];
  let at = 0;
  poly.forEach((p, i) => {
    if (lowestLeft(p, poly[at]) < 0) at = i;
  });
  return [...poly.slice(at), ...poly.slice(0, at)];
}

const allCollinear = (pts: readonly P[], orient: Orient) => pts.every((p) => orient(pts[0], pts[1], p) === 0);

/** Fewer than three distinct points, or all on one line: no polygon, so the answer is the points themselves (the ends, or all by policy). */
function degenerate(pts: P[], policy: Policy, orient: Orient = cross): P[] | null {
  if (pts.length < 3) return [...pts].sort(lowestLeft);
  if (!allCollinear(pts, orient)) return null;
  const line = [...pts].sort(leftLow);
  return policy === 'keep' ? line : [line[0], line[line.length - 1]];
}

/** Graham scan: pivot, sort by angle (ties by distance), then keep a stack, popping while the last two and the new point do not turn left. */
export function graham(input: readonly P[], policy: Policy = 'drop', tally?: Tally): P[] {
  const pts = dedupe(input);
  const flat = degenerate(pts, policy);
  if (flat) return flat;
  const pivot = pts.reduce((best, p) => (lowestLeft(p, best) < 0 ? p : best));
  const rest = pts.filter((p) => !same(p, pivot));
  const byAngle = (a: P, b: P) => {
    const c = counted(tally, pivot, a, b);
    return c > 0 ? -1 : c < 0 ? 1 : dist2(pivot, a) - dist2(pivot, b);
  };
  let sorted = sortCounted(rest, byAngle);
  if (policy === 'keep') {
    // the points on the last ray must be walked from the far end, or the last edge skips its middle points
    let k = sorted.length - 1;
    while (k > 0 && cross(pivot, sorted[k - 1], sorted[sorted.length - 1]) === 0) k--;
    sorted = [...sorted.slice(0, k), ...sorted.slice(k).reverse()];
  }
  tally?.events?.push({ kind: 'pivot', pivot, sorted, sortTests: tally?.orientations ?? 0 });
  const stack: P[] = [pivot];
  for (const p of sorted) {
    while (stack.length >= 2) {
      const [a, b] = [stack[stack.length - 2], stack[stack.length - 1]];
      const c = counted(tally, a, b, p);
      const pop = policy === 'drop' ? c <= 0 : c < 0;
      tally?.events?.push({ kind: 'test', a, b, c: p, value: c, pop });
      if (pop) stack.pop();
      else break;
    }
    stack.push(p);
    tally?.events?.push({ kind: 'push', p, stack: [...stack] });
  }
  return startAtLowestLeft(stack);
}

/** Andrew's monotone chain: sort by x then y, build the lower hull and the upper hull with the same pop rule, join them. */
export function andrew(input: readonly P[], policy: Policy = 'drop', tally?: Tally, orient: Orient = cross): P[] {
  const pts = dedupe(input);
  const flat = degenerate(pts, policy, orient);
  if (flat) return flat;
  const sorted = [...pts].sort(leftLow);
  const chain = (list: readonly P[], name: 'lower' | 'upper') => {
    tally?.events?.push({ kind: 'chain', name });
    const out: P[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        if (tally) tally.orientations++;
        const [a, b] = [out[out.length - 2], out[out.length - 1]];
        const c = orient(a, b, p);
        const pop = policy === 'drop' ? c <= 0 : c < 0;
        tally?.events?.push({ kind: 'test', a, b, c: p, value: c, pop });
        if (pop) out.pop();
        else break;
      }
      out.push(p);
      tally?.events?.push({ kind: 'push', p, stack: [...out] });
    }
    out.pop();
    return out;
  };
  return startAtLowestLeft([...chain(sorted, 'lower'), ...chain([...sorted].reverse(), 'upper')]);
}

/** Gift wrapping (Jarvis): from the leftmost point, repeatedly take the point that leaves every other point on its left. */
export function jarvis(input: readonly P[], policy: Policy = 'drop', tally?: Tally): P[] {
  const pts = dedupe(input);
  const flat = degenerate(pts, policy);
  if (flat) return flat;
  const start = pts.reduce((best, p) => (leftLow(p, best) < 0 ? p : best));
  const out: P[] = [];
  let cur = start;
  tally?.events?.push({ kind: 'wrap-start', start });
  do {
    out.push(cur);
    // points already on the hull cannot come next (this also keeps a collinear point behind us from winning a tie), except the start, which closes the loop
    const candidates = pts.filter((p) => !same(p, cur) && (same(p, start) || !out.some((o) => same(o, p))));
    const prev = out.length > 1 ? out[out.length - 2] : null;
    const dot = (a: P, b: P, o: P) => (a.x - o.x) * (b.x - o.x) + (a.y - o.y) * (b.y - o.y);
    let next = candidates[0];
    for (const p of candidates) {
      if (same(p, next)) continue;
      const c = counted(tally, cur, next, p);
      const before = next;
      if (c < 0) next = p;
      else if (c === 0 && dot(next, p, cur) < 0) {
        // on opposite sides of cur along one line: the one that carries on in the direction we arrived in
        if (prev && dot(p, { x: 2 * cur.x - prev.x, y: 2 * cur.y - prev.y }, cur) > 0) next = p;
      } else if (c === 0) {
        const farther = dist2(cur, p) > dist2(cur, next);
        if (policy === 'drop' ? farther : !farther) next = p;
      }
      tally?.events?.push({ kind: 'wrap-test', cur, best: before, p, value: c, replace: next !== before });
    }
    tally?.events?.push({ kind: 'wrap-edge', from: cur, to: next });
    cur = next;
  } while (!same(cur, start) && out.length <= pts.length);
  return startAtLowestLeft(out);
}

export const HULLS: Record<Algo, (pts: readonly P[], policy?: Policy, tally?: Tally) => P[]> = { graham, andrew, jarvis };

/** Orientation tests an algorithm spends on a point set. */
export function countOrientations(algo: Algo, pts: readonly P[], policy: Policy = 'drop'): number {
  const tally: Tally = { orientations: 0 };
  HULLS[algo](pts, policy, tally);
  return tally.orientations;
}
