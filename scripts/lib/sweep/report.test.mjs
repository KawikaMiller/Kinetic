import { describe, expect, it } from 'vitest';
import { addFinding, createResult, formatLesson, summarize } from './report.mjs';

const finding = (over = {}) => ({ kind: 'residue', scene: 'Calm', control: 'button Add', action: 'click', detail: 'NaN: "x NaN y"', ...over });

describe('addFinding', () => {
  it('keeps the first offence per control and kind', () => {
    const r = createResult('x');
    expect(addFinding(r, finding({ kind: 'focus-dropped', detail: 'a' }))).toBe(true);
    expect(addFinding(r, finding({ kind: 'focus-dropped', detail: 'b' }))).toBe(false);
    expect(addFinding(r, finding({ kind: 'focus-dropped', control: 'other', detail: 'b' }))).toBe(true);
  });

  it('keeps one finding per message per scene for page-text kinds, whatever control found it', () => {
    const r = createResult('x');
    expect(addFinding(r, finding({ control: 'a' }))).toBe(true);
    expect(addFinding(r, finding({ control: 'b' }))).toBe(false);
    expect(addFinding(r, finding({ control: 'b', scene: 'Busy' }))).toBe(true);
  });
});

describe('formatLesson and summarize', () => {
  it('a clean lesson is one ok line; a failing one lists each finding with its control and action', () => {
    const clean = createResult('sorting');
    expect(formatLesson(clean)).toMatch(/^ok {3}sorting/);
    const bad = createResult('sorting');
    addFinding(bad, finding());
    const text = formatLesson(bad);
    expect(text).toMatch(/^FAIL sorting/);
    expect(text).toContain('[residue] scene "Calm" / button Add / click: NaN');
  });

  it('totals findings and names the failed lessons', () => {
    const a = createResult('a');
    const b = createResult('b');
    addFinding(b, finding());
    a.actions = 3;
    b.actions = 4;
    expect(summarize([a, b])).toMatchObject({ lessons: 2, clean: 1, failed: ['b'], findings: 1, actions: 7, byKind: { residue: 1 } });
  });
});
