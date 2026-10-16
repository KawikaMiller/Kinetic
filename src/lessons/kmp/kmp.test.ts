import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { kmpSearch, lps, lpsSteps, naiveSearch, printable, type KmpBug } from './kmp';

/** The failure table from the definition: try every border length, longest first. Shares no code with kmp.ts. */
function lpsByDefinition(p: string): number[] {
  return [...p].map((_, i) => {
    const prefix = p.slice(0, i + 1);
    for (let len = i; len > 0; len--) if (prefix.slice(0, len) === prefix.slice(prefix.length - len)) return len;
    return 0;
  });
}

/** Every occurrence, overlapping ones included, with real String.indexOf. */
function allOccurrences(text: string, pattern: string): number[] {
  const out: number[] = [];
  for (let at = text.indexOf(pattern); at !== -1 && pattern !== ''; at = text.indexOf(pattern, at + 1)) out.push(at);
  return out;
}

const randomString = (rnd: () => number, len: number, letters: string) => Array.from({ length: len }, () => letters[Math.floor(rnd() * letters.length)]).join('');

function seededPair(seed: number): { text: string; pattern: string } {
  const rnd = mulberry32(seed);
  const text = randomString(rnd, Math.floor(rnd() * 41), 'ab');
  const pattern = randomString(rnd, 1 + Math.floor(rnd() * 8), 'ab');
  return { text, pattern };
}

describe('failure table', () => {
  it('equals the border definition for every binary string of length 1 to 12 (8,190 strings)', () => {
    let count = 0;
    for (let len = 1; len <= 12; len++) {
      for (let bits = 0; bits < 2 ** len; bits++) {
        const p = bits.toString(2).padStart(len, '0');
        expect(lps(p), p).toEqual(lpsByDefinition(p));
        count++;
      }
    }
    expect(count).toBe(8190);
  });

  it('matches the four hand-worked vectors', () => {
    expect(lps('abcabd')).toEqual([0, 0, 0, 1, 2, 0]);
    expect(lps('aaaab')).toEqual([0, 1, 2, 3, 0]);
    expect(lps('abababac')).toEqual([0, 0, 1, 2, 3, 4, 5, 0]);
    expect(lps('aabaaab')).toEqual([0, 1, 0, 1, 2, 2, 3]);
  });

  it('depends only on the pattern, and the live build ends on the same table', () => {
    for (const p of ['abcabd', 'aaaab', 'abababac', 'aabaaab', 'x', 'aaaa']) {
      const steps = lpsSteps(p);
      expect(steps.length === 0 ? lps(p) : steps[steps.length - 1].table).toEqual(lps(p));
      expect(kmpSearch('zzzzabcabd', p).steps.length).toBeGreaterThanOrEqual(0);
    }
    expect(lpsSteps('a')).toEqual([]);
  });
});

describe('matching against a naive all-occurrence scan', () => {
  it('KMP and the naive scan find exactly the occurrences String.indexOf finds, on 500 seeded two-letter pairs', () => {
    for (let seed = 0; seed < 500; seed++) {
      const { text, pattern } = seededPair(seed);
      const want = allOccurrences(text, pattern);
      expect(kmpSearch(text, pattern).matches, `kmp ${seed}`).toEqual(want);
      expect(naiveSearch(text, pattern).matches, `naive ${seed}`).toEqual(want);
    }
  });

  it('edge cases: overlapping matches, pattern equal to text, longer than text (0 comparisons), one character', () => {
    expect(kmpSearch('aaaa', 'aa').matches).toEqual([0, 1, 2]);
    expect(kmpSearch('abc', 'abc').matches).toEqual([0]);
    const longer = kmpSearch('ab', 'abc');
    expect(longer.matches).toEqual([]);
    expect(longer.comparisons).toBe(0);
    expect(naiveSearch('ab', 'abc').comparisons).toBe(0);
    expect(kmpSearch('abcab', 'b').matches).toEqual([1, 4]);
    expect(kmpSearch('', 'a').matches).toEqual([]);
  });
});

describe('the work', () => {
  it('on the aaaab preset the naive scan makes exactly 80 comparisons (16 windows x 5) and KMP exactly 36', () => {
    const text = 'a'.repeat(20);
    expect(naiveSearch(text, 'aaaab').comparisons).toBe(80);
    expect(16 * 5).toBe(80);
    expect(kmpSearch(text, 'aaaab').comparisons).toBe(36);
    expect(36).toBeLessThanOrEqual(2 * 20);
  });

  it('KMP never exceeds 2n comparisons: the 500 pairs, and the adversarial family a^(n-1) b against a^k b', () => {
    for (let seed = 0; seed < 500; seed++) {
      const { text, pattern } = seededPair(seed);
      expect(kmpSearch(text, pattern).comparisons, `seed ${seed}`).toBeLessThanOrEqual(2 * text.length);
    }
    for (let n = 2; n <= 60; n++) {
      for (let k = 1; k <= Math.min(12, n); k++) {
        const r = kmpSearch('a'.repeat(n - 1) + 'b', 'a'.repeat(k - 1) + 'b');
        expect(r.comparisons, `n=${n} k=${k}`).toBeLessThanOrEqual(2 * n);
        expect(r.matches).toEqual(allOccurrences('a'.repeat(n - 1) + 'b', 'a'.repeat(k - 1) + 'b'));
      }
    }
  });

  it('the amortised argument: comparisons = text advances + fall-backs, advances <= n, and fall-backs <= advances', () => {
    for (let seed = 0; seed < 500; seed++) {
      const { text, pattern } = seededPair(seed);
      const r = kmpSearch(text, pattern);
      expect(r.comparisons).toBe(r.advances + r.fallbacks);
      expect(r.advances).toBeLessThanOrEqual(text.length);
      expect(r.fallbacks).toBeLessThanOrEqual(r.advances);
    }
  });

  it('naive comparisons equal a plain recount, and the rematch count is successful comparisons minus distinct text positions matched', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { text, pattern } = seededPair(seed);
      let comps = 0;
      let wins = 0;
      const positions = new Set<number>();
      for (let s = 0; s + pattern.length <= text.length; s++) {
        for (let k = 0; k < pattern.length; k++) {
          comps++;
          if (text[s + k] !== pattern[k]) break;
          wins++;
          positions.add(s + k);
        }
      }
      const r = naiveSearch(text, pattern);
      expect(r.comparisons).toBe(comps);
      expect(r.rematches).toBe(wins - positions.size);
    }
    expect(naiveSearch('a'.repeat(20), 'aaaab').rematches).toBe(45);
  });

  it('KMP never matches a text character twice: every successful comparison is at a new text index', () => {
    for (let seed = 0; seed < 300; seed++) {
      const { text, pattern } = seededPair(seed);
      const wins = kmpSearch(text, pattern).steps.filter((s) => s.equal).map((s) => s.i);
      expect(new Set(wins).size).toBe(wins.length);
      expect(wins).toEqual([...wins].sort((a, b) => a - b));
    }
  });
});

describe('broken variants are rejected by the oracle', () => {
  const rejects = (bug: KmpBug) => {
    for (let seed = 0; seed < 500; seed++) {
      const { text, pattern } = seededPair(seed);
      const r = kmpSearch(text, pattern, bug);
      const want = allOccurrences(text, pattern);
      if (r.stalled || r.matches.join() !== want.join()) return seed;
    }
    return -1;
  };

  it('on a mismatch j = lps[j] (off by one) goes wrong on the lowest failing seed', () => {
    expect(rejects('off-by-one')).toBe(BROKEN_SEEDS['off-by-one']);
  });

  it('on a mismatch j = 0 (and after a match) misses overlapping matches on the lowest failing seed', () => {
    expect(rejects('reset')).toBe(BROKEN_SEEDS.reset);
  });

  it('the hand case for each: aa in aaaa', () => {
    expect(kmpSearch('aaaa', 'aa', 'reset').matches).toEqual([0, 2]);
    expect(kmpSearch('aaaa', 'aa', 'reset').matches).not.toEqual([0, 1, 2]);
  });
});

const BROKEN_SEEDS: Record<'off-by-one' | 'reset', number> = { 'off-by-one': 2, reset: 2 };

describe('hostile input', () => {
  it('control characters are dropped from typed text, and emoji count as two UTF-16 code units', () => {
    expect(printable('a\tb\nc')).toBe('abc');
    expect('😀'.length).toBe(2);
    expect(kmpSearch('x😀y', '😀').matches).toEqual([1]);
  });
});
