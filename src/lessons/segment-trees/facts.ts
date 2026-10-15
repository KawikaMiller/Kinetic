import { recommend } from './chooser';
import { WORKLOAD_SIZE, makeWorkload, runWorkload } from './cost';
import { fenBuild, fenRange, minBuild, prefixHops, rangeMinWrong, updateHops } from './fenwick';
import { addRange, buildTree, queryRange } from './model';
import { ADD_DEFAULT, CHOOSER_N, DEFAULT_UPDATE_PCT, FENWICK_DEFAULT, FENWICK_MIN_RANGE, FENWICK_VALUES, QUERY_DEFAULT, WORKLOAD_SEED, costStartValues, valuesFor } from './presets';

/** Every number the lesson's text quotes, measured from the model once. */
const small = runWorkload(costStartValues(8), makeWorkload(8, WORKLOAD_SIZE, DEFAULT_UPDATE_PCT, WORKLOAD_SEED)).costs;
const big = runWorkload(costStartValues(1024), makeWorkload(1024, WORKLOAD_SIZE, DEFAULT_UPDATE_PCT, WORKLOAD_SEED)).costs;

const tree = buildTree(valuesFor(8), 'sum');
const q = queryRange(tree, QUERY_DEFAULT.l, QUERY_DEFAULT.r);

const lazyAdd = addRange(tree, ADD_DEFAULT.l, ADD_DEFAULT.r, ADD_DEFAULT.v, true);
const eagerAdd = addRange(tree, ADD_DEFAULT.l, ADD_DEFAULT.r, ADD_DEFAULT.v, false);
const afterQuery = queryRange(lazyAdd.tree, 3, 3, { record: true });

const fen = fenBuild(FENWICK_VALUES, 'sum');
const range = fenRange(fen, FENWICK_DEFAULT.rangeL, FENWICK_DEFAULT.rangeR, 'sum');
const seg = queryRange(buildTree(FENWICK_VALUES, 'sum'), FENWICK_DEFAULT.rangeL - 1, FENWICK_DEFAULT.rangeR - 1);
const minWrong = rangeMinWrong(minBuild(FENWICK_VALUES), FENWICK_MIN_RANGE.r);
const minTrue = Math.min(...FENWICK_VALUES.slice(FENWICK_MIN_RANGE.l - 1, FENWICK_MIN_RANGE.r));

export const FACTS = {
  workload: WORKLOAD_SIZE,
  seed: WORKLOAD_SEED,
  smallPrefix: small.prefix,
  smallSegment: small.segment,
  smallFenwick: small.fenwick,
  bigPrefix: big.prefix,
  bigSegment: big.segment,
  bigFenwick: big.fenwick,
  queryL: QUERY_DEFAULT.l,
  queryR: QUERY_DEFAULT.r,
  queryValue: q.value as number,
  queryCovering: q.covering.map((id) => (tree.nodes[id].l === tree.nodes[id].r ? `[${tree.nodes[id].l}]` : `[${tree.nodes[id].l}, ${tree.nodes[id].r}]`)).join(' '),
  queryCoveringCount: q.covering.length,
  queryTouched: q.touched,
  addL: ADD_DEFAULT.l,
  addR: ADD_DEFAULT.r,
  addV: ADD_DEFAULT.v,
  lazyTouched: lazyAdd.touched,
  eagerTouched: eagerAdd.touched,
  pushedAt: afterQuery.events.filter((e) => e.kind === 'push').length,
  fenQuery: FENWICK_DEFAULT.query,
  fenReads: prefixHops(FENWICK_DEFAULT.query).join(', '),
  fenUpdate: FENWICK_DEFAULT.updateAt,
  fenWrites: updateHops(FENWICK_DEFAULT.updateAt, 16).join(', '),
  rangeL: FENWICK_DEFAULT.rangeL,
  rangeR: FENWICK_DEFAULT.rangeR,
  rangeValue: range.value,
  rangeCells: range.hopsR.length + range.hopsL.length,
  rangeSegTouched: seg.touched,
  rangeSegValue: seg.value as number,
  minL: FENWICK_MIN_RANGE.l,
  minR: FENWICK_MIN_RANGE.r,
  minWrong,
  minTrue,
  sparseNumbers: recommend({ op: 'min', updates: 'none', memory: false }, CHOOSER_N).structure.numbers(CHOOSER_N),
  leanNumbers: recommend({ op: 'min', updates: 'none', memory: true }, CHOOSER_N).structure.numbers(CHOOSER_N),
};
