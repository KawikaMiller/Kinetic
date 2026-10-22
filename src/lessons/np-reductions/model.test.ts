import { describe, expect, it } from 'vitest';
import { minVertexCover } from '../../core/vertexCover';
import {
  assignmentCaption, assignmentFromCover, buildGadget, checkCover, coverCountBySize, coverFromAssignment, F1, F_STAR, firstMissing, judgeEdge,
  literalVertex, parseFormula, SAMPLE_COUNT, SAMPLE_SEED, seededFormulas, sweep, toCnf, TWO_VAR_CLAUSES, twoVariableFormulas, U, usedVariables,
  verdictOf, vertexName, withVariables, WRONG_RULE, BROKEN_FAILURES, EXHAUSTIVE_COUNT, type Formula, type Gadget,
} from './model';

// Independent oracles, written without the model's helpers: every subset of vertices, and every assignment.

type Pair = readonly [number, number];

/** The sizes of all covering subsets of V vertices, found by trying all 2^V subsets. */
function bruteCoverSizes(V: number, edges: readonly Pair[]): number[] {
  const counts = new Array<number>(V + 1).fill(0);
  for (let s = 0; s < 2 ** V; s++) {
    let ok = true;
    for (const [a, b] of edges) {
      if (((s >> a) & 1) === 0 && ((s >> b) & 1) === 0) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let size = 0;
    for (let i = 0; i < V; i++) size += (s >> i) & 1;
    counts[size]++;
  }
  return counts;
}
const bruteMin = (V: number, edges: readonly Pair[]) => bruteCoverSizes(V, edges).findIndex((c) => c > 0);

const literalTrue = (l: number, bits: number) => (((bits >> (Math.abs(l) - 1)) & 1) === 1) === l > 0;
const satisfying = (f: Formula): number[] =>
  Array.from({ length: 2 ** f.vars }, (_, bits) => bits).filter((bits) => f.clauses.every((c) => c.some((l) => literalTrue(l, bits))));
const toBools = (bits: number, n: number) => Array.from({ length: n }, (_, i) => ((bits >> i) & 1) === 1);
const key = (e: Pair) => `${Math.min(...e)}-${Math.max(...e)}`;

// F1 by hand. Vertices: x1 0, not x1 1, x2 2, not x2 3, x3 4, not x3 5, clause 1 is 6 7 8, clause 2 is 9 10 11.
const F1_EDGES: Pair[] = [
  [0, 1], [2, 3], [4, 5], // the 3 variable edges
  [6, 7], [7, 8], [6, 8], [9, 10], [10, 11], [9, 11], // the 2 triangles
  [6, 0], [7, 3], [8, 4], // clause 1 = (x1 or not x2 or x3)
  [9, 1], [10, 2], [11, 5], // clause 2 = (not x1 or x2 or not x3)
];

describe('the gadget graph on F1, by hand', () => {
  const g = buildGadget(F1);

  it('has the hand-listed 12 vertices, 15 edges and K = 7', () => {
    expect(g.vertexCount).toBe(6 + 6);
    expect(g.edges.length).toBe(3 + 6 + 6);
    expect(g.K).toBe(3 + 2 * 2);
    expect(g.edges.map(key).sort()).toEqual(F1_EDGES.map(key).sort());
  });

  it('is satisfied by 6 of 8 assignments (clause 1 fails only on F,T,F and clause 2 only on T,F,T)', () => {
    const sat = satisfying(F1);
    expect(sat.length).toBe(8 - 2);
    const bitsOf = (x1: number, x2: number, x3: number) => x1 | (x2 << 1) | (x3 << 2);
    expect(sat).not.toContain(bitsOf(0, 1, 0));
    expect(sat).not.toContain(bitsOf(1, 0, 1));
  });

  it('has exactly 12 covers of size 7 and none smaller, by walking all 4096 subsets', () => {
    const counts = bruteCoverSizes(12, F1_EDGES);
    expect(counts[7]).toBe(12);
    expect(counts.slice(0, 7).every((c) => c === 0)).toBe(true);
    expect(coverCountBySize(g)).toEqual(counts);
  });

  it('the cover from an assignment is the product of true-literal counts per clause, 2 for each satisfying assignment', () => {
    const sat = satisfying(F1);
    const covers = new Set<string>();
    for (const bits of sat) {
      const a = toBools(bits, 3);
      const trueCounts = F1.clauses.map((c) => c.filter((l) => literalTrue(l, bits)).length);
      expect(trueCounts.reduce((x, y) => x * y, 1)).toBe(2);
      for (let p0 = 0; p0 < 3; p0++) {
        for (let p1 = 0; p1 < 3; p1++) {
          const r = coverFromAssignment(g, a, [p0, p1]);
          expect(r.size).toBe(7);
          expect(r.isCover).toBe(true);
          covers.add([...r.cover].sort((x, y) => x - y).join(','));
        }
      }
    }
    expect(covers.size).toBe(12);
  });

  it('the falsifying assignment F,T,F costs 3 + 3 + 2 = 8 = K + 1 and still covers every edge', () => {
    const r = coverFromAssignment(g, [false, true, false]);
    expect(r.falsified).toEqual([0]);
    expect(r.size).toBe(3 + 3 + 2);
    expect(r.size).toBe(g.K + 1);
    expect(r.isCover).toBe(true);
    expect(assignmentCaption(g, r)).toBe('Clause 1 has no true literal, so all three of its vertices must be covered: size K + 1 = 8.');
  });

  it('a pick that is not a true literal is ignored in favour of the first true one', () => {
    const a = [false, false, false]; // clause 1: only not x2 is true (slot 1); clause 2: not x1 (slot 0) and not x3 (slot 2)
    expect(coverFromAssignment(g, a, [0, 2]).leftOut).toEqual([1, 2]);
    expect(coverFromAssignment(g, a, [undefined, undefined]).leftOut).toEqual([1, 0]);
  });

  it('reading a cover back gives an assignment that satisfies the formula, for all 12 covers', () => {
    let seen = 0;
    for (let s = 0; s < 2 ** 12; s++) {
      const cover = Array.from({ length: 12 }, (_, i) => i).filter((i) => ((s >> i) & 1) === 1);
      if (cover.length !== 7 || checkCover(g, cover).kind !== 'ok') continue;
      seen++;
      const read = assignmentFromCover(g, cover);
      expect(read.decided).toBe(true);
      expect(read.satisfied).toBe(true);
      expect(satisfying(F1)).toContain(read.values.reduce<number>((bits, v, i) => bits | ((v === true ? 1 : 0) << i), 0));
    }
    expect(seen).toBe(12);
  });
});

describe('the unsatisfiable preset U, by hand', () => {
  const g = buildGadget(U);
  const edges = g.edges as readonly Pair[];

  it('has 16 vertices, 26 edges, K = 10, minimum cover 11 and no cover of size 10', () => {
    expect(g.vertexCount).toBe(2 * 2 + 3 * 4);
    expect(g.edges.length).toBe(2 + 12 + 12);
    expect(g.K).toBe(2 + 2 * 4);
    const counts = bruteCoverSizes(16, edges);
    expect(counts.findIndex((c) => c > 0)).toBe(11);
    expect(counts[10]).toBe(0);
    expect(coverCountBySize(g)).toEqual(counts);
    expect(minVertexCover(g.vertexCount, g.edges).size).toBe(11);
    expect(satisfying(U)).toEqual([]);
  });

  it('each of the 4 assignments falsifies exactly one clause (TT the 4th, TF the 3rd, FT the 2nd, FF the 1st) and costs K + 1 = 11', () => {
    const falsifiedBy: Record<string, number> = { TT: 3, TF: 2, FT: 1, FF: 0 };
    for (const [name, clause] of Object.entries(falsifiedBy)) {
      const r = coverFromAssignment(g, [name[0] === 'T', name[1] === 'T']);
      expect(r.falsified, name).toEqual([clause]);
      expect(r.size, name).toBe(11);
      expect(r.isCover, name).toBe(true);
    }
  });
});

describe('manipulation: the wrong moves are refused with the spec text', () => {
  const g = buildGadget(F1);
  const x1 = literalVertex(1);
  const notX1 = literalVertex(-1);
  const x2 = literalVertex(2);
  const c12 = 6 + 1; // c1.2, which names not x2

  it('manipulation 1: joining x1 and x2 is refused with the construction rule and leaves the graph as it was', () => {
    const placed = new Set<number>();
    const r = judgeEdge(g, placed, x1, x2);
    expect(r).toEqual({
      ok: false,
      text: 'The construction never joins x1 and x2: it joins only a literal to its own negation, the three vertices inside one clause, and a clause vertex to the literal it names.',
    });
    expect(placed.size).toBe(0);
    expect(judgeEdge(g, placed, x1, notX1)).toEqual({ ok: true, index: 0 });
  });

  it('manipulation 2: joining c1.2 (which holds not x2) to x2 is refused as the opposite clause', () => {
    expect(vertexName(3, c12)).toBe('c1.2');
    const r = judgeEdge(g, new Set(), c12, x2);
    expect(r).toEqual({ ok: false, text: 'Clause 1 has the literal not x2 here, so c1.2 joins the vertex not x2, not the vertex x2: that would encode the opposite clause.' });
    expect(judgeEdge(g, new Set(), x2, c12)).toEqual(r);
    expect(judgeEdge(g, new Set(), c12, literalVertex(-2))).toMatchObject({ ok: true });
  });

  it('manipulation 3: a cover of 6 is refused with the lower bound 3 + 2 x 2 = 7 and the first uncovered edge', () => {
    const six = [0, 2, 4, 6, 7, 9]; // x1, x2, x3 and two vertices of triangle 1 and one of triangle 2
    const r = checkCover(g, six);
    expect(r.kind).toBe('too-small');
    const firstUncovered = F1_EDGES.find(([a, b]) => !six.includes(a) && !six.includes(b))!;
    expect(r.text).toBe(
      `No cover of 6 exists: the 3 variable edges are disjoint from each other and from the 2 clause triangles, and a triangle needs 2 vertices, so every cover has at least 3 + 2 x 2 = 7. Edge (${vertexName(3, firstUncovered[0])}, ${vertexName(3, firstUncovered[1])}) is still uncovered.`,
    );
    expect(bruteMin(12, F1_EDGES)).toBe(7);
    for (let s = 0; s < 2 ** 12; s++) {
      const pick = Array.from({ length: 12 }, (_, i) => i).filter((i) => ((s >> i) & 1) === 1);
      if (pick.length < 7) expect(checkCover(g, pick).kind).toBe('too-small');
    }
  });

  it('manipulation 4: Check my graph names the first clause that is not fully encoded and the missing edge', () => {
    const all = new Set(g.edges.map((_, i) => i));
    expect(firstMissing(g, all)).toBeNull();
    const missing = g.edges.findIndex((e) => key(e) === key([9, 11]));
    const placed = new Set(all);
    placed.delete(missing);
    expect(firstMissing(g, placed)).toBe('Clause 2 (not x1 or x2 or not x3) is missing the triangle edge c2.1 to c2.3');
    placed.delete(g.edges.findIndex((e) => key(e) === key([0, 1])));
    expect(firstMissing(g, placed)).toBe('Clause 2 (not x1 or x2 or not x3) is missing the triangle edge c2.1 to c2.3');
    expect(firstMissing(g, new Set())).toBe('Clause 1 (x1 or not x2 or x3) is missing the triangle edge c1.1 to c1.2');
  });

  it('an edge already placed is refused, and a planted bad judge would accept x1-x2', () => {
    expect(judgeEdge(g, new Set([0]), x1, notX1)).toEqual({ ok: false, text: 'The edge (x1, not x1) is already in the graph.' });
    const acceptsEverything = (a: number, b: number) => ({ ok: true as const, index: a + b });
    expect(acceptsEverything(x1, x2).ok).toBe(true);
    expect(judgeEdge(g, new Set(), x1, x2).ok).toBe(false);
  });
});

describe('the reduction on every small formula', () => {
  const all = twoVariableFormulas();

  it('the two-variable family has 12 clauses and 793 formulas of one to four of them', () => {
    expect(TWO_VAR_CLAUSES.length).toBe(12);
    expect(all.length).toBe(12 + 66 + 220 + 495);
    expect(all.length).toBe(EXHAUSTIVE_COUNT);
    expect(new Set(all.map((f) => JSON.stringify(f.clauses))).size).toBe(793);
  });

  it('the minimum cover is at most K exactly when an assignment satisfies, and never below n + 2m, on all 793', () => {
    for (const f of all) {
      const g = buildGadget(f);
      const min = bruteMin(g.vertexCount, g.edges as readonly Pair[]);
      expect(min >= f.vars + 2 * f.clauses.length, JSON.stringify(f)).toBe(true);
      expect(min <= g.K, JSON.stringify(f)).toBe(satisfying(f).length > 0);
    }
  }, 180_000);

  it('without the variable edges the verdict is wrong on the count an independent walk finds, and F* is the first', () => {
    let wrong = 0;
    let first: Formula | null = null;
    for (const f of all) {
      const g = buildGadget(f, { variableEdges: false });
      const min = bruteMin(g.vertexCount, g.edges as readonly Pair[]);
      if ((min <= g.K) !== (satisfying(f).length > 0)) {
        wrong++;
        first ??= f;
      }
    }
    const s = sweep(all, { variableEdges: false });
    expect(s.failures).toBe(wrong);
    expect(s.failures).toBe(WRONG_COUNT);
    expect(wrong / 793).toBeLessThan(0.9);
    expect(first).toEqual(F_STAR);
    expect(s.first).toEqual(F_STAR);
    expect(sweep(all).failures).toBe(0);
  }, 180_000);

  it('F* fails for the stated reason: a cover of size K exists though no assignment satisfies', () => {
    const v = verdictOf(F_STAR, { variableEdges: false });
    expect(v).toMatchObject({ satisfiable: false, K: 6, minimum: 6, coverSaysSatisfiable: true, agrees: false, rule: WRONG_RULE });
    expect(verdictOf(F_STAR)).toMatchObject({ satisfiable: false, minimum: 7, agrees: true, rule: null });
    // x1 and not x1 both taken, plus two vertices of each triangle, is the cover of size 6
    const g = buildGadget(F_STAR, { variableEdges: false });
    const cover = [literalVertex(1), literalVertex(-1), 4, 5, 7, 8];
    expect(checkCover(g, cover).kind).toBe('ok');
    expect(assignmentFromCover(g, cover).values[0]).toBe('both');
  });

  it('200 seeded three-variable formulas agree with the independent oracle, and the sweep counts the unsatisfiable ones the way the oracle does', () => {
    const sample = seededFormulas(SAMPLE_SEED, SAMPLE_COUNT);
    expect(sample.length).toBe(200);
    let unsat = 0;
    for (const f of sample) {
      const g = buildGadget(f);
      expect(f.clauses.every((c) => !c.some((l) => c.includes(-l)))).toBe(true);
      const sat = satisfying(f).length > 0;
      if (!sat) unsat++;
      expect(bruteMin(g.vertexCount, g.edges as readonly Pair[]) <= g.K, JSON.stringify(f)).toBe(sat);
    }
    expect(unsat).toBeGreaterThanOrEqual(1);
    expect(sweep(sample).unsatisfiable).toBe(unsat);
    expect(sweep(sample).failures).toBe(0);
  }, 120_000);

  it('the same seed gives the same sample, another seed another', () => {
    expect(seededFormulas(SAMPLE_SEED, 20)).toEqual(seededFormulas(SAMPLE_SEED, 20));
    expect(seededFormulas(SAMPLE_SEED + 1, 20)).not.toEqual(seededFormulas(SAMPLE_SEED, 20));
  });
});

describe('the formula editor', () => {
  it('reads F1 as typed and refuses what the construction cannot take', () => {
    const ok = parseFormula('(x1 or not x2 or x3) and (not x1 or x2 or not x3)', 3);
    expect(ok).toEqual({ ok: true, formula: F1 });
    const two = parseFormula('x1 or x2', 3);
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.error).toContain('a clause needs exactly 3 literals');
    const beyond = parseFormula('x1 or x2 or x5', 4);
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.error).toContain('"x5" is not one of the allowed variables (x1, x2, x3, x4)');
    const taut = parseFormula('x1 or not x1 or x2', 2);
    expect(taut.ok).toBe(false);
    if (!taut.ok) expect(taut.error).toContain('x1 and not x1 in one clause is always true: leave it out');
    const many = parseFormula(Array.from({ length: 6 }, () => 'x1 or x2 or x2').join('\n'), 2);
    expect(many.ok).toBe(false);
    if (!many.ok) expect(many.error).toContain('more than 5');
    expect(parseFormula('x1 or x1 or x1', 1).ok).toBe(true);
  });

  it('lowering the variable count below a used variable is refused with the variable named', () => {
    expect(usedVariables(F1.clauses)).toBe(3);
    expect(withVariables(F1, 2)).toEqual({ ok: false, error: 'x3 is used by a clause: edit the clauses before lowering the variables to 2.' });
    expect(withVariables(F1, 4)).toEqual({ ok: true, formula: { ...F1, vars: 4 } });
  });

  it('the largest editor formula (4 variables, 5 clauses) has 23 vertices and K = 14, as the quiz says', () => {
    const five = parseFormula(Array.from({ length: 5 }, () => 'x1 or x2 or x3').join('\n'), 4);
    expect(five.ok).toBe(true);
    if (!five.ok) return;
    const g: Gadget = buildGadget(five.formula);
    expect(g.vertexCount).toBe(2 * 4 + 3 * 5);
    expect(g.K).toBe(14);
    expect(toCnf(five.formula).clauses.length).toBe(5);
  });
});

const WRONG_COUNT = BROKEN_FAILURES;
