import { describe, expect, it } from 'vitest';
import { annealedTwoOpt, crossedSquareMap, seededMap, DEFAULT_MAP_SEED, MAP_POINTS } from './tour';
import { freshWork, freshWorks, workOf, workStat, type Works } from './work';

describe('the 2-opt scene keeps one work per method, so switching never mixes their numbers', () => {
  const map = seededMap(DEFAULT_MAP_SEED, MAP_POINTS.default);
  const key = 'random:test';

  it('after an annealed run, the plain method still shows its own untouched work and stat', () => {
    const a = annealedTwoOpt(map.dist, map.start, DEFAULT_MAP_SEED);
    expect(a.accepted).toBeGreaterThan(0);
    const works: Works = { ...freshWorks(key, map), annealed: { ...freshWork(key, map), tour: a.tour, annealed: a } };
    const annealedStat = workStat('annealed', workOf(works, 'annealed', key, map));
    expect(annealedStat).toEqual({ label: 'Reversals accepted', value: a.accepted, sub: `${a.uphill} made the tour longer` });
    const plain = workOf(works, 'plain', key, map);
    expect(plain.annealed).toBeNull();
    expect(plain.moves).toHaveLength(0);
    expect(plain.tour).toEqual(map.start);
    expect(workStat('plain', plain)).toEqual({ label: '2-opt moves', value: 0, sub: 'each one shortens the tour' });
  });

  it('a stat label always names the kind of count its value is, for either method and either state', () => {
    const a = annealedTwoOpt(map.dist, map.start, DEFAULT_MAP_SEED);
    const ran = { ...freshWork(key, map), annealed: a };
    expect(workStat('annealed', freshWork(key, map)).label).toBe('Reversals accepted');
    expect(workStat('annealed', freshWork(key, map)).value).toBe(0);
    expect(workStat('annealed', ran).value).toBe(a.accepted);
    expect(workStat('plain', freshWork(key, map)).label).toBe('2-opt moves');
  });

  it('work from another map is replaced by a fresh start, for each method', () => {
    const square = crossedSquareMap();
    const stale = { ...freshWork('random:old', map), moves: [{ i: 1, j: 2, delta: -1, tour: [0] }] };
    const works: Works = { plain: stale, annealed: stale };
    expect(workOf(works, 'plain', 'square', square).tour).toEqual(square.start);
    expect(workOf(works, 'annealed', 'square', square).moves).toHaveLength(0);
  });
});
