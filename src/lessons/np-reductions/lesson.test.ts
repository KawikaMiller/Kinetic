import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  F1, F_STAR, U, assignmentCaption, buildGadget, checkCover, coverCountBySize, coverFromAssignment, judgeEdge, literalVertex, sweep, twoVariableFormulas, verdictOf,
} from './model';
import { buildCaption, sweepLine, unsatCaption, verdictCaption, EXHAUSTIVE_SCOPE } from './text';
import { minVertexCover } from '../../core/vertexCover';

const g = buildGadget(F1);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: x1 then not x1 places a variable edge and the counter reads 1 of 15', () => {
    const r = judgeEdge(g, new Set(), literalVertex(1), literalVertex(-1));
    expect(r).toEqual({ ok: true, index: 0 });
    expect(g.kinds[0]).toBe('variable');
    expect(buildCaption(g, 1)).toBe('1 of 15 edges placed. The target is a cover of size K = n + 2m = 3 + 2 x 2 = 7.');
    expect(lesson.tryThis[0]).toContain('reads 1 of 15');
  });

  it('try-this 2: x1 then x2 is refused and the counter stays at 1 of 15', () => {
    const placed = new Set([0]);
    const r = judgeEdge(g, placed, literalVertex(1), literalVertex(2));
    expect(r.ok).toBe(false);
    expect(buildCaption(g, placed.size)).toContain('1 of 15 edges placed');
  });

  it('try-this 3: all false satisfies F1 with size 7, then x2 on gives 8 = K + 1 with the clause 1 caption', () => {
    const allFalse = coverFromAssignment(g, [false, false, false]);
    expect(allFalse.falsified).toEqual([]);
    expect(allFalse.size).toBe(7);
    const x2On = coverFromAssignment(g, [false, true, false]);
    expect(x2On.size).toBe(8);
    expect(assignmentCaption(g, x2On)).toBe('Clause 1 has no true literal, so all three of its vertices must be covered: size K + 1 = 8.');
    expect(lesson.tryThis[2]).toContain('reads 8 = K + 1');
  });

  it('try-this 4: any 6 vertices fail Check with the K - 1 refusal and the bound 3 + 2 x 2 = 7', () => {
    for (const six of [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11], [0, 2, 4, 7, 8, 10]]) {
      const r = checkCover(g, six);
      expect(r.kind).toBe('too-small');
      expect(r.text).toContain('No cover of 6 exists');
      expect(r.text).toContain('at least 3 + 2 x 2 = 7');
    }
    expect(lesson.tryThis[3]).toContain('3 + 2 x 2 = 7');
  });

  it('try-this 5: the unsatisfiable preset has 0 covers of size 10 and minimum 11', () => {
    const gu = buildGadget(U);
    const counts = coverCountBySize(gu);
    expect(counts[10]).toBe(0);
    expect(minVertexCover(gu.vertexCount, gu.edges).size).toBe(11);
    expect(unsatCaption(gu, 11, counts[10], 4, 11)).toContain('has 0 covers of size K = 10: the minimum is 11');
    expect(lesson.tryThis[4]).toContain('has 0 covers of size 10');
    expect(lesson.tryThis[4]).toContain('minimum is 11');
  });
});

describe('what the stage prints', () => {
  it('names the scope of every sweep result: exhaustive or sampled, never a bare "all"', () => {
    const s = sweep(twoVariableFormulas(), { variableEdges: false });
    const line = sweepLine('Without them', s, EXHAUSTIVE_SCOPE);
    expect(line).toContain(`wrong on ${s.failures} of 793`);
    expect(line).toContain(`${s.unsatisfiable} of them unsatisfiable`);
    expect(line).toContain('exhaustive over all 793 formulas of 2 variables and 1 to 4 clauses');
    expect(line).toContain('(x1 or x1 or x1) and (not x1 or not x1 or not x1)');
    expect(sweepLine('With them', sweep(twoVariableFormulas()), EXHAUSTIVE_SCOPE)).toContain('wrong on 0 of 793');
  });

  it('the verdict caption states the broken rule for F* and agreement for F1', () => {
    const wrong = verdictCaption(verdictOf(F_STAR, { variableEdges: false }), false);
    expect(wrong).toContain('Wrong verdict without its variable edges');
    expect(wrong).toContain('a cover of size K = 6 exists (the minimum is 6), but no assignment satisfies it');
    expect(verdictCaption(verdictOf(F1), true)).toContain('agrees with brute force: an assignment satisfies it');
  });
});
