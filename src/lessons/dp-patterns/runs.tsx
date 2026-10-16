import type { ReactNode } from 'react';
import {
  chainIntervals, chainParenthesis, chainPrefixOnly, chainTable, citiesOf, knapsackChosen, knapsackPath, knapsackPrefixOnly, knapsackRolling, lisEndingAt,
  lisPrefixOnly, lisReconstruct, lisStartingAt, masksBySize, tspBitmask, tspLastOnly, tspMaskOnly, type ChainOrder, type Item, type LoopDirection, type Matrix,
} from './dp';

/** One cell as the grid draws it: empty (not computed), base (given by the base case) or done. */
export interface CellView {
  text: string;
  kind: 'empty' | 'base' | 'done';
}

export type Pos = [number, number];

/** What the grid shows at one moment of a run. */
export interface GridView {
  rowLabels: string[];
  colLabels: string[];
  cells: CellView[][];
  reads: Pos[];
  current: Pos | null;
  path: Pos[];
  /** The answer cell, drawn in red when the state is wrong. */
  answer: Pos | null;
}

/** A DP run in one state definition: a fixed list of steps, a reconstruction, and the captions, all derived from the model. */
export interface DpRun {
  stepCount: number;
  pathCount: number;
  /** True when the state definition cannot give the right answer in general. */
  wrongState: boolean;
  answer: string;
  intro: ReactNode;
  stepSay(step: number): ReactNode;
  pathSay(k: number): ReactNode;
  view(done: number, trace: number): GridView;
}

export interface DpFrame {
  say: ReactNode;
  done: number;
  trace: number;
}

/** Frames: the opening, one per step, then one per cell the reconstruction walks through. */
export function framesOf(run: DpRun): DpFrame[] {
  const frames: DpFrame[] = [{ say: run.intro, done: 0, trace: 0 }];
  for (let s = 1; s <= run.stepCount; s++) frames.push({ say: run.stepSay(s - 1), done: s, trace: 0 });
  for (let k = 1; k <= run.pathCount; k++) frames.push({ say: run.pathSay(k - 1), done: run.stepCount, trace: k });
  return frames;
}

const blank = (rows: number, cols: number): CellView[][] => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: '', kind: 'empty' as const })));
const put = (cells: CellView[][], [r, c]: Pos, text: string, kind: CellView['kind']) => {
  cells[r][c] = { text, kind };
};
const num = (x: number) => (Number.isFinite(x) ? String(x) : '∞');

// ── knapsack ───────────────────────────────────────────────────────────────

export type KnapsackState = 'w' | 'iw' | 'i';

export function knapsackRun(items: readonly Item[], cap: number, state: KnapsackState, dir: LoopDirection): DpRun {
  const n = items.length;
  if (state === 'i') return knapsackPrefixRun(items, cap);
  const effective: LoopDirection = state === 'iw' ? 'down' : dir;
  const rows = knapsackRolling(items, cap, effective);
  const steps: { i: number; w: number }[] = [];
  for (let i = 1; i <= n; i++) {
    for (let k = 0; k <= cap; k++) steps.push({ i, w: effective === 'down' && state === 'w' ? cap - k : k });
  }
  const path = knapsackPath(items, cap, rows, effective);
  const answerCell: Pos = [n, cap];
  const reuse = (i: number, w: number) => (effective === 'up' ? rows[i][w - items[i - 1].w] : rows[i - 1][w - items[i - 1].w]) + items[i - 1].v;
  const counts = knapsackChosen(items, cap, rows, effective);
  const picked = counts.flatMap((c, i) => (c ? [`item ${i + 1}${c > 1 ? ` ×${c}` : ''}`] : [])).join(', ') || 'nothing';
  const where = state === 'w' ? `dp[w] after item ${n}` : 'dp[i][w]';
  return {
    stepCount: steps.length,
    pathCount: path.length,
    wrongState: false,
    answer: String(rows[n][cap]),
    intro:
      state === 'iw'
        ? <>The state is dp[i][w]: the best value using the first i items with capacity w. Row 0 is the base case, all zeros. Each cell reads row i - 1 only.</>
        : <>The state is dp[w], updated in place item by item, {effective === 'down' ? 'capacity from high to low' : 'capacity from low to high'}. Each row of the grid is the array after one item.</>,
    stepSay: (s) => {
      const { i, w } = steps[s];
      const it = items[i - 1];
      if (w < it.w) return <>Item {i} (weight {it.w}) does not fit in capacity {w}: keep {rows[i - 1][w]}.</>;
      const skip = rows[i - 1][w];
      const via = reuse(i, w);
      const source = effective === 'up' ? `dp[${w - it.w}] already includes item ${i}` : `dp[${w - it.w}] from before item ${i}`;
      return <>Item {i} (weight {it.w}, value {it.v}), capacity {w}: skip gives {skip}, take gives {via - it.v} + {it.v} = {via} ({source}). Keep {rows[i][w]}.</>;
    },
    pathSay: (k) => {
      const [r, c] = path[k];
      if (k === 0) return <>Walk back from the answer, {where} = {rows[n][cap]}: it takes {picked}.</>;
      return r === path[k - 1][0]
        ? <>Item {r} is taken again: its value came from the same row, capacity {c} left.</>
        : <>Row {r}, capacity {c}: the walk moved up a row.</>;
    },
    view: (done, trace) => {
      const cells = blank(n + 1, cap + 1);
      for (let w = 0; w <= cap; w++) put(cells, [0, w], '0', 'base');
      for (let s = 0; s < done; s++) put(cells, [steps[s].i, steps[s].w], String(rows[steps[s].i][steps[s].w]), 'done');
      const cur = done > 0 && trace === 0 ? steps[done - 1] : null;
      const reads: Pos[] = [];
      if (cur) {
        reads.push([cur.i - 1, cur.w]);
        if (cur.w >= items[cur.i - 1].w) reads.push([effective === 'up' ? cur.i : cur.i - 1, cur.w - items[cur.i - 1].w]);
      }
      return {
        rowLabels: ['none', ...items.map((it, i) => `${i + 1}: ${it.w}/${it.v}`)],
        colLabels: Array.from({ length: cap + 1 }, (_, w) => String(w)),
        cells,
        reads,
        current: cur ? [cur.i, cur.w] : null,
        path: path.slice(0, trace),
        answer: done === steps.length ? answerCell : null,
      };
    },
  };
}

function knapsackPrefixRun(items: readonly Item[], cap: number): DpRun {
  const n = items.length;
  const out = knapsackPrefixOnly(items, cap);
  const truth = knapsackRolling(items, cap, 'down')[n][cap];
  return {
    stepCount: n,
    pathCount: 0,
    wrongState: out[n].value !== truth,
    answer: String(out[n].value),
    intro: <>The state is only dp[i]: one value per prefix of items. It has to remember the weight of the one set behind it, and cannot say what else was possible.</>,
    stepSay: (s) => {
      const it = items[s];
      const prev = out[s];
      return prev.weight + it.w <= cap
        ? <>Item {s + 1} (weight {it.w}, value {it.v}): the stored set weighs {prev.weight}, so it fits: dp[{s + 1}] = {out[s + 1].value}.</>
        : <>Item {s + 1} (weight {it.w}): the stored set weighs {prev.weight} and {prev.weight} + {it.w} is over {cap}, so it is skipped, even if dropping an earlier item would make room.</>;
    },
    pathSay: () => null,
    view: (done) => {
      const cells = blank(1, n + 1);
      put(cells, [0, 0], '0', 'base');
      for (let s = 1; s <= done; s++) put(cells, [0, s], String(out[s].value), 'done');
      return {
        rowLabels: ['dp[i]'],
        colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
        cells,
        reads: done > 0 ? [[0, done - 1]] : [],
        current: done > 0 ? [0, done] : null,
        path: [],
        answer: done === n ? [0, n] : null,
      };
    },
  };
}

// ── longest increasing subsequence ─────────────────────────────────────────

export type LisState = 'end' | 'start' | 'prefix';

export function lisRun(a: readonly number[], state: LisState): DpRun {
  const n = a.length;
  const base = (): CellView[][] => {
    const cells = blank(2, n);
    a.forEach((x, i) => put(cells, [0, i], String(x), 'base'));
    return cells;
  };
  const colLabels = a.map((_, i) => String(i));
  if (state === 'prefix') {
    const out = lisPrefixOnly(a);
    return {
      stepCount: n,
      pathCount: 0,
      wrongState: out[n].len !== lisEndingAt(a).length,
      answer: String(out[n].len),
      intro: <>The state is "best length within the first i elements". To extend it the algorithm keeps one subsequence's last value, and cannot know about a lower one.</>,
      stepSay: (s) => {
        const prev = out[s];
        if (prev.last === null) return <>{a[s]} is the first element: the length becomes 1.</>;
        return a[s] > prev.last
          ? <>{a[s]} is above the stored last value {prev.last}: the length becomes {out[s + 1].len}.</>
          : <>{a[s]} is not above the stored last value {prev.last}: the length stays {prev.len}, though a subsequence ending lower may exist.</>;
      },
      pathSay: () => null,
      view: (done) => {
        const cells = base();
        for (let s = 1; s <= done; s++) put(cells, [1, s - 1], String(out[s].len), 'done');
        return { rowLabels: ['a', 'best in first i'], colLabels, cells, reads: done > 1 ? [[1, done - 2]] : [], current: done > 0 ? [1, done - 1] : null, path: [], answer: done === n ? [1, n - 1] : null };
      },
    };
  }
  const forward = state === 'end';
  const end = lisEndingAt(a);
  const start = lisStartingAt(a);
  const dp = forward ? end.dp : start.dp;
  const order = Array.from({ length: n }, (_, k) => (forward ? k : n - 1 - k));
  const pathIdx = forward ? lisReconstruct(end) : (() => {
    const out: number[] = [];
    for (let i = start.start; i !== -1 && n > 0; i = start.next[i]) out.push(i);
    return out;
  })();
  const sources = (i: number) => (forward ? a.flatMap((x, j) => (j < i && x < a[i] ? [j] : [])) : a.flatMap((x, j) => (j > i && x > a[i] ? [j] : [])));
  return {
    stepCount: n,
    pathCount: pathIdx.length,
    wrongState: false,
    answer: String(forward ? end.length : start.length),
    intro: forward
      ? <>The state is dp[i]: the longest increasing subsequence that ends exactly at element i. Every earlier smaller element is a way to extend.</>
      : <>The state is dp[i]: the longest increasing subsequence that starts exactly at element i, filled from the right. It is the mirror image, and works too.</>,
    stepSay: (s) => {
      const i = order[s];
      const src = sources(i);
      if (src.length === 0) return <>{a[i]} has no {forward ? 'earlier smaller' : 'later larger'} element: dp[{i}] = 1, just itself.</>;
      const bestJ = src.reduce((b, j) => (dp[j] > dp[b] ? j : b));
      return <>{a[i]} can follow {forward ? 'the smaller earlier' : 'before the larger later'} elements at {src.join(', ')}; the best of them has dp = {dp[bestJ]}, so dp[{i}] = {dp[i]}.</>;
    },
    pathSay: (k) => <>Rebuild: {k === 0 ? 'start at' : 'then'} index {pathIdx[k]}, value {a[pathIdx[k]]}.</>,
    view: (done, trace) => {
      const cells = base();
      for (let s = 0; s < done; s++) put(cells, [1, order[s]], String(dp[order[s]]), 'done');
      const cur = done > 0 && trace === 0 ? order[done - 1] : null;
      return {
        rowLabels: ['a', 'dp[i]'],
        colLabels,
        cells,
        reads: cur === null ? [] : sources(cur).map((j) => [1, j] as Pos),
        current: cur === null ? null : [1, cur],
        path: pathIdx.slice(0, trace).map((i) => [1, i] as Pos),
        answer: done === n && n > 0 ? [1, forward ? end.end : start.start] : null,
      };
    },
  };
}

// ── matrix-chain ───────────────────────────────────────────────────────────

export type ChainState = 'ij' | 'ijk' | 'i';

export function chainRun(dims: readonly number[], state: ChainState, order: ChainOrder): DpRun {
  const n = dims.length - 1;
  const names = Array.from({ length: n }, (_, k) => `A${k + 1}`);
  if (state === 'i') {
    const out = chainPrefixOnly(dims);
    const truth = chainTable(dims).answer;
    return {
      stepCount: n - 1,
      pathCount: 0,
      wrongState: out[n] !== truth,
      answer: String(out[n]),
      intro: <>The state is dp[i]: the cheapest cost for the first i matrices. The last product can only join that prefix with one more matrix, so only one grouping is ever tried.</>,
      stepSay: (s) => <>Add A{s + 2}: dp[{s + 2}] = {out[s + 1]} + {dims[0]}×{dims[s + 1]}×{dims[s + 2]} = {out[s + 2]}. No other split is tried.</>,
      pathSay: () => null,
      view: (done) => {
        const cells = blank(1, n);
        put(cells, [0, 0], '0', 'base');
        for (let s = 1; s <= done; s++) put(cells, [0, s], String(out[s + 1]), 'done');
        return { rowLabels: ['dp[i]'], colLabels: names, cells, reads: done > 0 ? [[0, done - 1]] : [], current: done > 0 ? [0, done] : null, path: [], answer: done === n - 1 ? [0, n - 1] : null };
      },
    };
  }
  const run = chainTable(dims, order);
  const intervals = chainIntervals(run.split, 1, n).filter(([i, j]) => i !== j);
  const stepsList = run.steps;
  const splitText = state === 'ijk' ? ' (the split k is part of the state in this version)' : '';
  return {
    stepCount: stepsList.length,
    pathCount: intervals.length,
    wrongState: false,
    answer: String(run.answer),
    intro: <>The state is dp[i][j]: the cheapest way to multiply matrices i to j{splitText}. Single matrices cost 0. {order === 'length' ? 'Shorter intervals are filled before longer ones.' : 'Cells are filled row by row, whatever they need.'}</>,
    stepSay: (s) => {
      const st = stepsList[s];
      const list = st.candidates.map((c) => `k=${c.k}: ${c.cost}`).join(', ');
      const unfilled = st.unfilledReads > 0 ? ` It read ${st.unfilledReads} cell${st.unfilledReads === 1 ? '' : 's'} not filled yet, counted as 0.` : '';
      return <>Interval {st.i} to {st.j}, splits {list}. The cheapest is k = {st.best}: dp[{st.i}][{st.j}] = {st.value}.{unfilled}</>;
    },
    pathSay: (k) => {
      const [i, j] = intervals[k];
      return k === 0 ? <>Rebuild the grouping from the split table: {chainParenthesis(run.split, 1, n)}. The whole chain, {i} to {j}, splits at {run.split[i][j]}.</> : <>Sub-interval {i} to {j} splits at {run.split[i][j]}.</>;
    },
    view: (done, trace) => {
      const cells = blank(n, n);
      for (let i = 1; i <= n; i++) put(cells, [i - 1, i - 1], '0', 'base');
      for (let s = 0; s < done; s++) put(cells, [stepsList[s].i - 1, stepsList[s].j - 1], String(stepsList[s].value), 'done');
      const cur = done > 0 && trace === 0 ? stepsList[done - 1] : null;
      return {
        rowLabels: names,
        colLabels: names,
        cells,
        reads: cur ? [[cur.i - 1, cur.best - 1], [cur.best, cur.j - 1]] : [],
        current: cur ? [cur.i - 1, cur.j - 1] : null,
        path: intervals.slice(0, trace).map(([i, j]) => [i - 1, j - 1] as Pos),
        answer: done === stepsList.length ? [0, n - 1] : null,
      };
    },
  };
}

// ── bitmask TSP ────────────────────────────────────────────────────────────

export type TspState = 'ml' | 'm' | 'l';

const maskLabel = (mask: number) => `{${citiesOf(mask).join(',')}}`;

export function tspRun(dist: Matrix, state: TspState): DpRun {
  const n = dist.length;
  const groups = masksBySize(n);
  const run = tspBitmask(dist);
  const colLabels = Array.from({ length: n - 1 }, (_, c) => String(c + 1));
  const layerOf = (size: number) => groups[size];
  if (state === 'l') return tspLastRun(dist, run.best);
  if (state === 'm') {
    const wrong = tspMaskOnly(dist);
    const masks = groups.slice(2).flat();
    return {
      stepCount: masks.length,
      pathCount: 0,
      wrongState: wrong.best !== run.best,
      answer: String(wrong.best),
      intro: <>The state is dp[mask]: the cheapest path through a set of cities, with only its end city remembered. Each set extends from one stored path, which may end in the wrong place.</>,
      stepSay: (s) => {
        const e = wrong.table.get(masks[s])!;
        return <>Set {maskLabel(masks[s])}: extending the stored paths gives {e.cost}, ending at city {e.end}. The cheaper path to a smaller set that ended elsewhere was thrown away.</>;
      },
      pathSay: () => null,
      view: (done) => {
        const size = done === 0 ? 1 : citiesOf(masks[done - 1]).length;
        const rows = layerOf(size);
        const cells = blank(rows.length, 1);
        rows.forEach((m, r) => {
          const e = wrong.table.get(m)!;
          const idx = masks.indexOf(m);
          if (size === 1) put(cells, [r, 0], `${e.cost}→${e.end}`, 'base');
          else if (idx < done) put(cells, [r, 0], `${e.cost}→${e.end}`, 'done');
        });
        const cur = done > 0 ? layerOf(size).indexOf(masks[done - 1]) : -1;
        const last = done === masks.length;
        return { rowLabels: rows.map(maskLabel), colLabels: ['cost→end'], cells, reads: [], current: cur >= 0 ? [cur, 0] : null, path: [], answer: last ? [0, 0] : null };
      },
    };
  }
  const steps = run.states.filter((s) => citiesOf(s.mask).length >= 2);
  const full = (1 << (n - 1)) - 1;
  const tourText = run.tour.join(' → ');
  return {
    stepCount: steps.length,
    pathCount: 1,
    wrongState: false,
    answer: String(run.best),
    intro: <>The state is dp[mask][last]: the cheapest path from city 0 through exactly the cities in mask, ending at last. Single-city rows are the base: the direct distance from city 0.</>,
    stepSay: (s) => {
      const st = steps[s];
      const list = st.candidates.map((c) => `via ${c.from}: ${c.cost}`).join(', ');
      return <>Cities {maskLabel(st.mask)} ending at {st.last}: {list}. The cheapest is via {st.from}, so the cell is {st.value}.</>;
    },
    pathSay: () => <>Close the tour: the cheapest finish is {run.table.get(full * 16 + run.closing)!.value} + {dist[run.closing][0]} (back from {run.closing}) = {run.best}. The tour is {tourText}.</>,
    view: (done, trace) => {
      const size = done === 0 ? 1 : citiesOf(steps[done - 1].mask).length;
      const rows = layerOf(size);
      const cells = blank(rows.length, n - 1);
      rows.forEach((m, r) => {
        for (const last of citiesOf(m)) {
          const st = run.table.get(m * 16 + last)!;
          if (size === 1) put(cells, [r, last - 1], String(st.value), 'base');
          else if (steps.indexOf(st) < done) put(cells, [r, last - 1], String(st.value), 'done');
        }
      });
      const cur = done > 0 && trace === 0 ? steps[done - 1] : null;
      const closingCell: Pos = [0, run.closing - 1];
      return {
        rowLabels: rows.map(maskLabel),
        colLabels,
        cells,
        reads: [],
        current: cur ? [rows.indexOf(cur.mask), cur.last - 1] : null,
        path: trace >= 1 ? [closingCell] : [],
        answer: done === steps.length ? closingCell : null,
      };
    },
  };
}

function tspLastRun(dist: Matrix, truth: number): DpRun {
  const n = dist.length;
  const { rows, best } = tspLastOnly(dist);
  return {
    stepCount: n,
    pathCount: 0,
    wrongState: best !== truth,
    answer: String(best),
    intro: <>The state is dp[last]: the cheapest walk of k edges ending at each city, with no record of which cities were visited. Row k is built from row k - 1.</>,
    stepSay: (s) => <>Walks of {s + 1} edge{s === 0 ? '' : 's'}: the cheapest back at city 0 is {num(rows[s + 1][0])}{s + 1 === n ? `, a closed walk of ${n} edges that may revisit cities` : ''}.</>,
    pathSay: () => null,
    view: (done) => {
      const cells = blank(n + 1, n);
      rows[0].forEach((v, c) => put(cells, [0, c], num(v), 'base'));
      for (let k = 1; k <= done; k++) rows[k].forEach((v, c) => put(cells, [k, c], num(v), 'done'));
      return {
        rowLabels: Array.from({ length: n + 1 }, (_, k) => `${k} edges`),
        colLabels: Array.from({ length: n }, (_, c) => String(c)),
        cells,
        reads: done > 0 ? [[done - 1, 0]] : [],
        current: done > 0 ? [done, 0] : null,
        path: [],
        answer: done === n ? [n, 0] : null,
      };
    },
  };
}
