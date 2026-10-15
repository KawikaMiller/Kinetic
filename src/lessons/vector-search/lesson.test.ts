import { describe, expect, it } from 'vitest';
import { pctText } from '../../core/format';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { compareCaption, curseCaption, exactCaption, hnswCaption, ivfCaption } from './captions';
import { compareIndexes, evalQueries, hnswMeanAt } from './compare';
import { curseRows } from './concentration';
import { MAX_K, bruteForce, clusteredPoints, dist, missed, recallAt } from './data';
import { LONGER_LIST, RAISED_NPROBE, curseFacts, exactFacts, hnswFacts, ivfFacts, tableFacts } from './facts';
import { buildHnsw, searchHnsw } from './hnsw';
import lesson from './index';
import { buildIvf, searchIvf } from './ivf';
import { DEFAULT_SETTINGS as S } from './useSettings';

const plain = (node: Parameters<typeof text>[0]) => text(node, { strict: true });
const points = clusteredPoints(S.seed);
const truth = bruteForce(points, S.query, S.k).neighbours;

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: brute force costs N whatever k is; at the defaults Euclidean and cosine differ, and scaled to unit length they agree', () => {
    const f = exactFacts();
    expect(f).toEqual({ n: 400, rawAgree: false, unitAgree: true });
    for (let k = 1; k <= MAX_K; k++) expect(bruteForce(points, S.query, k).computations).toBe(400);
    expect(lesson.tryThis[0]).toContain('400 distance computations whatever k is');
    expect(plain(exactCaption({ n: 400, k: S.k, unit: false, metric: 'euclid', agree: false }))).toContain('different neighbours');
    expect(plain(exactCaption({ n: 400, k: S.k, unit: true, metric: 'euclid', agree: true }))).toContain('they agree');
    expect(plain(exactCaption({ n: 400, k: S.k, unit: true, metric: 'euclid', agree: false }))).not.toContain('they agree');
  });

  it('try-this 2: with one cell probed the scan is that cell and one true neighbour across a border is missed; two cells fix it; all cells cost more than brute force', () => {
    const f = ivfFacts();
    const ivf = buildIvf(points, S.nlist, S.seed);
    const nearestCell = ivf.centroids.reduce((best, c, i) => (dist(c, S.query) < dist(ivf.centroids[best], S.query) ? i : best), 0);
    expect(f.scanned).toBe(ivf.members[nearestCell].length);
    expect([f.recall, f.missed, f.twoRecall, f.allRecall, f.allComputations]).toEqual([0.8, 1, 1, 1, 408]);
    const r = searchIvf(ivf, S.query, S.k, S.nprobe);
    const lost = missed(truth, r.neighbours);
    expect(lost).toHaveLength(1);
    expect(ivf.assign[lost[0].id]).not.toBe(nearestCell);
    expect(lesson.tryThis[1]).toContain(`scans ${f.scanned} of 400 points: recall 80%`);
    expect(plain(ivfCaption({ nlist: S.nlist, nprobe: S.nprobe, scanned: r.scanned.length, n: 400, recall: f.recall, k: S.k, missed: 1, r }))).toContain('1 true neighbour lies across a cell border');
    expect(searchIvf(ivf, S.query, S.k, RAISED_NPROBE).scanned.length).toBe(f.twoScanned);
  });

  it('try-this 3: the default efSearch of 1 ends in a local minimum, and 16 finds every neighbour with far fewer than 400 computations', () => {
    const f = hnswFacts();
    expect(f.shortRecall).toBeLessThan(1);
    expect(f.longRecall).toBe(1);
    expect(f.longComputations).toBeLessThan(400);
    expect(S.efSearch).toBe(1);
    const h = buildHnsw(points, S.m, S.efConstruction, S.seed);
    const r = searchHnsw(h, S.query, S.k, S.efSearch);
    const c = plain(hnswCaption({ r, truth, recall: recallAt(truth, r.neighbours), ef: S.efSearch, k: S.k, n: 400, top: h.top }));
    expect(c).toContain('local minimum');
    expect(lesson.tryThis[2]).toContain(`after ${f.shortComputations} computations`);
    expect(LONGER_LIST).toBe(16);
  });

  it('try-this 4: the spread of distances falls from d = 2 to d = 256 and so does IVF recall, with the numbers the entry prints', () => {
    const f = curseFacts();
    expect(f.first.ratio).toBeGreaterThan(40);
    expect(f.last.ratio).toBeLessThan(0.25);
    expect(f.first.recall).toBe(1);
    expect(f.last.recall).toBeLessThan(f.first.recall);
    expect(lesson.tryThis[3]).toContain(`falls from ${f.first.ratio.toPrecision(3)} to ${f.last.ratio.toFixed(2)}`);
    expect(lesson.tryThis[3]).toContain(`from ${pctText(f.first.recall, 0)} to ${pctText(f.last.recall, 0)}`);
    const rows = curseRows(S.seed);
    const c = plain(curseCaption({ row: rows[4], first: rows[0], last: rows.at(-1)! }));
    expect(c).toContain(`${rows[4].d} dimensions`);
  });

  it('try-this 5: the table at the defaults is measured, and HNSW stores more extra numbers than IVF', () => {
    const f = tableFacts();
    expect(f.brute.computations).toBe(400);
    expect(f.hnsw.extra).toBeGreaterThan(f.ivf.extra);
    expect(f.ivf.extra).toBe(S.nlist * 2 + 400);
    expect(lesson.tryThis[4]).toContain(`HNSW stores ${f.hnsw.extra.toLocaleString('en-US')} extra numbers and IVF ${f.ivf.extra}`);
    expect(plain(compareCaption([f.brute, f.ivf, f.hnsw]))).toContain('brute force is exact at 400 computations');
  });
});

describe('captions follow the model across the controls', () => {
  it('the IVF caption names missed neighbours exactly when some are missed, for every nlist and nprobe', () => {
    for (const nlist of [4, 8, 16, 32]) {
      const ivf = buildIvf(points, nlist, S.seed);
      for (let nprobe = 1; nprobe <= nlist; nprobe += Math.max(1, Math.floor(nlist / 4))) {
        const r = searchIvf(ivf, S.query, S.k, nprobe);
        const lost = missed(truth, r.neighbours).length;
        const c = plain(ivfCaption({ nlist, nprobe, scanned: r.scanned.length, n: 400, recall: recallAt(truth, r.neighbours), k: S.k, missed: lost, r }));
        expect(c.includes('cell border'), `${nlist}/${nprobe}`).toBe(lost > 0);
        expect(c).toContain(`${r.computations} computations`);
      }
    }
  });

  it('the HNSW caption says "local minimum" only for a short list that missed neighbours', () => {
    const h = buildHnsw(points, S.m, S.efConstruction, S.seed);
    for (const ef of [1, 2, 4, 5, 8, 16, 64]) {
      const r = searchHnsw(h, S.query, S.k, ef);
      const recall = recallAt(truth, r.neighbours);
      const c = plain(hnswCaption({ r, truth, recall, ef, k: S.k, n: 400, top: h.top }));
      expect(c.includes('local minimum'), `ef ${ef}`).toBe(recall < 1 && ef <= S.k);
      expect(c.includes('found every true neighbour')).toBe(recall === 1);
    }
  });
});

describe('nothing hidden feeds a number', () => {
  it('the comparison table ignores the query it does not show, follows k and the index settings it prints, and its HNSW row is the HNSW sweep point at the same efSearch', () => {
    const base = compareIndexes(points, S);
    expect(compareIndexes(points, { ...S, query: [1, 1] } as typeof S)).toEqual(base);
    expect(compareIndexes(points, { ...S, nprobe: 5 })[1].recall).toBeGreaterThanOrEqual(base[1].recall);
    const queries = evalQueries(S.seed);
    const h = buildHnsw(points, S.m, S.efConstruction, S.seed);
    for (const [k, ef] of [[5, 1], [5, 16], [3, 128], [10, 32]] as const) {
      const truths = queries.map((q) => bruteForce(points, q, k).neighbours);
      const sweepPoint = hnswMeanAt(h, queries, truths, k, ef);
      const row = compareIndexes(points, { ...S, k, efSearch: ef })[2];
      expect(row.recall, `k ${k} ef ${ef}`).toBe(sweepPoint.recall);
      expect(row.computations, `k ${k} ef ${ef}`).toBe(sweepPoint.computations);
      const own = queries.map((q) => recallAt(truths[queries.indexOf(q)], searchHnsw(h, q, k, ef).neighbours));
      expect(row.recall, `k ${k} ef ${ef} by hand`).toBeCloseTo(own.reduce((x, y) => x + y, 0) / own.length, 12);
    }
  });

  it('the HNSW table row says how much of the graph a search can reach, and recall never exceeds the share of points reachable', () => {
    const row = compareIndexes(points, S)[2];
    expect(row.reachable).toBeGreaterThan(0);
    expect(row.reachable).toBeLessThanOrEqual(1);
    expect(compareIndexes(points, { ...S, efSearch: 400 })[2].recall).toBeLessThanOrEqual(1);
  });

  it('an nprobe above nlist, a k above N, a query outside the plot and an empty dataset are all handled without an exception', () => {
    const ivf = buildIvf(points, 8, S.seed);
    expect(searchIvf(ivf, S.query, 5, 99).cells).toHaveLength(8);
    expect(bruteForce(points, S.query, 9_999).neighbours).toHaveLength(400);
    expect(searchIvf(ivf, [-50, 500], 5, 2).neighbours).toHaveLength(5);
    expect(bruteForce([], [0, 0], 3).neighbours).toEqual([]);
    expect(buildIvf([], 8, 1).members.flat()).toEqual([]);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
