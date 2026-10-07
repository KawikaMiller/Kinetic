import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { BASE, CHUNK_WINDOW, INSERTED, MODULI, naiveComparisons, rabinKarp } from './model';

export type Hit = 'none' | 'checking' | 'match' | 'spurious';

export interface RhFrame extends Frame {
  /** Window start, or null before the first window. */
  s: number | null;
  hash: bigint | null;
  /** The character leaving and entering on this slide. */
  outAt: number | null;
  inAt: number | null;
  /** The pattern position being compared during a verification. */
  verifyAt: number | null;
  hit: Hit;
  /** The update just made: ((prev − out·H)·B + in) mod M. */
  arith: { prev: bigint; out: number; inc: number; next: bigint } | null;
  matches: number[];
  spurious: number[];
  rolls: number;
  verifyChars: number;
  done: boolean;
}

export const modText = (m: bigint) => (m === 2147483647n ? '2³¹ − 1' : String(m));
const q = (s: string) => `“${s}”`;

export function searchFrames(text: string, pattern: string, m: bigint): RhFrame[] {
  const run = rabinKarp(text, pattern, m);
  const len = pattern.length;
  const r = createRecorder<RhFrame>(
    { s: null, hash: null, outAt: null, inAt: null, verifyAt: null, hit: 'none', arith: null, matches: [], spurious: [], rolls: 0, verifyChars: 0, done: false },
    { transient: { outAt: null, inAt: null, arith: null } },
  );
  const ph = run.patternHash;
  for (const st of run.steps) {
    const cur = r.get();
    if (st.t === 'pattern') {
      r.snap(
        <>
          The pattern {q(pattern)} hashes to <b>{String(ph)}</b> mod {modText(m)}, with base {String(BASE)} and letters worth a = 1 … z = 26,
          space = 27. {len > text.length ? <>It is longer than the text, so there is no window to slide.</> : null}
        </>,
      );
    } else if (st.t === 'first') {
      const w = text.slice(0, len);
      r.snap(
        <>
          Hash the first window from scratch, {plural(len, 'character')}: {q(w)} → <b>{String(st.hash)}</b>. {hitSentence(st.hash, ph)}
        </>,
        undefined,
        { s: 0, hash: st.hash, hit: st.hash === ph ? 'checking' : 'none', verifyAt: null },
      );
    } else if (st.t === 'roll') {
      r.snap(
        <>
          Slide one place: drop {q(text[st.s - 1])}, add {q(text[st.s + len - 1])}. The same few operations, whatever the pattern's length, give{' '}
          <b>{String(st.hash)}</b>, the same as hashing {q(text.slice(st.s, st.s + len))} from scratch. {hitSentence(st.hash, ph)}
        </>,
        undefined,
        {
          s: st.s, hash: st.hash, outAt: st.s - 1, inAt: st.s + len - 1, verifyAt: null, hit: st.hash === ph ? 'checking' : 'none',
          arith: { prev: st.prev, out: st.out, inc: st.inc, next: st.hash }, rolls: cur.rolls + 1,
        },
      );
    } else {
      const a = text[st.s + st.at];
      const b = pattern[st.at];
      const verifyChars = cur.verifyChars + 1;
      if (!st.equal) {
        r.snap(
          <>
            {q(a)} ≠ {q(b)} at position {st.at}: a <span className="hl orange">spurious hit</span>. The hashes matched but the strings
            don't, and only the character check could tell.
          </>,
          1.6,
          { verifyAt: st.at, verifyChars, hit: 'spurious', spurious: [...cur.spurious, st.s] },
        );
      } else if (st.last) {
        r.snap(
          <>
            {q(a)} = {q(b)}: all {plural(len, 'character')} match, a <span className="hl ok">real match</span> at {st.s}.
          </>,
          1.4,
          { verifyAt: st.at, verifyChars, hit: 'match', matches: [...cur.matches, st.s] },
        );
      } else {
        r.snap(
          <>
            Verify: {q(a)} = {q(b)} at position {st.at}, keep going.
          </>,
          undefined,
          { verifyAt: st.at, verifyChars },
        );
      }
    }
  }
  r.set({ done: true, verifyAt: null, hit: 'none' });
  r.close(searchSummary(text, pattern, m), 2);
  return r.frames;
}

function hitSentence(h: bigint, ph: bigint): ReactNode {
  return h === ph ? (
    <>
      That equals the pattern's hash, so <span className="hl info">check the characters</span>.
    </>
  ) : (
    <>Not the pattern's hash, so skip this window without reading its characters.</>
  );
}

/** Spurious hits for every modulus on this text, for the closing comparison. */
export function spuriousByModulus(text: string, pattern: string): { m: bigint; spurious: number }[] {
  return MODULI.map((m) => ({ m, spurious: rabinKarp(text, pattern, m).spurious.length }));
}

export function searchSummary(text: string, pattern: string, m: bigint): ReactNode {
  const run = rabinKarp(text, pattern, m);
  const naive = naiveComparisons(text, pattern);
  const others = spuriousByModulus(text, pattern);
  return (
    <>
      Done: {plural(run.matches.length, 'match', 'matches')}
      {run.matches.length ? <> at {run.matches.join(', ')}</> : null} and {plural(run.spurious.length, 'spurious hit')}, using{' '}
      {plural(run.rolls, 'rolling update')} and {plural(run.verifyChars, 'character check')}; a naïve scan makes {naive}. Spurious hits on
      this text: {others.map((o, i) => (
        <span key={String(o.m)}>
          {i ? ', ' : ''}mod {modText(o.m)}: {o.spurious}
        </span>
      ))}
      .
    </>
  );
}

// ── Chunking scene ────────────────────────────────────────────────────

export function chunkCaption(at: number, kept: number, shifted: number, changed: number, reused: number, total: number, fresh: number): ReactNode {
  return (
    <>
      Inserting {INSERTED} at position {at}: {plural(kept, 'cut')} before it stayed put and {plural(shifted, 'cut')} after it moved one place
      along with the text.{' '}
      {changed ? <>{plural(changed, 'cut')} appeared or vanished, all within {CHUNK_WINDOW} characters of the edit. </> : <>No cut appeared or vanished. </>}
      {reused} of {plural(total, 'chunk')} {reused === 1 ? 'is' : 'are'} found again unchanged; only {plural(fresh, 'chunk')}{' '}
      {fresh === 1 ? 'needs' : 'need'} storing.
    </>
  );
}
