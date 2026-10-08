/** A word-level diff: the minimal set of removed and inserted words between two texts (longest common subsequence). */
export type DiffKind = 'eq' | 'del' | 'ins';
export interface DiffToken {
  kind: DiffKind;
  text: string;
}

/** Words and line breaks, so a diff can say a line was added or removed. */
const TOKEN = /\n|[^\s]+/g;
const tokens = (s: string) => s.match(TOKEN) ?? [];

export function wordDiff(before: string, after: string): DiffToken[] {
  const a = tokens(before);
  const b = tokens(after);
  // lcs[i][j]: length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'eq', text: a[i] });
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push({ kind: 'ins', text: b[j++] });
    } else {
      out.push({ kind: 'del', text: a[i++] });
    }
  }
  return out;
}

/** The text before (every eq and del word) or after (every eq and ins word) a diff, one space between words. */
export function sideOf(diff: readonly DiffToken[], side: 'before' | 'after'): string {
  const drop: DiffKind = side === 'before' ? 'ins' : 'del';
  let out = '';
  for (const t of diff) {
    if (t.kind === drop) continue;
    if (t.text === '\n') out += '\n';
    else out += out === '' || out.endsWith('\n') ? t.text : ` ${t.text}`;
  }
  return out;
}

/** A line of a diff: runs of words that are unchanged, removed or inserted. */
export interface DiffLine {
  spans: DiffToken[];
}

/** Splits a diff into display lines. Every line break ends a line, and lines left empty are dropped. */
export function diffLines(diff: readonly DiffToken[]): DiffLine[] {
  const lines: DiffLine[] = [];
  let spans: DiffToken[] = [];
  const flush = () => {
    if (spans.length > 0) lines.push({ spans });
    spans = [];
  };
  for (const t of diff) {
    if (t.text === '\n') {
      flush();
      continue;
    }
    const last = spans[spans.length - 1];
    if (last && last.kind === t.kind) last.text += ` ${t.text}`;
    else spans.push({ ...t });
  }
  flush();
  return lines;
}

/** 'ins' when a line was only inserted, 'del' when only removed, 'eq' when unchanged, otherwise 'mixed'. */
export function lineKind(line: DiffLine): DiffKind | 'mixed' {
  const kinds = new Set(line.spans.map((s) => s.kind));
  return kinds.size === 1 ? [...kinds][0] : 'mixed';
}
