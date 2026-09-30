import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats, Toggle } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type NodeId = 'browser' | 'app' | 'auth' | 'api' | 'attacker';
type Kind = 'front' | 'back' | 'ok' | 'bad';

const COLOR: Record<Kind, string> = { front: 'var(--info)', back: 'var(--violet)', ok: 'var(--ok)', bad: 'var(--bad)' };
const POS: Record<NodeId, { x: number; y: number }> = {
  browser: { x: 120, y: 170 },
  app: { x: 470, y: 55 },
  auth: { x: 470, y: 285 },
  api: { x: 820, y: 55 },
  attacker: { x: 820, y: 285 },
};
const LABEL: Record<NodeId, [string, string]> = {
  browser: ['🧑 You + browser', 'the resource owner'],
  app: ['🖨 PhotoPrint', 'client app'],
  auth: ['🔐 accounts.photos', 'authorization server'],
  api: ['🖼 Photos API', 'resource server'],
  attacker: ['🕵 Malicious app', 'grabbed the redirect'],
};

interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
}

interface Opts {
  pkce: boolean;
  attacker: boolean;
  oidc: boolean;
}

interface OFrame extends Frame {
  msg: Msg | null;
  busy: NodeId | null;
  url: string | null;
  screen: 'none' | 'login' | 'consent';
  app: string[];
  att: string[];
  signedIn: boolean;
  outcome: 'ok' | 'bad' | 'blocked' | null;
  photosLeaked: boolean;
}

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

function build({ pkce, attacker, oidc }: Opts): OFrame[] {
  const out: OFrame[] = [];
  let cur: OFrame = { msg: null, busy: null, url: null, screen: 'none', app: [], att: [], signedIn: false, outcome: null, photosLeaked: false };
  const push = (p: Partial<OFrame> & { say: ReactNode }) => {
    cur = { ...cur, msg: null, busy: null, screen: 'none', outcome: null, ...p };
    out.push(cur);
  };
  const m = (from: NodeId, to: NodeId, label: string, kind: Kind): Msg => ({ from, to, label, kind });
  const scope = oidc ? 'openid photos.read' : 'photos.read';
  const authorize =
    `https://accounts.photos/authorize?response_type=code&client_id=photoprint&redirect_uri=https://photoprint.app/cb&scope=${scope.replace(' ', '%20')}&state=xyz123` +
    (pkce ? `&code_challenge=${CHALLENGE}&code_challenge_method=S256` : '');
  const callback = 'https://photoprint.app/cb?code=SplxlOBeZQQYbYS6&state=xyz123';

  push({ say: <><b>PhotoPrint</b> wants to print photos you keep at <b>Photos</b>. Handing it your Photos password would be insane. OAuth lets you grant <span className="hl">limited, revocable access</span> instead.</> });
  push({ msg: m('browser', 'app', 'click "Connect Photos"', 'front'), say: <>You click <b>Connect Photos</b> in PhotoPrint.</> });
  if (pkce) {
    push({ busy: 'app', app: ['code_verifier'], say: <>PKCE: the app invents a one-time secret, the <span className="hl">code_verifier</span>, and keeps it. It will send only its hash, the <span className="hl">code_challenge</span>.</> });
  }
  push({ msg: m('app', 'browser', '302 → /authorize', 'front'), url: authorize, say: <>The app <b>redirects your browser</b> to the authorization server. Everything rides in the URL: which app, what access (<span className="hl info">scope</span>), a <span className="hl violet">state</span> value{pkce ? <>, and the challenge</> : null}.</> });
  push({ msg: m('browser', 'auth', 'GET /authorize?…', 'front'), url: authorize, say: <>Your browser lands on <b>accounts.photos</b>. These redirects are the <span className="hl info">front channel</span>: visible, and easy to tamper with.</> });
  push({ screen: 'login', busy: 'auth', url: 'https://accounts.photos/login', say: <>You log in <b>on accounts.photos itself</b>. PhotoPrint never sees your password.</> });
  push({ screen: 'consent', busy: 'auth', url: 'https://accounts.photos/consent', hold: 1.3, say: <>Consent screen: "PhotoPrint wants to <b>view your photos</b>." Only what the scope asked for. You click Allow.</> });
  push({ msg: m('auth', 'browser', '302 → /cb?code=…', 'front'), url: callback, say: <>The auth server redirects back with a short-lived, single-use <span className="hl ok">authorization code</span>. Not a token yet.</> });

  if (attacker) {
    push({ msg: m('browser', 'attacker', 'code=SplxlOB…', 'bad'), url: callback, att: ['code'],
      say: <>But a <span className="hl bad">malicious app</span> on the device registered the same redirect and <b>grabs the code</b> first. PhotoPrint never gets it.</> });
    push({ msg: m('attacker', 'auth', pkce ? 'POST /token code (no verifier)' : 'POST /token code', 'bad'), att: ['code'],
      say: <>The attacker races to swap the code for tokens. PhotoPrint is a public client (no secret), so the code is all the auth server asks for…</> });
    if (pkce) {
      push({ busy: 'auth', att: ['code'], say: <>…unless PKCE is on. The server stored the challenge, so it demands the <span className="hl">code_verifier</span> that hashes to it. The attacker never had it.</> });
      push({ msg: m('auth', 'attacker', '400 invalid_grant', 'ok'), att: ['code'], outcome: 'blocked', hold: 1.4,
        say: <><span className="hl ok">Blocked.</span> A stolen code is useless without the verifier, which never left PhotoPrint.</> });
      push({ hold: 2, say: <>That's why PKCE is required for mobile and single-page apps, and recommended for every OAuth client today.</> });
    } else {
      push({ msg: m('auth', 'attacker', '200 access_token', 'bad'), att: ['code', 'access_token'],
        say: <><span className="hl bad">Tokens issued to the attacker.</span> Nothing tied the code to the app that started the flow.</> });
      push({ msg: m('attacker', 'api', 'GET /photos  Bearer …', 'bad'), att: ['code', 'access_token'], say: <>The attacker calls the Photos API with your token…</> });
      push({ msg: m('api', 'attacker', '200 · your photos', 'bad'), att: ['code', 'access_token'], outcome: 'bad', photosLeaked: true, hold: 1.4,
        say: <><span className="hl bad">Your photos leak.</span> Turn PKCE on and replay this.</> });
    }
    return out;
  }

  push({ msg: m('browser', 'app', 'GET /cb?code=…&state=…', 'front'), app: pkce ? ['code_verifier', 'code'] : ['code'],
    say: <>PhotoPrint receives the code and checks <span className="hl violet">state</span> matches what it sent, so nobody slipped it someone else's code (CSRF).</> });
  push({ msg: m('app', 'auth', pkce ? 'POST /token code + verifier' : 'POST /token code', 'back'), app: pkce ? ['code_verifier', 'code'] : ['code'],
    say: <>Now the <span className="hl violet">back channel</span>: a direct server-to-server call to swap the code for tokens{pkce ? <>, proving it's the same app with the <span className="hl">code_verifier</span></> : null}.</> });
  if (pkce) {
    push({ busy: 'auth', app: ['code_verifier', 'code'], say: <>The auth server hashes the verifier: SHA-256(verifier) = the challenge from earlier. <span className="hl ok">✓ Same app.</span></> });
  }
  const tokens = oidc ? ['access_token', 'refresh_token', 'id_token'] : ['access_token', 'refresh_token'];
  push({ msg: m('auth', 'app', oidc ? '200 access + refresh + id_token' : '200 access + refresh', 'back'), app: tokens,
    say: <>Tokens: a short-lived <span className="hl ok">access_token</span> (scope photos.read) and a <span className="hl violet">refresh_token</span> to get new ones later{oidc ? <>, plus an <span className="hl info">id_token</span></> : null}.</> });
  if (oidc) {
    push({ busy: 'app', app: tokens, signedIn: true, hold: 1.3,
      say: <>The <span className="hl info">id_token</span> is OIDC: a signed JWT saying <b>who you are</b> (sub, email). That's <i>authentication</i>. The access token is only <i>authorization</i>.</> });
  }
  push({ msg: m('app', 'api', 'GET /photos  Bearer …', 'back'), app: tokens, say: <>PhotoPrint calls the Photos API with the access token.</> });
  push({ msg: m('api', 'app', '200 · photos', 'ok'), app: tokens, outcome: 'ok', say: <>The API checks the token and that its scope includes <span className="hl info">photos.read</span>. <span className="hl ok">200.</span></> });
  push({ msg: m('app', 'api', 'DELETE /photos/7', 'back'), app: tokens, say: <>Could PhotoPrint delete a photo?</> });
  push({ msg: m('api', 'app', '403 insufficient_scope', 'bad'), app: tokens, say: <><span className="hl bad">403.</span> You only granted <b>read</b>. That's the whole point of scopes.</> });
  push({ app: tokens, hold: 2,
    say: <>OAuth 2 = <b>delegated authorization</b> ("this app may read my photos"). OIDC adds <b>authentication</b> ("this is Ada"). You can revoke PhotoPrint's access anytime without changing your password.</> });
  return out;
}

export function Stage() {
  const [pkce, setPkce] = useState(true);
  const [attacker, setAttacker] = useState(false);
  const [oidc, setOidc] = useState(true);
  const frames = useMemo(() => build({ pkce, attacker, oidc }), [pkce, attacker, oidc]);
  const player = usePlayer(frames, { interval: 1900 });
  const f = player.frame;
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : f.busy ? [f.busy] : []);
  const nodes: NodeId[] = attacker ? ['browser', 'app', 'auth', 'api', 'attacker'] : ['browser', 'app', 'auth', 'api'];

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="PKCE" value={pkce ? 'on' : 'off'} color={pkce ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Signed in as" value={f.signedIn ? 'Ada' : '·'} color="var(--info)" sub="from the id_token" />
          <Stat
            label="Outcome"
            value={f.outcome === 'ok' ? 'photos printed' : f.outcome === 'bad' ? 'photos leaked' : f.outcome === 'blocked' ? 'attack blocked' : '·'}
            color={f.outcome === 'bad' ? 'var(--bad)' : f.outcome ? 'var(--ok)' : 'var(--muted)'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.front, label: 'front channel (browser redirects)', shape: 'dot' },
            { color: COLOR.back, label: 'back channel (server to server)', shape: 'dot' },
            { color: COLOR.ok, label: 'success', shape: 'dot' },
            { color: COLOR.bad, label: 'attack / denied', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Toggle label="PKCE" value={pkce} onChange={setPkce} />
          <Toggle label="Attacker on the device" value={attacker} onChange={setAttacker} off="No" on="Intercepts the code" />
          <Toggle label="Scope" value={oidc} onChange={setOidc} off="photos.read" on="openid + photos.read" />
        </Controls>
      }
    >
      <div className="oa">
        <svg className="oa-scene" viewBox="0 0 940 340" role="img" aria-label="OAuth authorization code flow">
          <line x1={POS.browser.x} y1={POS.browser.y} x2={POS.app.x} y2={POS.app.y} className="oa-edge front" />
          <line x1={POS.browser.x} y1={POS.browser.y} x2={POS.auth.x} y2={POS.auth.y} className="oa-edge front" />
          <line x1={POS.app.x} y1={POS.app.y} x2={POS.auth.x} y2={POS.auth.y} className="oa-edge back" />
          <line x1={POS.app.x} y1={POS.app.y} x2={POS.api.x} y2={POS.api.y} className="oa-edge back" />
          {attacker && (
            <>
              <line x1={POS.browser.x} y1={POS.browser.y} x2={POS.attacker.x} y2={POS.attacker.y} className="oa-edge bad" />
              <line x1={POS.attacker.x} y1={POS.attacker.y} x2={POS.auth.x} y2={POS.auth.y} className="oa-edge bad" />
              <line x1={POS.attacker.x} y1={POS.attacker.y} x2={POS.api.x} y2={POS.api.y} className="oa-edge bad" />
            </>
          )}
          <text x={255} y={100} className="oa-channel" transform="rotate(-18 255 100)">front channel</text>
          <text x={484} y={132} className="oa-channel back">back channel</text>

          {nodes.map((n) => (
            <Node key={n} id={n} on={active.has(n)} busy={f.busy === n} extra={n === 'api' && f.photosLeaked ? 'leaked!' : undefined} />
          ))}

          <AnimatePresence>
            {f.screen !== 'none' && (
              <motion.g key={f.screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <rect x={POS.auth.x - 120} y={POS.auth.y - 118} width={240} height={78} rx={12} className="oa-popup" />
                {f.screen === 'login' ? (
                  <>
                    <text x={POS.auth.x} y={POS.auth.y - 95} textAnchor="middle" className="oa-popup-title">Sign in to Photos</text>
                    <text x={POS.auth.x} y={POS.auth.y - 74} textAnchor="middle" className="oa-popup-body">ada@ex.com · ••••••••</text>
                    <text x={POS.auth.x} y={POS.auth.y - 55} textAnchor="middle" className="oa-popup-note">typed on accounts.photos only</text>
                  </>
                ) : (
                  <>
                    <text x={POS.auth.x} y={POS.auth.y - 95} textAnchor="middle" className="oa-popup-title">PhotoPrint wants to:</text>
                    <text x={POS.auth.x} y={POS.auth.y - 74} textAnchor="middle" className="oa-popup-body">✓ View your photos</text>
                    <rect x={POS.auth.x - 30} y={POS.auth.y - 64} width={60} height={18} rx={6} className="oa-allow" />
                    <text x={POS.auth.x} y={POS.auth.y - 51} textAnchor="middle" className="oa-allow-text">Allow</text>
                  </>
                )}
              </motion.g>
            )}
          </AnimatePresence>

          {f.msg && <MessagePill key={player.index} msg={f.msg} />}
        </svg>

        <Box className="oa-url">
          <span className="oa-url-label">URL bar</span>
          <code>{f.url ? <Url url={f.url} /> : <span className="oa-muted">photoprint.app</span>}</code>
        </Box>

        <div className="oa-holds">
          <Holds title="PhotoPrint holds" items={f.app} />
          {attacker && <Holds title="Attacker holds" items={f.att} bad />}
        </div>
      </div>
    </StageFrame>
  );
}

const CHIP: Record<string, { color: string; note: string }> = {
  code_verifier: { color: 'var(--hi)', note: 'secret, never sent until /token' },
  code: { color: 'var(--ok)', note: 'single-use, ~1 min' },
  access_token: { color: 'var(--ok)', note: 'photos.read · ~1 h' },
  refresh_token: { color: 'var(--violet)', note: 'gets new access tokens' },
  id_token: { color: 'var(--info)', note: 'JWT: who the user is' },
};

function Holds({ title, items, bad = false }: { title: string; items: string[]; bad?: boolean }) {
  return (
    <Box className={`oa-hold ${bad ? 'bad' : ''}`}>
      <span className="oa-url-label">{title}</span>
      <div className="oa-chips">
        <AnimatePresence>
          {items.map((it) => (
            <motion.span
              key={it}
              layout
              className="oa-chip"
              style={{ borderColor: bad ? 'var(--bad)' : CHIP[it].color, color: bad ? 'var(--bad)' : CHIP[it].color }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
            >
              {it} <i>{CHIP[it].note}</i>
            </motion.span>
          ))}
        </AnimatePresence>
        {!items.length && <span className="oa-muted">nothing</span>}
      </div>
    </Box>
  );
}

function Url({ url }: { url: string }) {
  const [base, query] = url.split('?');
  if (!query) return <span>{base}</span>;
  return (
    <>
      <span>{base}?</span>
      {query.split('&').map((pair, i) => {
        const [k, v] = pair.split('=');
        const cls = k.startsWith('code_challenge') ? 'pkce' : k === 'state' ? 'state' : k === 'scope' ? 'scope' : k === 'code' ? 'code' : '';
        return (
          <span key={k} className={`oa-param ${cls}`}>
            {i > 0 ? '&' : ''}
            {k}=<b>{v}</b>
          </span>
        );
      })}
    </>
  );
}

/** Node boxes are 184×54; the busy ripple grows from 44 to 92. */
const NODE = { w: 184, h: 54, rx: 12, subDy: 14 } as const;
const BUSY_RIPPLE = { from: 44, to: 92 } as const;

function Node({ id, on, busy, extra }: { id: NodeId; on: boolean; busy: boolean; extra?: string }) {
  const [title, sub] = LABEL[id];
  return (
    <>
      {busy && <Pulse at={POS[id]} from={BUSY_RIPPLE.from} to={BUSY_RIPPLE.to} />}
      <SceneNode
        at={POS[id]}
        {...NODE}
        title={title}
        sub={extra ? <tspan className="oa-node-alert">{extra}</tspan> : sub}
        on={on}
        className={id === 'attacker' ? 'oa-attacker' : undefined}
      />
    </>
  );
}

/** Travel, pause, fade out on arrival so the target stays readable. */
const PILL_TIMING = { travelEnd: 0.62, fadeStart: 0.82, fadeInEnd: 0.1 } as const;

function MessagePill({ msg }: { msg: Msg }) {
  return (
    <Packet
      path={[POS[msg.from], POS[msg.to]]}
      label={msg.label}
      color={COLOR[msg.kind]}
      duration={1.4}
      height={24}
      charW={6.2}
      pad={22}
      timing={PILL_TIMING}
    />
  );
}