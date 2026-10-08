import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { appliedCaption, smellCaption, unsafeCaption } from './frames';
import { ALL_SUBSETS, REFACTORS, SMELLS, diffRows, runCharacterization, versionLines, type RefactorId } from './model';

describe('captions are computed from the diff and the test run', () => {
  it('for every refactoring applied on top of every subset that lacks it, with and without the unsafe edit', () => {
    for (const s of ALL_SUBSETS) {
      for (const r of REFACTORS.filter((x) => !s.has(x))) {
        for (const unsafe of [false, true]) {
          const next = new Set<RefactorId>([...s, r]);
          const rows = diffRows(versionLines(s, { unsafe }), versionLines(next, { unsafe }));
          const tests = runCharacterization(next, { unsafe });
          const t = text(appliedCaption(r, rows, tests, unsafe));
          const added = rows.filter((x) => x.kind === 'added').length;
          const removed = rows.filter((x) => x.kind === 'removed').length;
          expect(t).toContain(`${added} line${added === 1 ? '' : 's'} in`);
          expect(t).toContain(`${removed} line${removed === 1 ? '' : 's'} out`);
          expect(t.includes('all 12 tests green')).toBe(!unsafe);
          expect(t.includes('that is a refactoring')).toBe(!unsafe);
          expect(t.includes('the red is that edit')).toBe(unsafe);
        }
      }
    }
  });
  it('the magic-literal try-this: 3 lines in, 1 out, green', () => {
    const rows = diffRows(versionLines(new Set()), versionLines(new Set<RefactorId>(['constant'])));
    expect(text(appliedCaption('constant', rows, runCharacterization(new Set(['constant'])), false))).toContain('3 lines in, 1 line out, and all 12 tests green');
  });
  it('the unsafe edit caption names the failing test with its numbers', () => {
    const t = text(unsafeCaption(true, runCharacterization(new Set(), { unsafe: true })));
    expect(t).toContain('1 of 12 tests red');
    expect(t).toContain('expected 96.53, got 96.54');
    expect(text(unsafeCaption(false, runCharacterization(new Set())))).toContain('all 12 tests green');
  });
  it('names each smell and its refactoring', () => {
    for (const r of REFACTORS) expect(text(smellCaption(r))).toContain(SMELLS[r].refactoring);
  });
});
