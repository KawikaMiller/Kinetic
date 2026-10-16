import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { kmpSearch, lps, lpsSteps, naiveSearch } from './kmp';
import { cellText } from './presets';

const hl = (v: ReactNode, tone = '') => <span className={`hl ${tone}`.trim()}>{v}</span>;
const ch = (c: string | undefined) => <code>{c === undefined ? '' : cellText(c)}</code>;

// ── naive ─────────────────────────────────────────────────────────────────

export interface NaiveFrame extends Frame {
  shift: number;
  /** Text index being compared, or null between comparisons. */
  i: number | null;
  k: number;
  /** Text indices matched by the current alignment so far. */
  matched: number[];
  /** Text indices matched again after matching in an earlier alignment: the rework. */
  reworked: number[];
  comparisons: number;
  rematches: number;
  found: number[];
  verdict: 'equal' | 'differ' | null;
}

export interface NaiveRun {
  frames: NaiveFrame[];
  comparisons: number;
  rematches: number;
  matches: number[];
}

export function naiveFrames(text: string, pattern: string): NaiveRun {
  const run = naiveSearch(text, pattern);
  const rec = createRecorder<NaiveFrame>(
    { shift: 0, i: null, k: 0, matched: [], reworked: [], comparisons: 0, rematches: 0, found: [], verdict: null },
    { transient: { i: null, verdict: null } },
  );
  const m = pattern.length;
  if (m > text.length) {
    rec.close(<>The pattern ({m} characters) is longer than the text ({text.length}), so it fits at no alignment: 0 comparisons.</>);
    return { frames: rec.frames, comparisons: 0, rematches: 0, matches: [] };
  }
  rec.snap(<>Align the pattern at the start of the text. Compare left to right; on a mismatch slide it by one and start over from its first character.</>);
  let matched: number[] = [];
  let reworked: number[] = [];
  const found: number[] = [];
  run.steps.forEach((s, n) => {
    if (s.k === 0) matched = [];
    if (s.equal) matched = [...matched, s.i];
    if (s.rematch) reworked = [...reworked, s.i];
    const reread = s.rematch ? <> {hl(`text[${s.i}]`, 'bad')} matched in an earlier alignment: this is rework.</> : null;
    const last = s.k === m - 1 && s.equal;
    if (last) found.push(s.shift);
    rec.snap(
      <>
        Compare text[{s.i}] = {ch(text[s.i])} with pattern[{s.k}] = {ch(pattern[s.k])}: {s.equal ? hl('equal', 'ok') : hl('mismatch', 'bad')}.
        {reread}
        {last ? <> The whole pattern matched at shift {hl(s.shift, 'ok')}; slide by one and go on.</> : null}
        {!s.equal ? <> Slide by one and start over.</> : null}
      </>,
      undefined,
      { shift: s.shift, i: s.i, k: s.k, matched: [...matched], reworked: [...reworked], comparisons: n + 1, rematches: reworked.length, found: [...found], verdict: s.equal ? 'equal' : 'differ' },
    );
  });
  rec.set({ i: null, verdict: null });
  rec.close(
    <>
      Done: {hl(plural(run.comparisons, 'comparison'), 'bad')} for a text of {text.length}, {hl(plural(run.rematches, 'match', 'matches'), 'bad')} of them against characters that had already matched before.
      {run.matches.length ? <> The pattern was found at {run.matches.join(', ')}.</> : <> The pattern was not found.</>}
    </>,
    2,
  );
  return { frames: rec.frames, comparisons: run.comparisons, rematches: run.rematches, matches: run.matches };
}

// ── lps ───────────────────────────────────────────────────────────────────

export interface LpsFrame extends Frame {
  i: number;
  len: number;
  /** lps values filled in so far; null while still unknown. */
  table: (number | null)[];
  kind: 'extend' | 'fallback' | 'zero' | 'start' | 'done';
}

export function lpsFrames(pattern: string): LpsFrame[] {
  const m = pattern.length;
  const steps = lpsSteps(pattern);
  const rec = createRecorder<LpsFrame>({ i: 0, len: 0, table: pattern.split('').map((_, i) => (i === 0 ? 0 : null)), kind: 'start' });
  rec.snap(
    <>
      lps[i] is the length of the longest proper prefix of pattern[0..i] that is also its suffix. lps[0] is always 0 (a single character has no proper prefix). Build the rest by matching the pattern against itself.
    </>,
  );
  for (const s of steps) {
    const filled = s.table.map((v, i) => (i === 0 || i < s.i || (s.kind !== 'fallback' && i === s.i) ? v : null));
    const say =
      s.kind === 'extend' ? (
        <>pattern[{s.i}] = {ch(pattern[s.i])} equals pattern[{s.len}] = {ch(pattern[s.len])}: the border grows to {hl(s.len + 1, 'ok')}, so lps[{s.i}] = {s.len + 1}.</>
      ) : s.kind === 'fallback' ? (
        <>pattern[{s.i}] = {ch(pattern[s.i])} differs from pattern[{s.len}] = {ch(pattern[s.len])}: fall back to the next shorter border, {hl(`lps[${s.len - 1}] = ${s.table[s.len - 1]}`, 'violet')}, and compare again.</>
      ) : (
        <>pattern[{s.i}] = {ch(pattern[s.i])} differs from pattern[0] = {ch(pattern[0])} and there is no shorter border: lps[{s.i}] = 0.</>
      );
    rec.snap(say, undefined, { i: s.i, len: s.len, table: filled, kind: s.kind });
  }
  rec.close(<>Done: lps = [{lps(pattern).join(', ')}] for {hl(plural(m, 'character'))}. The table was built from the pattern alone, with no text in sight.</>, 2);
  rec.frames[rec.frames.length - 1].table = lps(pattern);
  rec.frames[rec.frames.length - 1].kind = 'done';
  return rec.frames;
}

// ── match ─────────────────────────────────────────────────────────────────

export interface MatchFrame extends Frame {
  /** Text pointer and pattern pointer at this comparison; null at the start and the end. */
  i: number | null;
  j: number;
  comparisons: number;
  found: number[];
  verdict: 'equal' | 'differ' | null;
  /** The pattern pointer after a fall-back (lps[j - 1]), for the arrow. */
  to: number | null;
  /** Text characters the naive scan would match again that KMP skips (the lps[j-1] characters before i). */
  skipped: number;
  /** Which line of the code is running. */
  line: number;
}

/** Code lines of the loop, shown beside the stepper. */
export const MATCH_CODE = [
  'let j = 0;',
  'for (let i = 0; i < n; ) {',
  '  if (text[i] === pattern[j]) {',
  '    i++; j++;',
  '    if (j === m) {',
  '      found.push(i - m); j = lps[j - 1];',
  '    }',
  '  } else if (j > 0) {',
  '    j = lps[j - 1];',
  '  } else {',
  '    i++;',
  '  }',
  '}',
];
const LINE = { compare: 2, advance: 3, match: 5, fallback: 8, skip: 10 } as const;

export interface MatchRun {
  frames: MatchFrame[];
  comparisons: number;
  matches: number[];
  advances: number;
  fallbacks: number;
}

export function matchFrames(text: string, pattern: string): MatchRun {
  const run = kmpSearch(text, pattern);
  const table = lps(pattern);
  const m = pattern.length;
  const rec = createRecorder<MatchFrame>(
    { i: null, j: 0, comparisons: 0, found: [], verdict: null, to: null, skipped: 0, line: 0 },
    { transient: { to: null, skipped: 0, verdict: null } },
  );
  if (m > text.length) {
    rec.close(<>The pattern ({m} characters) is longer than the text ({text.length}), so there is nothing to compare: 0 comparisons.</>);
    return { frames: rec.frames, comparisons: 0, matches: [], advances: 0, fallbacks: 0 };
  }
  rec.snap(<>The text pointer i never moves back; the pattern pointer j says how much of the pattern is already matched. The table lps = [{table.join(', ')}] was built from the pattern alone.</>);
  run.steps.forEach((s, n) => {
    const common = { i: s.i, j: s.j, comparisons: n + 1, found: s.found, verdict: s.equal ? ('equal' as const) : ('differ' as const), line: LINE.compare };
    const head = (
      <>
        Compare text[{s.i}] = {ch(text[s.i])} with pattern[{s.j}] = {ch(pattern[s.j])}: {s.equal ? hl('equal', 'ok') : hl('mismatch', 'bad')}.
      </>
    );
    if (s.kind === 'advance') {
      rec.snap(<>{head} Advance both pointers.</>, undefined, { ...common, line: LINE.advance });
    } else if (s.kind === 'match') {
      rec.snap(
        <>
          {head} The whole pattern matched: found at {hl(s.i - m + 1, 'ok')}. Continue with j = lps[{m - 1}] = {s.to}, so an overlapping match can still be found.
        </>,
        undefined,
        { ...common, line: LINE.match },
      );
    } else if (s.kind === 'fallback') {
      rec.snap(
        <>
          {head} Set j = lps[{s.j - 1}] = {hl(s.to, 'violet')}: the pattern shifts right by {hl(s.j - (s.to ?? 0), 'violet')} without re-reading the text, skipping {plural(s.skipped, 'comparison')} the naive scan would repeat.
        </>,
        undefined,
        { ...common, to: s.to, skipped: s.skipped, line: LINE.fallback },
      );
    } else {
      rec.snap(<>{head} j is 0, so nothing is matched yet: only the text pointer advances.</>, undefined, { ...common, line: LINE.skip });
    }
  });
  rec.set({ i: null });
  rec.close(
    <>
      Done: {hl(plural(run.comparisons, 'comparison'), 'ok')} for a text of {text.length}. {run.matches.length ? <>Found at {run.matches.join(', ')}.</> : <>The pattern was not found.</>}
    </>,
    2,
  );
  return { frames: rec.frames, comparisons: run.comparisons, matches: run.matches, advances: run.advances, fallbacks: run.fallbacks };
}
