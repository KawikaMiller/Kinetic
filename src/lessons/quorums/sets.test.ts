import { describe, expect, it } from 'vitest';
import { alwaysOverlap, intersection } from './quorum';
import { DEFAULT_SETS, disjointSets, holdersOfLatest, read, readBlocked, toggleMember, withN, withSizes, write, writeBlocked, type SetsState } from './sets';
import { randomSet } from './storeView';

const press = (s: SetsState, i: number): SetsState => {
  const r = toggleMember(s, i);
  if ('refused' in r) throw new Error(r.refused);
  return r.state;
};

describe('picking sets by hand', () => {
  it('a set holds exactly its size: a press past it is refused with the reason, a second press removes', () => {
    let s = withSizes(DEFAULT_SETS, 2, 2);
    s = press(press(s, 3), 1);
    expect(s.writeSet).toEqual([1, 3]);
    expect(toggleMember(s, 0)).toEqual({ refused: 'The write set already has 2 replicas: take one out first.' });
    s = press(s, 3);
    expect(s.writeSet).toEqual([1]);
    expect(writeBlocked(s)).toBe('A write needs exactly W = 2 replicas: 1 picked.');
    expect(writeBlocked(press(s, 4))).toBeNull();
  });
  it('shrinking W or R drops the extra members, and changing N restarts the register', () => {
    let s = withSizes(DEFAULT_SETS, 3, 3);
    s = press(press(press(s, 0), 1), 2);
    expect(withSizes(s, 2, 3).writeSet).toEqual([0, 1]);
    const small = withN({ ...s, versions: [4, 4, 4, 0, 0] }, 3);
    expect([small.n, small.w, small.r, small.versions, small.writeSet]).toEqual([3, 3, 3, [0, 0, 0], []]);
  });
  it('a write sets its W replicas to the next version, a read returns the highest it polled and says what the latest was', () => {
    let s = withSizes(DEFAULT_SETS, 3, 2);
    s = write(press(press(press(s, 0), 1), 2));
    expect(s.versions).toEqual([1, 1, 1, 0, 0]);
    expect(holdersOfLatest(s)).toEqual([0, 1, 2]);
    s = { ...s, pick: 'read' };
    s = read(press(press(s, 3), 4));
    expect(s.lastRead).toEqual({ set: [3, 4], returned: 0, latest: 1 });
    expect(readBlocked({ ...s, readSet: [3] })).toBe('A read needs exactly R = 2 replicas: 1 picked.');
  });
  it('with R + W > N no choice of sets can return a stale value, on every choice for N = 3 to 5; with R + W <= N a disjoint choice does', () => {
    for (let n = 3; n <= 5; n++) {
      for (let w = 1; w <= n; w++) {
        for (let r = 1; r <= n; r++) {
          const disjoint = disjointSets(n, w, r);
          expect(disjoint === null, `N=${n} W=${w} R=${r}`).toBe(alwaysOverlap({ n, w, r }));
          if (!disjoint) continue;
          expect(intersection(disjoint.writeSet, disjoint.readSet)).toEqual([]);
          let s: SetsState = withSizes(withN(DEFAULT_SETS, n), w, r);
          s = write({ ...s, writeSet: disjoint.writeSet });
          s = read({ ...s, readSet: disjoint.readSet });
          expect(s.lastRead!.returned).toBeLessThan(s.lastRead!.latest);
        }
      }
    }
  });
  it('random sets have the right size, are inside 0..N-1 and repeat for a seed', () => {
    for (let seed = 0; seed < 50; seed++) {
      const set = randomSet(7, 3, seed);
      expect(set).toHaveLength(3);
      expect(new Set(set).size).toBe(3);
      expect(set.every((i) => i >= 0 && i < 7)).toBe(true);
      expect(randomSet(7, 3, seed)).toEqual(set);
    }
  });
});
