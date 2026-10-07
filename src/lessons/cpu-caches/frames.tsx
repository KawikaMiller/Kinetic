import type { ReactNode } from 'react';
import { latency, pct, plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { CACHE, hitRate, illustrativeNs, INT_BYTES, sceneAddresses, simulateCache, tally, type CacheAccess, type Scene } from './model';

export interface CacheFrame extends Frame {
  /** Index of the access shown, or -1 before the first one. */
  i: number;
}

export const hex = (n: number) => `0x${n.toString(16)}`;
const INTS_PER_LINE = CACHE.lineBytes / INT_BYTES;

/** How the loop names the element it reads. */
export function elementName(s: Scene, r: number, c: number): string {
  if (s.layout !== 'structs') return `a[${r}][${c}]`;
  const k = r * INTS_PER_LINE + c;
  return s.order === 'rows' ? `p[${Math.floor(k / 4)}].x` : `p.x[${k}]`;
}

function verdict(a: CacheAccess): ReactNode {
  const out = a.evicted !== null ? (
    <>
      {' '}Set {a.split.set} was full, so LRU throws out line <span className="hl orange">{hex(a.evicted)}</span> (way {a.way}).
    </>
  ) : null;
  switch (a.kind) {
    case 'hit':
      return (
        <>
          <span className="hl ok">Hit</span>: line {hex(a.line)} is already in set {a.split.set}, way {a.way}.
        </>
      );
    case 'compulsory':
      return (
        <>
          <span className="hl bad">Miss</span> (compulsory): the first touch of line {hex(a.line)}. It loads into way {a.way}, and all {INTS_PER_LINE} ints in it come along for free.{out}
        </>
      );
    case 'capacity':
      return (
        <>
          <span className="hl bad">Miss</span> (capacity): even a fully associative cache of {CACHE.sets * CACHE.ways} lines would have dropped line {hex(a.line)} by now. The loop touches more lines than
          fit.{out}
        </>
      );
    case 'conflict':
      return (
        <>
          <span className="hl bad">Miss</span> (conflict): a fully associative cache of {CACHE.sets * CACHE.ways} lines would still hold line {hex(a.line)}, but too many of the lines in use map to set{' '}
          {a.split.set}, which has only {CACHE.ways} ways.{out}
        </>
      );
  }
}

export function summary(s: Scene, accesses: readonly CacheAccess[]): ReactNode {
  const t = tally(accesses);
  return (
    <>
      {plural(accesses.length, 'access', 'accesses')}: {plural(t.hits, 'hit')}, {plural(t.misses, 'miss', 'misses')} ({t.compulsory} compulsory, {t.capacity} capacity, {t.conflict} conflict). Hit rate{' '}
      <span className={`hl ${hitRate(t) >= 0.5 ? 'ok' : 'bad'}`}>{pct(hitRate(t))}</span>, about {latency(illustrativeNs(t))} with illustrative latencies.
      {s.layout === 'small' ? <> The whole 256-byte array fits in this 512-byte cache, so loop order barely matters here. Try 16 × 16.</> : null}
    </>
  );
}

export function cacheFrames(s: Scene): { accesses: CacheAccess[]; frames: CacheFrame[] } {
  const accesses = simulateCache(sceneAddresses(s), CACHE);
  const rec = createRecorder<CacheFrame>({ i: -1 });
  rec.snap(
    <>
      The loop reads {plural(s.visits.length, 'int')} in {s.order === 'rows' ? (s.layout === 'structs' ? 'an array of structs' : 'row order') : s.layout === 'structs' ? 'a struct of arrays' : 'column order'}. The
      cache holds {CACHE.sets} sets × {CACHE.ways} ways of {CACHE.lineBytes}-byte lines. Press play.
    </>,
    1.3,
  );
  accesses.forEach((a, i) => {
    const [r, c] = s.visits[i];
    rec.snap(
      <>
        {elementName(s, r, c)} at {hex(a.addr)}: tag {hex(a.split.tag)}, set <span className="hl violet">{a.split.set}</span>, offset {a.split.offset}. {verdict(a)}
      </>,
      a.hit ? 0.6 : 1,
      { i },
    );
  });
  rec.close(summary(s, accesses), 2);
  return { accesses, frames: rec.frames };
}
