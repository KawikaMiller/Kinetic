import type { ReactNode } from 'react';
import { decimal, pct, plural } from '../../core/format';
import { keyProblems, type KeyChoice, type KeyPart, type KeyRun, type PageKind } from './keys';
import type { ExpiryRun, SpreadRun } from './stampede';
import type { TtlResult } from './ttl';

/** The caption for the TTL trade-off at one TTL, from the replay's own numbers. */
export function ttlCaption(r: TtlResult): ReactNode {
  return <>With a <span className="hl">{r.ttl} s</span> TTL, <span className="hl ok">{pct(r.hitRate, 1)}</span> of reads hit the cache and{' '}
    <span className="hl orange">{pct(r.staleRate, 1)}</span> returned a value from before the key's latest write. The longest a stale value was served after
    the write it missed was {decimal(r.maxStaleness, 1)} s, never more than the TTL.</>;
}

const PART_WORDS: Record<KeyPart, { name: string; harm: string }> = {
  user: { name: 'the user', harm: 'one user is served another user\'s page' },
  locale: { name: 'the locale', harm: 'a German reader is served the French page someone else cached' },
  version: { name: 'the version', harm: 'after a deploy, pages cached by the old version keep being served' },
};
const list = (parts: readonly KeyPart[]) => parts.map((p) => PART_WORDS[p].name).join(' and ');

const PAGE_NAME: Record<PageKind, string> = { catalog: 'product page', account: 'account page' };

/** The caption for the key-design scene. */
export function keyCaption(kind: PageKind, choice: KeyChoice, run: KeyRun): ReactNode {
  const { missing, extra } = keyProblems(kind, choice);
  if (missing.length) {
    return <>The key leaves out <span className="hl orange">{list(missing)}</span>, so {PART_WORDS[missing[0]].harm}. <b>{plural(run.wrong, 'request')}</b> of {run.hits + run.misses} got the wrong page,
      and the hit rate of {pct(run.hitRate, 0)} flatters a cache that is serving wrong answers.</>;
  }
  if (extra.length) {
    return <>The key also includes <span className="hl">{list(extra)}</span>, which the {PAGE_NAME[kind]} does not depend on. Nothing is served wrong, but the cache holds <b>{run.entries}</b> entries
      and hits only {pct(run.hitRate, 0)}: a key that is too specific fragments the cache.</>;
  }
  return <>The key names exactly what the {PAGE_NAME[kind]} depends on: no wrong pages, {run.entries} entries and a {pct(run.hitRate, 0)} hit rate.</>;
}

/** The caption for a hot key expiring. */
export function expiryCaption(rate: number, coalesce: boolean, run: ExpiryRun): ReactNode {
  return coalesce
    ? <>The hot key expires with {rate} requests a second arriving. {plural(run.misses, 'request')} found it missing during the first load, and with <span className="hl violet">request coalescing</span> only
      the first one goes to the database: <b>{run.loads} load</b>. The other {run.waited} wait a moment for its answer.</>
    : <>The hot key expires with {rate} requests a second arriving. {plural(run.misses, 'request')} found it missing before the first load finished, and every one went to the database:{' '}
      <span className="hl bad">{plural(run.loads, 'load')}</span> for one value. That is a stampede.</>;
}

/** The caption for many keys expiring together. */
export function spreadCaption(jitter: number, keys: number, ttl: number, run: SpreadRun): ReactNode {
  return jitter === 0
    ? <>All {keys} keys were stored together with the same {ttl} s TTL, so they expire together: <span className="hl bad">{run.peak} database loads in one second</span>.</>
    : <>With each TTL varied by plus or minus {pct(jitter, 0)}, the same {keys} expiries spread out: at most <span className="hl ok">{run.peak} loads in any one second</span>, instead of all {keys} at once.</>;
}
