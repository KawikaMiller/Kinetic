import { describe, expect, it } from 'vitest';
import lesson from './index';
import { STAR_M, clampM, starBanner, starCaption, starFacts } from './star';
import { M7, toursCaption, toursOf } from './tours';
import { coverCaption, coverResult, finishMatching, presetGraph, toggleMatchingEdge } from './vc';

const k33 = presetGraph('k33');
const edgeIndex = (a: number, b: number) => k33.edges.findIndex((e) => e[0] === a && e[1] === b);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: edges (0,3), (1,4), (2,5) then Done give cover 6, optimum 3 and a ratio of exactly 2.00', () => {
    let matching: number[] = [];
    for (const [a, b] of [[0, 3], [1, 4], [2, 5]]) {
      const move = toggleMatchingEdge(k33.edges, matching, edgeIndex(a, b));
      if (!move.ok) throw new Error(move.text);
      matching = move.matching;
    }
    expect(finishMatching(k33.edges, matching).ok).toBe(true);
    const r = coverResult(6, k33.edges, matching, 'both');
    expect(coverCaption(r, 'both', k33.edges)).toBe('The cover keeps both endpoints of each matching edge: 6 vertices against an exact optimum of 3, a ratio of 2.00. The proved bound is 2.');
    expect(lesson.tryThis[0]).toContain('the cover has 6 vertices, the optimum 3, and the ratio is exactly 2.00');
  });

  it('try-this 2: after that matching, the edge (0,4) is refused because vertex 0 is already matched', () => {
    const matching = [edgeIndex(0, 3), edgeIndex(1, 4), edgeIndex(2, 5)];
    const r = toggleMatchingEdge(k33.edges, matching, edgeIndex(0, 4));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.text).toContain('shares vertex 0');
  });

  it('try-this 3: M7 gives doubling 1.32, Christofides 1.09 and a tree of 20.90 below the optimum 26.76', () => {
    const t = toursOf(M7);
    expect(t.ratioDoubling.toFixed(2)).toBe('1.32');
    expect(t.ratioChristofides.toFixed(2)).toBe('1.09');
    expect(t.mst.weight.toFixed(2)).toBe('20.90');
    expect(t.optimum.length.toFixed(2)).toBe('26.76');
    expect(toursCaption(t)).toContain('MST doubling 35.39, ratio 1.32');
    expect(lesson.tryThis[2]).toContain('ratio 1.32, Christofides 1.09');
    expect(lesson.tryThis[2]).toContain('weighs 20.90, below the optimum 26.76');
  });

  it('try-this 4: M = 100 shows the banner and the ratio 31.31', () => {
    const f = starFacts(100);
    expect(starBanner(f)).toContain('The guarantee no longer applies');
    expect(f.ratio.toFixed(2)).toBe('31.31');
    expect(starCaption(f)).toBe('The triangle inequality fails at M = 100. MST doubling (children in index order) costs 203.5 against an optimum of 6.5: a ratio of 31.31.');
    expect(lesson.tryThis[3]).toContain('ratio reads 31.31');
  });

  it('try-this 5: M back at 2 removes the banner and the ratio reads 1.15 (the inequality holds with equality)', () => {
    const f = starFacts(STAR_M.default);
    expect(STAR_M.default).toBe(2);
    expect(starBanner(f)).toBeNull();
    expect(f.ratio.toFixed(2)).toBe('1.15');
    expect(starCaption(f)).toContain('The triangle inequality holds with equality at M = 2');
    expect(lesson.tryThis[4]).toContain('ratio reads 1.15');
  });
});

describe('controls at their extremes and one beyond', () => {
  it('the M slider ends at 1.5 and 200: below and above are clamped and still give a ratio', () => {
    for (const m of [clampM(0), clampM(1.5), clampM(200), clampM(500)]) {
      const f = starFacts(m);
      expect(Number.isFinite(f.ratio)).toBe(true);
    }
    expect(clampM(0)).toBe(1.5);
    expect(clampM(500)).toBe(200);
    expect(starFacts(1.5).ratio).toBeCloseTo(1, 12);
    expect(starFacts(200).ratio).toBeCloseTo(403.5 / 6.5, 9);
  });

  it('a graph with no edges has nothing to approximate, and says so', () => {
    const r = coverResult(3, [], [], 'both');
    expect(r.ratio).toBeNull();
    expect(coverCaption(r, 'both', [])).toContain('no edges');
  });

  it('a learner-added edge is covered by the matching rule again after the matching is rebuilt', () => {
    const edges = [...presetGraph('path4').edges, [0, 3] as const];
    expect(finishMatching(edges, [0]).ok).toBe(false);
    expect(finishMatching(edges, [0, 2]).ok).toBe(true);
    expect(coverResult(4, edges, [0, 2], 'both').cover).toEqual([0, 1, 2, 3]);
  });
});
