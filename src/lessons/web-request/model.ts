// The legs of a page load and the clock/round-trip arithmetic over them. No captions here:
// frames.tsx adds those. Every latency is illustrative (a plausible size, not a measurement),
// and a cold lookup always walks the whole tree from the root.

export type ActorId = 'browser' | 'os' | 'resolver' | 'root' | 'tld' | 'auth' | 'server';
export type Phase = 'dns' | 'tcp' | 'tls' | 'http' | 'render';

/** Documentation range (RFC 5737), the same server address ip-ports and osi use. */
export const SERVER_IP = '203.0.113.10';

export const PHASES: { id: Phase; label: string; color: string }[] = [
  { id: 'dns', label: 'DNS', color: 'var(--violet)' },
  { id: 'tcp', label: 'TCP', color: 'var(--info)' },
  { id: 'tls', label: 'TLS', color: 'var(--hi)' },
  { id: 'http', label: 'HTTP', color: 'var(--ok)' },
  { id: 'render', label: 'Render', color: 'var(--orange)' },
];
/** A leg with no phase (skipping setup on a reused connection) is a win, so it's green. */
export const phaseColor = (p: Phase | null) => (p ? PHASES.find((x) => x.id === p)!.color : 'var(--ok)');
export const phaseLabel = (p: Phase | null) => (p ? PHASES.find((x) => x.id === p)!.label : 'Reused');

export interface Actor {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
}

export const ACTORS: Record<ActorId, Actor> = {
  browser: { x: 120, y: 248, w: 190, h: 110, label: 'Browser', sub: '' },
  os: { x: 120, y: 62, w: 132, h: 50, label: 'OS cache', sub: 'local DNS' },
  resolver: { x: 350, y: 150, w: 140, h: 50, label: 'Resolver', sub: 'ISP / 1.1.1.1' },
  root: { x: 585, y: 46, w: 104, h: 50, label: 'Root', sub: '“.”' },
  tld: { x: 710, y: 46, w: 104, h: 50, label: 'TLD', sub: '.com' },
  auth: { x: 846, y: 46, w: 128, h: 50, label: 'Authoritative', sub: 'ns1.example.com' },
  server: { x: 820, y: 248, w: 150, h: 64, label: 'Server', sub: SERVER_IP },
};

export const EDGES: [ActorId, ActorId][] = [
  ['browser', 'os'],
  ['os', 'resolver'],
  ['resolver', 'root'],
  ['resolver', 'tld'],
  ['resolver', 'auth'],
];

export type LegId =
  | 'askOsCached' | 'osHit'
  | 'askOs' | 'askResolver' | 'askRoot' | 'rootSays' | 'askTld' | 'tldSays' | 'askAuth' | 'authSays' | 'resolverSays' | 'osSays'
  | 'reuse'
  | 'syn' | 'synAck' | 'ack' | 'clientHello' | 'serverHello13' | 'finished13' | 'serverHello12' | 'keyExchange' | 'finished12'
  | 'get' | 'work' | 'ok' | 'render';

export interface Leg {
  id: LegId;
  from: ActorId;
  to: ActorId;
  label: string;
  /** null: no setup happens at all (a reused connection). */
  phase: Phase | null;
  /** One-way latency this leg adds (illustrative). */
  ms: number;
  /** Completes a round trip. */
  rtt?: boolean;
  ip?: boolean;
  tcpUp?: boolean;
  tlsUp?: boolean;
  paint?: boolean;
}

export interface Opts {
  dnsCached: boolean;
  reuse: boolean;
  tls13: boolean;
}

/**
 * Change one option, keeping the set possible: an open keep-alive connection means the
 * browser was just talking to this host, so it never needs a cold lookup.
 */
export function setOpt<K extends keyof Opts>(o: Opts, key: K, value: Opts[K]): Opts {
  const next = { ...o, [key]: value };
  if (key === 'reuse' && value) next.dnsCached = true;
  if (key === 'dnsCached' && !value) next.reuse = false;
  return next;
}

const leg = (id: LegId, from: ActorId, to: ActorId, label: string, phase: Phase | null, ms: number, more: Partial<Leg> = {}): Leg =>
  ({ id, from, to, label, phase, ms, ...more });

export function legs({ dnsCached, reuse, tls13 }: Opts): Leg[] {
  const m: Leg[] = [];
  if (reuse) {
    // The browser's connection pool is keyed by host: a pooled connection skips DNS too.
    m.push(leg('reuse', 'browser', 'browser', '', null, 0, { ip: true, tcpUp: true, tlsUp: true }));
  } else {
    if (dnsCached) {
      m.push(leg('askOsCached', 'browser', 'os', 'example.com?', 'dns', 1));
      m.push(leg('osHit', 'os', 'browser', SERVER_IP, 'dns', 1, { ip: true }));
    } else {
      m.push(leg('askOs', 'browser', 'os', 'example.com?', 'dns', 1));
      m.push(leg('askResolver', 'os', 'resolver', 'example.com?', 'dns', 10));
      m.push(leg('askRoot', 'resolver', 'root', 'example.com?', 'dns', 15));
      m.push(leg('rootSays', 'root', 'resolver', 'ask .com', 'dns', 15, { rtt: true }));
      m.push(leg('askTld', 'resolver', 'tld', 'example.com?', 'dns', 15));
      m.push(leg('tldSays', 'tld', 'resolver', 'ask ns1', 'dns', 15, { rtt: true }));
      m.push(leg('askAuth', 'resolver', 'auth', 'example.com?', 'dns', 20));
      m.push(leg('authSays', 'auth', 'resolver', SERVER_IP, 'dns', 20, { rtt: true }));
      m.push(leg('resolverSays', 'resolver', 'os', SERVER_IP, 'dns', 10, { rtt: true }));
      m.push(leg('osSays', 'os', 'browser', SERVER_IP, 'dns', 1, { ip: true }));
    }
    m.push(leg('syn', 'browser', 'server', 'SYN', 'tcp', 25));
    m.push(leg('synAck', 'server', 'browser', 'SYN-ACK', 'tcp', 25, { rtt: true }));
    m.push(leg('ack', 'browser', 'server', 'ACK', 'tcp', 0, { tcpUp: true }));
    m.push(leg('clientHello', 'browser', 'server', 'ClientHello', 'tls', 25));
    if (tls13) {
      m.push(leg('serverHello13', 'server', 'browser', 'ServerHello + cert', 'tls', 25, { rtt: true }));
      m.push(leg('finished13', 'browser', 'server', 'Finished', 'tls', 0, { tlsUp: true }));
    } else {
      m.push(leg('serverHello12', 'server', 'browser', 'ServerHello + cert', 'tls', 25, { rtt: true }));
      m.push(leg('keyExchange', 'browser', 'server', 'KeyExchange', 'tls', 25));
      m.push(leg('finished12', 'server', 'browser', 'Finished', 'tls', 25, { rtt: true, tlsUp: true }));
    }
  }
  m.push(leg('get', 'browser', 'server', 'GET /', 'http', 25));
  m.push(leg('work', 'server', 'server', '', 'http', 30));
  m.push(leg('ok', 'server', 'browser', '200 OK', 'http', 25, { rtt: true }));
  m.push(leg('render', 'browser', 'browser', '', 'render', 60, { paint: true }));
  return m;
}

export type Elapsed = Record<Phase, number>;

export interface WrStep {
  leg: Leg | null;
  elapsed: Elapsed;
  ms: number;
  rtts: number;
  ip: boolean;
  tcp: boolean;
  tls: boolean;
  painted: boolean;
}

/** Clock and state after each leg, starting with the moment you hit Enter. */
export function timeline(opts: Opts): { steps: WrStep[]; total: number; setup: number } {
  const elapsed: Elapsed = { dns: 0, tcp: 0, tls: 0, http: 0, render: 0 };
  let cur: WrStep = { leg: null, elapsed: { ...elapsed }, ms: 0, rtts: 0, ip: false, tcp: false, tls: false, painted: false };
  const steps = [cur];
  for (const l of legs(opts)) {
    if (l.phase) elapsed[l.phase] += l.ms;
    cur = {
      leg: l,
      elapsed: { ...elapsed },
      ms: cur.ms + l.ms,
      rtts: cur.rtts + (l.rtt ? 1 : 0),
      ip: cur.ip || !!l.ip,
      tcp: cur.tcp || !!l.tcpUp,
      tls: cur.tls || !!l.tlsUp,
      painted: cur.painted || !!l.paint,
    };
    steps.push(cur);
  }
  return { steps, total: cur.ms, setup: elapsed.dns + elapsed.tcp + elapsed.tls };
}
