import type { ReactNode } from 'react';
import { pct } from '../../core/format';
import type { Frame } from '../../core/types';
import { HIT_MS, MISS_MS, POLICY_NAMES, VICTIM, emojiOf, hitRatio, simulate, type Policy, type Step } from './sim';

export type LFrame = Frame & Step;

/** Early requests get the full explanation; after that captions shrink to a line. */
const VERBOSE_REQUESTS = 3;
/** Evictions keep the full explanation a little longer. */
const VERBOSE_EVICTIONS = 8;

const em = (k: string) => <span className="lru-em">{emojiOf(k)}</span>;

function caption(s: Step, policy: Policy, cap: number, verbose: boolean): ReactNode {
  const k = s.key!;
  switch (s.phase) {
    case 'lookup':
      return verbose ? (
        <>
          Request for {em(k)}. First stop: the cache. A <span className="hl info">hash map</span> lookup, O(1).
        </>
      ) : (
        <>
          {em(k)} requested…
        </>
      );
    case 'hit':
      return verbose ? (
        <>
          <span className="hl ok">Hit!</span> {em(k)} served in ~{HIT_MS}ms.{' '}
          {policy === 'lru' && 'LRU moves it to the front: most recently used.'}
          {policy === 'fifo' && "FIFO doesn't reorder: arrival order is all it cares about."}
          {policy === 'lfu' && 'LFU bumps its use count, so it climbs toward the front.'}
        </>
      ) : (
        <>
          <span className="hl ok">Hit</span> {em(k)} ~{HIT_MS}ms
        </>
      );
    case 'fetch':
      return (
        <>
          <span className="hl bad">Miss</span>. {em(k)} isn't cached, so it's a slow trip to the database (~
          {MISS_MS - HIT_MS}ms).
          {s.victim && verbose && <> Cache is full ({cap}/{cap}). Something has to go.</>}
        </>
      );
    case 'insert': {
      const where =
        policy === 'lfu' ? (
          <>
            with a use count of 1, which puts it <b>last in line</b>. LFU is harsh on newcomers.
          </>
        ) : (
          <>at the front.</>
        );
      return s.evicted ? (
        <>
          Evict {em(s.evicted)} ({VICTIM[policy]}), then store {em(k)} {where}
        </>
      ) : (
        <>
          Store {em(k)} {where}
        </>
      );
    }
    default:
      return null;
  }
}

/**
 * One frame per phase of every request, plus a closing summary frame.
 * Frame i is simulate()'s step i, so appending a request leaves every earlier frame
 * in place: its first frame is at the old `frames.length - 1`.
 */
export function buildFrames(seq: string[], cap: number, policy: Policy): LFrame[] {
  const steps = simulate(seq, cap, policy);
  const frames: LFrame[] = steps.map((s) => ({
    ...s,
    say:
      s.phase === 'idle'
        ? undefined
        : caption(s, policy, cap, s.n < VERBOSE_REQUESTS || (s.phase === 'fetch' && !!s.victim && s.n < VERBOSE_EVICTIONS)),
    hold: s.phase === 'fetch' ? 1.3 : s.n >= VERBOSE_REQUESTS ? 0.75 : 1,
  }));
  frames[0].say = (
    <>
      A client asks for items. The <span className="hl info">cache</span> holds {cap} of them; everything else lives in a
      slow <span className="hl bad">database</span>. Press play.
    </>
  );
  const last = steps[steps.length - 1];
  const ratio = hitRatio(last.hits, last.misses);
  const avg = last.hits * HIT_MS + last.misses * MISS_MS;
  frames.push({
    ...last,
    phase: 'idle',
    key: null,
    hold: 3,
    say: (
      <>
        {POLICY_NAMES[policy]} with room for {cap}: hit ratio <span className="hl ok">{pct(ratio)}</span>, average{' '}
        <span className="hl">{Math.round(avg / Math.max(1, seq.length))}ms</span> vs. {MISS_MS}ms with no cache at all.
      </>
    ),
  });
  return frames;
}
