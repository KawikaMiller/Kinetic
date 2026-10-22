/**
 * count-min-heavy-hitters: the numbers the try-this entries quote, computed from the same models the scenes run, from each scene's
 * default state.
 */
import { heavyRun, quality, depthFor, epsilonOf, deltaOf, estimate, widthFor, UNIVERSE, exactCounts, exactTop, keyOfRank, zipfStream } from '../../core/countMin';
import { GRID_D, GRID_W, STREAM_BURST, buildGrid, cellRole, inspect, itemsByCount, polluted, undercounted, wordStream } from './grid';
import { MERGE_DEPTH, MERGE_N, MERGE_WIDTH, mergeRun } from './merge';
import { DEFAULT_DEPTH, DEFAULT_SEED, DEFAULT_SKEW, DEFAULT_STREAM, DEFAULT_WIDTH, GHOST_DELETES, MIN_SCENE_WIDTH, PLAIN, errorRun, overCount, overLimit, underCount } from './stream';

/** The chip the size entry presses, and the width the heavy-hitters entry drags down to. */
export const CHIP = { epsilon: 0.05, delta: 0.05 } as const;
export const SMALL_WIDTH = MIN_SCENE_WIDTH;

/** Try-this 1: stream 30 items into the small grid and look at the item with the biggest error (the most popular on a tie). */
export function gridFacts() {
  const items = wordStream(STREAM_BURST, 7, 0);
  const model = buildGrid(items);
  const looks = itemsByCount(model).map((item) => inspect(model, item));
  const look = looks.reduce((a, b) => (b.estimate - b.truth > a.estimate - a.truth ? b : a));
  let red = 0;
  for (let r = 0; r < GRID_D; r++) for (let c = 0; c < GRID_W; c++) if (cellRole(model, look, r, c) === 'shared') red++;
  const ownShared = look.cells.filter((c) => polluted(model, c.row, c.col)).length;
  return { word: look.item, truth: look.truth, estimate: look.estimate, below: undercounted(model), red, ownShared, distinct: model.truth.size };
}

/** Try-this 2: the default size, then the epsilon = 0.05, delta = 0.05 chip. */
export function sizeFacts() {
  const stream = zipfStream(DEFAULT_STREAM, DEFAULT_SKEW, DEFAULT_SEED);
  const at = (w: number, d: number) => {
    const run = errorRun(stream, w, d, DEFAULT_SEED);
    const limit = epsilonOf(w) * run.n;
    return { w, d, limit, share: overLimit(run, limit) / UNIVERSE, delta: deltaOf(d) };
  };
  return { normal: at(DEFAULT_WIDTH, DEFAULT_DEPTH), chip: at(widthFor(CHIP.epsilon), depthFor(CHIP.delta)) };
}

/** Try-this 3: all five of the true top items at the default size, and at the smallest width. */
export function heavyFacts() {
  const stream = zipfStream(DEFAULT_STREAM, DEFAULT_SKEW, DEFAULT_SEED);
  const recall = (w: number) => quality(stream, heavyRun(stream, w, DEFAULT_DEPTH, DEFAULT_SEED, stream.length)).recall;
  return { atDefault: recall(DEFAULT_WIDTH), atSmall: recall(SMALL_WIDTH) };
}

/** Try-this 4: merged against combined, with the same seeds and with different ones. */
export function mergeFacts() {
  const stream = zipfStream(MERGE_N, DEFAULT_SKEW, DEFAULT_SEED);
  const counts = exactCounts(stream);
  const same = mergeRun(stream, MERGE_WIDTH, MERGE_DEPTH, DEFAULT_SEED, true);
  const diff = mergeRun(stream, MERGE_WIDTH, MERGE_DEPTH, DEFAULT_SEED, false);
  return {
    cells: same.merged.counts.length,
    sameEqual: same.equal,
    differing: diff.differingCells,
    below: exactTop(counts).filter((r) => estimate(diff.merged, keyOfRank(r)) < counts[r]).length,
  };
}

/** Try-this 5: the mean estimator, then deletes of items that were never added. */
export function breakFacts() {
  const stream = zipfStream(DEFAULT_STREAM, DEFAULT_SKEW, DEFAULT_SEED);
  const worst = (run: ReturnType<typeof errorRun>) => Math.max(...run.errors);
  const min = errorRun(stream, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_SEED, PLAIN);
  const mean = errorRun(stream, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_SEED, { how: 'mean', ghostDeletes: 0 });
  const ghosts = errorRun(stream, DEFAULT_WIDTH, DEFAULT_DEPTH, DEFAULT_SEED, { how: 'min', ghostDeletes: GHOST_DELETES });
  return { minWorst: worst(min), meanWorst: worst(mean), minOver: overCount(min), meanOver: overCount(mean), under: underCount(ghosts), underAtStart: underCount(min) };
}
