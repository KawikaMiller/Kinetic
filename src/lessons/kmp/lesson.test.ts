import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import { lpsFrames, matchFrames, naiveFrames } from './frames';
import lesson from './index';
import { kmpSearch, lps, naiveSearch } from './kmp';
import { EMPTY_PATTERN_MESSAGE, LPS_PRESETS, MATCH_PRESETS, NAIVE_PRESETS, OPENING, PATTERN_MAX, TEXT_MAX, parsePair } from './presets';
import { SWEEP_MAX_N, SWEEP_MIN_N, WORST_PATTERN, sweep } from './sweep';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

/** Border lengths from the definition, independent of kmp.ts. */
const border = (p: string, i: number): number => {
  const prefix = p.slice(0, i + 1);
  for (let len = i; len > 0; len--) if (prefix.slice(0, len) === prefix.slice(prefix.length - len)) return len;
  return 0;
};

describe('scenes', () => {
  it('every scene component carries its own key', () => {
    const els = sceneElements('kmp');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('kmp')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state that its try-this relies on', () => {
    expect(OPENING.naive).toEqual({ text: 'a'.repeat(20), pattern: 'aaaab' });
    expect(OPENING.lps.pattern).toBe('abcabd');
    expect(OPENING.match.pattern).toBe('abcabd');
    expect(OPENING.count).toEqual(OPENING.naive);
    for (const preset of [...NAIVE_PRESETS, ...MATCH_PRESETS]) expect(parsePair(preset.text, preset.pattern).ok, preset.id).toBe(true);
    expect(LPS_PRESETS.map((p) => p.pattern)).toEqual(['abcabd', 'aaaab', 'abababac', 'aabaaab']);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: aaaab in 20 a is 80 comparisons, 45 of them matches against characters that matched before', () => {
    const t = 'a'.repeat(20);
    let comps = 0;
    for (let s = 0; s + 5 <= t.length; s++) for (let k = 0; k < 5; k++) { comps++; if (t[s + k] !== 'aaaab'[k]) break; }
    expect(comps).toBe(80);
    const run = naiveFrames(t, 'aaaab');
    expect(run.comparisons).toBe(80);
    expect(run.rematches).toBe(45);
    expect(run.frames[run.frames.length - 1].rematches).toBe(45);
    expect([FACTS.naiveComparisons, FACTS.naiveRematches]).toEqual([80, 45]);
    expect(lesson.tryThis[0]).toContain('80 comparisons');
    expect(lesson.tryThis[0]).toContain('45 of them');
  });

  it('try-this 2: the table for abcabd, aaaab and abababac, and lps[6] of abababac names the prefix and suffix ababa', () => {
    expect(lpsFrames('abcabd').slice(-1)[0].table).toEqual([0, 0, 0, 1, 2, 0]);
    expect(FACTS.lpsDefault).toBe('0 0 0 1 2 0');
    expect(FACTS.lpsAaaab).toBe('0 1 2 3 0');
    expect(FACTS.lpsAbababac).toBe('0 0 1 2 3 4 5 0');
    const p = 'abababac';
    expect(lpsFrames(p).slice(-1)[0].table[6]).toBe(5);
    expect(p.slice(0, 5)).toBe('ababa');
    expect(p.slice(2, 7)).toBe('ababa');
    expect([...p].map((_, i) => border(p, i))).toEqual(lps(p));
    expect(lesson.tryThis[1]).toContain('index 6');
  });

  it('try-this 3: abcabd is found at 3 and 12 in 20 comparisons with 2 fall-backs (naive 35); aa in aaaa gives 0, 1, 2', () => {
    const { text: t, pattern } = OPENING.match;
    expect(t.indexOf(pattern)).toBe(3);
    expect(t.indexOf(pattern, 4)).toBe(12);
    const run = matchFrames(t, pattern);
    expect(run.matches).toEqual([3, 12]);
    expect([run.comparisons, run.fallbacks]).toEqual([20, 2]);
    expect(naiveSearch(t, pattern).comparisons).toBe(35);
    expect([FACTS.matchComparisons, FACTS.matchFallbacks, FACTS.matchNaiveComparisons, FACTS.matchFound]).toEqual([20, 2, 35, '3 and 12']);
    expect(matchFrames('aaaa', 'aa').matches).toEqual([0, 1, 2]);
    expect(FACTS.overlapFound).toBe('0, 1, 2');
    expect(lesson.tryThis[2]).toContain('found at 3 and 12 in 20 comparisons');
  });

  it('try-this 4: 80 naive against 36 KMP, bound 40, 20 advances + 16 fall-backs', () => {
    const { text: t, pattern } = OPENING.count;
    const k = kmpSearch(t, pattern);
    expect([k.comparisons, k.advances, k.fallbacks]).toEqual([36, 20, 16]);
    expect(k.advances + k.fallbacks).toBe(k.comparisons);
    expect(k.comparisons).toBeLessThanOrEqual(2 * t.length);
    expect([FACTS.kmpComparisons, FACTS.kmpBound, FACTS.kmpAdvances, FACTS.kmpFallbacks]).toEqual([36, 40, 20, 16]);
    expect(lesson.tryThis[3]).toContain('KMP 36');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  const pairs = [...NAIVE_PRESETS, ...MATCH_PRESETS, { text: '', pattern: 'a' }, { text: 'ab', pattern: 'abc' }, { text: 'x😀y', pattern: '😀' }, { text: 'aaaa', pattern: 'a' }];

  it('walks naive, table and matcher frames over every preset and edge case: no NaN, closing counts equal the models', () => {
    let frames = 0;
    for (const { text: t, pattern } of pairs) {
      const n = naiveFrames(t, pattern);
      const m = matchFrames(t, pattern);
      for (const f of [...n.frames, ...m.frames, ...lpsFrames(pattern)]) {
        expect(text(f.say), `${t}/${pattern}`).not.toMatch(/NaN|undefined|null|Infinity/);
        frames++;
      }
      expect(n.comparisons).toBe(naiveSearch(t, pattern).comparisons);
      expect(m.comparisons).toBe(kmpSearch(t, pattern).comparisons);
      expect(m.matches).toEqual(n.matches);
      expect(lpsFrames(pattern).slice(-1)[0].table).toEqual(lps(pattern));
    }
    expect(frames).toBeGreaterThan(150);
  });

  it('the counter on each frame never runs ahead of the closing count', () => {
    const run = matchFrames(OPENING.match.text, OPENING.match.pattern);
    let prev = 0;
    for (const f of run.frames) {
      expect(f.comparisons).toBeGreaterThanOrEqual(prev);
      prev = f.comparisons;
    }
    expect(prev).toBe(run.comparisons);
  });
});

describe('the sweep', () => {
  it('is made of real runs: the worst pair rises faster than 2n for the naive scan, KMP stays within 2n', () => {
    const s = sweep();
    expect(s).toHaveLength(SWEEP_MAX_N - SWEEP_MIN_N + 1);
    for (const p of s) {
      expect(p.kmpWorst).toBeLessThanOrEqual(2 * p.n);
      expect(p.kmpRandom).toBeLessThanOrEqual(2 * p.n);
      expect(p.naiveWorst).toBe(naiveSearch('a'.repeat(p.n), WORST_PATTERN).comparisons);
    }
    const last = s[s.length - 1];
    expect(last.naiveWorst).toBeGreaterThan(2 * last.n);
  });
});

describe('hostile input', () => {
  it('an empty pattern is refused with the explanation, and the caps and control characters are enforced', () => {
    const empty = parsePair('abc', '');
    expect(empty).toEqual({ ok: false, error: EMPTY_PATTERN_MESSAGE });
    expect(EMPTY_PATTERN_MESSAGE).toContain('a scan for the empty string matches everywhere');
    expect(parsePair('a'.repeat(TEXT_MAX + 1), 'a').ok).toBe(false);
    expect(parsePair('a'.repeat(TEXT_MAX), 'a'.repeat(PATTERN_MAX)).ok).toBe(true);
    expect(parsePair('a', 'a'.repeat(PATTERN_MAX + 1)).ok).toBe(false);
    expect(parsePair('a\tb', 'a')).toMatchObject({ ok: true, text: 'ab' });
    expect(parsePair('😀', 'a')).toMatchObject({ ok: true, surrogates: true });
    expect(parsePair('abc', 'b')).toMatchObject({ ok: true, surrogates: false });
  });
});
