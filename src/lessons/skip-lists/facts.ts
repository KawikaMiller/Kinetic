import { insertFrames } from './frames';
import { SkipList, buildList, flipHeight, monteCarlo, pughCost, touchedNodes } from './model';
import { DEFAULT_COIN_SEED, DEFAULT_INSERT_KEY, DEFAULT_KEYS, DEFAULT_P, DEFAULT_TARGET, MC_FOCUS_N, MC_SEEDS, coinFlips, defaultEntries } from './presets';
import { mulberry32 } from '../../core/random';
import { plainSteps } from './text';

/** Every number the lesson's text quotes, measured from the model once. */
const entries = defaultEntries();
const list = buildList(entries);
const snap = list.snapshot();
const hit = list.search(DEFAULT_TARGET);
const ABSENT = DEFAULT_INSERT_KEY;
const miss = list.search(ABSENT);
const flips = coinFlips(DEFAULT_COIN_SEED, 0, DEFAULT_P, 'fair');
const insert = insertFrames(entries, DEFAULT_INSERT_KEY, flips, null);
const insertLast = insert[insert.length - 1];
const RIGGED_KEY = 36;
const afterDefault = insertLast.snap;
const rigged = flipHeight(mulberry32(0), DEFAULT_P, 'tails');
const WHY_KEY = 53;
const whyFlips = coinFlips(DEFAULT_COIN_SEED, 1, DEFAULT_P, 'fair');
const whyFrames = insertFrames(afterDefault.towers.map((t) => ({ key: t.key, height: t.height })), WHY_KEY, whyFlips, null);
const whyLast = whyFrames[whyFrames.length - 1];
const mc = monteCarlo(MC_FOCUS_N, DEFAULT_P, MC_SEEDS);
const mcQuarter = monteCarlo(MC_FOCUS_N, 0.25, MC_SEEDS);

/** An all-tails list of n keys is a plain linked list: the mean steps over all keys is (n - 1) / 2. */
const allTailsMean = (n: number): number => {
  const l = new SkipList();
  for (let k = 1; k <= n; k++) l.insert(k, 1);
  let total = 0;
  for (let k = 1; k <= n; k++) total += l.search(k).steps;
  return total / n;
};

export const FACTS = {
  keys: DEFAULT_KEYS.length,
  levels: snap.levels,
  target: DEFAULT_TARGET,
  hitSteps: hit.steps,
  hitMoves: hit.moves,
  hitDrops: hit.drops,
  hitLinear: plainSteps(snap, DEFAULT_TARGET),
  absent: ABSENT,
  missSteps: miss.steps,
  missPred: miss.pred as number,
  missNext: miss.candidate as number,
  insertKey: DEFAULT_INSERT_KEY,
  coinsText: flips.flips.map((h) => (h ? 'heads' : 'tails')).join(', '),
  insertHeight: flips.height,
  insertWrites: insertLast.writes,
  riggedKey: RIGGED_KEY,
  riggedHeight: rigged.height,
  riggedWrites: 2 * rigged.height,
  mcN: MC_FOCUS_N,
  mcMean: mc.mean,
  mcFormula: pughCost(MC_FOCUS_N, DEFAULT_P),
  mcWorst: mc.worst,
  mcPointers: mc.pointers,
  mcPointersQuarter: mcQuarter.pointers,
  allTailsMean: allTailsMean(MC_FOCUS_N),
  whyKey: WHY_KEY,
  whyWrites: whyLast.writes,
  whyHeight: whyFlips.height,
  whyTouched: touchedNodes(afterDefault, whyLast.snap).length,
  whyNodes: afterDefault.towers.length + 1,
};
