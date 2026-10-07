/**
 * Rabin-Karp with a polynomial rolling hash, worked in bigint (core/numberTheory) so every
 * modulus is exact, plus content-defined chunking on the same rolling hash.
 */
import { mod, modPow } from '../../core/numberTheory';

/** Letters are 1-26 and a space is 27, so no character hashes to 0 like an empty one would. */
export const SPACE_VALUE = 27;
export const BASE = 31n;
export const MODULI = [13n, 101n, 2147483647n] as const;
export type Modulus = (typeof MODULI)[number];

export const charValue = (ch: string): number => (ch === ' ' ? SPACE_VALUE : ch.charCodeAt(0) - 96);
export const valuesOf = (s: string): number[] => [...s].map(charValue);

/** h = (…((v₀·B + v₁)·B + v₂)…) mod M: the hash computed from scratch, Horner's rule. */
export function hashDirect(values: readonly number[], m: bigint, base = BASE): bigint {
  let h = 0n;
  for (const v of values) h = mod(h * base + BigInt(v), m);
  return h;
}

/** Slide one place: drop `out`'s term (worth out·B^(len−1)), shift everything up one power, add `inc`. */
export function roll(prev: bigint, out: number, inc: number, high: bigint, m: bigint, base = BASE): bigint {
  return mod((prev - BigInt(out) * high) * base + BigInt(inc), m);
}

export type RkStep =
  | { t: 'pattern'; hash: bigint }
  | { t: 'first'; s: 0; hash: bigint }
  | { t: 'roll'; s: number; prev: bigint; out: number; inc: number; hash: bigint }
  | { t: 'verify'; s: number; at: number; equal: boolean; last: boolean };

export interface RkRun {
  steps: RkStep[];
  patternHash: bigint;
  /** B^(m−1) mod M: the weight of the character leaving the window. */
  high: bigint;
  /** Window starts whose hash matched and whose characters matched. */
  matches: number[];
  /** Window starts whose hash matched but whose characters didn't. */
  spurious: number[];
  /** O(1) rolling updates (every window after the first). */
  rolls: number;
  /** Character comparisons spent verifying hash hits. */
  verifyChars: number;
}

export function rabinKarp(text: string, pattern: string, m: bigint, base = BASE): RkRun {
  const t = valuesOf(text);
  const p = valuesOf(pattern);
  const len = p.length;
  const high = len ? modPow(base, BigInt(len - 1), m) : 0n;
  const patternHash = hashDirect(p, m, base);
  const run: RkRun = { steps: [{ t: 'pattern', hash: patternHash }], patternHash, high, matches: [], spurious: [], rolls: 0, verifyChars: 0 };
  if (len === 0 || len > t.length) return run;
  let h = hashDirect(t.slice(0, len), m, base);
  for (let s = 0; s + len <= t.length; s++) {
    if (s === 0) run.steps.push({ t: 'first', s: 0, hash: h });
    else {
      const prev = h;
      h = roll(prev, t[s - 1], t[s + len - 1], high, m, base);
      run.rolls++;
      run.steps.push({ t: 'roll', s, prev, out: t[s - 1], inc: t[s + len - 1], hash: h });
    }
    if (h !== patternHash) continue;
    let ok = true;
    for (let k = 0; k < len; k++) {
      run.verifyChars++;
      const equal = text[s + k] === pattern[k];
      const last = !equal || k === len - 1;
      run.steps.push({ t: 'verify', s, at: k, equal, last });
      if (!equal) {
        ok = false;
        break;
      }
    }
    (ok ? run.matches : run.spurious).push(s);
  }
  return run;
}

/** Character comparisons a naïve scan makes: every window, left to right until a mismatch. */
export function naiveComparisons(text: string, pattern: string): number {
  let count = 0;
  for (let s = 0; s + pattern.length <= text.length; s++) {
    for (let k = 0; k < pattern.length; k++) {
      count++;
      if (text[s + k] !== pattern[k]) break;
    }
  }
  return count;
}

// ── Input ─────────────────────────────────────────────────────────────

export const MAX_TEXT = 40;
export const MAX_PATTERN = 8;

export type TextResult = { ok: true; value: string } | { ok: false; error: string };

/** Lowercase letters and spaces only, 1 to `max` of them. Capitals are refused, not folded. */
export function parseLetters(raw: string, what: 'text' | 'pattern'): TextResult {
  const max = what === 'text' ? MAX_TEXT : MAX_PATTERN;
  if (raw.trim() === '') return { ok: false, error: `Type a ${what}: lowercase letters a-z and spaces.` };
  const chars = [...raw];
  const bad = chars.find((c) => !/^[a-z ]$/.test(c));
  if (bad !== undefined) return { ok: false, error: `“${bad}” isn't in this demo's alphabet: lowercase letters a-z and spaces only.` };
  if (chars.length > max) return { ok: false, error: `Keep the ${what} to ${max} characters; that's ${chars.length}.` };
  return { ok: true, value: raw };
}

export const PRESETS = [
  { id: 'spurious', label: 'Small modulus', text: 'abracadabra cadabra abracadabra', pattern: 'abra', modulus: 13n },
  { id: 'overlap', label: 'Overlaps', text: 'banana bandana ananas', pattern: 'ana', modulus: 101n },
  { id: 'none', label: 'No match', text: 'the quick brown fox jumps over the lazy dog', pattern: 'cat', modulus: 101n },
] as const;

// ── Content-defined chunking ──────────────────────────────────────────

/** Rolling window length, and the divisor: a cut wherever the window's hash ≡ 0 (mod CHUNK_DIVISOR). */
export const CHUNK_WINDOW = 6;
export const CHUNK_DIVISOR = 32n;
const CHUNK_MOD = 2147483647n;

/**
 * Cut positions: a cut after index i when the window ending at i hashes to 0 mod the divisor.
 * Character codes, not letter values, so any text chunks.
 */
export function chunkCuts(text: string, w = CHUNK_WINDOW, divisor = CHUNK_DIVISOR): number[] {
  const codes = [...text].map((c) => c.codePointAt(0)!);
  const cuts: number[] = [];
  if (codes.length < w) return cuts;
  const high = modPow(BASE, BigInt(w - 1), CHUNK_MOD);
  let h = hashDirect(codes.slice(0, w), CHUNK_MOD);
  for (let end = w - 1; end < codes.length; end++) {
    if (end > w - 1) h = roll(h, codes[end - w], codes[end], high, CHUNK_MOD);
    if (mod(h, divisor) === 0n && end + 1 < codes.length) cuts.push(end + 1);
  }
  return cuts;
}

/** Split text at the cuts. */
export function chunksOf(text: string, cuts: readonly number[]): string[] {
  const chars = [...text];
  const edges = [0, ...cuts, chars.length];
  return edges.slice(1).map((e, i) => chars.slice(edges[i], e).join(''));
}

export const CHUNK_TEXT =
  'rolling hashes let backup tools split files into chunks by content, so an edit near the start only changes the chunks around it while every later chunk is found again unchanged';
export const INSERTED = 'X';

export interface ChunkCompare {
  before: number[];
  after: number[];
  /** Cuts at or before the insertion point that survived exactly. */
  keptBefore: number;
  /** Cuts after it that reappeared exactly one place later. */
  shiftedAfter: number;
  /** Cuts that appeared or vanished: only possible within a window's reach of the insertion. */
  changed: number;
}

export function compareChunks(text: string, at: number, inserted = INSERTED): ChunkCompare {
  const edited = [...text].slice(0, at).join('') + inserted + [...text].slice(at).join('');
  const before = chunkCuts(text);
  const after = chunkCuts(edited);
  const afterSet = new Set(after);
  const keptBefore = before.filter((c) => c <= at && afterSet.has(c)).length;
  const shiftedAfter = before.filter((c) => c > at && afterSet.has(c + 1)).length;
  const matched = keptBefore + shiftedAfter;
  return { before, after, keptBefore, shiftedAfter, changed: before.length - matched + (after.length - matched) };
}
