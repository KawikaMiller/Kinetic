import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { HEADER, PAYLOAD, useSignedJwt } from './jwt';

type Kind = 'req' | 'store' | 'ok' | 'bad';
type NodeId = 'browser' | 'server' | 'store' | 'attacker';

const COLOR: Record<Kind, string> = { req: 'var(--info)', store: 'var(--violet)', ok: 'var(--ok)', bad: 'var(--bad)' };
const POS: Record<NodeId, { x: number; y: number }> = {
  browser: { x: 130, y: 95 },
  server: { x: 470, y: 95 },
  store: { x: 800, y: 95 },
  attacker: { x: 130, y: 205 },
};

interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
}

type Row = { sid: string; user: string; state: 'live' | 'hit' | 'gone' };

interface AuthFrame extends Frame {
  msg: Msg | null;
  busy: NodeId | null;
  holding: 'none' | 'cookie' | 'token';
  rows: Row[];
  token: boolean;
  attacker: boolean;
  verdict: 'ok' | 'bad' | null;
  lookups: number;
}

const SID = '7f3a9c2e41b8';

function build(kind: 'session' | 'jwt'): AuthFrame[] {
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
      say: <>The server recomputes the signature over header.payload with its key. <span className="hl ok">It matches</span>, so it trusts the claims. <b>No lookup.</b></> });
    push({ msg: m('server', 'browser', '200 · your orders', 'ok'), token: true, verdict: 'ok', say: <><span className="hl ok">200 OK</span>.</> });
    push({ token: true, hold: 1.4,
      say: <>Careful: the payload is only <b>base64</b>, not encrypted. Anyone holding the token can read it, so never put secrets in a JWT.</> });
    push({ msg: m('browser', 'server', 'POST /logout', 'req'), token: true, say: <>Ada logs out. The browser throws its copy of the token away…</> });
    push({ msg: m('attacker', 'server', 'GET /orders  Bearer (copied)', 'req'), attacker: true, token: true,
      say: <>…but a copy stolen earlier is still out there.</> });
    push({ busy: 'server', attacker: true, token: true, say: <>Signature check: still valid. Not expired yet. The server has <b>nothing to look up</b> that says otherwise.</> });
    push({ msg: m('server', 'attacker', '200 · Ada’s orders', 'bad'), attacker: true, token: true, verdict: 'bad', hold: 1.3,
      say: <><span className="hl bad">It works.</span> A JWT can't be revoked on its own: it stays valid until <code>exp</code>.</> });
    push({ attacker: false, token: true, hold: 2,
      say: <>Fixes: <b>short-lived</b> access tokens (≈15 min) plus a <span className="hl violet">refresh token</span> the server <i>does</i> store and can revoke, or a denylist. The price of statelessness.</> });
  }
  return out;
}

export function Flow({ kind, modePicker }: { kind: 'session' | 'jwt'; modePicker: ReactNode }) {
  const frames = useMemo(() => build(kind), [kind]);
  const player = usePlayer(frames, { interval: 1700 });
  const jwt = useSignedJwt(PAYLOAD);
  const f = player.frame;
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : f.busy ? [f.busy] : []);
  const nodes: NodeId[] = kind === 'session' ? ['browser', 'server', 'store'] : ['browser', 'server'];

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Server stores" value={kind === 'session' ? `${f.rows.filter((r) => r.state !== 'gone').length} session${f.rows.filter((r) => r.state !== 'gone').length === 1 ? '' : 's'}` : 'nothing'} color="var(--violet)" />
          <Stat label="Store lookups" value={f.lookups} color="var(--violet)" sub="per request cost" />
          <Stat label="Last result" value={f.verdict === 'ok' ? '200' : f.verdict === 'bad' ? (kind === 'jwt' ? '200 ⚠' : '401') : '·'} color={f.verdict === 'bad' ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.req, label: 'request', shape: 'dot' },
            { color: COLOR.store, label: 'session store', shape: 'dot' },
            { color: COLOR.ok, label: 'response', shape: 'dot' },
            { color: COLOR.bad, label: 'rejected / bad outcome', shape: 'dot' },
          ]}
        />
      }
      controls={<Controls>{modePicker}</Controls>}
    >
      <div className="aj">
        <svg className="aj-scene" viewBox="0 0 930 250" role="img" aria-label="Login flow between browser, server and session store">
          <line x1={POS.browser.x} y1={POS.browser.y} x2={POS.server.x} y2={POS.server.y} className="aj-edge" />
          {kind === 'session' && <line x1={POS.server.x} y1={POS.server.y} x2={POS.store.x} y2={POS.store.y} className="aj-edge aj-edge-store" />}
          {f.attacker && <line x1={POS.attacker.x} y1={POS.attacker.y} x2={POS.server.x} y2={POS.server.y} className="aj-edge aj-edge-bad" />}

          {nodes.map((n) => (
            <NodeBox key={n} id={n} on={active.has(n)} busy={f.busy === n} />
          ))}
          {kind === 'jwt' && (
            <g className="aj-key">
              <rect x={POS.server.x - 60} y={POS.server.y + 42} width={120} height={24} rx={12} />
              <text x={POS.server.x} y={POS.server.y + 58} textAnchor="middle">🔑 secret signing key</text>
            </g>
          )}
          <AnimatePresence>
            {f.attacker && (
              <motion.g key="att" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <NodeBox id="attacker" on={active.has('attacker')} busy={false} />
              </motion.g>
            )}
          </AnimatePresence>
          {f.msg && <Packet key={player.index} msg={f.msg} />}
        </svg>

        <div className="aj-panels">
          <div className="aj-panel">
            <span className="aj-panel-title">Browser is holding</span>
            {f.holding === 'none' && <span className="aj-empty">nothing yet</span>}
            {f.holding === 'cookie' && (
              <motion.div className="aj-cookie" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <code>
                  sid=<span className="aj-sid">{SID}</span>
                </code>
                <div className="aj-flags">
                  <span title="JavaScript can't read it, so XSS can't steal it">HttpOnly</span>
                  <span title="Only sent over HTTPS">Secure</span>
                  <span title="Not sent on most cross-site requests: CSRF protection">SameSite=Lax</span>
                </div>
              </motion.div>
            )}
            {f.holding === 'token' && <TokenString jwt={jwt} />}
          </div>

          {kind === 'session' ? (
            <div className="aj-panel">
              <span className="aj-panel-title">Session store (server side)</span>
              <div className="aj-rows">
                <AnimatePresence>
                  {f.rows.map((r) => (
                    <motion.div
                      key={r.sid}
                      className={`aj-row ${r.state}`}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: r.state === 'gone' ? 0.4 : 1, x: 0 }}
                      exit={{ opacity: 0, x: 30 }}
                    >
                      <code>{r.sid}</code>
                      <span>→ {r.user}</span>
                      <span className="aj-exp">{r.state === 'gone' ? 'deleted' : 'expires in 30 min'}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!f.rows.length && <span className="aj-empty">empty</span>}
              </div>
            </div>
          ) : (
            <div className={`aj-panel ${f.token ? '' : 'dim'}`}>
              <span className="aj-panel-title">Decoded token (anyone can do this)</span>
              {f.token ? <Decoded /> : <span className="aj-empty">no token yet</span>}
            </div>
          )}
        </div>
      </div>
    </StageFrame>
  );
}

function NodeBox({ id, on, busy }: { id: NodeId; on: boolean; busy: boolean }) {
  const { x, y } = POS[id];
  const label = { browser: '🌐 Browser', server: '⚙ Server', store: '🗄 Session store', attacker: '🕵 Attacker' }[id];
  return (
    <g className={`aj-node ${on ? 'on' : ''} ${id === 'attacker' ? 'bad' : ''} ${id === 'store' ? 'store' : ''}`}>
      {busy && (
        <motion.circle cx={x} cy={y} fill="none" stroke="var(--info)" strokeWidth={2} initial={{ r: 40, opacity: 0.8 }} animate={{ r: [40, 90], opacity: [0.8, 0] }} transition={{ duration: 1, repeat: Infinity }} />
      )}
      <rect x={x - 80} y={y - 26} width={160} height={52} rx={12} />
      <text x={x} y={y + 5} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function Packet({ msg }: { msg: Msg }) {
  const a = POS[msg.from];
  const b = POS[msg.to];
  const w = msg.label.length * 6.3 + 22;
  return (
    <motion.g
      initial={{ x: a.x, y: a.y, opacity: 0, scale: 0.6 }}
      animate={{ x: [a.x, b.x, b.x], y: [a.y, b.y, b.y], opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.4] }}
      transition={{ duration: 1.3, ease: 'easeInOut', times: [0, 0.65, 0.82, 1], opacity: { times: [0, 0.1, 0.82, 1], duration: 1.3 } }}
    >
      <rect x={-w / 2} y={-12} width={w} height={24} rx={12} fill={COLOR[msg.kind]} className="aj-packet" />
      <text x={0} y={4} textAnchor="middle" className="aj-packet-text">
        {msg.label}
      </text>
    </motion.g>
  );
}

export function TokenString({ jwt }: { jwt: { header: string; payload: string; signature: string } | null }) {
  if (!jwt) return <span className="aj-empty">signing…</span>;
  return (
    <motion.code className="aj-token" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span className="h">{jwt.header}</span>.<span className="p">{jwt.payload}</span>.<span className="s">{jwt.signature}</span>
    </motion.code>
  );
}

function Decoded() {
  return (
    <div className="aj-decoded">
      <code className="h">{JSON.stringify(HEADER)}</code>
      <code className="p">{JSON.stringify(PAYLOAD)}</code>
      <code className="s">HMAC-SHA256(header.payload, secret)</code>
    </div>
  );
}
