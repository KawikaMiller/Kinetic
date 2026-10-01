import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type IpFrame } from './frames';
import {
  ANCHORS, DEVICES, ep, KIND_COLOR, LOOPBACK, PORT_OPTIONS, ROUTER_LAN, ROUTER_WAN, SERVER_IP, SERVER_PORTS, SLOT_Y, SLOTS, TOUR,
  type Dest, type Dev, type Endpoint, type Flight, type Trip,
} from './model';
import './styles.css';

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
    <StageFrame minWidth={900}
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Connections" value={f.connections} color="var(--info)" />
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
          <Segmented label="Port" value={port} onChange={setPort} options={PORT_OPTIONS[dest].map((p) => ({ value: p, label: `:${p}` }))} />
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
          <text x={34} y={42} className="scene-zone">HOME NETWORK · PRIVATE</text>
          <text x={560} y={172} textAnchor="middle" className="scene-zone">THE INTERNET</text>

          <line x1={240} y1={96} x2={345} y2={180} className="ipp-wire" />
          <line x1={240} y1={272} x2={345} y2={200} className="ipp-wire" />
          <line x1={505} y1={190} x2={668} y2={190} className="ipp-wire ipp-wan" />

          <Device dev="laptop" lit={f.lit} />
          <Device dev="phone" lit={f.lit} />

          <g className={`ipp-box ${f.lit.includes('router') ? 'on' : ''}`}>
            <rect x={345} y={146} width={160} height={88} rx={12} />
            <text x={425} y={172} textAnchor="middle" className="ipp-title">Router</text>
            <text x={425} y={194} textAnchor="middle" className="ipp-ip">LAN {ROUTER_LAN}</text>
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

          {f.flight && <MessagePill key={player.index} flight={f.flight} />}
        </svg>

        <div className="ipp-panels">
          <HeaderPanel frame={f} index={player.index} />
          <NatPanel frame={f} />
          <Box className="ipp-panel ipp-v6">
            <h4>IPv4 vs IPv6</h4>
            <p>
              <b>IPv4</b> is 32 bits (<code>203.0.113.10</code>): about 4.3 billion addresses. Not enough for every device,
              which is a big reason NAT exists.
            </p>
            <p>
              <b>IPv6</b> is 128 bits (<code>2001:db8::1</code>): enough for every device to get its own public address.
            </p>
          </Box>
        </div>
        <Hint block>A simulated, simplified network: one packet each way per connection (no TCP handshake), and documentation-range addresses.</Hint>
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

/** A "still" pill (same from/to) hovers this far above its anchor while it's being rewritten. */
const STILL_LIFT = 34;
/** Seconds for each kind of trip. */
const BOUNCE_S = 0.6;
const ABSORB_S = 1;
const TRAVEL_S = 0.75;

function MessagePill({ flight }: { flight: Flight }) {
  const still = flight.from === flight.to;
  // Pills dropping into a port slot dissolve into it, so the lit slot stays readable.
  const absorbed = flight.to.startsWith('port-') || flight.to.startsWith('lo');
  const arrive = still ? 'bounce' : absorbed ? 'absorb' : 'stay';
  return (
    <Packet
      path={[ANCHORS[flight.from], ANCHORS[flight.to]]}
      label={flight.label}
      color={KIND_COLOR[flight.kind]}
      arrive={arrive}
      lift={STILL_LIFT}
      duration={still ? BOUNCE_S : absorbed ? ABSORB_S : TRAVEL_S}
      charW={7}
      pad={22}
    />
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
    <Box className="ipp-panel">
      <h4>Packet header</h4>
      {field('src', 'SOURCE', frame.src)}
      {field('dst', 'DESTINATION', frame.dst)}
      <p className="ipp-note">IP picks the machine · port picks the program</p>
    </Box>
  );
}

const NAT_ROWS_SHOWN = 4;

function NatPanel({ frame }: { frame: IpFrame }) {
  return (
    <Box className="ipp-panel">
      <h4>Router NAT table</h4>
      {frame.nat.length === 0 ? (
        <p className="ipp-note">Empty. It fills in as devices open connections.</p>
      ) : (
        <div className="ipp-nat">
          {frame.nat.slice(-NAT_ROWS_SHOWN).map((r, i, arr) => {
            const idx = frame.nat.length - arr.length + i;
            return (
              <motion.div
                key={idx}
                className={`ipp-nat-row ${frame.natHi === idx ? 'on' : ''}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="ipp-dev">{DEVICES[r.dev].name}</span>
                <span>{ep(r.priv)}</span>
                <span className="ipp-arrow">↔</span>
                <span className="ipp-pub">:{r.pub.port}</span>
              </motion.div>
            );
          })}
          {frame.nat.length > NAT_ROWS_SHOWN && <p className="ipp-note">+{frame.nat.length - NAT_ROWS_SHOWN} older</p>}
        </div>
      )}
    </Box>
  );
}
