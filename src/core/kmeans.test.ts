import { describe, expect, it } from 'vitest';
import { blobs } from './fixtures/datasets';
import { assignAll, initPlusPlus, initRandom, initShuffled, inertia, kmeans, lloydPasses, nearest, sqDist, updateCentroids } from './kmeans';
import { mulberry32 } from './random';

const LINE = [[0], [1], [10], [11]];
const BLOBS = blobs({ seed: 3, centers: [[0, 0], [6, 0], [3, 5]], n: 20, spread: 0.6 }).map((p) => [p.x, p.y]);

describe('distance and assignment', () => {
  it('sqDist works in any dimension', () => {
    expect(sqDist([0, 0], [3, 4])).toBe(25);
    expect(sqDist([1, 2, 3, 4], [1, 2, 3, 4])).toBe(0);
    expect(sqDist([0, 0, 0], [1, 2, 2])).toBe(9);
  });

  it('nearest breaks a tie towards the lower index', () => {
    expect(nearest([5], [[0], [10]])).toBe(0);
    expect(nearest([6], [[0], [10]])).toBe(1);
    expect(assignAll(LINE, [[0], [11]])).toEqual([0, 0, 1, 1]);
  });

  it('inertia is the sum of squared distances to the assigned centroid', () => {
    expect(inertia([[0, 0], [3, 4]], [[0, 0], [0, 4]], [0, 1])).toBe(9);
  });
});

describe('Lloyd passes', () => {
  it('a hand-worked 1-D run: three passes, the last finds nothing moving', () => {
    const passes = [...lloydPasses(LINE, [[0], [1]])];
    expect(passes.map((p) => p.assign)).toEqual([[0, 1, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]]);
    expect(passes.map((p) => p.changed)).toEqual([4, 1, 0]);
    expect(passes[0].update?.centroids[1][0]).toBeCloseTo(22 / 3, 12);
    expect(passes[1].update?.centroids).toEqual([[0.5], [10.5]]);
    expect(passes[2].settled && passes[2].update === null).toBe(true);
  });

  it('stops at maxIterations without settling', () => {
    expect([...lloydPasses(LINE, [[0], [1]], { maxIterations: 2 })]).toHaveLength(2);
  });
});

describe('kmeans', () => {
  it('reports iterations and the distance computations they cost (points x centroids per pass)', () => {
    const run = kmeans(LINE, [[0], [1]]);
    expect(run.iterations).toBe(3);
    expect(run.computations).toBe(3 * LINE.length * 2);
    expect(run.centroids).toEqual([[0.5], [10.5]]);
    expect(run.assign).toEqual([0, 0, 1, 1]);
  });

  it('an unsettled run is finished with one more counted assignment, so assign agrees with centroids', () => {
    const run = kmeans(LINE, [[0], [1]], { maxIterations: 2 });
    expect(run.iterations).toBe(2);
    expect(run.computations).toBe(3 * LINE.length * 2);
    expect(run.assign).toEqual(assignAll(LINE, run.centroids));
  });

  it('is deterministic and ends with every point in its nearest centroid, from every start, on 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const init of [initRandom, initShuffled, initPlusPlus]) {
        const start = init(BLOBS, 3, mulberry32(seed));
        const run = kmeans(BLOBS, start);
        expect(kmeans(BLOBS, start)).toEqual(run);
        expect(run.assign).toEqual(assignAll(BLOBS, run.centroids));
      }
    }
  });

  it('keeps the centroid of an empty cluster, or reseeds it when asked', () => {
    const assign = [0, 0, 1, 1];
    const centroids = [[0.5], [10.5], [100]];
    expect(updateCentroids(LINE, assign, centroids, 'keep')).toEqual({ centroids, reseeded: [] });
    const reseeded = updateCentroids(LINE, assign, centroids, 'reseed');
    expect(reseeded.reseeded).toHaveLength(1);
    expect(reseeded.reseeded[0].cluster).toBe(2);
    expect(LINE).toContainEqual(reseeded.centroids[2]);
  });

  it('with more centroids than points the extra ones stay put (keep) without a NaN', () => {
    const run = kmeans([[0], [10]], [[0], [10], [50]]);
    expect(run.centroids).toEqual([[0], [10], [50]]);
  });
});

describe('starts', () => {
  it('initShuffled returns min(k, n) distinct points', () => {
    const start = initShuffled(LINE, 9, mulberry32(1));
    expect(start).toHaveLength(LINE.length);
    expect(new Set(start.map(String)).size).toBe(LINE.length);
  });

  it('initRandom and initPlusPlus return k points of the data', () => {
    for (const init of [initRandom, initPlusPlus]) {
      const start = init(LINE, 3, mulberry32(2));
      expect(start).toHaveLength(3);
      for (const c of start) expect(LINE).toContainEqual(c);
    }
  });
});
