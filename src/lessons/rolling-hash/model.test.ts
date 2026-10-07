import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import {
  BASE, charValue, CHUNK_TEXT, CHUNK_WINDOW, chunkCuts, chunksOf, compareChunks, hashDirect, MAX_PATTERN, MAX_TEXT, MODULI, naiveComparisons,
  parseLetters, PRESETS, rabinKarp, valuesOf,
} from './model';

function seededString(rnd: Rnd, len: number, alphabet = 'ab '): string {
  return Array.from({ length: len }, () => alphabet[randInt(0, alphabet.length - 1, rnd)]).join('');
}

/** Every start where the pattern occurs, overlaps included: indexOf stepped one place at a time. */
function indexOfAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf(pattern); i !== -1; i = text.indexOf(pattern, i + 1)) out.push(i);
  return out;
}

/** An independent hash: Σ vᵢ·B^(m−1−i), summed exactly in bigint, then reduced once. */
const polyHash = (s: string, m: bigint) =>
  valuesOf(s).reduce((acc, v, i, all) => acc + BigInt(v) * BASE ** BigInt(all.length - 1 - i), 0n) % m;

describe('the rolling hash', () => {
  it('equals a from-scratch hash of every window: 500 seeded strings × 3 moduli', () => {
    const rnd = mulberry32(41);
    for (let t = 0; t < 500; t++) {
      const text = seededString(rnd, randInt(1, MAX_TEXT, rnd), 'abcz ');
      const pattern = seededString(rnd, randInt(1, MAX_PATTERN, rnd), 'abcz ');
      for (const m of MODULI) {
        const run = rabinKarp(text, pattern, m);
        expect(run.patternHash).toBe(polyHash(pattern, m));
        for (const s of run.steps) {
          if (s.t === 'first' || s.t === 'roll') expect(s.hash).toBe(polyHash(text.slice(s.s, s.s + pattern.length), m));
        }
      }
    }
  });

  it('hashDirect (Horner) agrees with the exact polynomial', () => {
    expect(hashDirect(valuesOf('abra'), 13n)).toBe(polyHash('abra', 13n));
    // a=1, b=2: 1·31 + 2 = 33.
    expect(hashDirect(valuesOf('ab'), 2147483647n)).toBe(33n);
    expect(charValue(' ')).toBe(27);
  });
});

describe('Rabin-Karp', () => {
  it('finds exactly what indexOf and a lookahead matchAll find, overlaps included, for every modulus', () => {
    const rnd = mulberry32(42);
    for (let t = 0; t < 500; t++) {
      const text = seededString(rnd, randInt(1, MAX_TEXT, rnd));
      const pattern = seededString(rnd, randInt(1, 4, rnd));
      const expected = indexOfAll(text, pattern);
      const viaRegex = [...text.matchAll(new RegExp(`(?=${pattern})`, 'g'))].map((m) => m.index);
      expect(viaRegex).toEqual(expected);
      for (const m of MODULI) {
        const run = rabinKarp(text, pattern, m);
        expect(run.matches).toEqual(expected);
        // Every spurious hit really had the pattern's hash and really differs.
        for (const s of run.spurious) {
          expect(text.slice(s, s + pattern.length)).not.toBe(pattern);
          expect(polyHash(text.slice(s, s + pattern.length), m)).toBe(run.patternHash);
        }
      }
    }
  });

  it('the Small modulus preset has spurious hits at mod 13 that verification rejects', () => {
    const p = PRESETS[0];
    const run = rabinKarp(p.text, p.pattern, 13n);
    expect(run.spurious.length).toBeGreaterThanOrEqual(1);
    expect(run.matches).toEqual(indexOfAll(p.text, p.pattern));
    const rejected = run.steps.filter((s) => s.t === 'verify' && !s.equal).map((s) => (s.t === 'verify' ? s.s : -1));
    expect(rejected).toEqual(run.spurious);
  });

  it('counts rolls, verification characters and the naïve scan exactly', () => {
    const run = rabinKarp('abab', 'ab', 2147483647n);
    expect(run.rolls).toBe(2);
    expect(run.matches).toEqual([0, 2]);
    expect(run.verifyChars).toBe(4);
    // Windows ab, ba, ab: 2 + 1 + 2 comparisons.
    expect(naiveComparisons('abab', 'ab')).toBe(5);
  });

  it('a pattern longer than the text has no windows', () => {
    const run = rabinKarp('ab', 'abc', 101n);
    expect(run.steps).toHaveLength(1);
    expect(run.matches).toEqual([]);
  });
});

describe('content-defined chunking', () => {
  it('chunks join back to the text', () => {
    expect(chunksOf(CHUNK_TEXT, chunkCuts(CHUNK_TEXT)).join('')).toBe(CHUNK_TEXT);
    expect(chunkCuts(CHUNK_TEXT).length).toBeGreaterThanOrEqual(3);
  });

  it('an insertion keeps every cut before it, shifts every cut a window past it, and changes only cuts within reach', () => {
    const rnd = mulberry32(43);
    const texts = [CHUNK_TEXT, ...Array.from({ length: 60 }, () => seededString(rnd, 200, 'abcdefgh '))];
    for (const text of texts) {
      for (let at = 0; at <= text.length; at += 3) {
        const c = compareChunks(text, at);
        const after = new Set(c.after);
        for (const cut of c.before) {
          // A cut at c covers the window [c − w, c − 1]. Entirely before the insert: kept. Entirely after: shifted by 1.
          if (cut <= at) expect(after.has(cut), `cut ${cut}, insert at ${at}`).toBe(true);
          if (cut - CHUNK_WINDOW >= at) expect(after.has(cut + 1), `cut ${cut}, insert at ${at}`).toBe(true);
        }
        const beforeShifted = new Set(c.before.map((x) => (x > at ? x + 1 : x)));
        for (const cut of c.after) if (!beforeShifted.has(cut)) expect(cut - at).toBeLessThanOrEqual(CHUNK_WINDOW);
      }
    }
  });

  it('agrees with its own counts', () => {
    const c = compareChunks(CHUNK_TEXT, 40);
    expect(c.keptBefore).toBe(c.before.filter((x) => x <= 40).length);
  });
});

describe('parseLetters', () => {
  it('accepts lowercase letters and spaces', () => {
    expect(parseLetters('abra cad', 'text')).toEqual({ ok: true, value: 'abra cad' });
  });
  it.each([
    ['', 'Type a'], ['   ', 'Type a'], ['Abra', '“A”'], ['a1', '“1”'], ['🙂', '“🙂”'], ['<b>', '“<”'], ['a,b', '“,”'],
  ])('refuses %j', (s, msg) => {
    const r = parseLetters(s, 'pattern');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
  it('limits length', () => {
    const r = parseLetters('abcdefghi', 'pattern');
    expect(!r.ok && r.error).toContain('8 characters');
  });
});
