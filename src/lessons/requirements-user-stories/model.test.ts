import { describe, expect, it } from 'vitest';
import {
  ambiguity, BUILD_DAYS, criteriaFor, gherkin, isTestable, MATERIAL, QUESTIONS, REFINEMENT_DAYS, scopeFor, skipCost, stageOf, testsFor,
} from './model';
import { buildSkipFrames } from './frames';

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

describe('the question deck', () => {
  it('has unique ids and both kinds of material question plus distractors', () => {
    expect(new Set(ids(QUESTIONS)).size).toBe(QUESTIONS.length);
    const kinds = new Set(QUESTIONS.map((q) => q.kind));
    expect(kinds).toEqual(new Set(['criterion', 'scope', 'irrelevant']));
  });

  it('gives every material question something concrete to record', () => {
    for (const q of MATERIAL) {
      if (q.kind === 'criterion') expect(q.criterion).toBeTruthy();
      else expect(q.scope).toBeTruthy();
      expect(q.ambiguity).toBeTruthy();
      expect(q.reworkDays).toBeGreaterThan(0);
    }
  });
});

describe('the ambiguity meter', () => {
  it('starts full and drops by one step per material question', () => {
    const asked = new Set<string>();
    expect(ambiguity(asked)).toBe(1);
    MATERIAL.forEach((q, i) => {
      asked.add(q.id);
      expect(ambiguity(asked)).toBeCloseTo(1 - (i + 1) / MATERIAL.length, 12);
    });
  });

  it('reaches its floor only when every material ambiguity is resolved', () => {
    for (const skip of MATERIAL) {
      const asked = new Set(ids(QUESTIONS).filter((id) => id !== skip.id));
      expect(ambiguity(asked)).toBeGreaterThan(0); // all distractors asked, one real gap left
    }
    expect(ambiguity(new Set(ids(MATERIAL)))).toBe(0);
  });

  it('ignores irrelevant questions', () => {
    const irrelevant = QUESTIONS.filter((q) => q.kind === 'irrelevant');
    expect(ambiguity(new Set(ids(irrelevant)))).toBe(1);
  });
});

describe('acceptance criteria', () => {
  const all = criteriaFor(ids(QUESTIONS));

  it('are written as testable Given / When / Then', () => {
    for (const c of all) {
      const lines = gherkin(c);
      expect(lines[0]).toMatch(/^Scenario: /);
      expect(lines[1]).toMatch(/^ {2}Given \S/);
      expect(lines[2]).toMatch(/^ {2}When \S/);
      expect(lines[3]).toMatch(/^ {2}Then \S/);
      expect(isTestable(c)).toBe(true);
    }
  });

  it('flags vague, untestable wording', () => {
    expect(isTestable({ name: 'x', given: 'a user', when: 'they reset', then: 'it is fast and user-friendly' })).toBe(false);
  });

  it('turns into exactly one test per criterion, in the order asked', () => {
    const asked = ['font', 'rate', 'sms', 'expiry'];
    expect(testsFor(asked)).toEqual(['test: Too many requests are limited', 'test: Expired link is refused']);
    expect(scopeFor(asked)).toHaveLength(1);
    expect(testsFor(ids(QUESTIONS))).toHaveLength(all.length);
  });
});

describe('skipping refinement', () => {
  it('costs the build plus every rework, against refinement plus the build', () => {
    const c = skipCost();
    const rework = MATERIAL.reduce((s, q) => s + q.reworkDays, 0);
    expect(c).toEqual({ rework, skipped: BUILD_DAYS + rework, refined: REFINEMENT_DAYS + BUILD_DAYS });
    expect(c.skipped).toBeGreaterThan(c.refined);
  });

  it('replays one surprise per material question and captions every frame', () => {
    const frames = buildSkipFrames();
    for (const f of frames) expect(f.say).toBeTruthy();
    const surprises = frames.filter((f) => f.surprise !== null).map((f) => f.surprise);
    expect([...surprises].sort()).toEqual([...ids(MATERIAL)].sort()); // once each; the order is by stage (below)
    expect(frames.at(-1)!.days).toBeCloseTo(skipCost().skipped, 9);
  });
});

describe('the skip replay timeline', () => {
  it('every surprise names a known stage, so the replay can play them in time order', () => {
    for (const q of MATERIAL) expect(stageOf(q), q.surprise).toBeGreaterThanOrEqual(0);
    const ids = buildSkipFrames().flatMap((f) => (f.surprise ? [f.surprise] : []));
    const stages = ids.map((id) => stageOf(MATERIAL.find((q) => q.id === id)!));
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
  });
  it('no criterion shows a different screen for an account that exists', () => {
    const sso = MATERIAL.find((q) => q.id === 'sso')!;
    expect(sso.criterion?.then).toContain('the same "If an account exists');
  });
});
