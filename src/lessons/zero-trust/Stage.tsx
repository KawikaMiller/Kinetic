import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type Mode = 'moat' | 'zt';
type NodeId = 'attacker' | 'bob' | 'alice' | 'gate' | 'wiki' | 'hr' | 'pay' | 'db' | 'wall';
type Kind = 'user' | 'svc' | 'bad' | 'ok';

const COLOR: Record<Kind, string> = { user: 'var(--info)', svc: 'var(--violet)', bad: 'var(--bad)', ok: 'var(--ok)' };
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
const SERVICES: NodeId[] = ['wiki', 'hr', 'pay', 'db'];
const NAME: Partial<Record<NodeId, [string, string]>> = {
  attacker: ['🕵 Attacker', 'on the internet'],
  bob: ['💻 Bob’s laptop', 'engineering'],
  alice: ['💻 Alice’s laptop', 'finance'],
  wiki: ['📚 Wiki', 'internal docs'],
  hr: ['🧾 HR app', 'salaries'],
  pay: ['💳 Payments', 'service'],
  db: ['🗄 Customer DB', 'crown jewels'],
};

interface Msg {
  path: NodeId[];
  label: string;
  kind: Kind;
  denied?: boolean;
}

interface Decision {
  allow: boolean;
  who: string;
  what: string;
  why: string;
}

interface ZFrame extends Frame {
  msgs: Msg[];
  bobPwned: boolean;
  owned: NodeId[];
  creds: boolean;
  exfil: boolean;
  log: Decision[];
  denials: number;
}

function build(mode: Mode): ZFrame[] {
  const out: ZFrame[] = [];
  let cur: ZFrame = { msgs: [], bobPwned: false, owned: [], creds: false, exfil: false, log: [], denials: 0 };
  const push = (p: Partial<ZFrame> & { say: ReactNode }, decision?: Decision) => {
    cur = { ...cur, msgs: [], ...p };
    if (decision) cur = { ...cur, log: [decision, ...cur.log].slice(0, 6), denials: cur.denials + (decision.allow ? 0 : 1) };
    out.push(cur);
  };

  if (mode === 'moat') {
    push({ say: <><b>Castle and moat.</b> A firewall and VPN guard the edge. Once you're <b>inside</b>, the network trusts you.</> });
    push({ msgs: [{ path: ['attacker', 'wall'], label: 'connect to wiki', kind: 'bad', denied: true }],
      say: <>The attacker tries to reach the wiki straight from the internet. <span className="hl ok">Blocked by the firewall.</span> The wall works against the front door.</> });
    push({ msgs: [{ path: ['attacker', 'bob'], label: '✉ Invoice.pdf.exe', kind: 'bad' }], bobPwned: true, owned: ['bob'],
      say: <>So they phish Bob instead. He opens the attachment. <span className="hl bad">Bob's laptop is compromised</span>, and it's already on the VPN.</> });
    push({ msgs: SERVICES.map((s) => ({ path: ['bob', s] as NodeId[], label: 'scan', kind: 'bad' as Kind })), owned: ['bob'],
      say: <>From inside, the network is <b>flat</b>: the attacker scans and can reach <span className="hl bad">every system</span>. Nothing asks who they are.</> });
    push({ msgs: [{ path: ['bob', 'wiki'], label: 'GET /runbooks', kind: 'bad' }], owned: ['bob', 'wiki'], creds: true,
      say: <>The wiki trusts anything inside the network. A runbook contains the <span className="hl bad">payments admin password</span>.</> });
    push({ msgs: [{ path: ['bob', 'pay'], label: 'login as admin', kind: 'bad' }], owned: ['bob', 'wiki', 'pay'], creds: true,
      say: <>Lateral movement: the stolen password opens the <b>payments service</b>, which accepts internal traffic by IP address.</> });
    push({ msgs: [{ path: ['pay', 'db'], label: 'SELECT * FROM customers', kind: 'bad' }], owned: ['bob', 'wiki', 'pay', 'db'], creds: true,
      say: <>Payments has full access to the customer database, so now the attacker does too.</> });
    push({ msgs: [{ path: ['db', 'attacker'], label: '2.1M rows ⟶', kind: 'bad' }], owned: ['bob', 'wiki', 'pay', 'db'], creds: true, exfil: true, hold: 1.5,
      say: <><span className="hl bad">Data exfiltrated.</span> One phished laptop became the whole company. The wall was never the problem; <b>trusting the inside</b> was.</> });
    push({ owned: ['bob', 'wiki', 'pay', 'db'], exfil: true, creds: true, hold: 2,
      say: <>Switch to <span className="hl ok">Zero trust</span> and replay the exact same attack.</> });
    return out;
  }

  push({ say: <><b>Zero trust:</b> there is no trusted inside. Every request goes through an <span className="hl">access proxy + policy engine</span> that checks <b>who</b>, <b>which device</b>, and <b>context</b>, every time.</> });
  push({ msgs: [{ path: ['bob', 'gate', 'wiki'], label: 'GET /wiki', kind: 'user' }],
    say: <>A normal Monday. Bob: SSO + MFA <span className="hl ok">✓</span>, managed and patched laptop <span className="hl ok">✓</span>, engineers may read the wiki <span className="hl ok">✓</span>. Allowed, to the wiki only.</> },
    { allow: true, who: 'bob@corp', what: 'wiki', why: 'MFA ✓ · device healthy ✓ · role engineering' });
  push({ msgs: [{ path: ['attacker', 'bob'], label: '✉ Invoice.pdf.exe', kind: 'bad' }], bobPwned: true, owned: ['bob'],
    say: <>Same phish. Bob still clicks. <b>Zero trust doesn't stop the phish</b>; it limits what happens next.</> });
  push({ msgs: [{ path: ['bob', 'gate', 'wiki'], label: 'GET /runbooks', kind: 'bad', denied: true }], bobPwned: true, owned: ['bob'],
    say: <>The laptop's security agent flagged the malware, so the device fails its posture check. <span className="hl ok">Denied</span>, even with Bob's valid login. Access is <b>re-checked on every request</b>.</> },
    { allow: false, who: 'bob@corp', what: 'wiki', why: 'device posture: EDR alert' });
  push({ msgs: [{ path: ['attacker', 'gate', 'hr'], label: 'Bob’s stolen token → HR', kind: 'bad', denied: true }], bobPwned: true, owned: ['bob'],
    say: <>The attacker replays Bob's stolen session from their own machine, aiming at HR. Unknown device <span className="hl bad">✗</span>, and engineers can't see HR anyway: <span className="hl ok">least privilege</span>.</> },
    { allow: false, who: 'bob@corp', what: 'hr', why: 'unenrolled device · role not permitted' });
  push({ msgs: [{ path: ['pay', 'db'], label: 'mTLS · spiffe://corp/payments', kind: 'svc' }], bobPwned: true, owned: ['bob'],
    say: <>Services authenticate each other too. Payments talks to the DB over <span className="hl violet">mutual TLS</span>, proving a <b>workload identity</b>. Policy: only payments may read customers.</> },
    { allow: true, who: 'spiffe://corp/payments', what: 'customer-db', why: 'valid workload cert · policy allows' });
  push({ msgs: [{ path: ['attacker', 'db'], label: 'connect to DB', kind: 'bad', denied: true }], bobPwned: true, owned: ['bob'],
    say: <>Trying the database directly? No workload certificate, so the <span className="hl ok">TLS handshake fails</span>. There's no network path in on trust alone.</> },
    { allow: false, who: 'unknown', what: 'customer-db', why: 'no client certificate' });
  push({ bobPwned: true, owned: ['bob'], hold: 1.3,
    say: <>Every decision is logged. A burst of denials fires an alert: security <b>revokes Bob's sessions</b> and quarantines the laptop.</> },
    { allow: false, who: 'bob@corp', what: '*', why: 'sessions revoked · device quarantined' });
  push({ bobPwned: true, owned: ['bob'], hold: 2,
    say: <>Blast radius: <span className="hl ok">one laptop, zero systems</span>. Never trust the network, verify explicitly, grant least privilege, and assume breach.</> });
  return out;
}

export function Stage() {
  const [mode, setMode] = useState<Mode>('moat');
  const frames = useMemo(() => build(mode), [mode]);
  const player = usePlayer(frames, { interval: 2300 });
  const f = player.frame;
  const zt = mode === 'zt';
  const reached = f.owned.filter((n) => SERVICES.includes(n)).length;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Systems breached" value={`${reached}/4`} color={reached ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Requests denied" value={f.denials} color="var(--ok)" />
          <Stat label="Data exfiltrated" value={f.exfil ? 'yes' : 'no'} color={f.exfil ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.user, label: 'user request', shape: 'dot' },
            { color: COLOR.svc, label: 'service-to-service (mTLS)', shape: 'dot' },
            { color: COLOR.bad, label: 'attacker / compromised', shape: 'dot' },
            { color: COLOR.ok, label: 'allowed / blocked correctly', shape: 'dot' },
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
        <svg className="zt-scene" viewBox="0 0 960 350" role="img" aria-label="Network diagram of an attack">
          {!zt && (
            <>
              <rect x={215} y={20} width={735} height={320} rx={20} className="zt-inside" />
              <text x={935} y={42} textAnchor="end" className="zt-zone">INSIDE THE NETWORK = TRUSTED</text>
              <rect x={196} y={20} width={14} height={320} rx={4} className="zt-wall" />
              <text x={203} y={352} textAnchor="middle" className="zt-zone">firewall + VPN</text>
            </>
          )}
          {zt && <text x={935} y={30} textAnchor="end" className="zt-zone ok">NO TRUSTED NETWORK · VERIFY EVERY REQUEST</text>}

          {/* static links */}
          {zt
            ? (['bob', 'alice', 'attacker'] as NodeId[]).map((n) => <line key={n} x1={POS[n].x} y1={POS[n].y} x2={POS.gate.x} y2={POS.gate.y} className="zt-edge" />)
            : (['wiki', 'hr', 'pay'] as NodeId[]).map((s) => <line key={s} x1={POS.bob.x} y1={POS.bob.y} x2={POS[s].x} y2={POS[s].y} className="zt-edge" />)}
          {zt && (['wiki', 'hr', 'pay'] as NodeId[]).map((s) => <line key={s} x1={POS.gate.x} y1={POS.gate.y} x2={POS[s].x} y2={POS[s].y} className="zt-edge" />)}
          <line x1={POS.pay.x} y1={POS.pay.y} x2={POS.db.x} y2={POS.db.y} className={`zt-edge ${zt ? 'mtls' : ''}`} />

          {zt && (
            <g className="zt-gate">
              <motion.circle cx={POS.gate.x} cy={POS.gate.y} fill="none" stroke="var(--hi)" strokeOpacity={0.4} initial={{ r: 62 }} animate={{ r: [62, 72, 62] }} transition={{ duration: 3, repeat: Infinity }} />
              <circle cx={POS.gate.x} cy={POS.gate.y} r={62} />
              <text x={POS.gate.x} y={POS.gate.y - 6} textAnchor="middle" className="zt-gate-title">🛡 Access proxy</text>
              <text x={POS.gate.x} y={POS.gate.y + 10} textAnchor="middle" className="zt-gate-sub">+ policy engine</text>
              <text x={POS.gate.x} y={POS.gate.y + 82} textAnchor="middle" className="zt-gate-sub">checks who · device · context</text>
            </g>
          )}

          {(Object.keys(NAME) as NodeId[]).map((n) => (
            <Node key={n} id={n} owned={f.owned.includes(n)} zt={zt} creds={n === 'bob' && f.creds} />
          ))}

          {f.msgs.map((m, i) => (
            <Packet key={`${player.index}-${i}`} msg={m} delay={i * 0.12} />
          ))}
        </svg>

        <div className="zt-log">
          <span className="zt-log-title">{zt ? 'Policy decision log' : 'Access log'}</span>
          {!zt && <span className="zt-log-empty">(nothing checks internal requests, so there's nothing to log)</span>}
          <AnimatePresence initial={false}>
            {zt &&
              f.log.map((d, i) => (
                <motion.div
                  key={`${d.who}-${d.what}-${d.why}`}
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
          {zt && !f.log.length && <span className="zt-log-empty">no requests yet</span>}
        </div>
      </div>
    </StageFrame>
  );
}

function Node({ id, owned, zt, creds }: { id: NodeId; owned: boolean; zt: boolean; creds: boolean }) {
  const { x, y } = POS[id];
  const [title, sub] = NAME[id]!;
  const isService = SERVICES.includes(id);
  return (
    <g className={`zt-node ${owned ? 'owned' : ''} ${id === 'attacker' ? 'attacker' : ''}`}>
      <rect x={x - 76} y={y - 25} width={152} height={50} rx={11} />
      <text x={x} y={y - 3} textAnchor="middle" className="zt-node-title">{title}</text>
      <text x={x} y={y + 13} textAnchor="middle" className="zt-node-sub">
        {owned && id !== 'attacker' ? (id === 'bob' ? 'compromised' : 'breached') : sub}
      </text>
      {zt && isService && (
        <text x={x + 64} y={y - 14} textAnchor="middle" className="zt-lock">🔒</text>
      )}
      {creds && (
        <text x={x} y={y + 40} textAnchor="middle" className="zt-creds">🔑 stolen payments password</text>
      )}
    </g>
  );
}

function Packet({ msg, delay }: { msg: Msg; delay: number }) {
  const pts = msg.path.map((p) => POS[p]);
  const last = pts[pts.length - 1];
  // Denied packets stop just short of the checkpoint and burst.
  const stop = msg.denied ? { x: last.x - (last.x - pts[pts.length - 2].x) * 0.18, y: last.y - (last.y - pts[pts.length - 2].y) * 0.18 } : last;
  const xs = [...pts.slice(0, -1).map((p) => p.x), stop.x];
  const ys = [...pts.slice(0, -1).map((p) => p.y), stop.y];
  const w = msg.label.length * 6.2 + 20;
  const dur = 0.7 * (pts.length - 1) + 0.3;
  return (
    <>
      <motion.g
        initial={{ x: xs[0], y: ys[0], opacity: 0 }}
        animate={{ x: [...xs, stop.x], y: [...ys, stop.y], opacity: [0, ...xs.slice(1).map(() => 1), msg.denied ? 0 : 0] }}
        transition={{ duration: dur + 0.5, delay, ease: 'easeInOut' }}
      >
        <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill={COLOR[msg.kind]} className="zt-packet" />
        <text x={0} y={4} textAnchor="middle" className="zt-packet-text">{msg.label}</text>
      </motion.g>
      {msg.denied && (
        <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: [0, 1, 1], scale: [0.3, 1.2, 1] }} transition={{ delay: delay + dur, duration: 0.4 }} style={{ transformOrigin: `${stop.x}px ${stop.y}px` }}>
          <circle cx={stop.x} cy={stop.y} r={16} className="zt-deny" />
          <text x={stop.x} y={stop.y + 5} textAnchor="middle" className="zt-deny-x">✕</text>
        </motion.g>
      )}
    </>
  );
}
