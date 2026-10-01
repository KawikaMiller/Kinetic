// The home network, router NAT and server ports, and a step-by-step simulation of packets
// crossing them. No captions here: frames.tsx turns each step into a captioned frame.
// Simplified on purpose: one packet each way per connection (no TCP handshake), and ephemeral
// ports counting up from 51000 on every device.

// Documentation address ranges (RFC 5737 / RFC 1918), so nothing here is a real host.
export const SERVER_IP = '203.0.113.10';
export const ROUTER_WAN = '198.51.100.7';
export const ROUTER_LAN = '192.168.1.1';
export const LOOPBACK = '127.0.0.1';
export const FIRST_EPHEMERAL = 51000;
export const FIRST_PUBLIC = 40001;

export type Dev = 'laptop' | 'phone';
export type Dest = 'server' | 'localhost';
export type Anchor = Dev | 'router' | 'server' | 'lo' | 'lo-phone' | `port-${number}`;
export type Kind = 'req' | 'resp' | 'rst' | 'lo';

export const DEVICES: Record<Dev, { name: string; ip: string }> = {
  laptop: { name: 'Laptop', ip: '192.168.1.20' },
  phone: { name: 'Phone', ip: '192.168.1.21' },
};

/** What each host is listening on. */
export const SERVER_PORTS: Record<number, string> = { 443: 'web server (HTTPS)', 22: 'sshd (remote login)', 5432: 'postgres' };
export const SLOTS = [443, 22, 5432, 8080];
export const LOCAL_PORTS: Record<Dev, Record<number, string>> = { laptop: { 3000: 'dev server' }, phone: {} };

export const SLOT_Y = (port: number) => 118 + SLOTS.indexOf(port) * 54;

export const ANCHORS: Record<string, { x: number; y: number }> = {
  laptop: { x: 140, y: 96 },
  lo: { x: 140, y: 142 },
  phone: { x: 140, y: 272 },
  'lo-phone': { x: 140, y: 290 },
  router: { x: 425, y: 190 },
  server: { x: 668, y: 190 },
  ...Object.fromEntries(SLOTS.map((p) => [`port-${p}`, { x: 790, y: SLOT_Y(p) }])),
};

export const KIND_COLOR: Record<Kind, string> = {
  req: 'var(--info)',
  resp: 'var(--ok)',
  rst: 'var(--bad)',
  lo: 'var(--violet)',
};

export interface Trip {
  dev: Dev;
  dest: Dest;
  port: number;
}

export interface Endpoint {
  ip: string;
  port: number;
}

export interface NatRow {
  dev: Dev;
  priv: Endpoint;
  pub: Endpoint;
}

export interface Flight {
  from: Anchor;
  to: Anchor;
  label: string;
  kind: Kind;
}

/** Which moment of a trip a step shows. Captions are chosen by this. */
export type Beat =
  | 'intro'
  | 'loopSend' | 'loopDelivered' | 'loopRefused'
  | 'send' | 'natOut' | 'internet' | 'deliver' | 'refused' | 'replyOut' | 'natIn' | 'home';

export interface IpStep {
  beat: Beat;
  /** The trip this step belongs to (null for the intro). */
  trip: Trip | null;
  /** The program that answered, if one was listening. */
  svc: string | null;
  /** Another device already holds a mapping from this same private source port. */
  sharedPort: boolean;
  /** This trip's private and public (post-NAT) source. */
  priv: Endpoint | null;
  pub: Endpoint | null;
  flight: Flight | null;
  /** The packet header on screen. */
  src: Endpoint | null;
  dst: Endpoint | null;
  changed: 'src' | 'dst' | null;
  nat: NatRow[];
  natHi: number | null;
  lit: string[];
  /** Connections attempted so far (each trip is one). */
  connections: number;
  refused: number;
}

export const ep = (e: Endpoint) => `${e.ip}:${e.port}`;

export function simulate(trips: Trip[]): IpStep[] {
  const nat: NatRow[] = [];
  const eph: Record<Dev, number> = { laptop: FIRST_EPHEMERAL, phone: FIRST_EPHEMERAL };
  let nextPublic = FIRST_PUBLIC;
  let connections = 0;
  let refused = 0;

  const blank = { trip: null, svc: null, sharedPort: false, priv: null, pub: null, flight: null, src: null, dst: null, changed: null, natHi: null, lit: [] };
  const steps: IpStep[] = [{ ...blank, beat: 'intro', nat: [], connections, refused }];

  for (const trip of trips) {
    const d = DEVICES[trip.dev];
    const sp = eph[trip.dev]++;
    connections++;
    const ctx = { trip, sharedPort: false };
    const push = (s: Omit<IpStep, 'trip' | 'sharedPort' | 'nat' | 'connections' | 'refused' | 'changed' | 'natHi'> & Partial<Pick<IpStep, 'changed' | 'natHi' | 'sharedPort'>>) =>
      steps.push({ changed: null, natHi: null, ...ctx, ...s, nat: nat.slice(), connections, refused });

    if (trip.dest === 'localhost') {
      const lo: Anchor = trip.dev === 'laptop' ? 'lo' : 'lo-phone';
      const src = { ip: LOOPBACK, port: sp };
      const dst = { ip: LOOPBACK, port: trip.port };
      const svc = LOCAL_PORTS[trip.dev][trip.port] ?? null;
      const base = { svc, priv: src, pub: null };
      push({ ...base, beat: 'loopSend', flight: { from: trip.dev, to: lo, label: `→ :${trip.port}`, kind: 'lo' }, src, dst, lit: [trip.dev] });
      if (svc) {
        push({ ...base, beat: 'loopDelivered', flight: null, src, dst, lit: [lo] });
      } else {
        refused++;
        push({ ...base, beat: 'loopRefused', flight: { from: trip.dev, to: trip.dev, label: 'RST', kind: 'rst' }, src: dst, dst: src, lit: [trip.dev] });
      }
      continue;
    }

    const priv = { ip: d.ip, port: sp };
    const dst = { ip: SERVER_IP, port: trip.port };
    ctx.sharedPort = nat.some((r) => r.dev !== trip.dev && r.priv.port === sp);
    const pub = { ip: ROUTER_WAN, port: nextPublic++ };
    const svc = SERVER_PORTS[trip.port] ?? null;
    const base = { svc, priv, pub };

    push({ ...base, beat: 'send', flight: { from: trip.dev, to: 'router', label: `→ :${trip.port}`, kind: 'req' }, src: priv, dst, lit: [trip.dev] });

    nat.push({ dev: trip.dev, priv, pub });
    const row = nat.length - 1;
    push({ ...base, beat: 'natOut', flight: { from: 'router', to: 'router', label: `→ :${trip.port}`, kind: 'req' }, src: pub, dst, changed: 'src', natHi: row, lit: ['router'] });
    push({ ...base, beat: 'internet', flight: { from: 'router', to: 'server', label: `→ :${trip.port}`, kind: 'req' }, src: pub, dst, lit: [] });

    const slot = `port-${trip.port}` as const;
    if (svc) {
      push({ ...base, beat: 'deliver', flight: { from: 'server', to: slot, label: `:${trip.port}`, kind: 'req' }, src: pub, dst, lit: [slot] });
    } else {
      refused++;
      push({ ...base, beat: 'refused', flight: { from: 'server', to: slot, label: `:${trip.port}`, kind: 'rst' }, src: pub, dst, lit: [slot] });
    }

    const back = { ip: SERVER_IP, port: trip.port };
    const kind: Kind = svc ? 'resp' : 'rst';
    const label = svc ? 'reply' : 'RST';
    push({ ...base, beat: 'replyOut', flight: { from: 'server', to: 'router', label, kind }, src: back, dst: pub, lit: [] });
    // The router finds the device by the public port alone: that's what the NAT table is for.
    const mapped = nat.find((r) => r.pub.port === pub.port)!;
    push({ ...base, beat: 'natIn', flight: { from: 'router', to: 'router', label, kind }, src: back, dst: mapped.priv, changed: 'dst', natHi: nat.indexOf(mapped), lit: ['router'] });
    push({ ...base, beat: 'home', flight: { from: 'router', to: mapped.dev, label, kind }, src: back, dst: mapped.priv, lit: [mapped.dev] });
  }

  return steps;
}

export const TOUR: Trip[] = [
  { dev: 'laptop', dest: 'server', port: 443 },
  { dev: 'phone', dest: 'server', port: 443 },
  { dev: 'laptop', dest: 'server', port: 8080 },
  { dev: 'laptop', dest: 'localhost', port: 3000 },
];

export const PORT_OPTIONS: Record<Dest, number[]> = { server: [443, 22, 5432, 8080], localhost: [3000, 8080] };
