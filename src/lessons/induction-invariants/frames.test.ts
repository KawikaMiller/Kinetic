import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { dominoRun, DOMINOES, type DominoClaim } from './dominoes';
import { factorTree, FACTOR_PRESETS, leafPrimes } from './factorTree';
import { dominoFrames, factorFrames, failingTarget, searchFrames, verdictLabel } from './frames';
import { ABSENT_TARGETS, SEARCH_ARRAY } from './presets';
import { BUGS, ITERATION_CAP, runSearch } from './search';

describe('dominoFrames', () => {
  it('ends on the right outcome for every claim × base × step combination', () => {
    const expected: Record<string, RegExp> = {
      'odd/true/true': /All 12 dominoes fell/,
      'odd/true/false': /domino 2 stays up/,
      'horses/true/true': /proves nothing past n = 1/,
      'horses/true/false': /domino 2 stays up/,
    };
    for (const claim of ['odd', 'horses'] as DominoClaim[]) {
      for (const base of [true, false]) {
        for (const step of [true, false]) {
          const frames = dominoFrames(claim, base, step);
          const last = frames.at(-1)!;
          const run = dominoRun(claim, base, step);
          expect(last.fallen).toBe(run.fallen);
          expect(frames.every((f) => f.say != null)).toBe(true);
          const want = base ? expected[`${claim}/${base}/${step}`] : /nothing is proven/;
          expect(text(last.say)).toMatch(want);
        }
      }
    }
  });

  it('marks the horses gap at 1 → 2 and never lets domino 2 fall', () => {
    const frames = dominoFrames('horses', true, true);
    expect(frames.some((f) => f.gapAt === 1)).toBe(true);
    expect(Math.max(...frames.map((f) => f.fallen))).toBe(1);
    expect(dominoFrames('odd', true, true).at(-1)!.fallen).toBe(DOMINOES);
  });
});

describe('searchFrames', () => {
  const targets = [...SEARCH_ARRAY, ...ABSENT_TARGETS];

  it("closes with the verdict category the run detected, for every bug and every target", () => {
    for (const bug of BUGS) {
      for (const target of targets) {
        const frames = searchFrames(SEARCH_ARRAY, target, bug);
        const run = runSearch(SEARCH_ARRAY, target, bug);
        expect(text(frames.at(-1)!.say).startsWith(verdictLabel(run.verdict, bug)), `${bug}/${target}`).toBe(true);
        expect(frames.every((f) => f.say != null)).toBe(true);
        if (bug === 'none') expect(run.verdict.kind).toBe('ok');
        expect(frames.at(-1)!.allHeld).toBe(run.verdict.kind !== 'invariant');
        expect(frames.slice(0, -1).every((x) => x.allHeld === null)).toBe(true);
      }
    }
  });

  it('only summarises the stalled loop when the skipped iterations really are identical', () => {
    for (const target of targets) {
      const run = runSearch(SEARCH_ARRAY, target, 'lo-mid');
      const frames = searchFrames(SEARCH_ARRAY, target, 'lo-mid');
      const skip = frames.find((f) => f.phase === 'skip');
      if (!skip) {
        expect(run.verdict.kind).not.toBe('non-termination');
        continue;
      }
      expect(run.iterations).toHaveLength(ITERATION_CAP);
      const from = frames.filter((f) => f.phase === 'iter').length;
      for (const it of run.iterations.slice(from)) expect([it.lo, it.hi, it.mid]).toEqual([skip.lo, skip.hi, skip.mid]);
      expect(text(skip.say)).toContain(`Iterations ${from + 1} to ${ITERATION_CAP} are the same`);
    }
  });

  it('names the unchecked cell when while (lo < hi) gives up early', () => {
    const exit = searchFrames(SEARCH_ARRAY, 91, 'lt').find((f) => f.phase === 'exit')!;
    expect(text(exit.say)).toContain('a[9] = 91 was never checked');
  });

  it('flags the read past the end for hi = a.length', () => {
    const frames = searchFrames(SEARCH_ARRAY, 99, 'hi-n');
    expect(text(frames[0].say)).toContain('invariant ✗');
    expect(text(frames.at(-1)!.say)).toContain('hi = 10, so hi + 1 = 11 is more than n = 10');
    expect(frames.some((f) => text(f.say).includes('a[10] is undefined'))).toBe(true);
  });
});

describe('factorFrames', () => {
  it('proves each preset bottom-up and closes on its real factorisation', () => {
    for (const n of FACTOR_PRESETS) {
      const t = factorTree(n);
      const frames = factorFrames(t);
      expect(frames.at(-1)!.proven).toHaveLength(t.size);
      expect(text(frames.at(-1)!.say)).toContain(`${n} = ${leafPrimes(t).join(' × ')}`);
    }
    expect(text(factorFrames(factorTree(360))[factorFrames(factorTree(360)).length - 2].say)).toContain('not P(359)');
  });
});

describe('review B15 regressions', () => {
  const targets = [...SEARCH_ARRAY, ...ABSENT_TARGETS];

  it('never calls code with an injected bug "Correct", and points at a target that really fails', () => {
    for (const bug of BUGS) {
      if (bug === 'none') continue;
      for (const target of targets) {
        const frames = searchFrames(SEARCH_ARRAY, target, bug);
        for (const f of frames) expect(text(f.say), `${bug}/${target}`).not.toMatch(/\bCorrect\b/);
        const run = runSearch(SEARCH_ARRAY, target, bug);
        if (run.verdict.kind === 'ok') {
          const last = text(frames.at(-1)!.say);
          expect(last).toMatch(/^Passed this run\./);
          const t = failingTarget(SEARCH_ARRAY, bug)!;
          expect(last).toContain(`search for ${t} to see it fail`);
          expect(runSearch(SEARCH_ARRAY, t, bug).verdict.kind).not.toBe('ok');
        }
      }
    }
  });

  it('the default target 91 shows every bug failing', () => {
    for (const bug of BUGS) if (bug !== 'none') expect(runSearch(SEARCH_ARRAY, 91, bug).verdict.kind).not.toBe('ok');
  });

  it('opens the strong-induction walk sensibly for n = 2 and 3, where there is no smaller case', () => {
    for (const n of [2, 3]) {
      const first = text(factorFrames(factorTree(n))[0].say);
      expect(first).toContain('base case');
      expect(first).not.toContain('from 2 to');
    }
    expect(text(factorFrames(factorTree(4))[0].say)).toContain('from 2 to 3');
  });
});
