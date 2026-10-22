import { describe, expect, it } from 'vitest';
import { emptyClassify, pickCategory } from '../../core/classify';
import {
  ASSIGNMENT_COUNT, CAP, CHANGES, EDGES, PRESETS, SERVICES, SERVICE_IDS, WEIGHT, canonical, dominates, isPlaced, layoutFrom, layoutKey, metrics, minFeasibleCap, moveService,
  placedCount, reference, type PlacedLayout, type ServiceId, type TeamId,
} from './model';

/** The oracle: every grouping of the eight services into at most three teams, as restricted growth strings (a different enumeration from the lesson's 3^8). */
function partitions(): PlacedLayout[] {
  const out: PlacedLayout[] = [];
  const names: TeamId[] = ['A', 'B', 'C'];
  const grow = (prefix: number[], used: number) => {
    if (prefix.length === SERVICE_IDS.length) {
      out.push(Object.fromEntries(SERVICE_IDS.map((id, i) => [id, names[prefix[i]]])) as PlacedLayout);
      return;
    }
    for (let t = 0; t <= Math.min(used, names.length - 1); t += 1) grow([...prefix, t], Math.max(used, t + 1));
  };
  grow([], 0);
  return out;
}

/** The same metrics by a second formulation: degree counting per service, and a pairwise count of teams per change. */
function oracle(layout: PlacedLayout, cap: number) {
  const teams = ['A', 'B', 'C'] as TeamId[];
  const crossDegree = (id: ServiceId) => EDGES.filter(([a, b]) => (a === id && layout[b] !== layout[a]) || (b === id && layout[a] !== layout[b])).length;
  const cognitive = Object.fromEntries(teams.map((t) => [t, SERVICES.filter((s) => layout[s.id] === t).reduce((n, s) => n + s.complexity + crossDegree(s.id), 0)]));
  const handoffs = CHANGES.reduce((n, c) => n + c.touches.filter((s, i) => c.touches.findIndex((o) => layout[o] === layout[s]) === i).length - 1, 0);
  const peers = SERVICES.filter((s) => SERVICES.filter((o) => o.skill === s.skill && layout[o.id] === layout[s.id]).length > 1).length;
  return {
    handoffs, interfaces: EDGES.filter(([a, b]) => layout[a] !== layout[b]).length, cognitive, peers,
    max: Math.max(...Object.values(cognitive)), over: teams.filter((t) => cognitive[t] > cap),
  };
}

describe('the toy', () => {
  it('has eight services of complexity 26 in all, ten edges and six changes', () => {
    expect(SERVICES.reduce((n, s) => n + s.complexity, 0)).toBe(26);
    expect(EDGES).toHaveLength(10);
    expect(CHANGES).toHaveLength(6);
    expect(ASSIGNMENT_COUNT).toBe(6561);
  });
});

describe('the three presets (hand-worked vectors at the default cap)', () => {
  const at = (p: keyof typeof PRESETS) => metrics(PRESETS[p].layout, CAP.default);

  it('one team: 0 handoffs, 0 interfaces, load 26 over the cap, 7 skill peers', () => {
    const m = at('one');
    expect([m.handoffs, m.interfaces, m.cognitive.A, m.peers, m.over]).toEqual([0, 0, 26, 7, ['A']]);
  });

  it('by layer: 6 handoffs, 7 interfaces, loads 11, 23 and 6 with team B over, 7 peers; F2 touches three teams', () => {
    const m = at('layer');
    expect([m.handoffs, m.interfaces, m.cognitive.A, m.cognitive.B, m.cognitive.C, m.peers, m.over]).toEqual([6, 7, 11, 23, 6, 7, ['B']]);
    expect(Object.values(m.teamsTouched)).toEqual([2, 3, 1, 2, 2, 2]);
    expect(m.teamsTouched.F2).toBe(3);
  });

  it('by journey: 4 handoffs, 4 interfaces, loads 15, 9 and 10 all inside 16, 6 peers', () => {
    const m = at('journey');
    expect([m.handoffs, m.interfaces, m.cognitive.A, m.cognitive.B, m.cognitive.C, m.peers, m.over]).toEqual([4, 4, 15, 9, 10, 6, []]);
    expect(m.owned).toEqual({ A: 11, B: 7, C: 8 });
  });

  it('moving payments from C to A in the journey layout: 3 handoffs, 3 interfaces, team A at 19 and over the cap', () => {
    const m = metrics(moveService(PRESETS.journey.layout, 'payments', 'A'), CAP.default);
    expect([m.handoffs, m.interfaces, m.cognitive.A, m.over]).toEqual([3, 3, 19, ['A']]);
  });

  it('no preset dominates another on handoffs, interfaces, maximum load and skill peers', () => {
    const all = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(at);
    for (const a of all) for (const b of all) if (a !== b) expect(dominates(a, b)).toBe(false);
    expect(all.map((m) => [m.handoffs, m.interfaces, m.maxCognitive, m.peers])).toEqual([[0, 0, 26, 7], [6, 7, 23, 7], [4, 4, 15, 6]]);
  });
});

describe('all assignments against the independent oracle', () => {
  it('metrics agree on every one of the 1,094 groupings, and every grouping is one of the 6,561 assignments up to renaming', () => {
    const parts = partitions();
    expect(parts).toHaveLength(1 + 127 + 966);
    for (const layout of parts) {
      const m = metrics(layout, CAP.default);
      const o = oracle(layout, CAP.default);
      expect([m.handoffs, m.interfaces, m.maxCognitive, m.peers, m.cognitive.A, m.cognitive.B, m.cognitive.C, [...m.over]]).toEqual(
        [o.handoffs, o.interfaces, o.max, o.peers, o.cognitive.A, o.cognitive.B, o.cognitive.C, o.over],
      );
    }
    const canonKeys = new Set(parts.map(layoutKey));
    expect(canonKeys.size).toBe(1094);
    expect(reference(26, 0).tied.length).toBeGreaterThan(0);
  });
});

describe('the reference', () => {
  /** The minimum over the oracle's groupings, by its own formulas. */
  const best = (cap: number, w: number) => {
    const fits = partitions().map((l) => ({ l, o: oracle(l, cap) })).filter(({ o }) => o.max <= cap);
    if (!fits.length) return { score: null, keys: [] as string[] };
    const score = Math.min(...fits.map(({ o }) => o.handoffs + w * o.interfaces));
    return { score, keys: fits.filter(({ o }) => o.handoffs + w * o.interfaces === score).map(({ l }) => layoutKey(l)).sort() };
  };

  it('at cap 16, weight 1 the minimum is 8, reached by three tied layouts, one of them the by-journey layout', () => {
    const r = reference(16, 1);
    expect(r.score).toBe(8);
    expect(r.tied).toHaveLength(3);
    expect(r.tied.map(layoutKey).sort()).toEqual(best(16, 1).keys);
    expect(r.tied.map(layoutKey)).toContain(layoutKey(canonical(PRESETS.journey.layout)));
    const groupings = r.tied.map((l) => SERVICE_IDS.filter((id) => l[id] === 'A').join('+'));
    expect(groupings).toEqual(['web+mobile+cart+checkout', 'web+mobile+cart+checkout', 'web+mobile+cart+checkout']);
  });

  it('sweeps the cap as the spec table says: none below 13, then 12, 11, 8, 8, 5, 5, 4, 4, 3, 2 to 25, and 0 from 26', () => {
    const expected: Record<number, number | null> = { 12: null, 13: 12, 14: 11, 15: 8, 16: 8, 17: 5, 18: 5, 19: 4, 20: 4, 21: 3, 22: 2, 23: 2, 24: 2, 25: 2, 26: 0, 30: 0 };
    for (const [cap, score] of Object.entries(expected)) {
      expect(reference(Number(cap), 1).score, `cap ${cap}`).toBe(score);
      expect(best(Number(cap), 1).score, `oracle cap ${cap}`).toBe(score);
    }
    expect(minFeasibleCap()).toBe(13);
  });

  it('agrees with the oracle for every weight on the slider at the default cap, and at cap 26 is one team', () => {
    for (let w = WEIGHT.min; w <= WEIGHT.max; w += WEIGHT.step) {
      const r = reference(CAP.default, w);
      expect(r.score, `w ${w}`).toBe(best(CAP.default, w).score);
      expect(r.tied.map(layoutKey).sort(), `w ${w}`).toEqual(best(CAP.default, w).keys);
    }
    expect(reference(26, 1).tied.map(layoutKey)).toEqual(['AAAAAAAA']);
  });

  it('never returns a layout over the cap, at either end of the cap slider and one step beyond', () => {
    for (const cap of [CAP.min - 1, CAP.min, CAP.max, CAP.max + 1]) {
      for (const l of reference(cap, 1).tied) expect(metrics(l, cap).over).toEqual([]);
    }
    expect(reference(CAP.min - 1, 1).tied).toEqual([]);
  });
});

describe('the board round trip', () => {
  it('placing the same service twice moves it, and only a complete layout counts as placed', () => {
    let board = emptyClassify(SERVICES);
    expect(placedCount(layoutFrom(board.answers))).toBe(0);
    board = pickCategory(pickCategory(board, 'web', 'A'), 'web', 'B');
    expect(layoutFrom(board.answers).web).toBe('B');
    expect(placedCount(layoutFrom(board.answers))).toBe(1);
    expect(isPlaced(layoutFrom(board.answers))).toBe(false);
    const full = Object.fromEntries(SERVICE_IDS.map((id) => [id, 'A']));
    expect(isPlaced(layoutFrom(full))).toBe(true);
    expect(layoutFrom({ web: 'Z' }).web).toBeNull();
  });
});
