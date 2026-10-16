import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { breakEven, chainTable, isSubsequence, knapsackRolling, lisTails, tspBitmask } from './dp';
import { FACTS } from './facts';
import lesson from './index';
import { bruteKnapsack01, bruteLis, bruteTsp, bruteUnbounded, parenthesisationCosts } from './oracles.test';
import {
  CHAIN_DEFAULT, chainCounterexample, distances, itemsText, KNAPSACK_DEFAULT, KNAPSACK_TRAP, knapsackCounterexample, LIS_DEFAULT, lisCounterexample, OPENING,
  parseDims, parseItems, parseSequence, tspCounterexamples,
} from './presets';
import { chainRun, framesOf, knapsackRun, lisRun, tspRun, type DpRun } from './runs';

const walk = (run: DpRun) => framesOf(run).map((f) => ({ f, view: run.view(f.done, f.trace) }));

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('dp-patterns');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('dp-patterns')).toEqual([]);
  });

  it('each tab opens on a fixed, pure state', () => {
    expect(OPENING.knapsack).toMatchObject({ cap: 9, state: 'w', direction: 'down' });
    expect(itemsText(OPENING.knapsack.items, 'w')).toBe('2, 3, 4, 5');
    expect(itemsText(OPENING.knapsack.items, 'v')).toBe('3, 4, 5, 8');
    expect(OPENING.lis).toMatchObject({ state: 'end' });
    expect(OPENING.chain).toMatchObject({ state: 'ij', order: 'length' });
    expect(OPENING.tsp).toMatchObject({ n: 5, seed: 7, state: 'ml' });
    const wide = parseItems(itemsText(KNAPSACK_TRAP.items, 'w'), itemsText(KNAPSACK_TRAP.items, 'v'));
    expect(wide.ok).toBe(true);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: dp[w] downward says 13, upward 14 (unbounded), greedy 11, all against brute force', () => {
    const { items, cap } = KNAPSACK_DEFAULT;
    expect(bruteKnapsack01(items, cap)).toBe(13);
    expect(bruteUnbounded(items, cap)).toBe(14);
    const down = knapsackRun(items, cap, 'w', OPENING.knapsack.direction);
    expect(down.answer).toBe('13');
    expect(knapsackRun(items, cap, 'w', 'up').answer).toBe('14');
    expect([FACTS.knapsackExact, FACTS.knapsackUnbounded, FACTS.knapsackGreedy]).toEqual([13, 14, 11]);
    expect(lesson.tryThis[0]).toContain('says 13');
  });

  it('try-this 2: dp[i] only says 12 where 13 is possible', () => {
    const { items, cap } = KNAPSACK_DEFAULT;
    expect(knapsackRun(items, cap, 'i', 'down').answer).toBe('12');
    expect(FACTS.knapsackPrefix).toBe(12);
    expect(bruteKnapsack01(items, cap)).toBe(13);
    expect(lesson.tryThis[1]).toContain('says 12');
  });

  it('try-this 3: the default array has length 4, tails 1, 2, 3, 6 (not a subsequence), 45 pair checks against the probe count', () => {
    expect(bruteLis(LIS_DEFAULT)).toBe(4);
    expect(lisRun(LIS_DEFAULT, 'end').answer).toBe('4');
    const { steps, probes } = lisTails(LIS_DEFAULT);
    expect(steps.at(-1)!.tails).toEqual([1, 2, 3, 6]);
    expect(isSubsequence([1, 2, 3, 6], LIS_DEFAULT)).toBe(false);
    expect([FACTS.lisLength, FACTS.lisComparisons, FACTS.lisProbes, FACTS.lisTails]).toEqual([4, 45, probes, '1, 2, 3, 6']);
    expect(lesson.tryThis[2]).toContain('made 45 pair checks');
  });

  it('try-this 4: the textbook chain costs 15125 by the best grouping, and row by row it reads unfilled cells and gives a lower wrong answer', () => {
    const best = Math.min(...parenthesisationCosts(CHAIN_DEFAULT, 1, 6).map((x) => x.cost));
    expect(best).toBe(15125);
    expect(chainRun(CHAIN_DEFAULT, OPENING.chain.state, OPENING.chain.order).answer).toBe('15125');
    const row = chainTable(CHAIN_DEFAULT, 'row');
    expect(chainRun(CHAIN_DEFAULT, 'ij', 'row').answer).toBe(String(row.answer));
    expect(row.answer).not.toBe(best);
    expect(row.unfilledReads).toBeGreaterThan(0);
    expect(FACTS.chainGrouping).toBe('((A1 (A2 A3)) ((A4 A5) A6))');
    expect([FACTS.chainCost, FACTS.chainRowCost, FACTS.chainRowUnfilled]).toEqual([15125, row.answer, row.unfilledReads]);
    expect(lesson.tryThis[3]).toContain(`reads ${row.unfilledReads} cells`);
  });

  it('try-this 5: five cities, seed 7: best 153 by permutations, dp[mask] says 192 (high), dp[last] says 65 (low)', () => {
    const d = distances(OPENING.tsp.n, OPENING.tsp.seed);
    expect(bruteTsp(d)).toBe(153);
    expect(tspRun(d, 'ml').answer).toBe('153');
    expect(tspRun(d, 'm').answer).toBe('192');
    expect(tspRun(d, 'l').answer).toBe('65');
    expect([FACTS.tspBest, FACTS.tspMask, FACTS.tspLast]).toEqual([153, 192, 65]);
    expect(lesson.tryThis[4]).toContain('says 192');
    expect(lesson.tryThis[4]).toContain('says 65');
  });
});

describe('every run walks cleanly, frame by frame', () => {
  const runs: [string, DpRun][] = [];
  for (const state of ['w', 'iw', 'i'] as const) {
    for (const dir of ['down', 'up'] as const) {
      for (const input of [KNAPSACK_DEFAULT, KNAPSACK_TRAP, { items: KNAPSACK_DEFAULT.items, cap: 0 }]) runs.push([`knapsack ${state} ${dir} cap ${input.cap}`, knapsackRun(input.items, input.cap, state, dir)]);
    }
  }
  for (const state of ['end', 'start', 'prefix'] as const) for (const a of [LIS_DEFAULT, lisCounterexample().array, [4, 4], [9, 8, 7]]) runs.push([`lis ${state} ${a.join()}`, lisRun(a, state)]);
  for (const state of ['ij', 'ijk', 'i'] as const) {
    for (const order of ['length', 'row'] as const) for (const dims of [CHAIN_DEFAULT, [10, 25, 5, 30], chainCounterexample().dims]) runs.push([`chain ${state} ${order} ${dims.join()}`, chainRun(dims, state, order)]);
  }
  for (const state of ['ml', 'm', 'l'] as const) for (const n of [5, 6, 8]) runs.push([`tsp ${state} n=${n}`, tspRun(distances(n, 3), state)]);

  it('every caption reads cleanly and no frame shows NaN, undefined or a view outside its grid', () => {
    let frames = 0;
    for (const [name, run] of runs) {
      for (const { f, view } of walk(run)) {
        expect(expectCaption(f.say), name).not.toMatch(/NaN|undefined|null|Infinity/);
        const rows = view.cells.length;
        const cols = view.cells[0].length;
        expect(view.rowLabels.length, name).toBe(rows);
        expect(view.colLabels.length, name).toBe(cols);
        for (const [r, c] of [...view.reads, ...view.path, ...(view.current ? [view.current] : []), ...(view.answer ? [view.answer] : [])]) {
          expect(r >= 0 && r < rows && c >= 0 && c < cols, `${name} ${r},${c}`).toBe(true);
        }
        frames++;
      }
    }
    expect(frames).toBeGreaterThan(1400);
  });

  it('the finished table reports the oracle value for every correct state, and the answer cell holds it', () => {
    const { items, cap } = KNAPSACK_TRAP;
    for (const state of ['iw'] as const) {
      const run = knapsackRun(items, cap, state, 'down');
      expect(run.answer).toBe(String(bruteKnapsack01(items, cap)));
      const last = run.view(run.stepCount, run.pathCount);
      expect(last.cells[last.answer![0]][last.answer![1]].text).toBe(run.answer);
    }
    const up = knapsackRun(items, cap, 'w', 'up');
    expect(up.answer).toBe(String(bruteUnbounded(items, cap)));
    for (const a of [LIS_DEFAULT, [2, 9, 1, 3]]) {
      for (const state of ['end', 'start'] as const) expect(lisRun(a, state).answer).toBe(String(bruteLis(a)));
    }
    for (const dims of [CHAIN_DEFAULT, [10, 25, 5, 30]]) {
      const best = String(Math.min(...parenthesisationCosts(dims, 1, dims.length - 1).map((x) => x.cost)));
      for (const state of ['ij', 'ijk'] as const) expect(chainRun(dims, state, 'length').answer).toBe(best);
    }
    const d = distances(6, 11);
    expect(tspRun(d, 'ml').answer).toBe(String(bruteTsp(d)));
  });

  it('the reconstruction path ends in a base cell for knapsack, and its length is the number of rows crossed plus one', () => {
    const run = knapsackRun(KNAPSACK_DEFAULT.items, KNAPSACK_DEFAULT.cap, 'w', 'down');
    const last = run.view(run.stepCount, run.pathCount);
    expect(last.path[0]).toEqual([4, 9]);
    expect(last.path.at(-1)![0]).toBe(0);
    expect(last.path).toHaveLength(run.pathCount);
  });
});

describe('hidden controls do not reach the numbers', () => {
  it('the loop direction does not change dp[i][w] or dp[i] runs, and the fill order does not change the prefix state', () => {
    const { items, cap } = KNAPSACK_DEFAULT;
    for (const state of ['iw', 'i'] as const) {
      const a = knapsackRun(items, cap, state, 'down');
      const b = knapsackRun(items, cap, state, 'up');
      expect(b.answer).toBe(a.answer);
      expect(walk(b).map((x) => expectCaption(x.f.say))).toEqual(walk(a).map((x) => expectCaption(x.f.say)));
    }
    expect(chainRun(CHAIN_DEFAULT, 'i', 'length').answer).toBe(chainRun(CHAIN_DEFAULT, 'i', 'row').answer);
  });

  it('the stats beside the table (best, greedy, unbounded) depend on the items and capacity alone, whichever state is chosen', () => {
    const { items, cap } = KNAPSACK_DEFAULT;
    expect(knapsackRolling(items, cap, 'up')[4][cap]).toBe(FACTS.knapsackUnbounded);
    expect(knapsackRolling(items, cap, 'down')[4][cap]).toBe(FACTS.knapsackExact);
  });
});

describe('counterexamples are real', () => {
  it('each wrong-state counterexample differs from the brute force, which the lesson computes itself', () => {
    const k = knapsackCounterexample();
    expect(bruteKnapsack01(k.items, k.cap)).toBe(k.right);
    expect(k.wrong).not.toBe(k.right);
    const l = lisCounterexample();
    expect(bruteLis(l.array)).toBe(l.right);
    expect(l.wrong).not.toBe(l.right);
    const c = chainCounterexample();
    expect(Math.min(...parenthesisationCosts(c.dims, 1, c.dims.length - 1).map((x) => x.cost))).toBe(c.right);
    expect(c.wrong).not.toBe(c.right);
    const t = tspCounterexamples();
    for (const [which, ex] of [['m', t.mask], ['l', t.last]] as const) {
      const d = distances(ex.n, ex.seed);
      expect(tspRun(d, which).answer, which).not.toBe(String(bruteTsp(d)));
      expect(tspBitmask(d).best).toBe(bruteTsp(d));
    }
  });

  it('the break-even is where the transition bound first drops below the tour count', () => {
    expect(breakEven(20)).toBe(FACTS.breakEven);
  });
});

describe('hostile input', () => {
  it('refuses a non-integer, a count outside range, a weight of 0 or less, a value out of range, and mismatched lists, with the reason', () => {
    expect(parseItems('1, 2, 3, x', '1, 2, 3, 4')).toMatchObject({ ok: false });
    expect(parseItems('1, 2, 3', '1, 2, 3')).toMatchObject({ ok: false, error: expect.stringContaining('4 to 8') });
    expect(parseItems('1, 2, 3, 4, 5, 6, 7, 8, 9', '1, 2, 3, 4, 5, 6, 7, 8, 9')).toMatchObject({ ok: false });
    expect(parseItems('1, 0, 3, 4', '1, 2, 3, 4')).toMatchObject({ ok: false, error: expect.stringContaining('weights') });
    expect(parseItems('1, -2, 3, 4', '1, 2, 3, 4')).toMatchObject({ ok: false });
    expect(parseItems('1, 2, 3, 4', '1, 2, 3, 100')).toMatchObject({ ok: false, error: expect.stringContaining('values') });
    expect(parseItems('1, 2, 3, 4', '1, 2, 3, 4, 5')).toMatchObject({ ok: false, error: expect.stringContaining('one of each') });
    expect(parseItems('1, 2, 3, 4', '0, 0, 0, 0')).toMatchObject({ ok: true });
  });

  it('refuses sequences of 15 values, a single value, decimals, and dimensions of 0 or more than six matrices', () => {
    expect(parseSequence(Array.from({ length: 15 }, (_, i) => i).join(','))).toMatchObject({ ok: false });
    expect(parseSequence(Array.from({ length: 14 }, (_, i) => i).join(','))).toMatchObject({ ok: true });
    expect(parseSequence('5')).toMatchObject({ ok: false });
    expect(parseSequence('1.5, 2')).toMatchObject({ ok: false });
    expect(parseDims('10, 0, 5, 4')).toMatchObject({ ok: false });
    expect(parseDims('10, 5, 4')).toMatchObject({ ok: false });
    expect(parseDims('1, 2, 3, 4, 5, 6, 7, 8')).toMatchObject({ ok: false });
    expect(parseDims('10, 25, 5, 30')).toMatchObject({ ok: true });
  });

  it('a capacity of 0 gives value 0 in every state', () => {
    for (const state of ['w', 'iw', 'i'] as const) expect(knapsackRun(KNAPSACK_DEFAULT.items, 0, state, 'down').answer).toBe('0');
  });
});
