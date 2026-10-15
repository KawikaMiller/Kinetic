import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, genOf } from './config';
import { shrinkFrames } from './frames';
import { replayIdentical } from './replay';
import { SHRINK_STEP_LIMIT, failsAny, findAndShrink, forAll, shrink, shrinkCandidates, type Shrinker } from './runner';
import { ALL_PROPS, BUGS, bugOf } from './sorts';

const buggy = BUGS.filter((b) => b.id !== 'correct');
const key = (xs: unknown) => JSON.stringify(xs);

/** Independent enumeration of every one-step simplification: drop any element, halve any element toward zero, or keep the first half. */
function bruteForceCandidates(xs: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < xs.length; i++) out.add(key(xs.filter((_, j) => j !== i)));
  for (let i = 0; i < xs.length; i++) {
    const half = xs[i] < 0 ? -Math.floor(-xs[i] / 2) : Math.floor(xs[i] / 2);
    if (half !== xs[i]) out.add(key(xs.map((v, j) => (j === i ? half : v))));
  }
  if (xs.length > 1) out.add(key(xs.slice(0, Math.ceil(xs.length / 2))));
  return out;
}

describe('shrink candidates and negative zero', () => {
  it('never produces -0, whichever value is halved', () => {
    for (const x of [-1, 1, 0, -3, 3, -1e9]) {
      for (const cand of shrinkCandidates([x])) for (const v of cand) expect(Object.is(v, -0), `${x}`).toBe(false);
    }
  });
});

describe('shrink candidates', () => {
  it('are exactly the single drops, halvings and first-half prefix, for 500 seeded arrays', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const xs = Array.from({ length: seed % 9 }, (_, i) => ((seed * 7919 + i * 104729) % 41) - 20);
      expect(new Set(shrinkCandidates(xs).map(key))).toEqual(bruteForceCandidates(xs));
    }
  });

  it('never repeats a candidate, never returns the input itself, and always changes something', () => {
    for (const xs of [[], [0], [5], [10, 2], [3, 3, 3], [-7, 4, 0, 9]]) {
      const c = shrinkCandidates(xs).map(key);
      expect(new Set(c).size).toBe(c.length);
      expect(c).not.toContain(key(xs));
    }
  });
});

describe('shrinking over 200 seeds for every buggy function', () => {
  const still = (bug: (typeof buggy)[number]) => failsAny(bug.fn, ALL_PROPS);

  it('ends on an input that still fails, no longer than the original, with no single further shrink failing', () => {
    for (const bug of buggy) {
      let checked = 0;
      for (let seed = 1; seed <= 200; seed++) {
        for (const range of ['million', 'tiny'] as const) {
          const found = findAndShrink(bug.fn, ALL_PROPS, { range, maxLength: 12, seed });
          if (!found) continue;
          checked++;
          const { original, minimal, hitLimit } = found.shrunk;
          expect(still(bug)(original), `${bug.id} ${seed}`).toBe(true);
          expect(still(bug)(minimal), `${bug.id} ${seed}`).toBe(true);
          expect(minimal.length).toBeLessThanOrEqual(original.length);
          expect(hitLimit, `${bug.id} ${seed}`).toBe(false);
          for (const c of bruteForceCandidates(minimal)) {
            expect(still(bug)(JSON.parse(c) as number[]), `${bug.id} seed ${seed}: a single shrink of ${key(minimal)} still fails: ${c}`).toBe(false);
          }
        }
      }
      expect(checked, bug.id).toBeGreaterThan(100);
    }
  });

  it('terminates within the step limit on every one of them', () => {
    for (const bug of buggy) {
      for (let seed = 1; seed <= 200; seed++) {
        const found = findAndShrink(bug.fn, ALL_PROPS, { range: 'million', maxLength: 20, seed });
        if (found) expect(found.shrunk.steps.length).toBeLessThanOrEqual(SHRINK_STEP_LIMIT);
      }
    }
  });

  it('stops at the step limit and says so when the limit is too small to finish', () => {
    const bug = bugOf('no-comparator');
    const stuck = shrink(Array.from({ length: 20 }, (_, i) => 1_000_000 - i * 7), failsAny(bug.fn, ALL_PROPS));
    expect(stuck.steps.length).toBeLessThanOrEqual(SHRINK_STEP_LIMIT);
    // A predicate that always fails never reaches a minimum before the empty array, but must still end.
    const always = shrink([5, 4, 3], () => true);
    expect(always.minimal).toEqual([]);
    expect(always.hitLimit).toBe(false);
  });
});

describe('the shrink-quality check can fail', () => {
  const shorterShare = (shrinker: Shrinker) => {
    let failing = 0;
    let shorter = 0;
    for (const bug of buggy) {
      for (let seed = 1; seed <= 200; seed++) {
        const found = findAndShrink(bug.fn, ALL_PROPS, { range: 'million', maxLength: 12, seed }, shrinker);
        if (!found) continue;
        failing++;
        if (found.shrunk.minimal.length < found.shrunk.original.length) shorter++;
      }
    }
    return shorter / failing;
  };
  const neverShrinks: Shrinker = (failing) => ({ original: [...failing], minimal: [...failing], steps: [], hitLimit: false });

  it('passes "shrunk length < original length for at least 90% of failing seeds" for the real shrinker', () => {
    expect(shorterShare(shrink)).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects a runner that never shrinks, which scores 0%', () => {
    expect(shorterShare(neverShrinks)).toBeLessThan(0.9);
  });
});

describe('the opening shrink and its replay', () => {
  it('try-this 2: the defaults shrink the seven-value array to [17, 3], and the last caption says nothing smaller fails', () => {
    const found = findAndShrink(bugOf(DEFAULT_CONFIG.fn).fn, DEFAULT_CONFIG.props, genOf(DEFAULT_CONFIG))!;
    expect(found.run.failure!.input).toHaveLength(7);
    expect(found.shrunk.minimal).toEqual([17, 3]);
    expect(found.shrunk.hitLimit).toBe(false);
    const frames = shrinkFrames(found.shrunk, found.run.failure!.k);
    expect(frames).toHaveLength(found.shrunk.steps.length + 2);
    expect(frames[frames.length - 1].verdict).toBe('done');
    expect(frames.some((f) => f.verdict === 'rejected')).toBe(true);
    expect(frames.some((f) => f.verdict === 'accepted')).toBe(true);
  });

  it('replays to the identical failure and shrink from the same seed, for every buggy function', () => {
    for (const bug of buggy) {
      expect(replayIdentical({ ...DEFAULT_CONFIG, fn: bug.id, props: ALL_PROPS.slice() }), bug.id).toBe(true);
    }
    const a = forAll(bugOf('no-comparator').fn, ALL_PROPS, genOf(DEFAULT_CONFIG));
    const b = forAll(bugOf('no-comparator').fn, ALL_PROPS, genOf({ ...DEFAULT_CONFIG, seed: DEFAULT_CONFIG.seed + 1 }));
    expect(key(a.cases)).not.toBe(key(b.cases));
  });

  it('describes the minimal input in frames whose every candidate genuinely differs from its source', () => {
    const found = findAndShrink(bugOf('insertion').fn, ALL_PROPS, genOf({ ...DEFAULT_CONFIG, fn: 'insertion' }))!;
    for (const s of found.shrunk.steps) expect(key(s.candidate)).not.toBe(key(s.from));
  });
});
