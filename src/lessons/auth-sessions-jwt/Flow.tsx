import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { useAsyncValue } from '../../core/useAsyncValue';
import { flowFrames, SID, type Kind, type Msg, type NodeId } from './frames';
import { HEADER, LESSON_NOW, PAYLOAD, SERVER_SECRET, signJwt } from './jwt';
import { TokenString } from './JwtParts';

const COLOR: Record<Kind, string> = { req: 'var(--info)', store: 'var(--violet)', ok: 'var(--ok)', bad: 'var(--bad)' };
const POS: Record<NodeId, { x: number; y: number }> = {
  browser: { x: 130, y: 95 },
  server: { x: 470, y: 95 },
  store: { x: 800, y: 95 },
  attacker: { x: 130, y: 205 },
};

export function Flow({ kind, modePicker }: { kind: 'session' | 'jwt'; modePicker: ReactNode }) {
  const frames = useMemo(() => flowFrames(kind), [kind]);
  const player = usePlayer(frames, { interval: 1700 });
  // The payload never changes in this lane, so it's signed once.
  const jwt = useAsyncValue(() => signJwt(PAYLOAD, SERVER_SECRET), 'issued');
  const f = player.frame;
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : f.busy ? [f.busy] : []);
  const nodes: NodeId[] = kind === 'session' ? ['browser', 'server', 'store'] : ['browser', 'server'];

  return (
    <StageFrame minWidth={760}
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
      controls={
        <Controls>
          {modePicker}
          <Hint block>
            {kind === 'session'
              ? 'A scripted flow. The session ID is shortened for display; real ones carry at least 64 bits of randomness.'
              : `A scripted flow around a real HS256 token, signed in your browser with a made-up demo key. The lesson's clock is fixed ${(LESSON_NOW - PAYLOAD.iat) / 60} minutes after the token was issued, so it hasn't expired yet.`}
          </Hint>
        </Controls>
      }
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
          {f.msg && <MessagePill key={player.index} msg={f.msg} />}
        </svg>

        <div className="aj-panels">
          <Box className="aj-panel">
            <span className="aj-panel-title">Browser is holding</span>
            {f.holding === 'none' && <span className="empty-note">nothing yet</span>}
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
          </Box>

          {kind === 'session' ? (
            <Box className="aj-panel">
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
                {!f.rows.length && <span className="empty-note">empty</span>}
              </div>
            </Box>
          ) : (
            <Box className={`aj-panel ${f.token ? '' : 'dim'}`}>
              <span className="aj-panel-title">Decoded token (anyone can do this)</span>
              {f.token ? <Decoded /> : <span className="empty-note">no token yet</span>}
            </Box>
          )}
        </div>
      </div>
    </StageFrame>
  );
}

const NODE_LABEL: Record<NodeId, string> = { browser: '🌐 Browser', server: '⚙ Server', store: '🗄 Session store', attacker: '🕵 Attacker' };
/** Node boxes are 160×52 with the label centred; the busy ripple grows from 40 to 90. */
const NODE = { w: 160, h: 52, rx: 12, titleDy: 5 } as const;
const BUSY_RIPPLE = { from: 40, to: 90, duration: 1 } as const;

function NodeBox({ id, on, busy }: { id: NodeId; on: boolean; busy: boolean }) {
  return (
    <>
      {busy && <Pulse at={POS[id]} {...BUSY_RIPPLE} />}
      <SceneNode
        at={POS[id]}
        {...NODE}
        title={NODE_LABEL[id]}
        on={on}
        tone={id === 'store' ? 'violet' : undefined}
        className={id === 'attacker' ? 'aj-attacker' : id === 'store' ? 'aj-store' : undefined}
      />
    </>
  );
}

/** Travel, pause, fade out on arrival so the target stays readable. */
const PILL_TIMING = { travelEnd: 0.65, fadeStart: 0.82, fadeInEnd: 0.1 } as const;

function MessagePill({ msg }: { msg: Msg }) {
  return (
    <Packet
      path={[POS[msg.from], POS[msg.to]]}
      label={msg.label}
      color={COLOR[msg.kind]}
      duration={1.3}
      height={24}
      charW={6.3}
      pad={22}
      timing={PILL_TIMING}
    />
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
