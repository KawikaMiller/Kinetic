/** Failure table: lps[i] is the length of the longest proper prefix of pattern[0..i] that is also a suffix of it. */
export function lps(pattern: string): number[] {
  const table = new Array<number>(pattern.length).fill(0);
  let len = 0;
  for (let i = 1; i < pattern.length; ) {
    if (pattern[i] === pattern[len]) table[i++] = ++len;
    else if (len > 0) len = table[len - 1];
    else table[i++] = 0;
  }
  return table;
}

export interface LpsStep {
  /** The pattern position being filled in. */
  i: number;
  /** The pointer into the pattern's own prefix before this comparison. */
  len: number;
  kind: 'extend' | 'fallback' | 'zero';
  /** The table as it stands after this step. */
  table: number[];
}

/** The same loop as `lps`, one entry per comparison of the pattern against itself. */
export function lpsSteps(pattern: string): LpsStep[] {
  const table = new Array<number>(pattern.length).fill(0);
  const steps: LpsStep[] = [];
  let len = 0;
  for (let i = 1; i < pattern.length; ) {
    const before = len;
    if (pattern[i] === pattern[len]) {
      table[i] = ++len;
      steps.push({ i, len: before, kind: 'extend', table: [...table] });
      i++;
    } else if (len > 0) {
      len = table[len - 1];
      steps.push({ i, len: before, kind: 'fallback', table: [...table] });
    } else {
      table[i] = 0;
      steps.push({ i, len: before, kind: 'zero', table: [...table] });
      i++;
    }
  }
  return steps;
}

export interface NaiveStep {
  /** Where the pattern is aligned in the text. */
  shift: number;
  /** Position inside the pattern. */
  k: number;
  /** Text index compared: shift + k. */
  i: number;
  equal: boolean;
  /** A text character that already matched in an earlier comparison and matches again now. */
  rematch: boolean;
}

export interface NaiveResult {
  matches: number[];
  comparisons: number;
  steps: NaiveStep[];
  /** Successful comparisons against a text character that had already matched before. */
  rematches: number;
}

/** The naive scan: align, compare left to right, on a mismatch slide by one and start over. Finds overlapping matches. */
export function naiveSearch(text: string, pattern: string): NaiveResult {
  const matches: number[] = [];
  const steps: NaiveStep[] = [];
  const matched = new Set<number>();
  let rematches = 0;
  for (let shift = 0; shift + pattern.length <= text.length; shift++) {
    let k = 0;
    while (k < pattern.length) {
      const i = shift + k;
      const equal = text[i] === pattern[k];
      const rematch = equal && matched.has(i);
      if (rematch) rematches++;
      if (equal) matched.add(i);
      steps.push({ shift, k, i, equal, rematch });
      if (!equal) break;
      k++;
    }
    if (k === pattern.length) matches.push(shift);
  }
  return { matches, comparisons: steps.length, steps, rematches };
}

export interface KmpStep {
  /** Text pointer and pattern pointer when the comparison happens. */
  i: number;
  j: number;
  equal: boolean;
  kind: 'advance' | 'match' | 'fallback' | 'skip';
  /** For a fall-back: the pattern pointer after it (lps[j - 1]). */
  to: number | null;
  /** Characters of the text a naive restart would have matched again here (j - to for a fall-back). */
  skipped: number;
  /** Match positions found so far, including this step's. */
  found: number[];
}

export interface KmpResult {
  matches: number[];
  comparisons: number;
  /** Times the text pointer moved forward. */
  advances: number;
  /** Mismatches with j > 0 that sent j back through the table. */
  fallbacks: number;
  steps: KmpStep[];
  /** True when a broken variant ran out of its step budget instead of finishing. */
  stalled: boolean;
}

/** Which wrong rule a broken matcher uses on a mismatch. */
export type KmpBug = 'off-by-one' | 'reset' | null;

/**
 * Knuth-Morris-Pratt. The text pointer never moves back. `bug` plants a wrong fall-back rule; the step budget keeps a
 * broken variant from looping forever.
 */
export function kmpSearch(text: string, pattern: string, bug: KmpBug = null, table: number[] = lps(pattern)): KmpResult {
  const m = pattern.length;
  const steps: KmpStep[] = [];
  const matches: number[] = [];
  let advances = 0;
  let fallbacks = 0;
  let j = 0;
  let i = 0;
  if (m === 0 || m > text.length) return { matches, comparisons: 0, advances, fallbacks, steps, stalled: false };
  const budget = 4 * (text.length + m) + 8;
  while (i < text.length && steps.length < budget) {
    const equal = text[i] === pattern[j];
    if (equal) {
      const at = i;
      i++;
      j++;
      advances++;
      const full = j === m;
      if (full) matches.push(i - m);
      steps.push({ i: at, j: j - 1, equal, kind: full ? 'match' : 'advance', to: full ? table[m - 1] : null, skipped: 0, found: [...matches] });
      if (full) j = bug === 'reset' ? 0 : table[m - 1];
    } else if (j > 0) {
      const to = bug === 'off-by-one' ? table[j] : bug === 'reset' ? 0 : table[j - 1];
      steps.push({ i, j, equal, kind: 'fallback', to, skipped: j - to, found: [...matches] });
      j = to;
      fallbacks++;
    } else {
      steps.push({ i, j, equal, kind: 'skip', to: null, skipped: 0, found: [...matches] });
      i++;
      advances++;
    }
  }
  return { matches, comparisons: steps.length, advances, fallbacks, steps, stalled: i < text.length };
}

/** Length-limited, printable-only text for the fields: control characters are dropped. */
export const printable = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, '');
