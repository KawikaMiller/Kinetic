import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { pointAlong } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type Msg } from './frames';
import type { Model } from './policy';
import { breachedSystems, SERVICES, type NodeId, type PillKind } from './replay';
import './styles.css';

const COLOR: Record<PillKind, string> = { user: 'var(--info)', svc: 'var(--violet)', bad: 'var(--bad)' };
const POS: Record<NodeId, { x: number; y: number }> = {
  attacker: { x: 80, y: 70 },
  bob: { x: 300, y: 120 },
  alice: { x: 300, y: 280 },
  gate: { x: 470, y: 200 },
  wiki: { x: 690, y: 70 },
  hr: { x: 690, y: 170 },
  pay: { x: 690, y: 280 },
  db: { x: 880, y: 280 },
  wall: { x: 200, y: 70 },
};
const NAME: Partial<Record<NodeId, [string, string]>> = {
  attacker: ['🕵 Attacker', 'on the internet'],
  bob: ['💻 Bob’s laptop', 'engineering'],
  alice: ['💻 Alice’s laptop', 'finance'],
  wiki: ['📚 Wiki', 'internal docs'],
  hr: ['🧾 HR app', 'salaries'],
  pay: ['💳 Payments', 'service'],
  db: ['🗄 Customer DB', 'crown jewels'],
};
/** The narrowest width at which the 960-unit network diagram keeps its text legible. */
const SCENE_MIN_WIDTH = 900;

export function Stage() {
  const [mode, setMode] = useState<Model>('moat');
  const frames = useMemo(() => buildFrames(mode), [mode]);
  const player = usePlayer(frames, { interval: 2300 });
  const f = player.frame;
  const zt = mode === 'zt';
  const { state } = f;
  const reached = breachedSystems(state).length;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Systems breached" value={`${reached}/${SERVICES.length}`} color={reached ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Requests denied" value={state.denials} color="var(--ok)" />
          <Stat label="Data exfiltrated" value={state.exfil ? 'yes' : 'no'} color={state.exfil ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.user, label: 'user request', shape: 'dot' },
            { color: COLOR.svc, label: 'service-to-service (mTLS)', shape: 'dot' },
            { color: COLOR.bad, label: 'attacker request / compromised', shape: 'dot' },
            { color: 'var(--ok)', label: 'denied (green ✕)', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Network model"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'moat', label: 'Castle & moat' },
              { value: 'zt', label: 'Zero trust' },
            ]}
          />
        </Controls>
      }
    >
      <div className="zt">
        <WideRegion minWidth={SCENE_MIN_WIDTH} label="Network diagram: scroll sideways to see all of it">
        <svg className="zt-scene" viewBox="0 0 960 350" role="img" aria-label="Network diagram of an attack">
          {!zt && (
            <>
              <rect x={215} y={20} width={735} height={320} rx={20} className="zt-inside" />
              <text x={935} y={42} textAnchor="end" className="scene-zone">INSIDE THE NETWORK = TRUSTED</text>
              <rect x={196} y={20} width={14} height={320} rx={4} className="zt-wall" />
              <text x={203} y={352} textAnchor="middle" className="scene-zone">firewall + VPN</text>
            </>
          )}
          {zt && <text x={935} y={30} textAnchor="end" className="scene-zone zt-zone-ok">NO TRUSTED NETWORK · VERIFY EVERY REQUEST</text>}

          {/* static links */}
          {zt
            ? (['bob', 'alice', 'attacker'] as NodeId[]).map((n) => <line key={n} x1={POS[n].x} y1={POS[n].y} x2={POS.gate.x} y2={POS.gate.y} className="scene-edge" />)
            : (['wiki', 'hr', 'pay'] as NodeId[]).map((s) => <line key={s} x1={POS.bob.x} y1={POS.bob.y} x2={POS[s].x} y2={POS[s].y} className="scene-edge" />)}
          {zt && (['wiki', 'hr', 'pay'] as NodeId[]).map((s) => <line key={s} x1={POS.gate.x} y1={POS.gate.y} x2={POS[s].x} y2={POS[s].y} className="scene-edge" />)}
          <line x1={POS.pay.x} y1={POS.pay.y} x2={POS.db.x} y2={POS.db.y} className={`scene-edge ${zt ? 'zt-edge-mtls' : ''}`} />

          {zt && (
            <g className="zt-gate">
              <Pulse mode="breathe" at={POS.gate} from={62} to={72} color="var(--hi)" opacity={0.4} strokeWidth={1} duration={3} />
              <circle cx={POS.gate.x} cy={POS.gate.y} r={62} />
              <text x={POS.gate.x} y={POS.gate.y - 6} textAnchor="middle" className="zt-gate-title">🛡 Access proxy</text>
              <text x={POS.gate.x} y={POS.gate.y + 10} textAnchor="middle" className="zt-gate-sub">+ policy engine</text>
              <text x={POS.gate.x} y={POS.gate.y + 82} textAnchor="middle" className="zt-gate-sub">checks who · device · context</text>
            </g>
          )}

          {(Object.keys(NAME) as NodeId[]).map((n) => (
            <Node key={n} id={n} owned={state.owned.includes(n)} zt={zt} creds={n === 'bob' && state.creds} />
          ))}

          {f.msgs.map((m, i) => (
            <MessagePill key={`${player.index}-${i}`} msg={m} delay={i * 0.12} />
          ))}
        </svg>
        </WideRegion>

        <Box className="zt-log">
          <span className="zt-log-title">{zt ? 'Policy decision log' : 'Access log'}</span>
          {!zt && <span className="empty-note">(nothing checks internal requests, so there's nothing to log)</span>}
          <AnimatePresence initial={false}>
            {zt &&
              state.log.map((d, i) => (
                <motion.div
                  key={d.seq}
                  layout
                  className={`zt-row ${d.allow ? 'allow' : 'deny'}`}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: i === 0 ? 1 : 0.6, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <b>{d.allow ? 'ALLOW' : 'DENY'}</b>
                  <code>{d.who}</code>
                  <span>→ {d.what}</span>
                  <i>{d.why}</i>
                </motion.div>
              ))}
          </AnimatePresence>
          {zt && !state.log.length && <span className="empty-note">no requests yet</span>}
        </Box>
        <ProvenanceRow>
          <Provenance kind="scripted">
            the attack is one fixed script of attempts, the same for both models; each attempt's outcome, what the attacker owns and the counts above are computed by one
            decision function from the request's identity, device, role, certificate and where it came from
          </Provenance>
          <Provenance kind="invented">the people, the systems and the access table (who may reach what) are made up for this lesson</Provenance>
          <Provenance kind="from-memory">
            BeyondCorp, Cloudflare Access, Zscaler, Google IAP, Istio, Linkerd and SPIFFE/SPIRE are named from memory: verify against each project's documentation
          </Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

const NODE = { w: 152, h: 50, rx: 11 } as const;

function Node({ id, owned, zt, creds }: { id: NodeId; owned: boolean; zt: boolean; creds: boolean }) {
  const { x, y } = POS[id];
  const [title, sub] = NAME[id]!;
  const isService = (SERVICES as readonly string[]).includes(id);
  return (
    <SceneNode
      at={POS[id]}
      {...NODE}
      title={title}
      sub={owned && id !== 'attacker' ? (id === 'bob' ? 'compromised' : 'breached') : sub}
      variant={owned ? 'bad' : 'default'}
      className={id === 'attacker' ? 'zt-attacker' : undefined}
    >
      {zt && isService && (
        <text x={x + 64} y={y - 14} textAnchor="middle" className="zt-lock">🔒</text>
      )}
      {creds && (
        <text x={x} y={y + 40} textAnchor="middle" className="zt-creds">🔑 stolen payments password</text>
      )}
    </SceneNode>
  );
}

/** Denied packets stop this fraction short of the checkpoint, then burst. */
const DENY_SHORTFALL = 0.18;
/** Seconds per hop, plus a little extra to settle. */
const HOP_SECONDS = 0.7;

/** Extra seconds the pill lingers (and fades) after its last hop. */
const LINGER_SECONDS = 0.5;

function MessagePill({ msg, delay }: { msg: Msg; delay: number }) {
  const pts = msg.path.map((p) => POS[p]);
  const last = pts[pts.length - 1];
  const stop = msg.denied ? pointAlong(last, pts[pts.length - 2], DENY_SHORTFALL) : last;
  const dur = HOP_SECONDS * (pts.length - 1) + 0.3;
  return (
    <>
      <Packet
        path={pts}
        stopAt={msg.denied ? 1 - DENY_SHORTFALL : undefined}
        keyframes="even"
        label={msg.label}
        color={COLOR[msg.kind]}
        duration={dur + LINGER_SECONDS}
        delay={delay}
        scaleIn={null}
        height={22}
        charW={6.2}
      />
      {msg.denied && (
        <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: [0, 1, 1], scale: [0.3, 1.2, 1] }} transition={{ delay: delay + dur, duration: 0.4 }} style={{ transformOrigin: `${stop.x}px ${stop.y}px` }}>
          <circle cx={stop.x} cy={stop.y} r={16} className="zt-deny" />
          <text x={stop.x} y={stop.y + 5} textAnchor="middle" className="zt-deny-x">✕</text>
        </motion.g>
      )}
    </>
  );
}