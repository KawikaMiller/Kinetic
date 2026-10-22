import { describe, expect, it } from 'vitest';
import { PRICE_RISE } from '../lessons/build-vs-buy/scenario';
import { PROPOSAL } from '../lessons/design-docs-rfcs/proposal';
import {
  choose, dominatedChoices, dominatedPaths, duplicatePaths, enumeratePaths, freePaths, pathId, redMeters, startWalk, validateScenario,
  type DestinationRule, type Meter, type Problem, type ProblemKind, type Scenario, type Walk,
} from './scenario';
import {
  BUILD_VS_BUY, HIRING, INFLUENCE, LEAD_SCENARIOS, LEAD_TRAP_PATHS, REVERSIBLE_DECISIONS, STRANGLER, TECHNICAL_STRATEGY,
} from './testing/leadScenarios';

/** K4-9: `validateScenario(s, { tradeoffs: true })` adds dominated-choice and free-path (docs/tier4-technical.md §4.1, decisions §4). */

const kinds = (s: Scenario): ProblemKind[] => validateScenario(s, { tradeoffs: true }).map((p) => p.kind);
const DESTINATIONS: DestinationRule[] = ['same', 'equal-or-better', 'ignore'];

const walkTo = (s: Scenario, choices: string[]): Walk => choices.reduce((w, id) => choose(s, w, id), startWalk(s));
const finalMeters = (s: Scenario, choices: string[]) => walkTo(s, choices).meters;

const meterUp: Meter = { id: 'm', label: 'Meter', start: 5, min: 0, max: 20, bad: { above: 12 } }; // lower is better
const meterDown: Meter = { id: 'q', label: 'Quality', start: 5, min: 0, max: 20, bad: { below: 2 } }; // higher is better
const end = (id: string) => ({ id, title: id, text: id });

/** One decision, two ways to the same ending: the second is plainly worse on `m`. */
const strawMan = (meters: Meter[], good: Record<string, number>, bad: Record<string, number>): Scenario => ({
  start: 'a',
  meters,
  nodes: [{ id: 'a', prompt: 'Which?', choices: [
    { id: 'good', label: 'Good', to: 'done', effects: good, because: 'It is better.' },
    { id: 'bad', label: 'Bad', to: 'done', effects: bad, because: 'It is worse.' },
  ] }],
  endings: [end('done')],
});

describe('the lead-lesson scenarios of the specs pass every trade-off check', () => {
  it('return no problem with tradeoffs: true, under every reading of "equally good destination" that the specs claim', () => {
    for (const [id, s] of Object.entries(LEAD_SCENARIOS)) {
      expect(validateScenario(s), id).toEqual([]);
      expect(validateScenario(s, { tradeoffs: true, trapPaths: LEAD_TRAP_PATHS[id] }), id).toEqual([]);
      expect(dominatedChoices(s, { destinations: 'same' }), `${id} (same destination only)`).toEqual([]);
    }
  });

  it('keeps the part1 scenarios clean even when destinations are ignored (the spec checked them both ways)', () => {
    for (const s of [STRANGLER, BUILD_VS_BUY, TECHNICAL_STRATEGY, REVERSIBLE_DECISIONS, INFLUENCE]) {
      expect(dominatedChoices(s, { destinations: 'ignore' })).toEqual([]);
    }
  });

  it('flags hiring-interviewing veto only when destinations are ignored: "no hire" and "hire" are different endings', () => {
    // veto (regret +12, days +1, goodwill -2) is worse than avg (regret +10) on every meter, but it ends
    // somewhere else. The meters cannot say whether "no hire" is as good as "hire", so the default does not call it a straw man.
    expect(dominatedChoices(HIRING, { destinations: 'ignore' }).map((p) => p.detail)).toEqual([
      'h1/veto is dominated by h1/avg: no better on any meter, worse on at least one',
    ]);
    expect(dominatedChoices(HIRING)).toEqual([]);
  });

  it('keeps design-docs-rfcs (Tier 3) valid with tradeoffs: true, so it is not exempt', () => {
    expect(validateScenario(PROPOSAL, { tradeoffs: true })).toEqual([]);
  });

  it('pins the path counts and the number of paths that never go red (the specs\' own figures)', () => {
    const counts = Object.fromEntries(Object.entries(LEAD_SCENARIOS).map(([id, s]) => [id, enumeratePaths(s).length]));
    expect(counts).toEqual({
      'strangler-fig-migrations': 28, 'build-vs-buy': 12, 'technical-strategy': 9, 'reversible-decisions': 6,
      'influence-without-authority': 8, 'hiring-interviewing': 6,
    });
    const neverRed = enumeratePaths(STRANGLER).filter((p) => {
      let w = startWalk(STRANGLER);
      return p.choices.every((id) => { w = choose(STRANGLER, w, id); return redMeters(STRANGLER, w.meters).length === 0; });
    });
    expect(neverRed.map((p) => p.choices.join('-')).sort()).toEqual(['a1-b1-c3', 'a1-b2-c2', 'a1-b3-c1', 'a1-b3-c3', 'a3-b3-c3']);
  });

  it('reproduces the hand-worked ledgers of the specs', () => {
    expect(finalMeters(STRANGLER, ['a1', 'b3', 'c1'])).toEqual({ incidents: 1, weeks: 24, strain: 4, surprises: 4 });
    expect(finalMeters(STRANGLER, ['a4'])).toEqual({ incidents: 6, weeks: 24, strain: 5, surprises: 0 });
    expect(finalMeters(STRANGLER, ['a2', 'b2', 'c1'])).toEqual({ incidents: 6, weeks: 28, strain: 4, surprises: 0 });
    expect(finalMeters(BUILD_VS_BUY, ['accept', 'nothing'])).toEqual({ extra: 32, weeks: 0, lockin: 8 });
    expect(finalMeters(BUILD_VS_BUY, ['opensource', 'plan'])).toEqual({ extra: 50, weeks: 17, lockin: 2 });
    expect(finalMeters(TECHNICAL_STRATEGY, ['hybrid', 'exception'])).toEqual({ autonomy: 5, effort: 6, drag: 4 });
    expect(finalMeters(TECHNICAL_STRATEGY, ['consolidate', 'hard-rule'])).toEqual({ autonomy: 2, effort: 7, drag: 2 });
    expect(finalMeters(TECHNICAL_STRATEGY, ['team-choice', 'advice'])).toEqual({ autonomy: 8, effort: 2, drag: 7 });
    expect(finalMeters(REVERSIBLE_DECISIONS, ['r1', 'migrate'])).toEqual({ slack: 6, regret: 30, undo: 5, upkeep: 0 });
    expect(finalMeters(REVERSIBLE_DECISIONS, ['r2', 'extend'])).toEqual({ slack: 6, regret: 25, undo: 4, upkeep: 6 });
    expect(finalMeters(REVERSIBLE_DECISIONS, ['r3', 'more'])).toEqual({ slack: 2, regret: 8, undo: 10, upkeep: 0 });
    expect(finalMeters(INFLUENCE, ['push', 'concede', 'pilot'])).toEqual({ support: 17, trust: 6, weeks: 3, scope: 55, risk: 10 });
    expect(finalMeters(INFLUENCE, ['ask', 'fullrollout'])).toEqual({ support: 18, trust: 5, weeks: 2, scope: 90, risk: 55 });
    expect(finalMeters(HIRING, ['evidence', 'decide_evidence'])).toEqual({ regret: 12, days: 1, goodwill: 3 });
    expect(finalMeters(HIRING, ['followup', 'hire_after'])).toEqual({ regret: 9, days: 8, goodwill: 7 });
  });
});

describe('dominated-choice', () => {
  it('finds a choice no better on any meter and worse on one, whichever way the meter points', () => {
    const lowerBetter = strawMan([meterUp], { m: 1 }, { m: 3 });
    const higherBetter = strawMan([meterDown], { q: 3 }, { q: 1 });
    for (const s of [lowerBetter, higherBetter]) {
      expect(dominatedChoices(s).map((p) => p.detail), 'one straw man').toEqual(['a/bad is dominated by a/good: no better on any meter, worse on at least one']);
      expect(kinds(s)).toContain('dominated-choice');
    }
  });

  it('does not call a trade-off a straw man: better on one meter, worse on another', () => {
    const s = strawMan([meterUp, meterDown], { m: 1, q: 1 }, { m: 3, q: 4 });
    expect(dominatedChoices(s)).toEqual([]);
  });

  it('needs a strict difference: identical effects and a choice that is better on a meter nobody mentions are not flagged', () => {
    expect(dominatedChoices(strawMan([meterUp], { m: 2 }, { m: 2 }))).toEqual([]);
    expect(dominatedChoices(strawMan([meterUp], {}, {}))).toEqual([]);
  });

  it('flags the straw man under every reading when both choices share a destination', () => {
    const s = strawMan([meterUp], { m: 1 }, { m: 3 });
    for (const destinations of DESTINATIONS) expect(dominatedChoices(s, { destinations }), destinations).toHaveLength(1);
  });

  /** Only the problems at the first decision: the twin nodes below carry their own, unrelated choices. */
  const atFirstNode = (problems: Problem[]) => problems.filter((p) => p.detail.startsWith('a/'));

  /** Two different nodes that offer the same two endings at the same prices: an "equally good" destination. */
  const twin = (worseOutcome: boolean): Scenario => ({
    start: 'a',
    meters: [meterUp],
    nodes: [
      { id: 'a', prompt: 'Which?', choices: [
        { id: 'good', label: 'Good', to: 'left', effects: { m: 1 }, because: 'Cheaper.' },
        { id: 'bad', label: 'Bad', to: 'right', effects: { m: 3 }, because: 'Dearer.' },
      ] },
      { id: 'left', prompt: 'Then?', choices: [{ id: 'l1', label: 'L1', to: 'win', effects: { m: 0 }, because: 'x' }, { id: 'l2', label: 'L2', to: 'lose', effects: { m: 2 }, because: 'x' }] },
      { id: 'right', prompt: 'Then?', choices: [
        { id: 'r1', label: 'R1', to: 'win', effects: { m: worseOutcome ? 0 : 5 }, because: 'x' },
        { id: 'r2', label: 'R2', to: 'lose', effects: { m: 2 }, because: 'x' },
      ] },
    ],
    endings: [end('win'), end('lose')],
  });

  it('reads "an equally good destination" as: every ending the other side can reach, reached here at no greater cost', () => {
    // right offers win at +5 where left offers it at +0, so left's destination is at least as good everywhere: bad is a straw man.
    const dominated = twin(false);
    expect(dominatedChoices(dominated, { destinations: 'same' }), 'the narrow reading misses it').toEqual([]);
    expect(atFirstNode(dominatedChoices(dominated, { destinations: 'equal-or-better' }))).toHaveLength(1);
    expect(atFirstNode(dominatedChoices(dominated, { destinations: 'ignore' }))).toHaveLength(1);
  });

  it('keeps a worse-priced choice whose destination is better, which only the strictest reading flags', () => {
    // Make left's win dearer than right's: now the dearer first step buys a cheaper way on, so it is a real trade-off.
    const s = twin(true);
    const costlyLeft: Scenario = { ...s, nodes: s.nodes.map((n) => (n.id === 'left' ? { ...n, choices: n.choices.map((c) => (c.id === 'l1' ? { ...c, effects: { m: 4 } } : c)) } : n)) };
    expect(atFirstNode(dominatedChoices(costlyLeft, { destinations: 'equal-or-better' }))).toEqual([]);
    expect(atFirstNode(dominatedChoices(costlyLeft, { destinations: 'ignore' }))).toHaveLength(1);
  });

  it('never treats two different endings as equally good', () => {
    const s: Scenario = { ...strawMan([meterUp], { m: 1 }, { m: 3 }), endings: [end('done'), end('other')] };
    const split: Scenario = { ...s, nodes: [{ ...s.nodes[0], choices: [s.nodes[0].choices[0], { ...s.nodes[0].choices[1], to: 'other' }] }] };
    expect(dominatedChoices(split, { destinations: 'equal-or-better' })).toEqual([]);
    expect(dominatedChoices(split, { destinations: 'ignore' })).toHaveLength(1);
  });

  it('compares siblings only, never choices at different nodes', () => {
    const s: Scenario = {
      start: 'a', meters: [meterUp],
      nodes: [
        { id: 'a', prompt: '?', choices: [{ id: 'a1', label: 'a1', to: 'b', effects: { m: 5 }, because: 'x' }] },
        { id: 'b', prompt: '?', choices: [{ id: 'b1', label: 'b1', to: 'done', effects: { m: -5 }, because: 'x' }] },
      ],
      endings: [end('done')],
    };
    expect(dominatedChoices(s, { destinations: 'ignore' })).toEqual([]);
  });

  it('does not hang on a looping scenario', () => {
    const s: Scenario = {
      start: 'a', meters: [meterUp],
      nodes: [{ id: 'a', prompt: '?', choices: [
        { id: 'again', label: 'again', to: 'a', effects: { m: 1 }, because: 'x' },
        { id: 'stop', label: 'stop', to: 'done', effects: { m: 2 }, because: 'x' },
      ] }],
      endings: [end('done')],
    };
    expect(() => validateScenario(s, { allowCycles: true, tradeoffs: true })).not.toThrow();
  });
});

describe('free-path', () => {
  const twoWay = (costly: Record<string, number>): Scenario => ({
    start: 'a',
    meters: [meterUp, meterDown],
    nodes: [{ id: 'a', prompt: 'Which?', choices: [
      { id: 'free', label: 'Free', to: 'done', effects: { m: 0, q: 1 }, because: 'It costs nothing.' },
      { id: 'costly', label: 'Costly', to: 'done', effects: costly, because: 'It costs something.' },
    ] }],
    endings: [end('done')],
  });

  it('finds a path on which no meter is ever red and none ends worse than it started', () => {
    const s = twoWay({ m: 2, q: -1 });
    expect(freePaths(s).map((p) => p.detail)).toEqual(['free ends at done with no meter ever in the red and none worse than it started']);
    expect(kinds(s)).toContain('free-path');
  });

  it('counts a meter that ends exactly where it started as not worse', () => {
    expect(freePaths(twoWay({ m: 0, q: 0 }))).toHaveLength(2);
  });

  it('is not free when any meter ends worse, in either direction', () => {
    const lowerIsBetterWorse: Scenario = { ...strawMan([meterUp], { m: 1 }, { m: 1 }) }; // m rises: worse
    const higherIsBetterWorse: Scenario = { ...strawMan([meterDown], { q: -1 }, { q: -1 }) }; // q falls: worse
    expect(freePaths(lowerIsBetterWorse)).toEqual([]);
    expect(freePaths(higherIsBetterWorse)).toEqual([]);
  });

  it('is not free when a meter goes red on the way, even if it recovers by the end', () => {
    const s: Scenario = {
      start: 'a', meters: [meterUp],
      nodes: [
        { id: 'a', prompt: '?', choices: [{ id: 'spike', label: 'spike', to: 'b', effects: { m: 10 }, because: 'x' }] },
        { id: 'b', prompt: '?', choices: [{ id: 'recover', label: 'recover', to: 'done', effects: { m: -12 }, because: 'x' }] },
      ],
      endings: [end('done')],
    };
    expect(validateScenario(s)).toEqual([]);
    expect(freePaths(s)).toEqual([]);
  });

  it('leaves the ordinary validation untouched when tradeoffs is off', () => {
    const s = strawMan([meterUp], { m: -1 }, { m: 3 });
    expect(validateScenario(s)).toEqual([]);
    expect(validateScenario(s, { tradeoffs: false })).toEqual([]);
    expect(validateScenario(s, { tradeoffs: true }).map((p) => p.kind).sort()).toEqual(['dominated-choice', 'dominated-path', 'free-path']);
  });
});

describe('dominated-path', () => {
  const choice = (id: string, to: string, effects: Record<string, number>) => ({ id, label: id, to, effects, because: 'x' });
  /** Every choice is a real trade-off at its node, yet the path B > B2 ends worse than A > A2 on both meters (m: lower is better, q: higher). */
  const wholePathOnly = (bEnding = 'done'): Scenario => ({
    start: 'a',
    meters: [meterUp, meterDown],
    nodes: [
      { id: 'a', prompt: '?', choices: [choice('A', 'b', { m: 2, q: 2 }), choice('B', 'c', { m: 0, q: 0 })] },
      { id: 'b', prompt: '?', choices: [choice('A2', 'done', { m: 0, q: 0 })] },
      { id: 'c', prompt: '?', choices: [choice('B2', bEnding, { m: 3, q: 1 })] },
    ],
    endings: [end('done'), end('other')],
  });
  const dominated = (s: Scenario, options = {}) => validateScenario(s, { tradeoffs: true, ...options }).filter((p) => p.kind === 'dominated-path');

  it('flags a planted whole-path-dominated scenario with the right kind, naming both paths', () => {
    const s = wholePathOnly();
    expect(dominatedChoices(s)).toEqual([]);
    expect(dominated(s)).toEqual([{ kind: 'dominated-path', detail: 'the path B > B2 is dominated by A > A2: its final meters are no better on any meter, worse on at least one' }]);
  });

  it('passes a scenario whose paths all trade one meter for another', () => {
    const good = wholePathOnly();
    good.nodes[2] = { id: 'c', prompt: '?', choices: [choice('B2', 'done', { m: 3, q: 4 })] }; // B > B2 ends m 3, q 4: better on q
    expect(dominated(good)).toEqual([]);
    expect(validateScenario(good, { tradeoffs: true }).map((p) => p.kind)).not.toContain('dominated-path');
  });

  it('needs a strict difference: equal final meters are not dominated (they are duplicates)', () => {
    const tie = wholePathOnly();
    tie.nodes[2] = { id: 'c', prompt: '?', choices: [choice('B2', 'done', { m: 2, q: 2 })] };
    expect(dominated(tie)).toEqual([]);
    expect(duplicatePaths(tie).map((p) => p.kind)).toEqual(['duplicate-path']);
    expect(duplicatePaths(tie)[0].detail).toBe('the paths A > A2 and B > B2 end on identical meters');
  });

  it('reports duplicates through validateScenario only when asked', () => {
    const tie = wholePathOnly();
    tie.nodes[2] = { id: 'c', prompt: '?', choices: [choice('B2', 'done', { m: 2, q: 2 })] };
    expect(kinds(tie)).not.toContain('duplicate-path');
    expect(validateScenario(tie, { tradeoffs: true, duplicatePaths: true }).map((p) => p.kind)).toContain('duplicate-path');
  });

  it('exempts a labelled trap path (and only that path)', () => {
    const s = wholePathOnly();
    expect(dominated(s, { trapPaths: [pathId(['B', 'B2'])] })).toEqual([]);
    expect(dominated(s, { trapPaths: ['A > A2'] })).toHaveLength(1);
  });

  it('compares only paths to the same ending, unless crossEndings says otherwise', () => {
    const different = wholePathOnly('other'); // B > B2 now reaches another ending: the meters cannot say it is worse
    expect(dominated(different)).toEqual([]);
    expect(dominated(different, { crossEndings: true })).toHaveLength(1);
    expect(dominatedPaths(different, { crossEndings: true })).toHaveLength(1);
  });

  it('honours the good direction of each meter', () => {
    const s = wholePathOnly();
    s.meters = [{ ...meterUp, bad: { below: 2 } }, meterDown]; // m is now higher-is-better: B > B2 (m 3, q 1) beats A > A2 (m 2, q 2) on m only
    expect(dominated(s)).toEqual([]);
  });

  it('does not hang on a looping scenario and ignores the looping path', () => {
    const loop: Scenario = {
      start: 'a', meters: [meterUp],
      nodes: [{ id: 'a', prompt: '?', choices: [choice('again', 'a', { m: 1 }), choice('go', 'done', { m: 1 })] }],
      endings: [end('done')],
    };
    expect(dominated(loop, { allowCycles: true })).toEqual([]);
  });

  it('keeps part1 and the shipped lead scenarios clean, and finds exactly the labelled traps in build-vs-buy under crossEndings', () => {
    for (const [id, s] of Object.entries(LEAD_SCENARIOS)) expect(dominated(s, { trapPaths: LEAD_TRAP_PATHS[id] }), id).toEqual([]);
    expect(dominated(PRICE_RISE, { crossEndings: true }).map((p) => p.detail.split(' is dominated')[0])).toEqual(['the path build > plan', 'the path build > nothing']);
    expect(dominated(PRICE_RISE, { crossEndings: true, trapPaths: ['build > plan', 'build > nothing'] })).toEqual([]);
  });

  it('finds the three cross-ending pairs of strangler-fig-migrations, none beaten by a path to the same ending', () => {
    expect(dominated(STRANGLER)).toEqual([]);
    expect(dominated(STRANGLER, { crossEndings: true }).map((p) => p.detail.split(' is dominated')[0])).toEqual([
      'the path a2 > b2 > c3', 'the path a3 > b1 > c2', 'the path a3 > b1 > c3',
    ]);
  });
});
