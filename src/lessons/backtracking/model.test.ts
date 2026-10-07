import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import lesson from './index';
import { queensFrames, STEP_CAP, subsetFrames, TREE_CAP, type BtFrame } from './frames';
import { MAX_DRAWN_N, MAX_N, MIN_N, runQueens, runSubsets, solveQueens, unprunedVisits, unprunedVisitsAt } from './model';

/** Published N-Queens solution counts (OEIS A000170). */
const KNOWN_SOLUTIONS: Record<number, number> = { 4: 2, 5: 10, 6: 4, 7: 40, 8: 92 };

/** Independent checker: columns, ↘ diagonals (r - c) and ↗ diagonals (r + c) all distinct. */
function independentOk(board: readonly number[]): boolean {
  const cols = new Set(board);
  const down = new Set(board.map((c, r) => r - c));
  const up = new Set(board.map((c, r) => r + c));
  return cols.size === board.length && down.size === board.length && up.size === board.length;
}

/** Every sequence of k columns in 0..n-1, lexicographic. */
function* sequences(n: number, k: number): Generator<number[]> {
  const seq = new Array<number>(k).fill(0);
  if (k === 0) {
    yield [];
    return;
  }
  for (;;) {
    yield seq.slice();
    let i = k - 1;
    while (i >= 0 && seq[i] === n - 1) seq[i--] = 0;
    if (i < 0) return;
    seq[i]++;
  }
}

/** Brute force: every permutation of 0..n-1 (lexicographic) that passes the independent checker. */
function bruteSolutions(n: number): string[] {
  const out: string[] = [];
  const perm = (prefix: number[], left: number[]) => {
    if (!left.length) {
      if (independentOk(prefix)) out.push(prefix.join(''));
      return;
    }
    left.forEach((c, i) => perm([...prefix, c], [...left.slice(0, i), ...left.slice(i + 1)]));
  };
  perm([], Array.from({ length: n }, (_, i) => i));
  return out;
}

/**
 * Reference pruned visit count, without the search: a pruned search expands exactly the safe
 * prefixes of length 0..n-1, and tries n columns from each.
 */
function referencePrunedVisits(n: number): number {
  let safePrefixes = 0;
  for (let k = 0; k < n; k++) for (const s of sequences(n, k)) if (independentOk(s)) safePrefixes++;
  return n * safePrefixes;
}

const ns = Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => MIN_N + i);

describe('N-Queens search', () => {
  it('finds the published solution counts for n = 4 to 8, pruned and (to n = 7) unpruned', () => {
    for (const n of ns) {
      expect(runQueens(n, true, false).solutions.length).toBe(KNOWN_SOLUTIONS[n]);
      if (n <= 7) expect(runQueens(n, false, false).solutions.length).toBe(KNOWN_SOLUTIONS[n]);
    }
  });

  it('reports exactly the brute-force set of solutions over all permutations, in order (n ≤ 7)', () => {
    for (const n of ns.filter((x) => x <= 7)) {
      const brute = bruteSolutions(n);
      expect(solveQueens(n).map((b) => b.join(''))).toEqual(brute);
      expect(runQueens(n, false, false).solutions.map((b) => b.join(''))).toEqual(brute);
    }
  });

  it('every reported solution is conflict-free by the independent checker', () => {
    for (const n of ns) for (const b of solveQueens(n)) expect(independentOk(b) && b.length === n).toBe(true);
  });

  it('pruned visit counts match the safe-prefix reference and the per-n values', () => {
    const expected: Record<number, number> = { 4: 60, 5: 220, 6: 894, 7: 3584, 8: 15720 };
    for (const n of ns) {
      const v = runQueens(n, true, false).visited;
      expect(v).toBe(referencePrunedVisits(n));
      expect(v).toBe(expected[n]);
      expect(v).toBeLessThan(unprunedVisits(n));
    }
  });

  it('unpruned runs visit Σ nᵏ placements, the closed form, counted by a real run (n ≤ 7)', () => {
    for (const n of ns.filter((x) => x <= 7)) {
      let sum = 0;
      for (let k = 1; k <= n; k++) sum += n ** k;
      expect(runQueens(n, false, false).visited).toBe(sum);
      expect(unprunedVisits(n)).toBe(sum);
    }
    expect(unprunedVisits(8)).toBe(19_173_960);
  });

  it('unprunedVisitsAt equals the real unpruned counter at every solution (n ≤ 6)', () => {
    for (const n of ns.filter((x) => x <= 6)) {
      const run = runQueens(n, false);
      for (const e of run.events) if (e.kind === 'try' && e.outcome === 'solution') expect(unprunedVisitsAt(e.board, n)).toBe(e.visited);
    }
  });

  it('a pruned dead node is attacked by exactly the rows it names, and an open one by none', () => {
    for (const n of [4, 5, 6]) {
      for (const e of runQueens(n, true).events) {
        if (e.kind !== 'try') continue;
        const r = e.board.length - 1;
        const attackers = e.board.slice(0, r).flatMap((c, i) => (pairAttacks(i, c, r, e.board[r]) ? [i] : []));
        expect(e.conflicts.map(([a]) => a)).toEqual(attackers);
        expect(e.outcome === 'dead').toBe(attackers.length > 0);
      }
    }
  });
});

/** Independent pair rule: same column, same r + c (↗ diagonal) or same r - c (↘ diagonal). */
const pairAttacks = (r1: number, c1: number, r2: number, c2: number) => c1 === c2 || r1 + c1 === r2 + c2 || r1 - c1 === r2 - c2;

describe('subsets', () => {
  it('generates exactly the 2⁴ distinct subsets a bitmask enumeration gives, in 30 decisions', () => {
    const run = runSubsets();
    const items = ['a', 'b', 'c', 'd'];
    const bitmask = Array.from({ length: 16 }, (_, m) => items.filter((_, i) => m & (1 << i)).join('')).sort();
    const got = run.subsets.map((s) => s.join(''));
    expect(new Set(got).size).toBe(16);
    expect([...got].sort()).toEqual(bitmask);
    expect(run.visited).toBe(30);
  });
});

/** The final caption of a run, as text. */
const lastText = (frames: readonly BtFrame[]) => captionText(frames[frames.length - 1].say);

describe('frames: every combination of puzzle, n and pruning', () => {
  const combos = [...ns.flatMap((n) => [true, false].map((prune) => ({ n, prune })))];

  it.each(combos)('queens n = $n, prune = $prune: captions, counters and the end state', ({ n, prune }) => {
    const run = queensFrames(n, prune);
    const f = run.frames;
    for (const x of f) expect(captionText(x.say).length).toBeGreaterThan(0);
    for (let i = 1; i < f.length; i++) {
      expect(f[i].visited).toBeGreaterThanOrEqual(f[i - 1].visited);
      expect(f[i].solutions).toBeGreaterThanOrEqual(f[i - 1].solutions);
    }
    const end = f[f.length - 1];
    const total = prune ? runQueens(n, true, false).visited : unprunedVisits(n);
    expect(end.visited).toBe(total);
    expect(end.solutions).toBe(KNOWN_SOLUTIONS[n]);
    expect(end.returned).toBe(true);
    const text = lastText(f);
    expect(text).toContain(`${KNOWN_SOLUTIONS[n]} solutions after ${total.toLocaleString('en-US')} placements tried`);
    if (prune) {
      const skipped = unprunedVisits(n) - total;
      expect(text).toContain(`skipped ${skipped.toLocaleString('en-US')}`);
    } else {
      expect(text).toContain(`with ${runQueens(n, true, false).visited.toLocaleString('en-US')}`);
    }

    if (n > MAX_DRAWN_N) {
      expect(run.drawn).toBe(0);
      expect(f.length).toBe(KNOWN_SOLUTIONS[n] + 2);
      f.slice(1, -1).forEach((x, k) => {
        expect(independentOk(x.board) && x.board.length === n).toBe(true);
        expect(captionText(x.say)).toContain(`Solution ${k + 1} of ${KNOWN_SOLUTIONS[n]}`);
      });
      return;
    }
    expect(run.drawn).toBeLessThanOrEqual(TREE_CAP);
    expect((run.drawn - 1) % n).toBe(0);
    // At the end every drawn node has been tried and left.
    expect(end.status.filter((s) => s === 'hidden' || s === 'untried' || s === 'path')).toEqual([]);
    const steps = f.filter((x) => x.outcome !== null).length;
    expect(steps).toBeLessThanOrEqual(STEP_CAP);
    const ff = f.find((x) => captionText(x.say).startsWith('Fast-forward'));
    expect(!!ff).toBe(run.capped);
    if (ff) {
      const lastStep = f[f.indexOf(ff) - 1];
      expect(captionText(ff.say)).toContain(`other ${(total - lastStep.visited).toLocaleString('en-US')} placements`);
    }
    for (const x of f) {
      const t = captionText(x.say);
      if (x.outcome === 'back') {
        const { r, c } = x.lifted!;
        expect(t).toContain(`lift the queen from row ${r + 1}, column ${c + 1}`);
        expect(t.includes('last column')).toBe(c === n - 1);
      }
      if (x.outcome === 'solution') {
        expect(independentOk(x.board) && x.board.length === n).toBe(true);
        expect(t).toContain(`solution ${x.solutions}`);
      }
      if (x.outcome === 'dead') expect(independentOk(x.board)).toBe(false);
    }
  });

  it('4-queens with pruning draws its whole tree and is never capped', () => {
    const run = queensFrames(4, true);
    expect(run.capped).toBe(false);
    expect(run.drawn).toBe(61);
    expect(run.nodes.length).toBe(61);
  });

  it('subsets: every frame captioned, 16 outputs, all decided at the end', () => {
    const run = subsetFrames();
    const f = run.frames;
    for (const x of f) expect(captionText(x.say).length).toBeGreaterThan(0);
    const end = f[f.length - 1];
    expect(end.found.length).toBe(16);
    expect(lastText(f)).toContain('16 subsets from 30 include/skip decisions');
    expect(lastText(f)).toContain('2⁴ = 16');
    expect(end.status.filter((s) => s === 'hidden' || s === 'untried' || s === 'path')).toEqual([]);
    for (const x of f) {
      const t = captionText(x.say);
      if (t.startsWith('Undo')) expect(t).toMatch(/^Undo: take [a-d] back out/);
    }
  });
});

describe('quiz numbers come from the model', () => {
  it('8-queens: 92 solutions, 15,720 pruned placements, about 19 million unpruned', () => {
    const q = lesson.quiz[0].options[lesson.quiz[0].answer];
    expect(q).toContain(`${solveQueens(8).length} solutions`);
    expect(q).toContain(runQueens(8, true, false).visited.toLocaleString('en-US'));
    expect(q).toContain(`${Math.floor(unprunedVisits(8) / 1e6)} million`);
    expect(lesson.quiz[3].why).toContain(`2⁴ = ${runSubsets().subsets.length}`);
  });
});
