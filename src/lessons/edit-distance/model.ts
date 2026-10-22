/**
 * Edit scripts over the `core/editDistance` table: a traceback to an optimal script, its replay,
 * and the insert/delete-only version over lines that a diff tool shows.
 */

import type { Costs, Source, Table } from '../../core/editDistance';

export type Op =
  | { t: 'match'; i: number; j: number; ch: string }
  | { t: 'sub'; i: number; j: number; from: string; to: string }
  | { t: 'ins'; i: number; j: number; ch: string }
  | { t: 'del'; i: number; j: number; ch: string };

/** The cells of the optimal path from (m, n) back to (0, 0), and the edit script in forward order. */
export function traceback(t: Table): { path: [number, number][]; ops: Op[] } {
  let i = t.a.length;
  let j = t.b.length;
  const path: [number, number][] = [[i, j]];
  const ops: Op[] = [];
  while (i > 0 || j > 0) {
    const src: Source = i === 0 ? 'left' : j === 0 ? 'up' : t.cands[i][j]!.win;
    if (src === 'diag') {
      const match = t.a[i - 1] === t.b[j - 1];
      ops.push(match ? { t: 'match', i: i - 1, j: j - 1, ch: t.a[i - 1] } : { t: 'sub', i: i - 1, j: j - 1, from: t.a[i - 1], to: t.b[j - 1] });
      i--;
      j--;
    } else if (src === 'up') {
      ops.push({ t: 'del', i: i - 1, j, ch: t.a[i - 1] });
      i--;
    } else {
      ops.push({ t: 'ins', i, j: j - 1, ch: t.b[j - 1] });
      j--;
    }
    path.push([i, j]);
  }
  return { path, ops: ops.reverse() };
}

export const opCost = (op: Op, costs: Costs) => (op.t === 'match' ? 0 : op.t === 'sub' ? costs.sub : op.t === 'ins' ? costs.ins : costs.del);

export type Tinted = { ch: string; kind: 'match' | 'sub' | 'ins' | 'del' | 'todo' };

/**
 * Replay the script on word A, one op at a time. After op k the word is B's first j letters
 * followed by A's untouched rest; a deleted letter shows struck through for that step only.
 */
export function replay(a: string, ops: readonly Op[]): { word: string; letters: Tinted[]; op: Op }[] {
  const A = [...a];
  const done: Tinted[] = [];
  return ops.map((op) => {
    if (op.t === 'match') done.push({ ch: op.ch, kind: 'match' });
    else if (op.t === 'sub') done.push({ ch: op.to, kind: 'sub' });
    else if (op.t === 'ins') done.push({ ch: op.ch, kind: 'ins' });
    const nextI = op.t === 'ins' ? op.i : op.i + 1;
    const rest = A.slice(nextI).map((ch): Tinted => ({ ch, kind: 'todo' }));
    const letters = op.t === 'del' ? [...done, { ch: op.ch, kind: 'del' as const }, ...rest] : [...done, ...rest];
    return { word: [...done.map((x) => x.ch), ...A.slice(nextI)].join(''), letters, op };
  });
}

/** Positions that differ, or null when the lengths differ (Hamming distance is undefined then). */
export function hamming(a: string, b: string): number | null {
  const A = [...a];
  const B = [...b];
  if (A.length !== B.length) return null;
  return A.filter((ch, i) => ch !== B[i]).length;
}

// ── Input ─────────────────────────────────────────────────────────────

export const MAX_WORD = 12;
export type WordResult = { ok: true; value: string } | { ok: false; error: string };

/** Up to 12 letters, digits, hyphens or apostrophes; empty is allowed (its distance is the other's length). */
export function parseWord(raw: string): WordResult {
  const chars = [...raw];
  const bad = chars.find((c) => !/^[\p{L}\p{N}'-]$/u.test(c));
  if (bad !== undefined) return { ok: false, error: bad.trim() === '' ? 'No spaces: one word per field.' : `“${bad}” isn't allowed: letters, digits, - and ' only.` };
  if (chars.length > MAX_WORD) return { ok: false, error: `Up to ${MAX_WORD} characters fit the table; that's ${chars.length}.` };
  return { ok: true, value: raw };
}

export const WORD_PRESETS = [
  { a: 'kitten', b: 'sitting' },
  { a: 'flaw', b: 'lawn' },
  { a: 'intention', b: 'execution' },
] as const;

// ── Line diff: insert and delete only ─────────────────────────────────

export type DiffLine = { sign: ' ' | '-' | '+'; text: string };

/** Lines of a text block; empty text has no lines. */
export const linesOf = (text: string) => (text === '' ? [] : text.split('\n'));

/**
 * The same DP over lines with substitution ruled out, so the cheapest script keeps a longest
 * common subsequence. On ties the traceback takes the insert first (walking backwards), so a
 * changed line reads "- old" then "+ new", as git prints it.
 */
export function diffLines(v1: string, v2: string): DiffLine[] {
  const A = linesOf(v1);
  const B = linesOf(v2);
  const d = Array.from({ length: A.length + 1 }, (_, i) => Array.from({ length: B.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      d[i][j] = A[i - 1] === B[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = A.length;
  let j = B.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      out.push({ sign: ' ', text: A[--i] });
      j--;
    } else if (j > 0 && (i === 0 || d[i][j] === d[i][j - 1] + 1)) {
      out.push({ sign: '+', text: B[--j] });
    } else {
      out.push({ sign: '-', text: A[--i] });
    }
  }
  return out.reverse();
}

/** Run a diff forwards on version 1: keep ' ' lines, drop '-' lines, add '+' lines. */
export function applyDiff(v1: string, diff: readonly DiffLine[]): string | null {
  const A = linesOf(v1);
  const out: string[] = [];
  let i = 0;
  for (const line of diff) {
    if (line.sign === '+') out.push(line.text);
    else {
      if (A[i] !== line.text) return null;
      if (line.sign === ' ') out.push(line.text);
      i++;
    }
  }
  return i === A.length ? out.join('\n') : null;
}

export const MAX_LINES = 12;
export const MAX_LINE_CHARS = 48;

export function parseConfig(raw: string, which: string): WordResult {
  const lines = linesOf(raw);
  if (lines.length > MAX_LINES) return { ok: false, error: `${which}: up to ${MAX_LINES} lines; that's ${lines.length}.` };
  const long = lines.findIndex((l) => [...l].length > MAX_LINE_CHARS);
  if (long !== -1) return { ok: false, error: `${which}, line ${long + 1}: keep lines to ${MAX_LINE_CHARS} characters.` };
  return { ok: true, value: raw };
}

export const CONFIG_V1 = ['[server]', 'host = 0.0.0.0', 'port = 8080', 'workers = 4', '', '[log]', 'level = info', 'file = app.log'].join('\n');
export const CONFIG_V2 = ['[server]', 'host = 0.0.0.0', 'port = 9090', 'workers = 4', 'timeout = 30', '', '[log]', 'level = debug'].join('\n');
