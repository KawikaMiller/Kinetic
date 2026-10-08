import type { ReactNode } from 'react';
import type { SequenceMessage } from '../../components/SequenceDiagram';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { NAME, START, USERS, finished, lostUpdates, type Ev, type HttpStep, type UserId, type World } from './model';

const times = (n: number) => (n === 1 ? '1 tick' : `${n} ticks`);

function describe(e: Ev, w: World): ReactNode {
  const who = NAME[e.user];
  switch (e.kind) {
    case 'read':
      return <>{who} reads stock {e.saw.stock}{w.strategy === 'optimistic' ? <> and version {e.saw.version}</> : null}
        {e.locked ? <>, and <span className="hl">takes the row lock</span></> : null}.</>;
    case 'wait':
      return e.result === 'granted'
        ? <>{who} waited {times(e.t1 - e.t0)} for the lock.</>
        : <><span className="hl bad">{who} gave up after {times(e.t1 - e.t0)}</span>: lock wait timeout exceeded (the exact error text differs by database). No sale was made.</>;
    case 'edit':
      return e.local === null
        ? <>{who} has nothing to compute: the database will do the subtraction.</>
        : <>{who} works out stock = {e.local} in the app{e.t1 - e.t0 > 1 ? <>, taking {times(e.t1 - e.t0)}</> : null}.</>;
    case 'save':
      if (e.result === 'conflict')
        return <>{who}'s UPDATE … WHERE version = {e.seenVersion} <span className="hl orange">matches 0 rows</span>: the version is now {e.version}. A conflict was detected, nothing was overwritten, so {who} must re-read and retry.</>;
      if (e.clobbered)
        return <>{who} saves stock = {e.stock}, worked out from a stale read, so the other sale is erased: <span className="hl bad">a lost update</span>.</>;
      if (w.strategy === 'optimistic')
        return <>{who}'s UPDATE … WHERE version = {e.seenVersion} <span className="hl ok">matches 1 row</span>: stock {e.stock}, version {e.version}.</>;
      if (w.strategy === 'atomic') return <>{who}'s UPDATE stock = stock - 1 leaves <span className="hl ok">stock {e.stock}</span>.</>;
      return <>{who} saves stock = {e.stock}{w.strategy === 'pessimistic' ? <> and commits; the lock is released</> : null}.</>;
  }
}

/** One sentence on the outcome once both users are done. */
export function verdictCaption(w: World): ReactNode {
  const lost = lostUpdates(w);
  const timedOut = USERS.filter((u) => w.users[u].outcome === 'timeout');
  const conflicts = w.events.filter((e) => e.kind === 'save' && e.result === 'conflict').length;
  return <>{lost > 0
    ? <><span className="hl bad">Final stock {w.row.stock}</span>: {w.committed} sales were saved but only {START.stock - w.row.stock} counted, so {lost} decrement{lost === 1 ? ' was' : 's were'} lost.</>
    : <><span className={`hl ${timedOut.length ? '' : 'ok'}`}>Final stock {w.row.stock}</span>: every sale that was saved is counted
      {conflicts ? <>, after {conflicts} detected conflict{conflicts === 1 ? '' : 's'} and a retry</> : null}.</>}
    {timedOut.length ? <> {timedOut.map((u) => NAME[u]).join(' and ')} timed out waiting, so that sale was not made.</> : null}</>;
}

/** The caption for what one click (or a preset) changed. `prev` is the world before it. */
export function changeCaption(prev: World | null, next: World, intro: ReactNode): ReactNode {
  if (next.events.length === 0 && USERS.every((u) => next.users[u].waitingSince === null)) return intro;
  const fresh = next.events.slice(prev?.events.length ?? 0);
  const blocked = USERS.filter((u) => next.users[u].waitingSince !== null && (prev?.users[u].waitingSince ?? null) === null);
  const parts = [
    ...fresh.map((e, i) => <span key={i}>{describe(e, next)} </span>),
    ...blocked.map((u) => <span key={u}>{NAME[u]}'s SELECT … FOR UPDATE <span className="hl">blocks</span>: {NAME[next.lock!]} holds the row lock. </span>),
  ];
  return <>{parts}{finished(next) ? verdictCaption(next) : null}</>;
}

export const introCaption = (strategy: string): ReactNode =>
  <>Ana and Ben each sell one unit of product 7 (stock 10, so the right answer is 8). Strategy: {strategy}. Press a step in either lane, in any order, or load an ordering.</>;

// ── Over HTTP ───────────────────────────────────────────────────────────

export interface HttpFrame extends Frame {
  at: number;
}

export function httpTone(s: HttpStep): Tone {
  if (s.from !== 'api') return s.owner === 'ana' ? 'info' : 'violet';
  if (s.clobbered) return 'bad';
  if (s.status === 412 || s.status === 428) return 'orange';
  return 'ok';
}

export const httpLadder = (steps: readonly HttpStep[]): SequenceMessage[] =>
  steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, note: s.note, tone: httpTone(s) }));

function httpCaption(s: HttpStep): ReactNode {
  const who = NAME[s.owner];
  switch (s.kind) {
    case 'get': return <>{who} loads the product.</>;
    case 'got': return <>{who} now holds stock {s.stock} with tag <code>{s.tag}</code>.</>;
    case 'put':
      return <>{who} sends its edit, stock {s.stock}, {s.tag ? <>guarded by <code>If-Match: {s.tag}</code></> : 'with no precondition'}.</>;
    case 'result':
      if (s.status === 412)
        return <><span className="hl orange">412 Precondition Failed</span>: {who}'s ETag no longer matches, so the server refuses. Nothing was overwritten; {who} must re-read.</>;
      if (s.status === 428)
        return <><span className="hl orange">428 Precondition Required</span>: this server insists on If-Match for writes (RFC 6585), so {who} must send one.</>;
      if (s.clobbered)
        return <><span className="hl bad">200 OK, but the write was stale</span>: {who}'s copy was out of date, and with no If-Match the server applied it anyway. The other user's sale is overwritten (stock {s.product.stock}).</>;
      return <><span className="hl ok">200 OK</span>: applied, new tag <code>{s.tag}</code> (stock {s.product.stock}).</>;
  }
}

export function httpSummary(steps: readonly HttpStep[]): ReactNode {
  const end = steps[steps.length - 1].product;
  const lost = steps.some((s) => s.clobbered);
  return lost
    ? <>Done: stock {end.stock}. <span className="hl bad">One sale was lost</span>: without If-Match the server can't tell Ben's copy was stale.</>
    : <>Done: stock {end.stock}, both sales counted, with exactly one refusal along the way.</>;
}

export function buildHttpFrames(steps: readonly HttpStep[], intro: ReactNode): HttpFrame[] {
  return [
    { at: -1, say: intro },
    ...steps.map((s, i) => ({ at: i, say: httpCaption(s), hold: s.status && s.status !== 200 ? 1.5 : 1 })),
    { at: steps.length, say: httpSummary(steps), hold: 2 },
  ];
}

export const HTTP_ACTORS = [
  { id: 'ana', label: 'Ana', tone: 'info' as const },
  { id: 'api', label: 'API' },
  { id: 'ben', label: 'Ben', tone: 'violet' as const },
];
export type { UserId };
