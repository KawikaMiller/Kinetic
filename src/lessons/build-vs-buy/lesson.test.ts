import { describe, expect, it } from 'vitest';
import { choose, dominatedChoices, enumeratePaths, redMeters, startWalk, validateScenario } from '../../core/scenario';
import { BUILD_VS_BUY } from '../../core/testing/leadScenarios';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { breakEvenLines, costCaption, placeCaption, placementStatus, storyCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  BENEFIT, COMPONENTS, DEFAULT_PLACEMENT, GROWTH, HORIZON, MAINTENANCE, REFERENCE, crossoverYear, defaultAssumptions, componentOf, placementOf, type Assumptions, type ComponentId, type StageId,
} from './model';
import { OPENING } from './opening';
import { METER, METERS, PRICE_RISE, TRAP_NOTE } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;
const email = componentOf('email');
const engine = componentOf('engine');
const a0 = defaultAssumptions();
const walkTo = (ids: string[]) => ids.reduce((w, id) => choose(PRICE_RISE, w, id), startWalk(PRICE_RISE));

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('build-vs-buy');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('build-vs-buy')).toEqual([]);
  });

  it('opens with all three components in Product, the email delivery picked, a 3-year horizon, 15% growth, 20% maintenance and no reversal cost', () => {
    expect(placementOf(OPENING.board.answers)).toEqual({ email: 'product', search: 'product', engine: 'product' });
    expect(OPENING.component).toBe('email');
    expect(OPENING.assumptions).toEqual({ growth: 15, maintenance: 20, horizon: 3, benefit: { email: 0, search: 150, engine: 400 }, includeReversal: false });
    expect(OPENING.scene).toBe('place');
  });

  it('keeps every control inside its range with the defaults, and the reference placement is the author\'s', () => {
    expect(a0.growth).toBeGreaterThanOrEqual(GROWTH.min);
    expect(a0.maintenance).toBeGreaterThanOrEqual(MAINTENANCE.min);
    expect(a0.horizon).toBeLessThanOrEqual(HORIZON.max);
    expect(BENEFIT.max).toBeGreaterThanOrEqual(400);
    expect(REFERENCE).toEqual({ email: 'commodity', search: 'product', engine: 'custom' });
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: email delivery reads buy 238.35, open source 260, build 576', () => {
    expect([FACTS.emailBuy, FACTS.emailOss, FACTS.emailBuild]).toEqual(['238.35', '260', '576']);
    expect(lesson.tryThis[0]).toContain('buy 238.35, open source 260 and build 576');
  });

  it('try-this 2: at 9 years build reads 1,008 against buy 1,037.15, build against buy crosses at year 9 and the lowest net cost moved from buy to open source at year 4', () => {
    expect([FACTS.email9Build, FACTS.email9Buy, FACTS.crossover]).toEqual(['1,008', '1,037.15', 9]);
    expect([FACTS.flipYear, FACTS.flipFrom, FACTS.flipTo]).toEqual([4, 'buy', 'open source']);
    expect(HORIZON.max).toBeGreaterThanOrEqual(9);
    expect(lesson.tryThis[1]).toContain('build reads 1,008 against buy 1,037.15');
  });

  it('try-this 3: with the engine Custom-built and the horizon back at 3, build reads -48 and buy 407.25', () => {
    expect([FACTS.engineBuildNet, FACTS.engineBuyNet]).toEqual(['−48', '407.25']);
    expect(lesson.tryThis[2]).toContain('build −48 and buy 407.25');
  });

  it('try-this 4: at B = 200 build reads 552 against buy 407.25 and open source 270 is the lowest; break-even 248.25', () => {
    expect([FACTS.lowBuildNet, FACTS.lowBuyNet, FACTS.lowOssNet, FACTS.breakEven]).toEqual(['552', '407.25', '270', '248.25']);
    expect(BENEFIT.step).toBe(10);
    expect(200 % BENEFIT.step).toBe(0);
    expect(lesson.tryThis[3]).toContain('open source, at 270, is the lowest of the three');
  });

  it('try-this 5: open source then plan reads extra cost 50, weeks 17, lock-in 2', () => {
    const w = walkTo(['opensource', 'plan']);
    expect([w.meters[METER.extra], w.meters[METER.weeks], w.meters[METER.lockin]]).toEqual([50, 17, 2]);
    expect(lesson.tryThis[4]).toContain('extra cost 50, weeks diverted 17, lock-in exposure 2');
  });
});

describe('captions across the controls', () => {
  it('the cost caption is clean at every slider extreme and one step beyond, for every component and placement', () => {
    const stages: StageId[] = ['genesis', 'custom', 'product', 'commodity'];
    for (const id of ['email', 'search', 'engine'] as ComponentId[]) for (const stage of stages) {
      for (const growth of [GROWTH.min, GROWTH.max + GROWTH.step]) for (const horizon of [HORIZON.min - 1, HORIZON.min, HORIZON.max, HORIZON.max + 1]) {
        const a: Assumptions = { ...a0, growth, horizon: Math.max(1, horizon), benefit: { ...a0.benefit, [id]: BENEFIT.max }, includeReversal: horizon % 2 === 0 };
        const text = expectCaption(costCaption(componentOf(id), stage, a));
        expect(text).not.toMatch(NO_JUNK);
        expect(text.includes('no benefit counts')).toBe(!['genesis', 'custom'].includes(stage));
      }
    }
  });

  it('the cost caption names the lowest net cost and says when the crossover is beyond the horizon', () => {
    const text = expectCaption(costCaption(email, 'product', a0));
    expect(text).toContain('The lowest is buy');
    expect(text).toContain('from year 9, beyond your 3-year horizon');
    expect(expectCaption(costCaption(engine, 'custom', a0))).toContain('The lowest is build.');
    expect(expectCaption(costCaption(engine, 'custom', { ...a0, benefit: { ...a0.benefit, engine: 200 } }))).toContain('The lowest is open source, self-hosted');
  });

  it('prints a break-even line for every pair, and says so when two options capture the same share', () => {
    const lines = breakEvenLines(engine, a0, BENEFIT.max);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('equal at a yearly benefit of 248.25 (inside the slider range)');
    expect(lines[1]).toContain('17');
    expect(lines[2]).toContain('325.33');
    expect(breakEvenLines(email, a0, BENEFIT.max).join(' ')).toContain('inside the slider range');
  });

  it('the placement caption counts benefits by the stated rule', () => {
    const none = expectCaption(placeCaption([{ id: 'email', label: 'email delivery', stage: 'product' }]));
    expect(none).toContain('No component is placed as something that sets you apart');
    const some = expectCaption(placeCaption([{ id: 'email', label: 'email delivery', stage: 'custom' }, { id: 'search', label: 'search', stage: 'commodity' }]));
    expect(some).toContain('1 component counts a benefit: email delivery');
  });

  it('the placement status counts what the learner moved: the opening Product placement is not "3 of 3 placed"', () => {
    const open = placementStatus(COMPONENTS.map((c) => ({ id: c.id, stage: DEFAULT_PLACEMENT[c.id] })));
    expect(open).toBe('0 of 3 moved off the opening Product placement');
    expect(open).not.toContain('placed');
    expect(placementStatus([{ id: 'email', stage: 'commodity' }, { id: 'search', stage: 'product' }, { id: 'engine', stage: 'custom' }])).toContain('2 of 3 moved');
  });

  it('the story caption reads the meters and the red ones', () => {
    expect(expectCaption(storyCaption(PRICE_RISE, startWalk(PRICE_RISE)))).toContain('Nothing is in the red');
    const text = expectCaption(storyCaption(PRICE_RISE, walkTo(['build'])));
    expect(text).toContain('Extra cost 180, weeks diverted 40, lock-in exposure 2');
    expect(text).toContain('In the red: weeks diverted.');
  });
});

describe('the price-rise story', () => {
  const ledgers = () => enumeratePaths(PRICE_RISE);

  it('has the graph and meters of the fixture the kit was proven against (renegotiate is retuned by 1 so it is not tied with accept)', () => {
    expect(PRICE_RISE.start).toBe(BUILD_VS_BUY.start);
    expect(PRICE_RISE.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad])).toEqual(BUILD_VS_BUY.meters.map((m) => [m.id, m.start, m.min, m.max, m.bad]));
    for (const [i, node] of PRICE_RISE.nodes.entries()) expect(node.choices.map((c) => [c.id, c.to])).toEqual(BUILD_VS_BUY.nodes[i].choices.map((c) => [c.id, c.to]));
    expect(PRICE_RISE.endings.map((e) => e.id)).toEqual(BUILD_VS_BUY.endings.map((e) => e.id));
  });

  it('has whole-path dominance only on the labelled build-it-in-house trap: every beaten path starts with build, and the on-screen note says so', () => {
    // start 0 / 0 / 6 plus the two picked effects; lower is better on all three meters.
    const paths = enumeratePaths(PRICE_RISE).map((p) => ({ id: p.choices.join('-'), v: [p.meters[METER.extra], p.meters[METER.weeks], p.meters[METER.lockin]] }));
    const beats = (q: number[], p: number[]) => q.every((x, i) => x <= p[i]) && q.some((x, i) => x !== p[i]);
    const beaten = paths.filter((p) => paths.some((q) => beats(q.v, p.v))).map((p) => p.id);
    expect(beaten.length).toBeGreaterThan(0);
    for (const id of beaten) expect(id, id).toMatch(/^build-/);
    expect(TRAP_NOTE).toMatch(/labelled trap/);
  });

  it('passes every trade-off check under all three readings, with 12 paths', () => {
    expect(validateScenario(PRICE_RISE, { tradeoffs: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(PRICE_RISE, { destinations }), destinations).toEqual([]);
    expect(ledgers()).toHaveLength(12);
  });

  it('has the spec\'s ledgers: accept then nothing ends at (32, 0, 8); open source then plan at (50, 17, 2)', () => {
    expect(walkTo(['accept', 'nothing']).meters).toEqual({ extra: 32, weeks: 0, lockin: 8 });
    expect(walkTo(['opensource', 'plan']).meters).toEqual({ extra: 50, weeks: 17, lockin: 2 });
  });

  it('puts lock-in in the red only on renegotiate-then-nothing, weeks on open-source-then-adapter and every build path, and extra cost is above 0 on every path', () => {
    const red = (ids: string[]) => {
      let w = startWalk(PRICE_RISE);
      const seen = new Set<string>();
      for (const id of ids) {
        w = choose(PRICE_RISE, w, id);
        for (const m of redMeters(PRICE_RISE, w.meters)) seen.add(m.id);
      }
      return seen;
    };
    const paths = ledgers().map((p) => ({ key: p.choices.join('-'), red: red(p.choices), extra: p.meters[METER.extra] }));
    expect(paths.filter((p) => p.red.has(METER.lockin)).map((p) => p.key)).toEqual(['renegotiate-nothing']);
    expect(paths.filter((p) => p.red.has(METER.weeks)).map((p) => p.key).sort()).toEqual(['build-adapter', 'build-nothing', 'build-plan', 'opensource-adapter']);
    expect(paths.every((p) => p.extra > 0)).toBe(true);
    expect(METERS).toHaveLength(3);
  });

  it('has no ending marked correct, and states every reason as a condition', () => {
    for (const e of PRICE_RISE.endings) expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong|success|succeeded)\b/i);
    for (const c of PRICE_RISE.nodes.flatMap((n) => n.choices)) expect(c.because, c.id).toMatch(/^If /);
  });
});

describe('the text quotes what the model computes', () => {
  it('has one "it depends" question that names its X, and a misconception question', () => {
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toBe('A horizon near 9 years, or a benefit only a build captures');
    expect(lesson.quiz[2].q).toContain('lock-in');
    expect(lesson.quiz[1].options[0]).toContain('About 248.25 a year: (1,152 - 407.25) / 3');
    expect(lesson.quiz[1].options[2]).toContain('744.75');
  });

  it('says a small growth does not flip the email ranking soon: at 5% growth the crossover is beyond year 15 or absent', () => {
    const c = crossoverYear(email, 5, 20);
    expect(c === null || c > 15).toBe(true);
    expect(crossoverYear(email, 0, 20)).toBeNull();
  });
});
