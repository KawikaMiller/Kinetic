/**
 * vector-search: the numbers the try-this entries quote, computed from the same models the scenes run, from each scene's default
 * state (the settings in `DEFAULT_SETTINGS`).
 */
import { cosine, normalize } from '../../core/vec';
import { compareIndexes } from './compare';
import { curseRows } from './concentration';
import { bruteForce, clusteredPoints, missed, recallAt } from './data';
import { buildHnsw, searchHnsw } from './hnsw';
import { buildIvf, searchIvf } from './ivf';
import { DEFAULT_SETTINGS as S } from './useSettings';

/** The efSearch the HNSW entry raises to. */
export const LONGER_LIST = 16;
/** The nprobe the IVF entry raises to before probing every cell. */
export const RAISED_NPROBE = 2;

const points = clusteredPoints(S.seed);

/** Try-this 1: do Euclidean and cosine pick the same k as drawn, and when scaled to unit length. */
export function exactFacts() {
  const ids = (ps: readonly (readonly number[])[], q: readonly number[], metric: 'euclid' | 'cosine') =>
    (metric === 'euclid' ? bruteForce(ps, q, S.k).neighbours.map((x) => x.id) : ps.map((p, id) => ({ id, c: cosine(p, q) })).sort((a, b) => b.c - a.c || a.id - b.id).slice(0, S.k).map((x) => x.id)).sort((a, b) => a - b).join();
  const unit = points.map((p) => normalize(p)!);
  const uq = normalize(S.query)!;
  return { n: points.length, rawAgree: ids(points, S.query, 'euclid') === ids(points, S.query, 'cosine'), unitAgree: ids(unit, uq, 'euclid') === ids(unit, uq, 'cosine') };
}

/** Try-this 2: the default IVF, then every cell probed. */
export function ivfFacts() {
  const ivf = buildIvf(points, S.nlist, S.seed);
  const truth = bruteForce(points, S.query, S.k).neighbours;
  const some = searchIvf(ivf, S.query, S.k, S.nprobe);
  const two = searchIvf(ivf, S.query, S.k, RAISED_NPROBE);
  const all = searchIvf(ivf, S.query, S.k, S.nlist);
  return { nlist: S.nlist, nprobe: S.nprobe, scanned: some.scanned.length, recall: recallAt(truth, some.neighbours), missed: missed(truth, some.neighbours).length, twoRecall: recallAt(truth, two.neighbours), twoScanned: two.scanned.length, allRecall: recallAt(truth, all.neighbours), allComputations: all.computations };
}

/** Try-this 3: the default HNSW search with efSearch 1, then LONGER_LIST. */
export function hnswFacts() {
  const h = buildHnsw(points, S.m, S.efConstruction, S.seed);
  const truth = bruteForce(points, S.query, S.k).neighbours;
  const short = searchHnsw(h, S.query, S.k, S.efSearch);
  const long = searchHnsw(h, S.query, S.k, LONGER_LIST);
  return { shortRecall: recallAt(truth, short.neighbours), shortComputations: short.computations, longRecall: recallAt(truth, long.neighbours), longComputations: long.computations, layers: h.top + 1 };
}

/** Try-this 4: the first and last dimension of the curse scene. */
export function curseFacts() {
  const rows = curseRows(S.seed);
  return { first: rows[0], last: rows[rows.length - 1] };
}

/** Try-this 5: the table at the defaults. */
export function tableFacts() {
  const [brute, ivf, hnsw] = compareIndexes(points, S);
  return { brute, ivf, hnsw };
}
