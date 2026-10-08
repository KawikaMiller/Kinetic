import type { ReactNode } from 'react';
import { bytes, humanDuration } from '../../core/format';
import type { Frame } from '../../core/types';
import { USERS, layerName, type Message, type Outcome } from './model';

export interface CacheFrame extends Frame {
  /** Index of the message shown last; -1 before the first. */
  step: number;
}

const WHERE: Record<Message['from'], string> = { browser: 'the browser', shared: 'the shared cache', origin: 'the origin' };

/** What one arrow on the ladder means. */
export function messageCaption(m: Message, o: Outcome): ReactNode {
  const name = USERS[o.user].name;
  const bg = m.background ? <> (a <span className="hl orange">background</span> refresh: the user already has their answer)</> : null;
  if (m.from === m.to) {
    return m.tone === 'ok'
      ? <><span className="hl ok">Fresh hit</span>: {name}'s browser has a fresh copy, so no request leaves the machine at all.</>
      : <><span className="hl orange">Stale copy served</span>: {name}'s copy is past its freshness lifetime but inside the stale-while-revalidate
        window, so the browser shows it now and refreshes it in the background.</>;
  }
  if (m.tone === 'info') {
    return <>{layerName(m.from)} asks {WHERE[m.to]}: <span className="hl info">{m.label}</span>
      {m.note && !m.background ? <>, sending <b>{m.note}</b> so the answer can be a tiny 304 if nothing changed</> : null}{bg}.</>;
  }
  if (m.tone === 'violet') return <><span className="hl violet">304 Not Modified</span> from {WHERE[m.from]}: the stored copy is still current, so only headers travel, no body.{bg}</>;
  if (m.tone === 'bad') {
    return <><span className="hl bad">The shared cache hands {name} {m.note?.replace('!', '')}</span>. It stored a per-user response because nothing told it not to
      (no <code>private</code>, no <code>Vary: Cookie</code>), so the next user got the first user's data.</>;
  }
  if (m.tone === 'orange') return <><span className="hl orange">Stale copy served</span> by the shared cache, inside its stale-while-revalidate window; it refreshes from the origin in the background.</>;
  if (m.tone === 'ok') return <><span className="hl ok">Fresh hit at the shared cache</span>: {m.label}{m.note ? ` (${m.note})` : ''}, without asking the origin.{bg}</>;
  return <><span className="hl">{m.label}</span> from {WHERE[m.from]}: the full body travels{m.note ? ` (${m.note})` : ''}.{bg}</>;
}

/** The request's verdict, from the model's outcome. */
export function verdict(o: Outcome, bodySize: number): ReactNode {
  const name = USERS[o.user].name;
  const at = humanDuration(o.t);
  const leak = o.leak ? <> <span className="hl bad">{name} was shown {USERS[o.owner!].name}'s page.</span></> : null;
  const cost = o.originBytes === 0 ? 'Nothing reached the origin.' : `${bytes(o.originBytes, { base: 1000 })} crossed the origin link.`;
  switch (o.kind) {
    case 'fresh':
      return <><span className="hl ok">Fresh hit</span> at t = {at}, answered by {o.answeredBy === 'browser' ? `${name}'s browser` : 'the shared cache'}. {cost}{leak}</>;
    case 'stale':
      return <><span className="hl orange">Stale served</span> at t = {at} by {o.answeredBy === 'browser' ? `${name}'s browser` : 'the shared cache'}, with a background refresh. {cost}{leak}</>;
    case 'revalidated-304':
      return <><span className="hl violet">Revalidated: 304</span> at t = {at}, answered by {WHERE[o.answeredBy]}. The body ({bytes(bodySize, { base: 1000 })}) didn't travel again. {cost}{leak}</>;
    case 'revalidated-200':
      return <><span className="hl">Revalidated, and it had changed</span>: the origin sent version {o.version} in a full 200 at t = {at}. {cost}{leak}</>;
    case 'not-stored':
      return <><span className="hl">Full trip to the origin</span> at t = {at}: <code>no-store</code> means no cache may keep it, so every request pays for the whole body. {cost}</>;
    default:
      return <><span className="hl">Miss</span> at t = {at}: no usable copy on the way, so the origin sent the full body. {cost}{leak}</>;
  }
}

/** The intro frame, then one frame per message of the latest request, then its verdict. */
export function requestFrames(o: Outcome | null, intro: ReactNode, bodySize: number): CacheFrame[] {
  if (!o) return [{ step: -1, say: intro }];
  return [
    { step: -1, say: <>{USERS[o.user].name} {o.reload ? 'reloads' : 'requests'} the page at t = {humanDuration(o.t)}.</> },
    ...o.messages.map((m, i) => ({ step: i, say: messageCaption(m, o) })),
    { step: o.messages.length - 1, say: verdict(o, bodySize), hold: 2 },
  ];
}
