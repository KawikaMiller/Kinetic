import type { ReactNode } from 'react';
import type { State } from '../../core/automata';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { ACCEPTS, KEYWORDS, STATE_LABEL, kept, lex, scans, type LexOptions, type Token } from './model';

export interface LexFrame extends Frame {
  /** Tokens finished so far (whitespace and comments included). */
  emitted: number;
  /** Where the current scan started, or null between scans. */
  scanStart: number | null;
  /** Index of the character just read (−1: none yet). */
  read: number;
  /** DFA state now (null: it just died). */
  state: State | null;
  /** End of the longest accepted prefix in this scan. */
  acceptEnd: number | null;
  /** The state the arrow just taken came from (one frame only). */
  edgeFrom: State | null;
}

/** A character as the learner can see it. */
export const showChar = (c: string) => (c === ' ' ? '␣' : c === '\t' ? '⇥' : c === '\n' ? '⏎' : c);

const quoteText = (t: string) => <code>{t}</code>;

function emitCaption(t: Token, opts: LexOptions): ReactNode {
  const isKeywordText = (KEYWORDS as readonly string[]).includes(t.text);
  const longerThanKeyword = t.kind === 'IDENT' && KEYWORDS.find((k) => t.text.startsWith(k) && t.text.length > k.length);
  if (t.kind === 'KEYWORD')
    return <>Emit <b>KEYWORD {t.text}</b>. The identifier rule matched the same {t.text.length} characters, but the keyword rule is listed first, so it wins the tie.</>;
  if (t.kind === 'IDENT' && isKeywordText && !opts.keywordsFirst)
    return <>Emit <b>IDENT {t.text}</b>. The identifier rule is listed first here, so it wins the tie and {quoteText(t.text)} stops being a keyword.</>;
  if (longerThanKeyword)
    return <>Emit <b>IDENT {t.text}</b>. The keyword rule could only match {quoteText(longerThanKeyword)}, and the longest match wins.</>;
  return <>Emit <b>{t.kind} {t.text}</b>.</>;
}

export function lexFrames(source: string, opts: LexOptions): LexFrame[] {
  const rec = createRecorder<LexFrame>({ emitted: 0, scanStart: null, read: -1, state: null, acceptEnd: null, edgeFrom: null }, { transient: { edgeFrom: null } });
  if (source.length === 0) {
    rec.snap(<>Nothing to lex: the line is empty, so the token stream is empty too.</>);
    return rec.frames;
  }
  rec.snap(<>The lexer starts at column 1 in state S, the start of the combined DFA. It reads one character at a time.</>, undefined, { state: 'S' });

  for (const scan of scans(source, opts)) {
    const t = scan.token;
    const end = scan.steps.length ? scan.steps[scan.steps.length - 1] : null;
    const base = { scanStart: scan.start, emitted: rec.get().emitted };
    if (t.kind === 'WS' || t.kind === 'COMMENT') {
      rec.snap(
        t.kind === 'WS'
          ? <>Whitespace ({plural(t.text.length, 'character')}): the DFA loops in ws until something else arrives. It's consumed and thrown away.</>
          : <>{quoteText('//')} starts a comment: everything to the end of the line is consumed and thrown away. The parser never sees it.</>,
        undefined,
        { ...base, read: t.end - 1, state: t.kind === 'WS' ? 'ws' : 'cmt', acceptEnd: t.end, emitted: base.emitted + 1 },
      );
      rec.set({ scanStart: null, acceptEnd: null });
      continue;
    }
    if (t.kind === 'ERROR') {
      rec.snap(
        <>
          <span className="hl bad">Error at line {t.line}, column {t.col}:</span> {t.message}. No token can start{t.message === 'string never closed' ? ' and finish' : ''} here, so
          the lexer records an error token, skips {plural(Array.from(t.text).length, 'character')} and carries on.
        </>,
        1.5,
        { ...base, read: t.end - 1, state: end?.state ?? null, acceptEnd: null, emitted: base.emitted + 1 },
      );
      rec.set({ scanStart: null });
      continue;
    }
    scan.steps.forEach((step, k) => {
      const ch = showChar(source[step.at]);
      const first = k === 0 ? <>New token at column {t.col}: </> : null;
      const acceptEnd = rec.get().acceptEnd !== null && rec.get().scanStart === scan.start ? rec.get().acceptEnd : null;
      if (step.state === null) {
        const back = step.at + 1 - scan.acceptEnd!;
        rec.snap(
          <>
            Read {quoteText(ch)}: no arrow for it from {STATE_LABEL[scan.steps[k - 1].state!]}, so the DFA is stuck. Back up to the last accepting spot (after{' '}
            {quoteText(source.slice(scan.start, scan.acceptEnd!))}) and give back {plural(back, 'character')}.
          </>,
          undefined,
          { ...base, read: step.at, state: null, acceptEnd },
        );
        return;
      }
      const accepting = step.state in ACCEPTS;
      rec.snap(
        <>
          {first}Read {quoteText(ch)} → {STATE_LABEL[step.state]}.{' '}
          {accepting
            ? <>That state accepts ({ACCEPTS[step.state] === 'IDENT' ? 'an identifier or keyword' : ACCEPTS[step.state]}), so remember this spot, but keep going: a longer token might follow.</>
            : <>Not an accepting state: keep reading and hope a longer token completes.</>}
        </>,
        undefined,
        { ...base, read: step.at, state: step.state, acceptEnd: accepting ? step.at + 1 : acceptEnd, edgeFrom: k === 0 ? 'S' : scan.steps[k - 1].state },
      );
    });
    if (end && end.state !== null) {
      // The input ran out mid-token: that's the end of the scan.
      rec.snap(<>End of the line: stop at the last accepting spot.</>, undefined, { read: source.length - 1 });
    }
    rec.snap(emitCaption(t, opts), undefined, { emitted: base.emitted + 1, scanStart: null, acceptEnd: null, read: t.end - 1, state: 'S' });
  }

  const tokens = lex(source, opts);
  const errors = tokens.filter((t) => t.kind === 'ERROR').length;
  const dropped = tokens.length - kept(tokens).length;
  rec.close(
    <>
      Done: <b>{plural(kept(tokens).length - errors, 'token')}</b> for the parser, {plural(dropped, 'discarded span')}
      {errors ? <>, and <span className="hl bad">{plural(errors, 'error')}</span></> : null}. The lexer never asked whether they make sense together: that's the parser's job.
    </>,
    2,
  );
  return rec.frames;
}
