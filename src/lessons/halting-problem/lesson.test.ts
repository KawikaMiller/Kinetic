import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { runTm, tmStart, tmStep, type Tm, type TmRule } from '../../core/tm';
import { ANALYSER_RANGE, analyse, analyseAll } from './analyser';
import { binExplanation, diagonalCaption, dCaption, limitsCaption, predictorCaption, riceCaption } from './captions';
import { allClaims, dOnItself, dRow, firstDifference, flip, GRID_SIZE, randomClaims, rowsEqualToD, type Cell, type Claims } from './diagonal';
import lesson from './index';
import { configKey, D_HALTS, D_LOOPS, fromNotation, LIBRARY, libraryMachine, onesOn, probe, TRUTHS, WALK_RIGHT_ARGUMENT } from './machines';
import { certifiedLoopPhrase, cutoffPhrase, truthPhrase } from './phrases';
import {
  BUDGET_RANGE, canSayUnknown, CYCLE_GUESS_STEPS, DEFAULT_BUDGET, effective, KIND_LABEL, predict, predictSelf, runD, scoreboard,
  type Predictor, type PredictorKind,
} from './predictors';
import {
  BIN_LABEL, BINS, BOUNDED_STEPS, containsWhile, hasMoreThanTenLines, haltsWithinBound, isRight, RICE_CARDS, type Placement,
} from './rice';

/** An independent simulator: tape is an array that grows at both ends, rules in an object. */
function referenceRun(tm: Tm, input: string, maxSteps: number) {
  const rules: Record<string, TmRule> = {};
  for (const r of tm.rules) rules[`${r.state}|${r.read}`] = r;
  const tape: string[] = input === '' ? ['_'] : [...input];
  let head = 0;
  let state = tm.start;
  let steps = 0;
  for (;;) {
    if (['halt', 'accept', 'reject'].includes(state)) return { halted: true, steps, ones: tape.filter((s) => s === '1').length, tape: tape.join('').replace(/^_+|_+$/g, '') };
    const rule = rules[`${state}|${tape[head]}`];
    if (!rule || steps >= maxSteps) return { halted: false, steps, ones: tape.filter((s) => s === '1').length, tape: tape.join('').replace(/^_+|_+$/g, '') };
    tape[head] = rule.write;
    head += rule.move === 'L' ? -1 : rule.move === 'R' ? 1 : 0;
    state = rule.next;
    steps++;
    if (head < 0) {
      tape.unshift('_');
      head = 0;
    }
    if (head >= tape.length) tape.push('_');
  }
}

const KINDS: PredictorKind[] = ['budget', 'cycle', 'alwaysLoops', 'alwaysHalts'];
const BUDGETS = [BUDGET_RANGE.min, 20, 21, DEFAULT_BUDGET, 106, 107, 200, BUDGET_RANGE.max];
const everyPredictor = (unknown: boolean): Predictor[] =>
  KINDS.flatMap((kind) => BUDGETS.map((budget) => ({ kind, budget, allowUnknown: unknown })));
const budgetPredictor = (n: number, allowUnknown = false): Predictor => ({ kind: 'budget', budget: n, allowUnknown });

describe('the library, against an independent simulator and the literature', () => {
  it('has eight machines and every one has a certificate: five halt, two repeat a configuration, one has the recorded argument', () => {
    expect(LIBRARY).toHaveLength(8);
    const truths = LIBRARY.map((m) => TRUTHS.get(m.id)!);
    expect(truths.filter((t) => t.kind === 'halts')).toHaveLength(5);
    expect(truths.filter((t) => t.kind === 'loops' && t.certificate.kind === 'repeat')).toHaveLength(2);
    expect(truths.filter((t) => t.kind === 'loops' && t.certificate.kind === 'argument')).toHaveLength(1);
  });

  it('the busy-beaver machines halt after 6, 21 and 107 steps leaving 4, 5 and 13 ones (the published values), by two simulators', () => {
    const expected = { bb2: [6, 4], bb3: [21, 5], bb4: [107, 13] } as const;
    for (const [id, [steps, ones]] of Object.entries(expected)) {
      const m = libraryMachine(id);
      const run = runTm(m.tm, m.input, { maxSteps: 1000 });
      expect([run.status, run.steps, onesOn(run.config)], id).toEqual(['halted', steps, ones]);
      const ref = referenceRun(m.tm, m.input, 1000);
      expect([ref.halted, ref.steps, ref.ones], id).toEqual([true, steps, ones]);
      expect(TRUTHS.get(id)).toEqual({ kind: 'halts', steps, ones });
    }
  });

  it('increment on 1011 halts in 8 steps with 1100; erase on 111 halts in 4 with a blank tape', () => {
    const inc = libraryMachine('increment');
    expect(referenceRun(inc.tm, inc.input, 100)).toMatchObject({ halted: true, steps: 8, tape: '1100' });
    const erase = libraryMachine('erase');
    expect(referenceRun(erase.tm, erase.input, 100)).toMatchObject({ halted: true, steps: 4, tape: '' });
  });

  it('runTm and the independent simulator agree on every library machine after 300 steps (loops included)', () => {
    for (const m of LIBRARY) {
      const ours = runTm(m.tm, m.input, { maxSteps: 300 });
      const theirs = referenceRun(m.tm, m.input, 300);
      expect(ours.status === 'halted', m.id).toBe(theirs.halted);
      expect(ours.steps, m.id).toBe(theirs.steps);
      expect(onesOn(ours.config), m.id).toBe(theirs.ones);
    }
  });

  it('parses the usual busy-beaver notation: 1RB 1LB 1LA 1RH is four rules, blank is 0, H is halt', () => {
    const tm = fromNotation('1RB 1LB 1LA 1RH');
    expect(tm.rules).toEqual([
      { state: 'A', read: '_', write: '1', move: 'R', next: 'B' },
      { state: 'A', read: '1', write: '1', move: 'L', next: 'B' },
      { state: 'B', read: '_', write: '1', move: 'L', next: 'A' },
      { state: 'B', read: '1', write: '1', move: 'R', next: 'halt' },
    ]);
    expect(fromNotation('0LC 1RA').rules[0]).toMatchObject({ write: '_', move: 'L', next: 'C' });
  });

  it('the two certified loops repeat a configuration: the flip at step 2, and the bounce, and a repeat is verified step by step', () => {
    const flip = TRUTHS.get('flip');
    expect(flip).toEqual({ kind: 'loops', certificate: { kind: 'repeat', first: 0, at: 2 } });
    const bounce = TRUTHS.get('bounce');
    expect(bounce?.kind).toBe('loops');
    for (const id of ['flip', 'bounce']) {
      const t = TRUTHS.get(id)!;
      if (t.kind !== 'loops' || t.certificate.kind !== 'repeat') throw new Error('expected a repeat');
      const m = libraryMachine(id);
      const keys: string[] = [];
      let config = tmStart(m.tm, m.input);
      keys.push(configKey(config));
      for (let k = 0; k < t.certificate.at; k++) {
        const next = tmStep(m.tm, config);
        if (next.status !== 'moved') throw new Error('stopped');
        config = next.config;
        keys.push(configKey(config));
      }
      expect(keys[t.certificate.at]).toBe(keys[t.certificate.first]);
    }
  });

  it('the walk-right argument holds: one rule, always applicable, never entering a halting state, and no configuration repeats in 1,000 steps', () => {
    const m = libraryMachine('walk');
    expect(m.tm.rules).toHaveLength(1);
    expect(m.tm.rules[0]).toMatchObject({ read: '_', write: '1', move: 'R', next: 'q0' });
    expect(['halt', 'accept', 'reject']).not.toContain(m.tm.rules[0].next);
    let config = tmStart(m.tm, m.input);
    const seen = new Set<string>();
    for (let k = 1; k <= 1000; k++) {
      const next = tmStep(m.tm, config);
      if (next.status !== 'moved') throw new Error('walk-right stopped');
      config = next.config;
      expect(config.state).toBe('q0');
      expect(config.head).toBe(k);
      expect(onesOn(config)).toBe(k);
      const key = configKey(config);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(TRUTHS.get('walk')).toEqual({ kind: 'loops', certificate: { kind: 'argument', text: WALK_RIGHT_ARGUMENT.text } });
  });

  it('probe stops at the budget boundary: 107 steps halts the 4-state champion, 106 does not', () => {
    const m = libraryMachine('bb4');
    expect(probe(m.tm, m.input, { maxSteps: 107, watchRepeats: false }).kind).toBe('halted');
    expect(probe(m.tm, m.input, { maxSteps: 106, watchRepeats: false })).toEqual({ kind: 'cutoff', steps: 106 });
  });
});

describe('the diagonal table', () => {
  const differsEverywhere = (claims: Claims) => {
    const n = claims.length;
    const d = dRow(claims, n);
    for (let i = 0; i < n; i++) {
      expect(d[i], `row ${i} at its own diagonal`).not.toBe(claims[i][i]);
      expect(firstDifference(claims[i], d)).not.toBeNull();
    }
    expect(rowsEqualToD(claims, n)).toEqual([]);
  };

  it('D differs from every row, at that row’s own diagonal cell, for all 2^9 tables of 3 x 3', () => {
    let count = 0;
    for (const t of allClaims(3)) {
      differsEverywhere(t);
      count++;
    }
    expect(count).toBe(512);
  });

  it('and for all 2^16 tables of 4 x 4', () => {
    let count = 0;
    for (const t of allClaims(4)) {
      const d = dRow(t, 4);
      for (let i = 0; i < 4; i++) if (d[i] === t[i][i]) throw new Error('D agrees with a row on the diagonal');
      count++;
    }
    expect(count).toBe(65536);
  });

  it('the fixed point does not exist: D’s behaviour on D differs from either claim', () => {
    for (const claim of ['H', 'L'] as Cell[]) {
      const { dDoes, claimIsRight } = dOnItself(claim);
      expect(dDoes).toBe(claim === 'H' ? 'L' : 'H');
      expect(claimIsRight).toBe(false);
    }
    expect(flip('H')).toBe('L');
  });

  it('seeded claims are reproducible, 7 x 7, and the first seed gives a table that is not constant', () => {
    expect(randomClaims(7, 1)).toEqual(randomClaims(7, 1));
    expect(randomClaims(7, 1)).not.toEqual(randomClaims(7, 2));
    const flat = randomClaims(7, 1).flat();
    expect(flat).toHaveLength(49);
    expect(new Set(flat.slice(0, GRID_SIZE * GRID_SIZE)).size).toBe(2);
  });

  it('holds for many seeded 6 x 6 tables too', () => {
    for (let seed = 1; seed <= 200; seed++) differsEverywhere(randomClaims(GRID_SIZE, seed));
  });
});

describe('predictors, scored against the truth', () => {
  it('Run N steps says HALTS exactly for the halting machines that need at most N steps, for every N from 10 to 500', () => {
    const needs = LIBRARY.map((m) => referenceRun(m.tm, m.input, 1000)).filter((r) => r.halted).map((r) => r.steps);
    expect(needs.sort((a, b) => a - b)).toEqual([4, 6, 8, 21, 107]);
    for (let n = BUDGET_RANGE.min; n <= BUDGET_RANGE.max; n++) {
      const halts = LIBRARY.filter((m) => predict(budgetPredictor(n), m).verdict === 'HALTS').length;
      expect(halts, `N=${n}`).toBe(needs.filter((s) => s <= n).length);
    }
  });

  it('Run 50 steps scores 7 of 9: it calls the 107-step champion a loop (wrong) and loses to D; Run 200 scores 8 of 9', () => {
    const at50 = scoreboard(budgetPredictor(50));
    expect([at50.right, at50.wrong, at50.unanswered, at50.total]).toEqual([7, 2, 0, 9]);
    expect(at50.rows.find((r) => r.id === 'bb4')?.outcome).toBe('wrong');
    expect(at50.d.outcome).toBe('wrong');
    const at200 = scoreboard(budgetPredictor(200));
    expect([at200.right, at200.wrong]).toEqual([8, 1]);
    expect(at200.rows.every((r) => r.outcome === 'right')).toBe(true);
  });

  it('no predictor that always answers scores 9 of 9, whatever the menu setting', () => {
    for (const p of everyPredictor(false)) {
      const sb = scoreboard(p);
      expect(sb.right, JSON.stringify(p)).toBeLessThan(sb.total);
      expect(sb.d.outcome, JSON.stringify(p)).toBe('wrong');
    }
  });

  it('D, really run, does the opposite of what an always-answering predictor says about D run on D', () => {
    for (const p of everyPredictor(false)) {
      const d = runD(p);
      expect(['HALTS', 'LOOPS']).toContain(d.verdict);
      if (d.verdict === 'LOOPS') {
        const ref = referenceRun(D_HALTS, '', 100);
        expect(d.truth).toEqual({ kind: 'halts', steps: 1, ones: 0 });
        expect([ref.halted, ref.steps]).toEqual([true, 1]);
      } else {
        expect(d.truth).toEqual({ kind: 'loops', certificate: { kind: 'repeat', first: 0, at: 2 } });
        expect(referenceRun(D_LOOPS, '', 100).halted).toBe(false);
      }
      const dHalts = d.truth.kind === 'halts';
      expect(dHalts, JSON.stringify(p)).toBe(d.verdict === 'LOOPS');
      expect(predictSelf(p).verdict).toBe(d.verdict);
    }
  });

  it('a predictor that may say UNKNOWN is never wrong in this menu, and D does not contradict it', () => {
    for (const p of everyPredictor(true).filter((x) => canSayUnknown(x.kind))) {
      const sb = scoreboard(p);
      expect(sb.wrong, JSON.stringify(p)).toBe(0);
      expect(sb.unanswered, JSON.stringify(p)).toBeGreaterThan(0);
      expect(sb.d.answer.verdict).toBe('UNKNOWN');
      expect(sb.d.outcome).toBe('unanswered');
    }
    const at50 = scoreboard(budgetPredictor(50, true));
    expect([at50.right, at50.wrong, at50.unanswered]).toEqual([4, 0, 5]);
  });

  it('Watch for a repeat settles the loops it can certify and guesses LOOPS for walk-right after 1,000 steps', () => {
    const walk = libraryMachine('walk');
    const p: Predictor = { kind: 'cycle', budget: DEFAULT_BUDGET, allowUnknown: false };
    expect(predict(p, libraryMachine('flip'))).toMatchObject({ verdict: 'LOOPS', basis: 'repeat', at: 2 });
    expect(predict(p, libraryMachine('bb4'))).toMatchObject({ verdict: 'HALTS', basis: 'ran-to-halt' });
    expect(predict(p, walk)).toEqual({ verdict: 'LOOPS', basis: 'cutoff', limit: CYCLE_GUESS_STEPS });
    expect(predict({ ...p, allowUnknown: true }, walk).verdict).toBe('UNKNOWN');
  });

  it('a control that is not shown does not change an answer: N for the other kinds, UNKNOWN for the fixed ones', () => {
    for (const kind of ['cycle', 'alwaysLoops', 'alwaysHalts'] as const) {
      const [lo, hi] = [BUDGET_RANGE.min, BUDGET_RANGE.max].map((budget) => scoreboard(effective({ kind, budget, allowUnknown: false })));
      expect(lo, kind).toEqual(hi);
    }
    for (const kind of ['alwaysLoops', 'alwaysHalts'] as const) {
      const [no, yes] = [false, true].map((allowUnknown) => scoreboard(effective({ kind, budget: 50, allowUnknown })));
      expect(no, kind).toEqual(yes);
    }
    expect(KIND_LABEL.budget).toBe('Run N steps');
  });
});

describe('captions never say "never halts" or "runs forever" without a certificate', () => {
  const certified = [...TRUTHS.values()].filter((t) => t.kind === 'loops').map((t) => (t.kind === 'loops' ? certifiedLoopPhrase(t.certificate) : ''));
  const forbidden = /never halts|runs forever|loops forever|infinite loop/i;
  const strip = (text: string) => certified.reduce((s, c) => s.split(c).join(''), text);

  it('over every predictor, setting and scoreboard row, only the certified phrases carry the words', () => {
    let seen = 0;
    for (const unknown of [false, true]) {
      for (const p of everyPredictor(unknown)) {
        const sb = scoreboard(effective(p));
        const texts = [
          captionText(predictorCaption(effective(p), sb, runD(effective(p)))),
          ...[...sb.rows, sb.d].flatMap((r) => [truthPhrase(r.truth), r.answer.verdict, cutoffPhrase(r.answer.limit ?? 1)]),
        ];
        for (const text of texts) {
          expect(strip(text), text).not.toMatch(forbidden);
          seen++;
        }
        for (const r of [...sb.rows, sb.d]) {
          expect(`${r.answer.basis}`).not.toMatch(forbidden);
          if (r.answer.basis === 'cutoff') {
            expect(truthPhrase(r.truth)).toBeTruthy();
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('a cut-off run is described as "did not halt within N steps", with the number', () => {
    expect(cutoffPhrase(50)).toBe('did not halt within 50 steps');
    expect(cutoffPhrase(1000)).toBe('did not halt within 1,000 steps');
    const text = expectCaption(predictorCaption(effective(budgetPredictor(50)), scoreboard(budgetPredictor(50)), runD(budgetPredictor(50))));
    expect(text).toContain('did not halt within 50 steps');
    expect(text).toContain('7 of 9');
    expect(text).toContain('Busy beaver, 4 states');
  });

  it('the analyser’s caption, every diagonal stage and the Rice sorting pass the glue check and the same rule', () => {
    const claims = randomClaims(7, 1);
    for (const stage of ['table', 'built', 'self'] as const) {
      for (let selected = 0; selected < GRID_SIZE; selected++) {
        const text = expectCaption(diagonalCaption(stage, claims, selected));
        expect(strip(text)).not.toMatch(forbidden);
      }
    }
    for (let limit = ANALYSER_RANGE.min; limit <= ANALYSER_RANGE.max; limit += 10) {
      const text = expectCaption(limitsCaption(analyseAll(limit), limit));
      expect(strip(text)).not.toMatch(forbidden);
    }
    expect(expectCaption(riceCaption(RICE_CARDS.map((card) => ({ card, chosen: null }))))).toContain('Sort each property');
    expect(expectCaption(dCaption(runD(budgetPredictor(50))))).toContain('They disagree');
    expect(expectCaption(dCaption(runD(budgetPredictor(50, true))))).toContain('UNKNOWN is no claim');
  });
});

describe('Rice’s theorem cards', () => {
  it('has eight cards, each with a reason and a class from the four; every class is used', () => {
    expect(RICE_CARDS).toHaveLength(8);
    for (const c of RICE_CARDS) {
      expect(c.reason.length, c.id).toBeGreaterThan(20);
      expect(BINS).toContain(c.bin);
    }
    for (const b of BINS) expect(RICE_CARDS.some((c) => c.bin === b), b).toBe(true);
    expect(new Set(RICE_CARDS.map((c) => c.id)).size).toBe(8);
  });

  it('the syntactic cards are decided by reading, with real deciders', () => {
    expect(hasMoreThanTenLines(Array.from({ length: 11 }, (_, i) => `line ${i}`).join('\n'))).toBe(true);
    expect(hasMoreThanTenLines(Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'))).toBe(false);
    expect(hasMoreThanTenLines('a\n\n\nb')).toBe(false);
    expect(containsWhile('i = 0; while (i < 3) { i = i + 1 }')).toBe(true);
    expect(containsWhile('meanwhile = 1')).toBe(false);
  });

  it('the bounded card is decided by running: halting at step 1,000 passes and at step 1,001 does not', () => {
    const chain = (steps: number): Tm => ({
      start: 's0',
      rules: Array.from({ length: steps }, (_, i): TmRule => ({ state: `s${i}`, read: i === 0 ? '0' : '_', write: i === 0 ? '0' : '_', move: 'R', next: i === steps - 1 ? 'halt' : `s${i + 1}` })),
    });
    expect(haltsWithinBound(chain(BOUNDED_STEPS))).toBe(true);
    expect(haltsWithinBound(chain(BOUNDED_STEPS + 1))).toBe(false);
    const spin: Tm = { start: 'q', rules: [{ state: 'q', read: '0', write: '0', move: 'R', next: 'q' }, { state: 'q', read: '_', write: '_', move: 'L', next: 'q' }] };
    expect(haltsWithinBound(spin)).toBe(false);
    expect(RICE_CARDS.find((c) => c.id === 'bounded')?.text).toContain(BOUNDED_STEPS.toLocaleString('en-US'));
  });

  it('the semantic cards are exactly the non-trivial, non-syntactic, non-bounded ones, and the reasons say why', () => {
    expect(RICE_CARDS.filter((c) => c.bin === 'rice').map((c) => c.id)).toEqual(['halts0', 'seven', 'zero', 'same']);
    expect(RICE_CARDS.find((c) => c.id === 'same')?.reason).toContain('pair');
    expect(RICE_CARDS.find((c) => c.id === 'some')?.reason).toContain('true of all programs');
  });

  it('a wrong sort names the right class; a right sort says Right', () => {
    const card = RICE_CARDS.find((c) => c.id === 'bounded')!;
    const wrong: Placement = { card, chosen: 'rice' };
    expect(isRight(wrong)).toBe(false);
    expect(binExplanation(wrong)).toContain(BIN_LABEL.bounded);
    expect(binExplanation({ card, chosen: 'bounded' })).toBe('Right.');
  });
});

describe('the analyser is sound: its yes and no answers are right at every limit', () => {
  it('for every limit from 10 to 500, yes means it halts, no means a certified loop, maybe means a cut-off', () => {
    for (let limit = ANALYSER_RANGE.min; limit <= ANALYSER_RANGE.max; limit++) {
      for (const row of analyseAll(limit)) {
        const reference = referenceRun(libraryMachine(row.id).tm, libraryMachine(row.id).input, limit);
        if (row.verdict === 'yes') {
          expect(row.truth.kind, `${row.id} @${limit}`).toBe('halts');
          expect(reference.halted).toBe(true);
        }
        if (row.verdict === 'no') expect(row.truth).toMatchObject({ kind: 'loops', certificate: { kind: 'repeat' } });
        if (row.verdict === 'maybe') expect(reference.halted).toBe(false);
      }
    }
  });

  it('settles more as the limit rises, and leaves walk-right a maybe at every limit', () => {
    const tally = (limit: number) => ['yes', 'no', 'maybe'].map((v) => analyseAll(limit).filter((r) => r.verdict === v).length);
    expect(tally(50)).toEqual([4, 2, 2]);
    expect(tally(200)).toEqual([5, 2, 1]);
    for (let limit = ANALYSER_RANGE.min; limit <= ANALYSER_RANGE.max; limit += 5) {
      expect(analyse(libraryMachine('walk'), limit).verdict).toBe('maybe');
    }
  });
});

describe('try-this entries, from the default state', () => {
  it('try-this 1: Build D on the seed-1 table: 0 of 6 rows equal D, all 6 differ at their own diagonal; also after Randomise', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const claims = randomClaims(GRID_SIZE + 1, seed);
      const d = dRow(claims, GRID_SIZE);
      expect(rowsEqualToD(claims, GRID_SIZE)).toEqual([]);
      expect(claims.slice(0, GRID_SIZE).filter((row, i) => row[i] !== d[i])).toHaveLength(GRID_SIZE);
    }
    expect(lesson.tryThis[0]).toContain('0 of 6');
  });

  it('try-this 2: whichever of H or L the D, D cell holds, D does the other', () => {
    const claims = randomClaims(GRID_SIZE + 1, 1);
    const claim = claims[GRID_SIZE][GRID_SIZE];
    expect(dOnItself(claim).dDoes).toBe(flip(claim));
    expect(dOnItself(flip(claim)).dDoes).toBe(claim);
    expect(expectCaption(diagonalCaption('self', claims, 0))).toContain('The claim is wrong');
  });

  it('try-this 3: N = 50 scores 7 of 9 because the 4-state machine needs 107 steps, and N = 200 scores 8 of 9', () => {
    expect(scoreboard(budgetPredictor(DEFAULT_BUDGET)).right).toBe(7);
    expect(scoreboard(budgetPredictor(200)).right).toBe(8);
    expect(lesson.tryThis[2]).toContain('107 steps');
    expect(lesson.tryThis[2]).toContain('7 of 9');
    expect(lesson.tryThis[2]).toContain('8 of 9');
  });

  it('try-this 4: UNKNOWN at N = 50 leaves 0 wrong, 4 right and 5 of 9 unanswered', () => {
    const sb = scoreboard(budgetPredictor(50, true));
    expect([sb.wrong, sb.right, sb.unanswered]).toEqual([0, 4, 5]);
    expect(lesson.tryThis[3]).toContain('5 of 9');
  });

  it('try-this 5: the bounded card under Undecidable is wrong, and the feedback says decidable by running and not semantic', () => {
    const card = RICE_CARDS.find((c) => c.text.includes('1,000 steps on input 0'))!;
    const placement: Placement = { card, chosen: 'rice' };
    expect(isRight(placement)).toBe(false);
    expect(binExplanation(placement)).toContain('Decidable by running');
    expect(card.reason).toContain('not semantic');
  });
});
