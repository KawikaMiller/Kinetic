import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { counterCaption, counterNumbers, fixesCaption, shapeRows, shapesCaption } from './captions';
import { BUDGET, MAX_LETTERS, backtrackVisits, parseText } from './engines';
import { BUDGETS, CAP_MAX, CAP_MIN, fixesOutcome, type FixesState, type RiskyId } from './fixes';
import { FACTS } from './facts';
import lesson from './index';
import { COUNTER_MAX, COUNTER_MIN, SHAPES_FROM, SHAPES_TO, initialCounter, initialFixes, initialShapes } from './opening';
import { PATTERNS } from './patterns';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLEAN = /NaN|undefined|\[object|null/;
const NO_FOREVER = /forever|never halt|infinite/i;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('redos');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('redos')).toEqual([]);
  });

  it('each scene opens on its own pure state, and the opening text parses', () => {
    expect([initialCounter(), initialShapes(), initialFixes()]).toEqual([initialCounter(), initialShapes(), initialFixes()]);
    expect(parseText(initialShapes().text)).toMatchObject({ ok: true });
    expect(initialCounter().letters).toBeGreaterThanOrEqual(COUNTER_MIN);
    expect(initialCounter().letters).toBeLessThanOrEqual(COUNTER_MAX);
    expect(initialFixes().letters).toBeLessThanOrEqual(MAX_LETTERS);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 12 letters take 16,384 visits against 63, one more letter multiplies by 2.00, and 19 letters give up while the linear engine needs 98', () => {
    const opening = counterNumbers(initialCounter().letters);
    expect([opening.bt.visits, opening.nfa.visits, opening.ratio!.toFixed(2)]).toEqual([16384, 63, '2.00']);
    expect([FACTS.counterVisits, FACTS.counterNfa, FACTS.counterRatio, FACTS.gaveUpAt, FACTS.gaveUpNfa]).toEqual([16384, 63, '2.00', 19, 98]);
    const eighteen = counterNumbers(18);
    const nineteen = counterNumbers(19);
    expect([eighteen.bt.gaveUp, nineteen.bt.gaveUp, nineteen.nfa.visits]).toEqual([false, true, 98]);
    expect(expectCaption(counterCaption(19))).toContain('gave up at the step budget of 2,000,000 visits');
    expect(expectCaption(counterCaption(12))).toContain('16,384 visits');
    expect(lesson.tryThis[0]).toContain('gave up at the step budget of 2,000,000');
  });

  it('try-this 2: the readout reads linear, polynomial, exponential and exponential, with 1.62 and 2.00 per letter, and the typed text costs 262,144 against 18', () => {
    expect(shapeRows().map((r) => r.growth.kind)).toEqual(['linear', 'polynomial', 'exponential', 'exponential']);
    expect([FACTS.fibRatio, FACTS.expRatio]).toEqual(['1.62', '2.00']);
    expect([FACTS.own.exponential, FACTS.own.linear, FACTS.ownLength]).toEqual([262144, 18, 17]);
    const text = initialShapes().text;
    expect(text).toBe(`${'a'.repeat(16)}!`);
    expect(expectCaption(shapesCaption('fibonacci', text))).toContain('exponential (each extra letter multiplies it by 1.62)');
    expect(lesson.tryThis[1]).toContain('exponential (about 1.62 per letter)');
  });

  it('try-this 3: cut off by default, a rewrite answers after 22 visits, the NFA takes 103, the cap refuses with 0 visits', () => {
    const start = initialFixes();
    expect(fixesOutcome(start)).toMatchObject({ verdict: 'cut-off', visits: BUDGET });
    expect(fixesOutcome({ ...start, rewrite: true })).toMatchObject({ verdict: 'answered', visits: 22, shown: '^a+$' });
    expect(fixesOutcome({ ...start, engine: 'nfa' })).toMatchObject({ verdict: 'answered', visits: 103 });
    expect(fixesOutcome({ ...start, capOn: true })).toMatchObject({ verdict: 'refused', visits: 0 });
    expect([FACTS.rewriteVisits, FACTS.nfaVisits, FACTS.cap, FACTS.capUnderVisits, FACTS.capVerdict]).toEqual([22, 103, 16, 131072, 'refused']);
    expect(lesson.tryThis[2]).toContain('answered after 22 visits');
  });
});

describe('captions across the control cross product', () => {
  it('the counter caption is clean and true at every letter count', () => {
    for (let n = COUNTER_MIN; n <= COUNTER_MAX; n++) {
      const text = expectCaption(counterCaption(n));
      const { bt, nfa } = counterNumbers(n);
      expect(text).not.toMatch(CLEAN);
      expect(text).not.toMatch(NO_FOREVER);
      const linear = nfa.visits.toLocaleString('en-US');
      expect(text.includes(`engine made ${linear}.`) || text.includes(`finished in ${linear} visits`)).toBe(true);
      expect(text.includes('gave up')).toBe(bt.gaveUp);
    }
  });

  it('the shapes caption is clean for every pattern and for refused text', () => {
    for (const p of PATTERNS) {
      expect(expectCaption(shapesCaption(p.id, 'aaa!'))).not.toMatch(CLEAN);
      expect(expectCaption(shapesCaption(p.id, 'x'.repeat(41)))).toContain('Your text is not used yet');
    }
  });

  it('the fixes caption is clean and matches the verdict over the whole control cross product', () => {
    const risky: RiskyId[] = ['quadratic', 'fibonacci', 'exponential'];
    for (const pattern of risky) {
      for (const engine of ['backtracking', 'nfa', 'lazy-dfa'] as const) {
        for (const rewrite of [false, true]) {
          for (const capOn of [false, true]) {
            for (const budget of BUDGETS) {
              for (const n of [1, 16, 20, MAX_LETTERS]) {
                const s: FixesState = { pattern, letters: n, engine, rewrite, capOn, cap: n + 1 > CAP_MAX ? CAP_MAX : CAP_MIN, budget };
                const o = fixesOutcome(s);
                const text = expectCaption(fixesCaption(s, o));
                expect(text).not.toMatch(CLEAN);
                expect(text).not.toMatch(NO_FOREVER);
                if (o.verdict === 'cut-off') expect(text).toContain(`cut off at the budget of ${budget.toLocaleString('en-US')} visits`);
                if (o.verdict === 'refused') expect(text).toContain('0 visits');
                if (o.verdict === 'answered') expect(text).toContain(`${o.visits.toLocaleString('en-US')} visits`);
              }
            }
          }
        }
      }
    }
  });

  it('the shapes table counts gave-up cells only for the doubling pattern', () => {
    const gaveUp = PATTERNS.map((p) => Array.from({ length: SHAPES_TO - SHAPES_FROM + 1 }, (_, i) => backtrackVisits(p.source, [...'a'.repeat(SHAPES_FROM + i), '!']).gaveUp).filter(Boolean).length);
    expect(gaveUp).toEqual([0, 0, 0, 2]);
  });
});

describe('the lesson stays inside the simulation', () => {
  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources)).toEqual([]);
  });

  it('never builds a RegExp, a Function or an eval from text, so a learner string cannot reach one', () => {
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(/new RegExp|RegExp\(|new Function|\beval\(/);
  });

  it('chips every scene as simulated and a toy', () => {
    for (const file of ['./CounterScene.tsx', './ShapesScene.tsx', './FixesScene.tsx']) {
      expect(sources[file]).toContain('<Provenance kind="simulated">');
      expect(sources[file]).toContain('<Provenance kind="toy">');
    }
    expect(sources['./CounterScene.tsx']).toContain('<Provenance kind="from-memory">');
    expect(sources['./FixesScene.tsx']).toContain('<Provenance kind="from-memory">');
  });

  it('says "gave up at the step budget" and never claims a run hangs or runs forever', () => {
    for (const [file, text] of Object.entries(sources)) expect(text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n'), file).not.toMatch(/runs forever|never halts|hangs the|infinite loop/i);
  });
});
