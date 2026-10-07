import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { LIFETIME_MIN, type TamperStory } from './jwt';

export type Kind = 'req' | 'store' | 'ok' | 'bad';
export type NodeId = 'browser' | 'server' | 'store' | 'attacker';

export interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
}

export type Row = { sid: string; user: string; state: 'live' | 'hit' | 'gone' };

export interface AuthFrame extends Frame {
  msg: Msg | null;
  busy: NodeId | null;
  holding: 'none' | 'cookie' | 'token';
  rows: Row[];
  token: boolean;
  attacker: boolean;
  verdict: 'ok' | 'bad' | null;
  lookups: number;
}

export const SID = '7f3a9c2e41b8';

export function flowFrames(kind: 'session' | 'jwt'): AuthFrame[] {
  const out: AuthFrame[] = [];
  let cur: AuthFrame = { msg: null, busy: null, holding: 'none', rows: [], token: false, attacker: false, verdict: null, lookups: 0 };
  const push = (p: Partial<AuthFrame> & { say: ReactNode }) => {
    cur = { ...cur, msg: null, busy: null, verdict: null, ...p };
    if (cur.msg?.to === 'store' && cur.msg.label.startsWith('lookup')) cur.lookups += 1;
    out.push(cur);
  };
  const m = (from: NodeId, to: NodeId, label: string, k: Kind): Msg => ({ from, to, label, kind: k });

  push({ say: <>HTTP is <b>stateless</b>: every request arrives as a stranger. After you log in, how does the server know the next request is still you?</> });
  push({ msg: m('browser', 'server', 'POST /login  ada / ••••••', 'req'), say: <>You submit your username and password (over HTTPS, always).</> });
  push({ busy: 'server', say: <>The server checks the password against its stored <b>salted hash</b>. <span className="hl ok">✓ correct</span>.</> });

  if (kind === 'session') {
    push({ msg: m('server', 'store', `create ${SID.slice(0, 6)}…`, 'store'), rows: [{ sid: SID, user: 'user 42 · Ada', state: 'live' }],
      say: <>It creates a <span className="hl violet">session</span>: a random, unguessable ID saved server-side, pointing at user 42.</> });
    push({ msg: m('server', 'browser', 'Set-Cookie: sid=…', 'ok'), holding: 'cookie',
      say: <>…and hands the browser <b>only the ID</b>, in a cookie. The ID means nothing on its own.</> });
    push({ msg: m('browser', 'server', 'GET /orders  Cookie: sid', 'req'),
      say: <>From now on the browser attaches the cookie <b>automatically</b> to every request to this site.</> });
    push({ msg: m('server', 'store', `lookup ${SID.slice(0, 6)}…`, 'store'), rows: [{ sid: SID, user: 'user 42 · Ada', state: 'hit' }],
      say: <>The server looks the ID up: <span className="hl violet">it's Ada</span>. One store lookup per request.</> });
    push({ msg: m('server', 'browser', '200 · your orders', 'ok'), rows: [{ sid: SID, user: 'user 42 · Ada', state: 'live' }], verdict: 'ok',
      say: <><span className="hl ok">200 OK</span>, here are Ada's orders.</> });
    push({ msg: m('browser', 'server', 'POST /logout', 'req'), say: <>Ada logs out…</> });
    push({ msg: m('server', 'store', `DELETE ${SID.slice(0, 6)}…`, 'bad'), rows: [{ sid: SID, user: 'user 42 · Ada', state: 'gone' }],
      say: <>…and the server <b>deletes the session row</b>.</> });
    push({ msg: m('attacker', 'server', 'GET /orders  Cookie: sid (copied)', 'req'), attacker: true, rows: [],
      say: <>Someone replays a copied cookie. Maybe it was stolen earlier…</> });
    push({ msg: m('server', 'store', `lookup ${SID.slice(0, 6)}…`, 'store'), attacker: true, say: <>Lookup…</> });
    push({ msg: m('server', 'attacker', '401 Unauthorized', 'bad'), attacker: true, verdict: 'bad', hold: 1.3,
      say: <><span className="hl bad">401</span>: no such session. <b>Revocation is instant</b>: delete the row and that ID is dead everywhere.</> });
    push({ attacker: false, hold: 2,
      say: <>Sessions: easy to revoke, tiny cookie, simple. The price: <span className="hl violet">every request needs a store lookup</span>, and every server must share that store.</> });
  } else {
    push({ busy: 'server', token: true,
      say: <>Instead of storing anything, it builds a <span className="hl info">JWT</span>: claims about you (user 42, role, expiry), <span className="hl">signed</span> with a secret key only the server knows.</> });
    push({ msg: m('server', 'browser', '200 + token', 'ok'), holding: 'token', token: true,
      say: <>The whole token goes to the client. The server <b>forgets about it</b>.</> });
    push({ msg: m('browser', 'server', 'GET /orders  Bearer eyJ…', 'req'), token: true,
      say: <>Each request sends the token back, e.g. in an <code>Authorization: Bearer</code> header.</> });
    push({ busy: 'server', token: true,
      say: <>The server recomputes the signature over header.payload with its key. <span className="hl ok">It matches</span> and exp hasn't passed, so it trusts the claims. <b>No lookup.</b></> });
    push({ msg: m('server', 'browser', '200 · your orders', 'ok'), token: true, verdict: 'ok', say: <><span className="hl ok">200 OK</span>.</> });
    push({ token: true, hold: 1.4,
      say: <>Careful: the payload is only <b>base64url</b>-encoded, not encrypted. Anyone holding the token can read it, so never put secrets in a JWT.</> });
    push({ msg: m('browser', 'server', 'POST /logout', 'req'), token: true, say: <>Ada logs out. The browser throws its copy of the token away…</> });
    push({ msg: m('attacker', 'server', 'GET /orders  Bearer (copied)', 'req'), attacker: true, token: true,
      say: <>…but a copy stolen earlier is still out there.</> });
    push({ busy: 'server', attacker: true, token: true, say: <>Signature check: still valid. Not expired yet. The server has <b>nothing to look up</b> that says otherwise.</> });
    push({ msg: m('server', 'attacker', '200 · Ada’s orders', 'bad'), attacker: true, token: true, verdict: 'bad', hold: 1.3,
      say: <><span className="hl bad">It works.</span> A JWT can't be revoked on its own: it stays valid until <code>exp</code>.</> });
    push({ attacker: false, token: true, hold: 2,
      say: <>Fixes: <b>short-lived</b> access tokens ({LIFETIME_MIN} min, like this one) plus a <span className="hl violet">refresh token</span> the server <i>does</i> store and can revoke, or a denylist. The price of statelessness.</> });
  }
  return out;
}

export type Outcome = 'ok' | 'bad' | 'warn' | null;

export interface ScFrame extends Frame {
  target: number | null;
  storeDown: boolean;
  revoked: boolean;
  sess: Outcome;
  jwt: Outcome;
  sessHops: number;
}

export function scaleFrames(): ScFrame[] {
  const base: ScFrame = { target: null, storeDown: false, revoked: false, sess: null, jwt: null, sessHops: 0 };
  const f = (p: Partial<ScFrame> & { say: ReactNode }): ScFrame => ({ ...base, ...p });
  return [
    f({ say: <>Three servers behind a load balancer, <b>same traffic in both lanes</b>. Top: sessions. Bottom: JWTs.</> }),
    f({ target: 0, sess: 'ok', jwt: 'ok', sessHops: 1, say: <>Request 1 → server A. Sessions: A must ask the <span className="hl violet">shared store</span>. JWT: A checks the signature <b>locally</b>.</> }),
    f({ target: 1, sess: 'ok', jwt: 'ok', sessHops: 2, say: <>Request 2 → server B. Same again: one extra network hop for sessions, zero for JWT.</> }),
    f({ target: 2, sess: 'ok', jwt: 'ok', sessHops: 3, say: <>Any server works in both lanes, as long as sessions live in a <b>shared</b> store (not in one server's memory).</> }),
    f({ target: 0, storeDown: true, sess: 'bad', jwt: 'ok', sessHops: 3, hold: 1.4,
      say: <>The session store goes down. <span className="hl bad">Every</span> session request fails: everyone is effectively logged out. JWT servers don't notice.</> }),
    f({ target: 1, revoked: true, sess: 'ok', jwt: 'warn', sessHops: 4, hold: 1.4,
      say: <>Store's back. Now an admin <b>bans user 42</b>. Sessions: delete the row, the next request is refused instantly. JWT: <span className="hl bad">still accepted</span> until the token expires.</> }),
    f({ target: null, hold: 2,
      say: <>Neither wins outright. A common blend: a <span className="hl info">short-lived JWT</span> for speed, plus a <span className="hl violet">stored refresh token</span> you can revoke.</> }),
  ];
}


/** The Forge lane's caption for each outcome (see tamperStory). */
export const TAMPER_STORY: Record<TamperStory, ReactNode> = {
  genuine: <>This is the genuine token the server issued. Edit the payload like an attacker would: make yourself <span className="hl">admin</span>.</>,
  'resigned-same': <><span className="hl ok">Valid</span>: re-signing the unchanged payload with the real key gives exactly the same signature as the genuine token.</>,
  'forged-accepted': <><span className="hl bad">Accepted.</span> With the real secret, a forged token is indistinguishable from a real one. Guard signing keys like passwords, and rotate them.</>,
  'guess-rejected': <><span className="hl bad">Rejected.</span> Re-signing with a guessed key gives a different signature. Only the server's secret produces the right one.</>,
  'edit-rejected': <><span className="hl bad">Rejected.</span> You changed the payload but can't produce a new signature, so the server's recomputed signature doesn't match.</>,
};
