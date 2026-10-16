import { compareStructures, COMPARE_K } from './compare';
import { makePoints, normaliseRect, scanNearest } from './data';
import { kdFrames } from './frames';
import { BOUNDARY_A, BOUNDARY_B, BOUNDARY_PRECISION, geoView } from './geoScene';
import { cellSize, encode, formatLength } from './geohash';
import { dimensionCurve } from './highDim';
import { buildKd } from './kdtree';
import { QUAD_CAPACITY, openingState, quadPreset } from './opening';
import { MAX_DEPTH, buildQuad, leaves, treeDepth } from './quadtree';
import { DEFAULT_QUERY } from './query';
import { xIndexCost } from './problem';
import { avg, pct } from './text';

const o = openingState();
const rect = normaliseRect(DEFAULT_QUERY.a, DEFAULT_QUERY.b);
const problemPoints = makePoints(o.problem.seed, o.problem.n);
const nn = xIndexCost(problemPoints, 'nn', DEFAULT_QUERY.q, rect);
const range = xIndexCost(problemPoints, 'range', DEFAULT_QUERY.q, rect);

const kdTree = buildKd(makePoints(o.kd.seed, o.kd.n));
const kdNn = kdFrames(kdTree, { kind: 'nn', q: DEFAULT_QUERY.q, k: o.kd.k });
const kdRangeRun = kdFrames(kdTree, { kind: 'range', rect });

const quadOf = (preset: 'uniform' | 'clustered' | 'coincident') => buildQuad(quadPreset(preset, o.quad.seed), o.quad.capacity);
const uniform = quadOf('uniform');
const clustered = quadOf('clustered');
const coincident = quadOf('coincident');

const vector = geoView({ lat: o.geohash.lat, lon: o.geohash.lon }, o.geohash.precision, false, false);
const boundaryOff = geoView(BOUNDARY_A, BOUNDARY_PRECISION, false, true);
const boundaryOn = geoView(BOUNDARY_A, BOUNDARY_PRECISION, true, true);

const rows = compareStructures(makePoints(o.problem.seed, o.problem.n), QUAD_CAPACITY);
const curve = dimensionCurve();

/** Every number the try-this lines and key ideas quote, computed from the same models the scenes use. */
export const FACTS = {
  n: o.problem.n,
  nnCandidates: nn.candidates.length,
  nnWasted: nn.wasted,
  rangeCandidates: range.candidates.length,
  rangeHits: range.hits.length,
  rangeWasted: range.wasted,
  kdN: o.kd.n,
  kdVisited: kdNn.visitedCount,
  kdSkipped: kdNn.prunedCount,
  kdNearest: scanNearest(makePoints(o.kd.seed, o.kd.n), DEFAULT_QUERY.q, 1)[0].toFixed(1),
  kdRangeVisited: kdRangeRun.visitedCount,
  kdRangeHits: kdRangeRun.resultSummary,
  quadCapacity: o.quad.capacity,
  quadUniformCells: uniform.nodes.length,
  quadUniformDepth: treeDepth(uniform),
  quadClusteredCells: clustered.nodes.length,
  quadClusteredDepth: treeDepth(clustered),
  quadCoincidentDepth: treeDepth(coincident),
  quadCoincidentLeaves: leaves(coincident).length,
  maxDepth: MAX_DEPTH,
  vectorCode: vector.code,
  vectorWidth: formatLength(cellSize(o.geohash.precision).widthKm),
  vectorHeight: formatLength(cellSize(o.geohash.precision).heightKm),
  boundaryA: encode(BOUNDARY_A.lat, BOUNDARY_A.lon, BOUNDARY_PRECISION),
  boundaryB: encode(BOUNDARY_B.lat, BOUNDARY_B.lon, BOUNDARY_PRECISION),
  boundaryShared: boundaryOff.nearest?.shared ?? -1,
  boundaryMissed: boundaryOff.others.filter((x) => x.state === 'missed').length,
  boundaryFoundWith: boundaryOn.others.filter((x) => x.state === 'found').length,
  boundaryMissedWith: boundaryOn.others.filter((x) => x.state === 'missed').length,
  compareK: COMPARE_K,
  kdChecks: avg(rows[1].nnChecks),
  quadChecks: avg(rows[2].nnChecks),
  lowDim: pct(curve[0].fraction),
  highDim: pct(curve[curve.length - 1].fraction),
};
