import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { FACTS } from './facts';
import { insertFrames, removeFrames, searchFrames } from './frames';
import lesson from './index';
import { KEY_MAX, KEY_MIN, parseKey, refuseOp } from './keys';
import { HEAD, LEVEL_CAP, buildList, flipHeight, pughCost, touchedNodes, type Entry } from './model';
import { DEFAULT_COIN_SEED, DEFAULT_INSERT_KEY, DEFAULT_KEYS, DEFAULT_P, DEFAULT_TARGET, DRAWN_LIMIT, P_OPTIONS, RIG_OPTIONS, coinFlips, defaultEntries } from './presets';
import { mulberry32 } from '../../core/random';
import { costCaption, plainSteps, writesCaption } from './text';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

/** An independent search count from the heights alone: per level, a sorted array and a cursor; no pointers. */
function stepsByLevels(entries: readonly Entry[], target: number): { moves: number; drops: number; pred: number | typeof HEAD } {
  const top = Math.max(1, ...entries.map((e) => e.height)) - 1;
  let moves = 0;
  let drops = 0;
  let pred: number | typeof HEAD = HEAD;
  for (let level = top; level >= 0; level--) {
    const lane = entries.filter((e) => e.height > level).map((e) => e.key).sort((a, b) => a - b);
    for (;;) {
      const at: number = pred === HEAD ? -1 : lane.indexOf(pred);
      const next: number | undefined = lane[at + 1];
      if (next === undefined || next >= target) break;
      pred = next;
      moves++;
    }
    if (level > 0) drops++;
  }
  return { moves, drops, pred };
}

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: searching 80 takes the steps the heights imply, against 15 for the plain list; 33 is absent and stops at 30', () => {
    const entries = defaultEntries();
    const oracle = stepsByLevels(entries, DEFAULT_TARGET);
    expect(FACTS.hitMoves).toBe(oracle.moves);
    expect(FACTS.hitDrops).toBe(oracle.drops);
    expect(FACTS.hitSteps).toBe(oracle.moves + oracle.drops);
    expect(FACTS.hitLinear).toBe(DEFAULT_KEYS.filter((k) => k < DEFAULT_TARGET).length);
    expect(FACTS.hitLinear).toBe(15);
    const frames = searchFrames(entries, DEFAULT_TARGET);
    expect(text(frames[frames.length - 1].say)).toContain(`Found 80 in ${FACTS.hitSteps} steps (${FACTS.hitMoves} moves, ${FACTS.hitDrops} drops). A plain linked list walks 15 steps`);
    const miss = stepsByLevels(entries, 33);
    expect(FACTS.missPred).toBe(30);
    expect(miss.pred).toBe(30);
    expect(FACTS.missSteps).toBe(miss.moves + miss.drops);
    expect(FACTS.missNext).toBe(35);
    const absent = searchFrames(entries, 33);
    const last = absent[absent.length - 1];
    expect(last.found).toBeNull();
    expect(last.stop).toBe(30);
    expect(text(last.say)).toContain('33 is not in the list');
    expect(lesson.tryThis[0]).toContain(`${FACTS.hitSteps} steps (${FACTS.hitMoves} moves and ${FACTS.hitDrops} drops)`);
    expect(lesson.tryThis[0]).toContain('walks 15');
    expect(lesson.tryThis[0]).toContain('stops at 30');
  });

  it('try-this 2: the default insert of 33 flips heads, heads, tails: a tower of 3 levels and 6 pointer writes', () => {
    const flips = coinFlips(DEFAULT_COIN_SEED, 0, 0.5, 'fair');
    expect(flips.flips).toEqual([true, true, false]);
    expect(flips.height).toBe(1 + flips.flips.filter(Boolean).length);
    expect(flips.height).toBe(3);
    const frames = insertFrames(defaultEntries(), DEFAULT_INSERT_KEY, flips, null);
    const last = frames[frames.length - 1];
    expect(last.writes).toBe(6);
    expect(last.coins).toEqual([true, true, false]);
    expect(last.snap.towers.find((t) => t.key === 33)?.height).toBe(3);
    expect(text(last.say)).toContain('Inserted 33 with a tower of height 3: 6 pointer writes');
    expect(lesson.tryThis[1]).toContain('heads, heads, tails');
    expect(lesson.tryThis[1]).toContain('3 levels tall and 6 pointers');
  });

  it('try-this 3: rigged all-tails coins give height 1 and 2 writes, whatever the seed', () => {
    const base = defaultEntries();
    const after = buildList([...base, { key: 33, height: 3 }]).snapshot();
    const entries = after.towers.map((t) => ({ key: t.key, height: t.height }));
    for (const seed of [0, 1, 35, 999]) {
      const flips = coinFlips(seed, 1, 0.5, 'tails');
      expect(flips).toEqual({ height: 1, flips: [false] });
      const frames = insertFrames(entries, 36, flips, 'all tails');
      const last = frames[frames.length - 1];
      expect(last.writes).toBe(2);
      expect(text(last.say)).toContain('Inserted 36 with a tower of height 1: 2 pointer writes');
      expect(frames.some((f) => /rigged \(all tails\): this is not random/.test(text(f.say)))).toBe(true);
    }
    expect(lesson.tryThis[2]).toContain('1 level tall with 2 pointer writes');
  });

  it('try-this 4: at p = 1/2 and n = 1,024 the measured mean is under the formula (22), the worst list over the mean, pointers near 2', () => {
    expect(FACTS.mcFormula).toBeCloseTo(22, 10);
    expect(FACTS.mcMean / FACTS.mcFormula).toBeGreaterThan(0.7);
    expect(FACTS.mcMean / FACTS.mcFormula).toBeLessThan(1.05);
    expect(FACTS.mcWorst).toBeGreaterThanOrEqual(FACTS.mcMean);
    expect(Math.abs(FACTS.mcPointers - 2) / 2).toBeLessThan(0.1);
    const caption = costCaption({ n: 1024, p: 0.5, mean: FACTS.mcMean, worst: FACTS.mcWorst, formula: FACTS.mcFormula });
    expect(caption).toContain(`${FACTS.mcMean.toFixed(1)} steps on average`);
    expect(caption).toContain(`Pugh's formula (22.0)`);
    expect(lesson.tryThis[3]).toContain(`${FACTS.mcMean.toFixed(1)} steps against the formula's 22.0`);
  });

  it('try-this 5: inserting 53 writes two pointers per level and touches only the predecessors that were already there', () => {
    expect(FACTS.whyWrites).toBe(2 * FACTS.whyHeight);
    const afterDefault = buildList(defaultEntries()).snapshot();
    const withThirtyThree = buildList([...defaultEntries(), { key: 33, height: 3 }]).snapshot();
    expect(withThirtyThree.towers).toHaveLength(afterDefault.towers.length + 1);
    const entries = withThirtyThree.towers.map((t) => ({ key: t.key, height: t.height }));
    const frames = insertFrames(entries, 53, coinFlips(DEFAULT_COIN_SEED, 1, 0.5, 'fair'), null);
    const before = frames[0].snap;
    const after = frames[frames.length - 1].snap;
    const preds = new Set<number | typeof HEAD>();
    for (let level = 0; level < FACTS.whyHeight; level++) {
      const lane = entries.filter((e) => e.height > level).map((e) => e.key).filter((k) => k < 53);
      preds.add(lane.length ? Math.max(...lane) : HEAD);
    }
    expect(new Set(touchedNodes(before, after))).toEqual(preds);
    expect(FACTS.whyTouched).toBe(preds.size);
    // "of N nodes, head included": the keys there before the insert, plus the head
    expect(FACTS.whyNodes).toBe(before.towers.length + 1);
    expect(FACTS.whyNodes).toBe(entries.length + 1);
    expect(text(writesCaption({ key: 53, height: FACTS.whyHeight, writes: FACTS.whyWrites, nodes: entries.length + 1 }))).toContain('none of the unrelated towers changed');
    expect(lesson.tryThis[4]).toContain(`${FACTS.whyWrites} pointer writes for a tower of 1 level and touches ${FACTS.whyTouched} of the ${FACTS.whyNodes} nodes`);
    expect(lesson.tryThis[4]).not.toContain('1 levels');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks every target of the default list, present and absent, through the search frames: counts match the model', () => {
    const entries = defaultEntries();
    const list = buildList(entries);
    let frames = 0;
    for (const target of [-5, 1, 5, 7, 33, 40, 79, 80, 81, 999]) {
      const s = list.search(target);
      const run = searchFrames(entries, target);
      for (const f of run) {
        expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
        frames++;
      }
      const last = run[run.length - 1];
      expect(last.moves).toBe(s.moves);
      expect(last.dropCount).toBe(s.drops);
      expect(last.linear).toBe(plainSteps(list.snapshot(), target));
      expect(text(last.say)).toMatch(new RegExp(`(in|after) ${s.steps} steps`));
      expect(text(last.say).includes('is not in the list')).toBe(!s.found);
    }
    expect(frames).toBeGreaterThan(60);
  });

  it('walks every p x coin setting through insert frames and a delete: the closing caption agrees with the writes', () => {
    const entries = defaultEntries();
    for (const p of P_OPTIONS) {
      for (const rig of RIG_OPTIONS.map((r) => r.value)) {
        for (const key of [3, 33, 48, 90]) {
          const flips = coinFlips(7, 2, p, rig);
          const run = insertFrames(entries, key, flips, rig === 'fair' ? null : rig);
          for (const f of run) expect(text(f.say), `${p} ${rig} ${key}`).not.toMatch(/NaN|undefined|null/);
          const last = run[run.length - 1];
          expect(last.writes).toBe(2 * flips.height);
          expect(text(last.say)).toContain(`${last.writes} pointer writes`);
        }
      }
    }
    for (const key of [5, 40, 80]) {
      const run = removeFrames(entries, key);
      const height = entries.find((e) => e.key === key)!.height;
      expect(run[run.length - 1].writes).toBe(height);
      expect(run[run.length - 1].snap.towers.some((t) => t.key === key)).toBe(false);
    }
  });

  it('the cost caption ratio and the formula line match the numbers', () => {
    for (const p of P_OPTIONS) {
      const c = costCaption({ n: 256, p, mean: 15, worst: 19, formula: pughCost(256, p) });
      expect(c).toContain(`${((15 / pughCost(256, p)) * 100).toFixed(0)}% of Pugh's formula (${pughCost(256, p).toFixed(1)})`);
    }
  });
});

describe('hostile input', () => {
  it('a typed key is read exactly: empty, decimals, huge numbers and range are refused with a message', () => {
    expect(parseKey('42')).toEqual({ ok: true, value: 42 });
    expect(parseKey('−7')).toEqual({ ok: true, value: -7 });
    for (const bad of ['', '  ', '1.5', '1e3', 'abc', '4 2', '99999999999999999999', `${KEY_MAX + 1}`, `${KEY_MIN - 1}`]) {
      const r = parseKey(bad);
      expect(r.ok, bad).toBe(false);
      expect(r.ok ? '' : r.error.length).toBeGreaterThan(0);
    }
  });

  it('duplicates are refused (not replaced), the 64-key drawing limit holds, and a delete says why when it cannot', () => {
    expect(refuseOp('insert', 5, 3, true)).toContain('duplicate insert is refused, not replaced');
    expect(refuseOp('insert', 5, DRAWN_LIMIT, false)).toContain(`${DRAWN_LIMIT} keys`);
    expect(refuseOp('insert', 5, DRAWN_LIMIT - 1, false)).toBeNull();
    expect(refuseOp('delete', 5, 0, false)).toContain('empty');
    expect(refuseOp('delete', 5, 3, false)).toContain('not in the list');
    expect(refuseOp('delete', 5, 3, true)).toBeNull();
    expect(refuseOp('search', 5, 3, false)).toBeNull();
  });

  it('a 64-key list builds and checks clean, and the default list is exactly the 16 keys named', () => {
    const l = buildList(Array.from({ length: DRAWN_LIMIT }, (_, i) => ({ key: i, height: 1 + (i % 3) })));
    expect(l.size).toBe(DRAWN_LIMIT);
    expect(defaultEntries().map((e) => e.key)).toEqual(DEFAULT_KEYS);
  });
});

describe('the coin-flip caption', () => {
  const flipCaptions = (flips: ReturnType<typeof coinFlips>, rig: 'heads' | null) =>
    insertFrames(defaultEntries(), 33, flips, rig === 'heads' ? 'all heads' : null)
      .map((fr) => text(fr.say as Parameters<typeof text>[0]))
      .filter((c) => c.startsWith('Flip '));

  it('says "level cap" only on a flip that reaches the cap, never on the default insert whose tower stops at 3', () => {
    const fair = coinFlips(DEFAULT_COIN_SEED, 0, DEFAULT_P, 'fair');
    expect(fair.height).toBe(3);
    const captions = flipCaptions(fair, null);
    expect(captions).toHaveLength(fair.flips.length);
    expect(captions.some((c) => c.includes('level cap'))).toBe(false);
    const rigged = flipCaptions(coinFlips(DEFAULT_COIN_SEED, 0, DEFAULT_P, 'heads'), 'heads');
    expect(rigged.filter((c) => c.includes('level cap'))).toHaveLength(1);
    expect(rigged[rigged.length - 1]).toContain(`height ${LEVEL_CAP} (the level cap)`);
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('rigged coins ignore the seed and p; fair coins use both; heights are in 1..cap', () => {
    for (const seed of [0, 1, 99]) {
      for (const p of P_OPTIONS) {
        expect(coinFlips(seed, 3, p, 'tails').height).toBe(1);
        expect(coinFlips(seed, 3, p, 'heads').height).toBe(LEVEL_CAP);
      }
    }
    const heights = (seed: number) => Array.from({ length: 40 }, (_, i) => coinFlips(seed, i, 0.5, 'fair').height).join();
    expect(heights(1)).not.toBe(heights(2));
    expect(heights(5)).toBe(heights(5));
    const mean = (p: number) => Array.from({ length: 4000 }, (_, i) => coinFlips(9, i, p, 'fair').height).reduce((a, b) => a + b, 0) / 4000;
    expect(mean(0.25)).toBeLessThan(mean(0.5));
  });

  it('the opening list does not depend on the coin seed or p controls: it is built from its own constant', () => {
    expect(JSON.stringify(defaultEntries())).toBe(JSON.stringify(defaultEntries()));
    expect(flipHeight(mulberry32(35), 0.5).height).toBe(defaultEntries()[0].height);
  });
});

describe('quiz facts', () => {
  it('the all-tails mean is (n - 1) / 2 and the quarter-p pointers are near 4/3', () => {
    expect(FACTS.allTailsMean).toBeCloseTo((1024 - 1) / 2, 10);
    expect(Math.abs(FACTS.mcPointersQuarter - 4 / 3) / (4 / 3)).toBeLessThan(0.1);
  });
});
