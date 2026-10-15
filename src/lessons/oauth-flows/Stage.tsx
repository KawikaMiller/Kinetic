import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Controls, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { cssVar } from '../../core/palette';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import {
  type Attack, countDefences, DEFAULT_OPTS, DEFENCE_NAMES, type Defences, type Held, ILLUSTRATIVE, type Kind, type Msg, type NodeId, type Opts, SCENE_EDGES,
  type UrlView,
} from './model';
import { ATTACK_LABEL, ATTACKS, BINDINGS, cellText, COLUMNS, defenceMatrix, OUTCOME_LABEL } from './run';
import './styles.css';

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
  attacker: ['🕵 Malicious party', ''],
};
/** What the attacker's box says it is doing, for each attack. */
const ATTACKER_SUB: Record<Exclude<Attack, 'none'>, string> = { steal: 'read the redirect', forge: 'started its own flow', redirect: 'wrote the link' };

/** The hues of the parameters and the things the app holds. None is a status colour or a channel colour. */
const PARAM_COLOR = {
  scope: cssVar('sky'),
  state: cssVar('trkHw'),
  pkce: cssVar('trkLang'),
  code: cssVar('trkMath'),
  redirect: cssVar('orange'),
  token: cssVar('trkWeb'),
} as const;
const CHIP: Record<Held, { color: string; note: string }> = {
  state: { color: PARAM_COLOR.state, note: 'ties the callback to this browser session' },
  code_verifier: { color: PARAM_COLOR.pkce, note: 'secret, sent only at /token' },
  code: { color: PARAM_COLOR.code, note: `single-use, short-lived (${ILLUSTRATIVE.codeSeconds} s here, made up)` },
  access_token: { color: PARAM_COLOR.token, note: `photos.read · ${ILLUSTRATIVE.accessMinutes} min here, made up` },
  refresh_token: { color: PARAM_COLOR.token, note: 'gets new access tokens' },
  id_token: { color: PARAM_COLOR.token, note: 'JWT: who the user is' },
};
const DEFENCE_COLOR: Record<keyof Defences, string> = { state: PARAM_COLOR.state, pkce: PARAM_COLOR.pkce, exactRedirect: PARAM_COLOR.redirect };

/** The narrowest width at which the scene's text stays readable; narrower screens scroll the scene sideways. */
const SCENE_MIN_WIDTH = 880;

const ATTACK_OPTIONS = (['none', ...ATTACKS] as Attack[]).map((a) => ({ value: a, label: ATTACK_LABEL[a] }));

export function Stage() {
  const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
  const set = <K extends keyof Opts>(key: K) => (value: Opts[K]) => setOpts((o) => ({ ...o, [key]: value }));
  const frames = useMemo(() => buildFrames(opts), [opts]);
  const player = usePlayer(frames, { interval: 1900 });
  const f = player.frame;
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : f.busy ? [f.busy] : []);
  const nodes: NodeId[] = opts.attack === 'none' ? ['browser', 'app', 'auth', 'api'] : ['browser', 'app', 'auth', 'api', 'attacker'];
  const off = (Object.keys(DEFENCE_NAMES) as (keyof Defences)[]).filter((k) => !opts[k]);
  const matrix = useMemo(() => defenceMatrix(), []);

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Defences on" value={`${countDefences(opts)}/3`} sub={off.length ? `${off.map((k) => DEFENCE_NAMES[k]).join(', ')} off` : 'PKCE, state, exact redirect_uri'} />
          <Stat label="Signed in as" value={f.signedIn ? 'Ada' : '·'} sub="from the id_token" />
          <Stat
            label="Outcome"
            value={f.outcome ? OUTCOME_LABEL[f.outcome] : '·'}
            color={f.outcome === 'leaked' || f.outcome === 'hijacked' ? 'var(--bad)' : f.outcome ? 'var(--ok)' : 'var(--muted)'}
          />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: COLOR.front, label: 'front channel (browser redirects)', shape: 'dot' },
              { color: COLOR.back, label: 'back channel (server to server)', shape: 'dot' },
              { color: COLOR.ok, label: 'success', shape: 'dot' },
              { color: COLOR.bad, label: 'attack / denied', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="toy">PhotoPrint and its servers are made up; the server and app are a small model written for this lesson, not a real OAuth library</Provenance>
            <Provenance kind="real">the PKCE challenge is a real SHA-256; codes, verifiers and tokens are fake values</Provenance>
            <Provenance kind="scripted">an attacker who can read the redirect, and a forwarding page on photoprint.app, are scenario assumptions</Provenance>
            <ClaimLabel kind="standard">RFC 6749 (OAuth 2.0) and RFC 7636 (PKCE) define these checks</ClaimLabel>
            <ClaimLabel kind="practice">exact redirect_uri matching, PKCE for every client and leaving the implicit flow are current guidance, from memory</ClaimLabel>
          </ProvenanceRow>
        </>
      }
      controls={
        <Controls>
          <Segmented label="Attacker" options={ATTACK_OPTIONS} value={opts.attack} onChange={set('attack')} />
          <Toggle label="PKCE" value={opts.pkce} onChange={set('pkce')} />
          <Toggle label="State check" value={opts.state} onChange={set('state')} />
          <Toggle label="redirect_uri matching" value={opts.exactRedirect} onChange={set('exactRedirect')} off="Any URL on the site" on="Exact" />
          <Toggle label="Scope" value={opts.oidc} onChange={set('oidc')} off="photos.read" on="openid + photos.read" />
        </Controls>
      }
    >
      <div className="oa">
        <WideRegion minWidth={SCENE_MIN_WIDTH}>
        <svg className="oa-scene" viewBox="0 0 940 340" role="img" aria-label="OAuth authorization code flow">
          {SCENE_EDGES.filter(([a, b]) => opts.attack !== 'none' || (a !== 'attacker' && b !== 'attacker')).map(([a, b]) => (
            <line key={`${a}-${b}`} x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} className={`oa-edge ${a === 'attacker' || b === 'attacker' ? 'bad' : a === 'browser' ? 'front' : 'back'}`} />
          ))}
          <text x={255} y={100} className="oa-channel" transform="rotate(-18 255 100)">front channel</text>
          <text x={484} y={132} className="oa-channel back">back channel</text>

          {nodes.map((n) => (
            <Node
              key={n}
              id={n}
              on={active.has(n)}
              busy={f.busy === n}
              sub={n === 'attacker' && opts.attack !== 'none' ? ATTACKER_SUB[opts.attack] : undefined}
              extra={n === 'api' && f.photosLeaked ? 'leaked!' : undefined}
            />
          ))}

          <AnimatePresence>
            {f.screen !== 'none' && (
              <motion.g key={f.screen} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <rect x={POS.auth.x - 120} y={POS.auth.y - 118} width={240} height={78} rx={12} className={`oa-popup ${f.screen === 'error' ? 'bad' : ''}`} />
                {f.screen === 'login' && (
                  <>
                    <text x={POS.auth.x} y={POS.auth.y - 95} textAnchor="middle" className="oa-popup-title">Sign in to Photos</text>
                    <text x={POS.auth.x} y={POS.auth.y - 74} textAnchor="middle" className="oa-popup-body">ada@ex.com · ••••••••</text>
                    <text x={POS.auth.x} y={POS.auth.y - 55} textAnchor="middle" className="oa-popup-note">typed on accounts.photos only</text>
                  </>
                )}
                {f.screen === 'consent' && (
                  <>
                    <text x={POS.auth.x} y={POS.auth.y - 95} textAnchor="middle" className="oa-popup-title">PhotoPrint wants to:</text>
                    <text x={POS.auth.x} y={POS.auth.y - 74} textAnchor="middle" className="oa-popup-body">✓ View your photos</text>
                    <rect x={POS.auth.x - 30} y={POS.auth.y - 64} width={60} height={18} rx={6} className="oa-allow" />
                    <text x={POS.auth.x} y={POS.auth.y - 51} textAnchor="middle" className="oa-allow-text">Allow</text>
                  </>
                )}
                {f.screen === 'error' && (
                  <>
                    <text x={POS.auth.x} y={POS.auth.y - 95} textAnchor="middle" className="oa-popup-title">Can't continue</text>
                    <text x={POS.auth.x} y={POS.auth.y - 74} textAnchor="middle" className="oa-popup-body bad">redirect_uri is not registered</text>
                    <text x={POS.auth.x} y={POS.auth.y - 55} textAnchor="middle" className="oa-popup-note">no redirect, no code issued</text>
                  </>
                )}
              </motion.g>
            )}
          </AnimatePresence>

          {f.msg && <MessagePill key={player.index} msg={f.msg} />}
        </svg>
        </WideRegion>

        <Box className="oa-url">
          <span className="oa-url-label">URL bar</span>
          <code>{f.url ? <Url url={f.url} /> : <span className="oa-muted">photoprint.app</span>}</code>
        </Box>

        <div className="oa-holds">
          <Holds title="PhotoPrint holds" items={f.app} />
          {opts.attack !== 'none' && <Holds title="Attacker holds" items={f.att} bad />}
        </div>

        <Box className="oa-bind">
          <span className="oa-url-label">Which parameter binds which party</span>
          <ul className="oa-bind-list">
            {BINDINGS.map((b) => (
              <li key={b.param}>
                <i className="oa-swatch" style={{ background: DEFENCE_COLOR[b.defence] }} aria-hidden="true" />
                <code>{b.param}</code> ties {b.binds}; checked by {b.checkedBy}.
              </li>
            ))}
          </ul>
          <div className="oa-matrix-wrap" tabIndex={0} role="region" aria-label="What each defence stops, a table you can scroll sideways">
          <table className="oa-matrix">
            <caption>What each defence stops: every cell is a run of the same model, and each column switches on only the defences it names</caption>
            <thead>
              <tr>
                <th scope="col">Attack</th>
                {COLUMNS.map((c) => (
                  <th key={c.id} scope="col" className={sameDefences(c.defences, opts) ? 'now' : ''}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.attack} className={row.attack === opts.attack ? 'now' : ''}>
                  <th scope="row">{ATTACK_LABEL[row.attack]}</th>
                  {row.cells.map((cell) => {
                    const col = COLUMNS.find((c) => c.id === cell.column)!;
                    return (
                      <td key={cell.column} className={`${cell.summary.outcome === 'blocked' ? 'good' : 'bad'} ${row.attack === opts.attack && sameDefences(col.defences, opts) ? 'now' : ''}`}>
                        {cellText(cell.summary)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Box>
      </div>
    </StageFrame>
  );
}

const sameDefences = (a: Defences, b: Defences) => a.pkce === b.pkce && a.state === b.state && a.exactRedirect === b.exactRedirect;

function Holds({ title, items, bad = false }: { title: string; items: Held[]; bad?: boolean }) {
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

/** The URL with each parameter in its own hue: the same hues as the chips and the table above. */
function Url({ url }: { url: UrlView }) {
  if (!url.params.length) return <span>{url.base}</span>;
  return (
    <>
      <span>{url.base}?</span>
      {url.params.map(([k, v], i) => {
        const cls = k.startsWith('code_challenge') ? 'pkce' : k === 'state' ? 'state' : k === 'scope' ? 'scope' : k === 'code' ? 'code' : k === 'redirect_uri' ? 'redirect' : '';
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

function Node({ id, on, busy, sub, extra }: { id: NodeId; on: boolean; busy: boolean; sub?: string; extra?: string }) {
  const [title, defaultSub] = LABEL[id];
  return (
    <>
      {busy && <Pulse at={POS[id]} from={BUSY_RIPPLE.from} to={BUSY_RIPPLE.to} />}
      <SceneNode
        at={POS[id]}
        {...NODE}
        title={title}
        sub={extra ? <tspan className="oa-node-alert">{extra}</tspan> : (sub ?? defaultSub)}
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
