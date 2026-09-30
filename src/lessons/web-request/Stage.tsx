import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Packet, Pulse, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats, Toggle } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type ActorId = 'browser' | 'os' | 'resolver' | 'root' | 'tld' | 'auth' | 'server';
type Phase = 'dns' | 'tcp' | 'tls' | 'http' | 'render';

const PHASES: { id: Phase; label: string; color: string }[] = [
  { id: 'dns', label: 'DNS', color: 'var(--violet)' },
  { id: 'tcp', label: 'TCP', color: 'var(--info)' },
  { id: 'tls', label: 'TLS', color: 'var(--hi)' },
  { id: 'http', label: 'HTTP', color: 'var(--ok)' },
  { id: 'render', label: 'Render', color: 'var(--orange)' },
];
const phaseColor = (p: Phase) => PHASES.find((x) => x.id === p)!.color;

interface Actor {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
}

const ACTORS: Record<ActorId, Actor> = {
  browser: { x: 120, y: 248, w: 190, h: 110, label: 'Browser', sub: '' },
  os: { x: 120, y: 62, w: 132, h: 50, label: 'OS cache', sub: 'local DNS' },
  resolver: { x: 350, y: 150, w: 140, h: 50, label: 'Resolver', sub: 'ISP / 1.1.1.1' },
  root: { x: 585, y: 46, w: 104, h: 50, label: 'Root', sub: '“.”' },
  tld: { x: 710, y: 46, w: 104, h: 50, label: 'TLD', sub: '.com' },
  auth: { x: 846, y: 46, w: 128, h: 50, label: 'Authoritative', sub: 'ns1.example.com' },
  server: { x: 820, y: 248, w: 150, h: 64, label: 'Server', sub: '93.184.216.34' },
};

const EDGES: [ActorId, ActorId][] = [
  ['browser', 'os'],
  ['os', 'resolver'],
  ['resolver', 'root'],
  ['resolver', 'tld'],
  ['resolver', 'auth'],
];

interface Msg {
  from: ActorId;
  to: ActorId;
  label: string;
  phase: Phase;
  /** One-way latency this leg adds. */
  ms: number;
  say: ReactNode;
  /** Completes a round trip. */
  rtt?: boolean;
  ip?: boolean;
  tcpUp?: boolean;
  tlsUp?: boolean;
  paint?: boolean;
}

interface Opts {
  dnsCached: boolean;
  reuse: boolean;
  tls13: boolean;
}

function buildMessages({ dnsCached, reuse, tls13 }: Opts): Msg[] {
  const m: Msg[] = [];
  if (dnsCached) {
    m.push({ from: 'browser', to: 'os', label: 'example.com?', phase: 'dns', ms: 1,
      say: <>Browser asks the OS: <span className="hl violet">where is example.com?</span></> });
    m.push({ from: 'os', to: 'browser', label: '93.184.216.34', phase: 'dns', ms: 1, ip: true,
      say: <>Cache hit. The OS already knows the IP. <b>Zero network trips.</b></> });
  } else {
    m.push({ from: 'browser', to: 'os', label: 'example.com?', phase: 'dns', ms: 1,
      say: <>Browser cache miss. Ask the OS: <span className="hl violet">where is example.com?</span></> });
    m.push({ from: 'os', to: 'resolver', label: 'example.com?', phase: 'dns', ms: 10,
      say: <>OS doesn't know either. It asks the <b>recursive resolver</b> to do the legwork.</> });
    m.push({ from: 'resolver', to: 'root', label: 'example.com?', phase: 'dns', ms: 15,
      say: <>The resolver starts at the top of the tree: a <b>root</b> server.</> });
    m.push({ from: 'root', to: 'resolver', label: 'ask .com', phase: 'dns', ms: 15, rtt: true,
      say: <>Root: “No idea, but here are the <span className="hl violet">.com</span> servers.”</> });
    m.push({ from: 'resolver', to: 'tld', label: 'example.com?', phase: 'dns', ms: 15,
      say: <>Ask the <b>.com TLD</b> server.</> });
    m.push({ from: 'tld', to: 'resolver', label: 'ask ns1', phase: 'dns', ms: 15, rtt: true,
      say: <>TLD: “example.com's own nameserver is <span className="hl violet">ns1.example.com</span>.”</> });
    m.push({ from: 'resolver', to: 'auth', label: 'example.com?', phase: 'dns', ms: 20,
      say: <>Ask the <b>authoritative</b> nameserver: the source of truth.</> });
    m.push({ from: 'auth', to: 'resolver', label: '93.184.216.34', phase: 'dns', ms: 20, rtt: true,
      say: <>Answer: <span className="hl violet">93.184.216.34</span>.</> });
    m.push({ from: 'resolver', to: 'os', label: '93.184.216.34', phase: 'dns', ms: 10, rtt: true,
      say: <>Resolver caches it (so the next person is fast) and passes it back…</> });
    m.push({ from: 'os', to: 'browser', label: '93.184.216.34', phase: 'dns', ms: 1, ip: true,
      say: <>…to the browser. <b>Now</b> we know where to go.</> });
  }

  if (reuse) {
    m.push({ from: 'browser', to: 'browser', label: '', phase: 'tcp', ms: 0, tcpUp: true, tlsUp: true,
      say: <>There's already an open, encrypted connection. <span className="hl ok">Skip TCP and TLS entirely.</span></> });
  } else {
    m.push({ from: 'browser', to: 'server', label: 'SYN', phase: 'tcp', ms: 25,
      say: <>TCP handshake. <span className="hl info">SYN</span>: “Can we talk?”</> });
    m.push({ from: 'server', to: 'browser', label: 'SYN-ACK', phase: 'tcp', ms: 25, rtt: true,
      say: <><span className="hl info">SYN-ACK</span>: “Yes. Can you hear me?”</> });
    m.push({ from: 'browser', to: 'server', label: 'ACK', phase: 'tcp', ms: 0, tcpUp: true,
      say: <><span className="hl info">ACK</span>: “Loud and clear.” Connection open. It rides with the next packet, so it's ~free.</> });
    m.push({ from: 'browser', to: 'server', label: 'ClientHello', phase: 'tls', ms: 25,
      say: <>TLS. <span className="hl">ClientHello</span>: ciphers I support{tls13 ? ' + my half of the key' : ''}.</> });
    if (tls13) {
      m.push({ from: 'server', to: 'browser', label: 'ServerHello + cert', phase: 'tls', ms: 25, rtt: true,
        say: <>Server picks a cipher and sends its <b>certificate</b> + its key half.</> });
      m.push({ from: 'browser', to: 'server', label: 'Finished', phase: 'tls', ms: 0, tlsUp: true,
        say: <>Cert checks out; both sides derive the same secret. <span className="hl">Encrypted.</span> TLS 1.3 took 1 round trip.</> });
    } else {
      m.push({ from: 'server', to: 'browser', label: 'ServerHello + cert', phase: 'tls', ms: 25, rtt: true,
        say: <>Server picks a cipher and sends its <b>certificate</b>.</> });
      m.push({ from: 'browser', to: 'server', label: 'KeyExchange', phase: 'tls', ms: 25,
        say: <>Browser sends its key exchange. TLS 1.2 needs an <b>extra</b> trip for this.</> });
      m.push({ from: 'server', to: 'browser', label: 'Finished', phase: 'tls', ms: 25, rtt: true, tlsUp: true,
        say: <>Server Finished. <span className="hl">Encrypted.</span> TLS 1.2 took 2 round trips.</> });
    }
  }

  m.push({ from: 'browser', to: 'server', label: 'GET /', phase: 'http', ms: 25,
    say: <>Finally, the actual request: <span className="hl ok">GET /</span></> });
  m.push({ from: 'server', to: 'server', label: '', phase: 'http', ms: 30,
    say: <>Server does its work: routing, database queries, templates…</> });
  m.push({ from: 'server', to: 'browser', label: '200 OK', phase: 'http', ms: 25, rtt: true,
    say: <><span className="hl ok">200 OK</span>, and the HTML streams back.</> });
  m.push({ from: 'browser', to: 'browser', label: '', phase: 'render', ms: 60, paint: true,
    say: <>Browser parses HTML, fetches CSS & JS, lays out and <b>paints</b>.</> });
  return m;
}

type Elapsed = Record<Phase, number>;

interface WrFrame extends Frame {
  msg: Msg | null;
  elapsed: Elapsed;
  ms: number;
  rtts: number;
  ip: boolean;
  tcp: boolean;
  tls: boolean;
  painted: boolean;
}

function buildFrames(opts: Opts): { frames: WrFrame[]; total: number } {
  const msgs = buildMessages(opts);
  const elapsed: Elapsed = { dns: 0, tcp: 0, tls: 0, http: 0, render: 0 };
  let ms = 0;
  let rtts = 0;
  let ip = false;
  let tcp = false;
  let tls = false;
  let painted = false;

  const frames: WrFrame[] = [
    {
      msg: null, elapsed: { ...elapsed }, ms, rtts, ip, tcp, tls, painted,
      say: <>You type <span className="hl">example.com</span> and hit Enter. The browser has no idea where that is yet.</>,
    },
  ];

  for (const msg of msgs) {
    elapsed[msg.phase] += msg.ms;
    ms += msg.ms;
    if (msg.rtt) rtts++;
    ip ||= !!msg.ip;
    tcp ||= !!msg.tcpUp;
    tls ||= !!msg.tlsUp;
    painted ||= !!msg.paint;
    frames.push({ msg, elapsed: { ...elapsed }, ms, rtts, ip, tcp, tls, painted, say: msg.say, hold: msg.from === msg.to ? 1.2 : 1 });
  }

  const setup = elapsed.dns + elapsed.tcp + elapsed.tls;
  frames.push({
    ...frames[frames.length - 1],
    msg: null,
    hold: 2,
    say: (
      <>
        Page up in <span className="hl ok">{ms} ms</span> over <b>{rtts}</b> round trips.{' '}
        {setup > 0 ? (
          <>
            <span className="hl bad">{setup} ms</span> of that was setup before we even asked for the page.
          </>
        ) : (
          <>Zero setup cost. That's what caching and connection reuse buy you.</>
        )}
      </>
    ),
  });

  return { frames, total: ms };
}

export function Stage() {
  const [dnsCached, setDnsCached] = useState(false);
  const [reuse, setReuse] = useState(false);
  const [tls13, setTls13] = useState(true);
  const { frames, total } = useMemo(() => buildFrames({ dnsCached, reuse, tls13 }), [dnsCached, reuse, tls13]);
  const player = usePlayer(frames, { interval: 1150 });
  const f = player.frame;
  const msg = f.msg;
  const active = new Set<ActorId>(msg ? [msg.from, msg.to] : []);

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Elapsed" value={`${f.ms} ms`} color="var(--hi)" />
          <Stat label="Round trips" value={f.rtts} color="var(--info)" />
          <Stat
            label="Phase"
            value={msg ? PHASES.find((p) => p.id === msg.phase)!.label : f.painted ? 'Done' : '·'}
            color={msg ? phaseColor(msg.phase) : 'var(--ok)'}
          />
        </Stats>
      }
      legend={<Legend items={PHASES.map((p) => ({ color: p.color, label: p.label }))} />}
      controls={
        <Controls>
          <Toggle label="DNS" value={dnsCached} onChange={setDnsCached} off="Cold lookup" on="Cached" />
          <Toggle label="Connection" value={reuse} onChange={setReuse} off="New" on="Reused (keep-alive)" />
          <Toggle label="TLS version" value={tls13} onChange={setTls13} off="TLS 1.2" on="TLS 1.3" />
        </Controls>
      }
    >
      <div className="wr">
        <svg className="wr-scene" viewBox="0 0 920 320" role="img" aria-label="Network diagram of a web request">
          <text x={250} y={36} className="scene-zone">① FINDING THE ADDRESS</text>
          <text x={470} y={300} textAnchor="middle" className="scene-zone">② TALKING TO IT</text>

          {EDGES.map(([a, b]) => (
            <line
              key={a + b}
              x1={ACTORS[a].x}
              y1={ACTORS[a].y}
              x2={ACTORS[b].x}
              y2={ACTORS[b].y}
              className={`scene-edge wr-edge ${active.has(a) && active.has(b) ? 'on' : ''}`}
            />
          ))}

          {/* The browser ↔ server link changes character as the connection comes up. */}
          <line
            x1={ACTORS.browser.x + ACTORS.browser.w / 2}
            y1={ACTORS.browser.y}
            x2={ACTORS.server.x - ACTORS.server.w / 2}
            y2={ACTORS.server.y}
            className={`wr-link ${f.tls ? 'tls' : f.tcp ? 'tcp' : ''}`}
          />
          <AnimatePresence>
            {f.tls && (
              <motion.g
                key="lock"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <rect x={454} y={226} width={32} height={22} rx={6} className="wr-lock-bg" />
                <text x={470} y={242} textAnchor="middle" className="wr-lock">
                  🔒
                </text>
              </motion.g>
            )}
          </AnimatePresence>

          {(Object.keys(ACTORS) as ActorId[])
            .filter((id) => id !== 'browser')
            .map((id) => (
              <ActorBox key={id} actor={ACTORS[id]} on={active.has(id)} color={msg ? phaseColor(msg.phase) : ''} />
            ))}
          <BrowserBox frame={f} on={active.has('browser')} color={msg ? phaseColor(msg.phase) : ''} />

          {msg && msg.from === msg.to && (
            <Pulse key={`busy-${player.index}`} at={ACTORS[msg.from]} {...BUSY_RIPPLE} color={phaseColor(msg.phase)} />
          )}

          {msg && msg.from !== msg.to && <MessagePill key={player.index} msg={msg} />}
        </svg>

        <Waterfall elapsed={f.elapsed} total={total} />
      </div>
    </StageFrame>
  );
}

/** "Doing work here" ripple for a step that stays on one actor. */
const BUSY_RIPPLE = { from: 30, to: 80, duration: 1, opacity: 0.9 } as const;
/** Waterfall segments grow a touch softer than SPRING.soft. */
const SEGMENT_SPRING = { type: 'spring', stiffness: 160, damping: 24 } as const;

function ActorBox({ actor, on, color }: { actor: Actor; on: boolean; color: string }) {
  const { x, y, w, h, label, sub } = actor;
  return <SceneNode at={{ x, y }} w={w} h={h} title={label} sub={sub} on={on} color={on ? color : undefined} />;
}
function BrowserBox({ frame, on, color }: { frame: WrFrame; on: boolean; color: string }) {
  const { x, y, w, h } = ACTORS.browser;
  const left = x - w / 2;
  const top = y - h / 2;
  const bars = [0.9, 0.55, 0.75, 0.4];
  return (
    <g className={`scene-node wr-browser ${on ? 'on' : ''}`} style={on ? { ['--c' as string]: color } : undefined}>
      <rect x={left} y={top} width={w} height={h} rx={10} className="scene-node-box" />
      <circle cx={left + 12} cy={top + 12} r={3} fill="var(--bad)" />
      <circle cx={left + 22} cy={top + 12} r={3} fill="var(--amber)" />
      <circle cx={left + 32} cy={top + 12} r={3} fill="var(--ok)" />
      <rect x={left + 42} y={top + 5} width={w - 50} height={15} rx={7} className="wr-urlbar" />
      <text x={left + 52} y={top + 16} className="wr-url">
        {frame.tls ? '🔒 ' : ''}example.com
      </text>
      <AnimatePresence>
        {frame.ip && (
          <motion.text
            key="ip"
            x={left + 12}
            y={top + 36}
            className="wr-ip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            → 93.184.216.34
          </motion.text>
        )}
      </AnimatePresence>
      {bars.map((b, i) => (
        <motion.rect
          key={i}
          x={left + 12}
          y={top + 46 + i * 14}
          height={8}
          rx={4}
          className={i === 0 ? 'wr-skel wr-skel-h' : 'wr-skel'}
          initial={false}
          animate={{ width: frame.painted ? (w - 24) * b : 0, opacity: frame.painted ? 1 : 0 }}
          transition={{ delay: frame.painted ? i * 0.15 : 0, duration: 0.4 }}
        />
      ))}
      {!frame.painted && (
        <text x={x} y={top + 76} textAnchor="middle" className="scene-node-sub">
          {frame.ip ? 'waiting for page…' : 'where is example.com?'}
        </text>
      )}
    </g>
  );
}

/** A pill that travels to the next actor and stays there, drawing its route behind it. */
function MessagePill({ msg }: { msg: Msg }) {
  return (
    <Packet
      path={[ACTORS[msg.from], ACTORS[msg.to]]}
      label={msg.label}
      color={phaseColor(msg.phase)}
      arrive="stay"
      trail
      duration={0.7}
      height={24}
      charW={6.6}
      pad={20}
    />
  );
}
function Waterfall({ elapsed, total }: { elapsed: Elapsed; total: number }) {
  return (
    <Box className="wr-fall">
      <div className="wr-fall-head">
        <span>Waterfall</span>
        <span className="wr-fall-total">
          {Object.values(elapsed).reduce((a, b) => a + b, 0)} / {total} ms
        </span>
      </div>
      <div className="wr-fall-bar">
        {PHASES.map((p) => (
          <motion.div
            key={p.id}
            className="wr-seg"
            style={{ background: p.color }}
            initial={false}
            animate={{ width: `${total ? (elapsed[p.id] / total) * 100 : 0}%` }}
            transition={SEGMENT_SPRING}
          />
        ))}
      </div>
      <div className="wr-fall-legend">
        {PHASES.map((p) => (
          <span key={p.id} className={elapsed[p.id] ? 'on' : ''}>
            <i style={{ background: p.color }} />
            {p.label} <b>{elapsed[p.id]}ms</b>
          </span>
        ))}
      </div>
    </Box>
  );
}
