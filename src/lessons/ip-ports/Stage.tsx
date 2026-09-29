import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

// Documentation address ranges (RFC 5737 / RFC 1918), so nothing here is a real host.
const SERVER_IP = '203.0.113.10';
const ROUTER_WAN = '198.51.100.7';
const LOOPBACK = '127.0.0.1';

type Dev = 'laptop' | 'phone';
type Dest = 'server' | 'localhost';
type Anchor = Dev | 'router' | 'server' | 'lo' | 'lo-phone' | `port-${number}`;
type Kind = 'req' | 'resp' | 'rst' | 'lo';

const DEVICES: Record<Dev, { name: string; ip: string }> = {
  laptop: { name: 'Laptop', ip: '192.168.1.20' },
  phone: { name: 'Phone', ip: '192.168.1.21' },
};

/** What each host is listening on. */
const SERVER_PORTS: Record<number, string> = { 443: 'web server (HTTPS)', 22: 'sshd (remote login)', 5432: 'postgres' };
const SLOTS = [443, 22, 5432, 8080];
const LOCAL_PORTS: Record<Dev, Record<number, string>> = { laptop: { 3000: 'dev server' }, phone: {} };

const SLOT_Y = (port: number) => 118 + SLOTS.indexOf(port) * 54;

const ANCHORS: Record<string, { x: number; y: number }> = {
  laptop: { x: 140, y: 96 },
  lo: { x: 140, y: 142 },
  phone: { x: 140, y: 272 },
  'lo-phone': { x: 140, y: 290 },
  router: { x: 425, y: 190 },
  server: { x: 668, y: 190 },
  ...Object.fromEntries(SLOTS.map((p) => [`port-${p}`, { x: 790, y: SLOT_Y(p) }])),
};

const KIND_COLOR: Record<Kind, string> = {
  req: 'var(--info)',
  resp: 'var(--ok)',
  rst: 'var(--bad)',
  lo: 'var(--violet)',
};

interface Trip {
  dev: Dev;
  dest: Dest;
  port: number;
}

interface Endpoint {
  ip: string;
  port: number;
}

interface NatRow {
  dev: Dev;
  priv: Endpoint;
  pub: Endpoint;
}

interface Flight {
  from: Anchor;
  to: Anchor;
  label: string;
  kind: Kind;
}

interface IpFrame extends Frame {
  flight: Flight | null;
  src: Endpoint | null;
  dst: Endpoint | null;
  changed: 'src' | 'dst' | null;
  nat: NatRow[];
  natHi: number | null;
  lit: string[];
  sent: number;
  refused: number;
}

const ep = (e: Endpoint) => `${e.ip}:${e.port}`;

function buildFrames(trips: Trip[]): IpFrame[] {
  const nat: NatRow[] = [];
  const eph: Record<Dev, number> = { laptop: 51000, phone: 51000 };
  let nextPublic = 40001;
  let sent = 0;
  let refused = 0;

  const frames: IpFrame[] = [
    {
      flight: null, src: null, dst: null, changed: null, nat: [], natHi: null, lit: [], sent, refused,
      say: (
        <>
          Every machine has an <b>IP address</b> (which machine) and every program talking on the network has a{' '}
          <b>port</b> (which program). Press play, or send your own packet below.
        </>
      ),
    },
  ];
  const push = (f: Omit<IpFrame, 'nat' | 'sent' | 'refused'>) =>
    frames.push({ ...f, nat: nat.slice(), sent, refused });

  for (const trip of trips) {
    const d = DEVICES[trip.dev];
    const sp = eph[trip.dev]++;
    sent++;

    if (trip.dest === 'localhost') {
      const lo: Anchor = trip.dev === 'laptop' ? 'lo' : 'lo-phone';
      const src = { ip: LOOPBACK, port: sp };
      const dst = { ip: LOOPBACK, port: trip.port };
      push({
        flight: { from: trip.dev, to: lo, label: `→ :${trip.port}`, kind: 'lo' }, src, dst, changed: null, natHi: null, lit: [trip.dev],
        say: (
          <>
            <span className="hl violet">127.0.0.1</span> (<b>localhost</b>) means <i>this machine</i>. The packet loops back
            inside the {d.name.toLowerCase()} and never touches the network or the router.
          </>
        ),
      });
      const svc = LOCAL_PORTS[trip.dev][trip.port];
      if (svc) {
        push({
          flight: null, src, dst, changed: null, natHi: null, lit: [lo],
          say: <>Delivered to the <span className="hl ok">{svc}</span> listening on :{trip.port}. Same idea as a server, just local.</>,
        });
      } else {
        refused++;
        push({
          flight: { from: trip.dev, to: trip.dev, label: 'RST', kind: 'rst' }, src: dst, dst: src, changed: null, natHi: null, lit: [trip.dev],
          say: <>Nothing on the {d.name.toLowerCase()} is listening on :{trip.port} → <span className="hl bad">connection refused</span>.</>,
        });
      }
      continue;
    }

    const priv = { ip: d.ip, port: sp };
    const dst = { ip: SERVER_IP, port: trip.port };
    const sharedPort = nat.some((r) => r.dev !== trip.dev && r.priv.port === sp);
    push({
      flight: { from: trip.dev, to: 'router', label: `→ :${trip.port}`, kind: 'req' }, src: priv, dst, changed: null, natHi: null, lit: [trip.dev],
      say: (
        <>
          The {d.name.toLowerCase()} sends to <span className="hl info">{ep(dst)}</span>. Its own address,{' '}
          <span className="hl">{d.ip}</span>, is <b>private</b>: it only means something inside this home.
        </>
      ),
    });

    const pub = { ip: ROUTER_WAN, port: nextPublic++ };
    nat.push({ dev: trip.dev, priv, pub });
    const row = nat.length - 1;
    push({
      flight: { from: 'router', to: 'router', label: `→ :${trip.port}`, kind: 'req' }, src: pub, dst, changed: 'src', natHi: row, lit: ['router'],
      say: sharedPort ? (
        <>
          Both devices picked source port <b>{sp}</b>! The router gives each a <span className="hl">different public port</span>{' '}
          ({pub.port}), which is how it tells the replies apart.
        </>
      ) : (
        <>
          <b>NAT</b>: the router swaps the private source for its one public IP{' '}
          <span className="hl">{ep(pub)}</span> and writes the mapping in its table.
        </>
      ),
    });

    push({
      flight: { from: 'router', to: 'server', label: `→ :${trip.port}`, kind: 'req' }, src: pub, dst, changed: null, natHi: null, lit: [],
      say: <>Across the internet, routers only read the <b>destination IP</b> to decide where to forward it.</>,
    });

    const svc = SERVER_PORTS[trip.port];
    const back = { ip: SERVER_IP, port: trip.port };
    if (svc) {
      push({
        flight: { from: 'server', to: `port-${trip.port}`, label: `:${trip.port}`, kind: 'req' }, src: pub, dst, changed: null, natHi: null,
        lit: [`port-${trip.port}`],
        say:
          trip.port === 5432 ? (
            <>Port 5432 → <span className="hl ok">postgres</span>. (In real life you'd firewall a database off from the internet!)</>
          ) : (
            <>
              The server's OS reads the <b>port</b>: :{trip.port} → <span className="hl ok">{svc}</span>. The IP found the machine;
              the port found the program.
            </>
          ),
      });
    } else {
      refused++;
      push({
        flight: { from: 'server', to: `port-${trip.port}`, label: `:${trip.port}`, kind: 'rst' }, src: pub, dst, changed: null, natHi: null,
        lit: [`port-${trip.port}`],
        say: (
          <>
            Nothing is listening on :{trip.port}. The server's OS answers with a reset (<span className="hl bad">RST</span>):{' '}
            connection refused.
          </>
        ),
      });
    }

    const kind: Kind = svc ? 'resp' : 'rst';
    const label = svc ? 'reply' : 'RST';
    push({
      flight: { from: 'server', to: 'router', label, kind }, src: back, dst: pub, changed: null, natHi: null, lit: [],
      say: <>The {svc ? 'reply' : 'reset'} is addressed to the router's public address <span className="hl">{ep(pub)}</span>.</>,
    });
    push({
      flight: { from: 'router', to: 'router', label, kind }, src: back, dst: priv, changed: 'dst', natHi: row, lit: ['router'],
      say: (
        <>
          Router looks up port <b>{pub.port}</b> in its NAT table → it belongs to the {d.name.toLowerCase()} at{' '}
          <span className="hl">{ep(priv)}</span>. Rewrite and forward.
        </>
      ),
    });
    push({
      flight: { from: 'router', to: trip.dev, label, kind }, src: back, dst: priv, changed: null, natHi: null, lit: [trip.dev],
      say: svc ? (
        <>Home again. Two numbers did all the work: <b>IP</b> → which machine, <b>port</b> → which program.</>
      ) : (
        <>The {d.name.toLowerCase()} gets <span className="hl bad">connection refused</span>: right machine, but no program on that port.</>
      ),
    });
  }

  return frames;
}

const TOUR: Trip[] = [
  { dev: 'laptop', dest: 'server', port: 443 },
  { dev: 'phone', dest: 'server', port: 443 },
  { dev: 'laptop', dest: 'server', port: 8080 },
  { dev: 'laptop', dest: 'localhost', port: 3000 },
];

const PORT_OPTIONS: Record<Dest, number[]> = { server: [443, 22, 5432, 8080], localhost: [3000, 8080] };

export function Stage() {
  const [trips, setTrips] = useState<Trip[]>(TOUR);
  const [dev, setDev] = useState<Dev>('laptop');
  const [dest, setDest] = useState<Dest>('server');
  const [port, setPort] = useState(443);
  const frames = useMemo(() => buildFrames(trips), [trips]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;

  const send = () => {
    player.queueNext({ play: true, from: frames.length });
    setTrips([...trips, { dev, dest, port }]);
  };
  const reset = () => {
    player.queueNext({ play: false });
    setTrips([]);
  };
  const pickDest = (d: Dest) => {
    setDest(d);
    setPort(PORT_OPTIONS[d][0]);
  };

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Packets sent" value={f.sent} color="var(--info)" />
          <Stat label="NAT entries" value={f.nat.length} color="var(--hi)" />
          <Stat label="Refused" value={f.refused} color="var(--bad)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: KIND_COLOR.req, label: 'request', shape: 'dot' },
            { color: KIND_COLOR.resp, label: 'reply', shape: 'dot' },
            { color: KIND_COLOR.rst, label: 'refused (RST)', shape: 'dot' },
            { color: KIND_COLOR.lo, label: 'loopback', shape: 'dot' },
            { color: 'var(--hi)', label: 'rewritten by NAT' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="From"
            value={dev}
            onChange={setDev}
            options={[
              { value: 'laptop', label: 'Laptop' },
              { value: 'phone', label: 'Phone' },
            ]}
          />
          <Segmented
            label="To"
            value={dest}
            onChange={pickDest}
            options={[
              { value: 'server', label: SERVER_IP },
              { value: 'localhost', label: 'localhost' },
            ]}
          />
          <Segmented
            label="Port"
            value={String(port)}
            onChange={(v) => setPort(Number(v))}
            options={PORT_OPTIONS[dest].map((p) => ({ value: String(p), label: `:${p}` }))}
          />
          <Button variant="primary" onClick={send} className="ipp-send">
            Send packet
          </Button>
          <Button onClick={reset}>Clear</Button>
        </Controls>
      }
    >
      <div className="ipp">
        <svg className="ipp-scene" viewBox="0 0 960 380" role="img" aria-label="Home network, router with NAT, and a server with ports">
          <rect x={18} y={20} width={246} height={324} rx={16} className="ipp-zone" />
          <text x={34} y={42} className="ipp-zone-label">HOME NETWORK · PRIVATE</text>
          <text x={560} y={172} textAnchor="middle" className="ipp-zone-label">THE INTERNET</text>

          <line x1={240} y1={96} x2={345} y2={180} className="ipp-wire" />
          <line x1={240} y1={272} x2={345} y2={200} className="ipp-wire" />
          <line x1={505} y1={190} x2={668} y2={190} className="ipp-wire ipp-wan" />

          <Device dev="laptop" lit={f.lit} />
          <Device dev="phone" lit={f.lit} />

          <g className={`ipp-box ${f.lit.includes('router') ? 'on' : ''}`}>
            <rect x={345} y={146} width={160} height={88} rx={12} />
            <text x={425} y={172} textAnchor="middle" className="ipp-title">Router</text>
            <text x={425} y={194} textAnchor="middle" className="ipp-ip">LAN 192.168.1.1</text>
            <text x={425} y={212} textAnchor="middle" className="ipp-ip ipp-pub">WAN {ROUTER_WAN}</text>
          </g>

          <g className="ipp-box">
            <rect x={668} y={48} width={246} height={296} rx={14} />
            <text x={688} y={76} className="ipp-title">Server</text>
            <text x={894} y={76} textAnchor="end" className="ipp-ip">{SERVER_IP}</text>
          </g>
          {SLOTS.map((p) => {
            const svc = SERVER_PORTS[p];
            const on = f.lit.includes(`port-${p}`);
            return (
              <g key={p} className={`ipp-slot ${svc ? '' : 'empty'} ${on ? (svc ? 'on' : 'bad') : ''}`}>
                <rect x={688} y={SLOT_Y(p) - 21} width={206} height={42} rx={9} />
                <text x={704} y={SLOT_Y(p) + 5} className="ipp-port">:{p}</text>
                <text x={760} y={SLOT_Y(p) + 5} className="ipp-svc">{svc ?? 'nothing listening'}</text>
              </g>
            );
          })}

          {f.flight && <Packet key={player.index} flight={f.flight} />}
        </svg>

        <div className="ipp-panels">
          <HeaderPanel frame={f} index={player.index} />
          <NatPanel frame={f} />
          <div className="ipp-panel ipp-v6">
            <h4>IPv4 vs IPv6</h4>
            <p>
              <b>IPv4</b> is 32 bits (<code>203.0.113.10</code>): about 4.3 billion addresses. Not enough for every device,
              which is a big reason NAT exists.
            </p>
            <p>
              <b>IPv6</b> is 128 bits (<code>2001:db8::1</code>): enough for every device to get its own public address.
            </p>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function Device({ dev, lit }: { dev: Dev; lit: string[] }) {
  const d = DEVICES[dev];
  const on = lit.includes(dev);
  const laptop = dev === 'laptop';
  const top = laptop ? 56 : 240;
  const h = laptop ? 116 : 76;
  return (
    <g className={`ipp-box ${on ? 'on' : ''}`}>
      <rect x={40} y={top} width={200} height={h} rx={12} />
      <text x={58} y={top + 26} className="ipp-title">{d.name}</text>
      <text x={222} y={top + 26} textAnchor="end" className="ipp-ip">{d.ip}</text>
      {laptop ? (
        <g className={`ipp-slot ${lit.includes('lo') ? 'on' : ''}`}>
          <rect x={56} y={top + 70} width={168} height={32} rx={8} />
          <text x={70} y={top + 91} className="ipp-port">:3000</text>
          <text x={118} y={top + 91} className="ipp-svc">dev server</text>
        </g>
      ) : (
        <text x={58} y={top + 54} className="ipp-svc">no local servers</text>
      )}
      {laptop && (
        <text x={58} y={top + 52} className="ipp-svc">localhost = {LOOPBACK}</text>
      )}
    </g>
  );
}

function Packet({ flight }: { flight: Flight }) {
  const a = ANCHORS[flight.from];
  const b = ANCHORS[flight.to];
  const w = flight.label.length * 7 + 22;
  const color = KIND_COLOR[flight.kind];
  const still = flight.from === flight.to;
  // Pills dropping into a port slot dissolve into it, so the lit slot stays readable.
  const absorbed = flight.to.startsWith('port-') || flight.to.startsWith('lo');
  return (
    <motion.g
      initial={{ x: a.x, y: a.y, opacity: 0, scale: 0.6 }}
      animate={
        still
          ? { x: b.x, y: b.y - 34, opacity: 1, scale: [1, 1.18, 1] }
          : { x: b.x, y: b.y, opacity: absorbed ? [0, 1, 1, 0] : 1, scale: absorbed ? [0.6, 1, 1, 0.5] : 1 }
      }
      transition={{
        duration: still ? 0.6 : absorbed ? 1 : 0.75,
        ease: 'easeInOut',
        opacity: absorbed ? { duration: 1, times: [0, 0.1, 0.75, 1] } : { duration: 0.15 },
        scale: absorbed ? { duration: 1, times: [0, 0.1, 0.75, 1] } : undefined,
      }}
    >
      <rect x={-w / 2} y={-12} width={w} height={24} rx={12} fill={color} className="ipp-pill" />
      <text x={0} y={4} textAnchor="middle" className="ipp-pill-text">
        {flight.label}
      </text>
    </motion.g>
  );
}

function HeaderPanel({ frame, index }: { frame: IpFrame; index: number }) {
  const field = (name: 'src' | 'dst', label: string, e: Endpoint | null): ReactNode => (
    <div className={`ipp-field ${frame.changed === name ? 'changed' : ''}`}>
      <span className="ipp-field-name">{label}</span>
      {e ? (
        <motion.span
          key={frame.changed === name ? `c${index}` : 'same'}
          className="ipp-field-val"
          initial={frame.changed === name ? { scale: 1.25, color: 'var(--hi)' } : false}
          animate={{ scale: 1, color: frame.changed === name ? 'var(--hi)' : 'var(--text)' }}
          transition={{ duration: 0.5 }}
        >
          <span className="ipp-ipval">{e.ip}</span>
          <span className="ipp-portval">:{e.port}</span>
        </motion.span>
      ) : (
        <span className="ipp-field-val muted">·</span>
      )}
    </div>
  );
  return (
    <div className="ipp-panel">
      <h4>Packet header</h4>
      {field('src', 'SOURCE', frame.src)}
      {field('dst', 'DESTINATION', frame.dst)}
      <p className="ipp-note">IP picks the machine · port picks the program</p>
    </div>
  );
}

function NatPanel({ frame }: { frame: IpFrame }) {
  return (
    <div className="ipp-panel">
      <h4>Router NAT table</h4>
      {frame.nat.length === 0 ? (
        <p className="ipp-note">Empty. It fills in as devices open connections.</p>
      ) : (
        <div className="ipp-nat">
          {frame.nat.slice(-4).map((r, i, arr) => {
            const idx = frame.nat.length - arr.length + i;
            return (
              <motion.div
                key={idx}
                className={`ipp-nat-row ${frame.natHi === idx ? 'on' : ''}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <i className={`ipp-dev ipp-dev-${r.dev}`} />
                <span>{ep(r.priv)}</span>
                <span className="ipp-arrow">↔</span>
                <span className="ipp-pub">:{r.pub.port}</span>
              </motion.div>
            );
          })}
          {frame.nat.length > 4 && <p className="ipp-note">+{frame.nat.length - 4} older</p>}
        </div>
      )}
    </div>
  );
}
