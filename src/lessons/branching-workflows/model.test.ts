import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph';
import { DAYS, edits, FEATURE_DAYS, merges, outcome, REGIONS, strategies, windowOf } from './model';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** Brute force: every cross-developer pair of same-area changes in the same window. */
function bruteConflicts(e: number[][], lifetime: number) {
  let n = 0;
  for (let a = 0; a < e.length; a++)
    for (let b = a + 1; b < e.length; b++)
      for (let t = 0; t < DAYS; t++)
        for (let u = 0; u < DAYS; u++) if (e[a][t] === e[b][u] && windowOf(t, lifetime) === windowOf(u, lifetime)) n++;
  return n;
}

describe('conflict model', () => {
  it('is deterministic for a seed and uses valid areas', () => {
    expect(edits(3, 7)).toEqual(edits(3, 7));
    expect(edits(3, 7)).not.toEqual(edits(3, 8));
    const areas = edits(4, 3).flat();
    expect(areas.every((r) => Number.isInteger(r) && r >= 0 && r < REGIONS)).toBe(true);
  });

  it('counts exactly the overlapping pairs, one merge at a time', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const e = edits(4, seed);
      for (const L of [1, FEATURE_DAYS, 5, 10]) {
        expect(merges(e, L).reduce((s, m) => s + m.conflicts, 0)).toBe(bruteConflicts(e, L));
      }
    }
  });

  it('longer branches never produce fewer conflicts', () => {
    for (const seed of SEEDS) {
      const e = edits(4, seed);
      const c = [1, 5, 10].map((L) => outcome(e, { lifetime: L, integrateTo: 'main', flags: false, releaseAtEnd: false }).conflicts);
      expect(c[1]).toBeGreaterThanOrEqual(c[0]);
      expect(c[2]).toBeGreaterThanOrEqual(c[1]);
      const three = outcome(e, { lifetime: FEATURE_DAYS, integrateTo: 'main', flags: false, releaseAtEnd: false }).conflicts;
      expect(three).toBeGreaterThanOrEqual(c[0]);
    }
  });

  it('a bigger team never produces fewer conflicts', () => {
    for (const seed of SEEDS) {
      let prev = 0;
      for (let team = 1; team <= 5; team++) {
        const n = outcome(edits(team, seed), strategies(5, true).long).conflicts;
        expect(n).toBeGreaterThanOrEqual(prev);
        prev = n;
      }
    }
  });

  it('trunk-based ships sooner than a week-end release, and PRs stay small', () => {
    const e = edits(3, 11);
    const s = strategies(5, true);
    const long = outcome(e, s.long);
    const trunk = outcome(e, s.trunk);
    expect(trunk.leadTime).toBe(1);
    expect(long.leadTime).toBeCloseTo((DAYS + 1) / 2);
    expect(trunk.prLines).toBeLessThan(long.prLines);
    expect(trunk.integrateEvery).toBe(1);
  });
});

describe('commit graph', () => {
  it.each([
    ['GitFlow, 5-day branches', strategies(5, true).long],
    ['GitFlow, 10-day branches', strategies(10, true).long],
    ['trunk with flags', strategies(5, true).trunk],
    ['trunk without flags', strategies(5, false).trunk],
  ])('is a valid history (%s)', (_, s) => {
    const team = 3;
    const e = edits(team, 5);
    const { commits, refsAt } = buildGraph(team, s, merges(e, s.lifetime));
    const seen = new Set<string>();
    for (const c of commits) {
      for (const p of c.parents) expect(seen.has(p)).toBe(true);
      seen.add(c.id);
    }
    expect(commits.filter((c) => c.day >= 0 && c.parents.length === 1 && c.short !== 'M')).toHaveLength(team * DAYS);
    const conflicts = commits.reduce((sum, c) => sum + c.conflicts, 0);
    expect(conflicts).toBe(outcome(e, s).conflicts);
    for (const ref of refsAt(DAYS - 1)) expect(seen.has(ref.at)).toBe(true);
    // At the end of the week no feature branch is left unmerged.
    expect(refsAt(DAYS - 1).map((r) => r.name).every((n) => !n.startsWith('feature/'))).toBe(true);
  });
});
