import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { costCaption, lineCaption, planeCaption, rangesCaption, storyCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  CAPACITY, DEPENDENCY, ITEMS, RULES, SPREAD, bestOrder, delayCost, lineOf, orderBy, simulateRanks, swapsToRatioOrder, topTwo, valueBy, violation, withinCapacity,
} from './model';
import { OPENING } from './opening';
import { BASE_VALUE, METER, OUTCOMES, STAKEHOLDER, SWAP_OUT, TRUST } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('prioritization');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('prioritization')).toEqual([]);
  });

  it('every scene opens on its documented state', () => {
    expect(OPENING.scene).toBe('plane');
    expect(OPENING.plane.items).toEqual(ITEMS);
    expect(OPENING.plane.items).not.toBe(ITEMS);
    expect(OPENING.plane.week).toBe(13);
    expect(OPENING.cost.order).toEqual(orderBy(ITEMS, 'impact'));
    expect(OPENING.cost.dependencyOn).toBe(false);
    expect(OPENING.ranges).toEqual({ sigma: 0.3, seed: 12 });
    expect(OPENING.line.capacity).toBe(13);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: by week 13 the values are 50, 243 and 240, and by week 40 impact over effort leads (1238, 1514, 1558)', () => {
    const at = (rule: 'impact' | 'effort' | 'ratio', w: number) => Math.round(valueBy(ITEMS, orderBy(ITEMS, rule), w));
    expect([at('impact', 13), at('effort', 13), at('ratio', 13)]).toEqual([50, 243, 240]);
    expect([at('impact', 40), at('effort', 40), at('ratio', 40)]).toEqual([1238, 1514, 1558]);
    expect(lesson.tryThis[0]).toContain('by week 13 highest impact first has delivered 50, lowest effort first 243 and impact over effort 240');
    expect(lesson.tryThis[0]).toContain('impact over effort leads');
  });

  it('try-this 2: 1202 against 882, 320 extra, 21 swaps; sorted then dependency on is refused and the best allowed costs 885', () => {
    const order = OPENING.cost.order;
    expect([delayCost(ITEMS, order), bestOrder(ITEMS, null).cost, swapsToRatioOrder(ITEMS, order).length]).toEqual([1202, 882, 21]);
    const sorted = orderBy(ITEMS, 'ratio');
    expect(delayCost(ITEMS, sorted)).toBe(882);
    expect(violation(sorted, DEPENDENCY)).toEqual(DEPENDENCY);
    expect(bestOrder(ITEMS, DEPENDENCY).cost).toBe(885);
    expect(lesson.tryThis[1]).toContain('you pay 320 extra and 21 neighbour swaps');
    expect(lesson.tryThis[1]).toContain('costs 885');
  });

  it('try-this 3: signup 55% and CSV 34%, a gap of 21 points; at spread 0.6 the gap is 7 and within noise', () => {
    const s = simulateRanks(ITEMS, OPENING.ranges.sigma, OPENING.ranges.seed);
    const t = topTwo(s);
    expect([Math.round(s.first[t.top] * 100), Math.round(s.first[t.second] * 100), Math.round(t.gap * 100), t.close]).toEqual([55, 34, 21, false]);
    expect(SPREAD.max).toBeGreaterThanOrEqual(0.6);
    const w = topTwo(simulateRanks(ITEMS, 0.6, OPENING.ranges.seed));
    expect([Math.round(w.gap * 100), w.close]).toEqual([7, true]);
    expect(lesson.tryThis[2]).toContain('a gap of 21 points');
  });

  it('try-this 4: 13 weeks fits 6 items worth 35, cutting 26; 20 weeks fits 7 and cuts 17', () => {
    const at = (c: number) => lineOf(ITEMS, new Set(withinCapacity(ITEMS, c)));
    expect([withinCapacity(ITEMS, 13).length, at(13).value, at(13).cutCost]).toEqual([6, 35, 26]);
    expect([withinCapacity(ITEMS, 20).length, at(20).cutCost]).toEqual([7, 17]);
    expect(CAPACITY.max).toBeGreaterThanOrEqual(20);
    expect(lesson.tryThis[3]).toContain('6 items fit, worth 35 a week, and the rest cost 26 a week');
  });

  it('try-this 5: swapping in the urgent item leaves value 256 against 240 and trust 5', () => {
    const w = choose(STAKEHOLDER, startWalk(STAKEHOLDER), 'swap');
    expect([w.meters[METER.value], BASE_VALUE, w.meters[METER.trust]]).toEqual([256, 240, 5]);
    expect(lesson.tryThis[4]).toContain('reads 256 against 240');
    expect(SWAP_OUT.label).toBe('Audit log');
  });
});

describe('captions across the control cross product', () => {
  it('the plane caption is clean for every horizon and names the leader it computes', () => {
    for (const w of [2, 13, 34, 40]) {
      const text = expectCaption(planeCaption(ITEMS, w));
      expect(text).not.toMatch(NO_JUNK);
      const values = RULES.map((r) => ({ r, v: valueBy(ITEMS, orderBy(ITEMS, r.value), w) })).sort((a, b) => b.v - a.v);
      expect(text).toContain(`"${values[0].r.label.toLowerCase()}"`);
    }
    expect(expectCaption(planeCaption(ITEMS, 13))).toContain('"lowest effort first"');
    expect(expectCaption(planeCaption(ITEMS, 40))).toContain('"highest impact over effort"');
  });

  it('the cost caption covers an allowed order, a broken one, and the best order', () => {
    const best = bestOrder(ITEMS, null);
    const mine = OPENING.cost.order;
    const own = expectCaption(costCaption({ yourCost: delayCost(ITEMS, mine), bestCost: best.cost, broken: null, swaps: swapsToRatioOrder(ITEMS, mine), dependencyOn: false }));
    expect(own).toContain('Your order costs 1202');
    expect(own).toContain('You pay 320 extra');
    expect(expectCaption(costCaption({ yourCost: 882, bestCost: 882, broken: null, swaps: [], dependencyOn: false }))).toContain('as cheap as any');
    const broken = expectCaption(costCaption({ yourCost: null, bestCost: 885, broken: DEPENDENCY, swaps: [], dependencyOn: true }));
    expect(broken).toContain('Team roles before Audit log');
    expect(broken).toContain('885');
  });

  it('the ranges caption is clean at every spread and says "within noise" exactly when the gap is under 10 points', () => {
    for (const sigma of [SPREAD.min, 0.3, SPREAD.max]) {
      const stats = simulateRanks(ITEMS, sigma, 12, 1000);
      const top = topTwo(stats);
      const text = expectCaption(rangesCaption(stats, top, sigma));
      expect(text).not.toMatch(NO_JUNK);
      expect(text.includes('within noise')).toBe(top.gap < 0.1);
    }
  });

  it('the line and story captions read their numbers off the model', () => {
    const line = lineOf(ITEMS, new Set(withinCapacity(ITEMS, 13)));
    expect(expectCaption(lineCaption(line, 13, 6, 10))).toContain('6 of 10 items fit in 13 weeks');
    expect(expectCaption(lineCaption({ ...line, used: 15 }, 13, 7, 10))).toContain('2 over capacity');
    const w = choose(STAKEHOLDER, startWalk(STAKEHOLDER), 'swap');
    expect(expectCaption(storyCaption(STAKEHOLDER, w))).toContain('Value delivered 256');
    expect(expectCaption(storyCaption(STAKEHOLDER, startWalk(STAKEHOLDER)))).toContain('Nothing is in the red');
  });
});

describe('the urgent request', () => {
  it('validates with 4 paths and all four endings, and no ending is marked correct or best', () => {
    expect(validateScenario(STAKEHOLDER)).toEqual([]);
    expect(enumeratePaths(STAKEHOLDER)).toHaveLength(4);
    for (const e of STAKEHOLDER.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong)\b/i);
  });

  it('no option is at least as good as another on value, trust, load and moved items at once', () => {
    const keys = Object.entries(OUTCOMES).map(([id, o]) => ({
      id, value: o.value, trust: TRUST[id as keyof typeof TRUST], load: -o.weeks, changed: -o.changed,
    }));
    for (const a of keys) for (const b of keys) if (a.id !== b.id) expect(a.value >= b.value && a.trust >= b.trust && a.load >= b.load && a.changed >= b.changed, `${a.id} vs ${b.id}`).toBe(false);
  });

  it('each choice\'s effects are the model\'s numbers: value, load and moved items', () => {
    for (const c of STAKEHOLDER.nodes[0].choices) {
      const key = c.id as keyof typeof OUTCOMES;
      expect(c.effects![METER.value]).toBe(OUTCOMES[key].value - BASE_VALUE);
      expect(c.effects![METER.changed]).toBe(OUTCOMES[key].changed);
    }
    expect(FACTS.baseValue).toBe(BASE_VALUE);
  });
});
