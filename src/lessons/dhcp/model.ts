/**
 * DHCP for the lesson: an address pool with offers, leases, withdrawals and expiry, the RFC 2131
 * renewal timers, the RFC 3927 link-local fallback, and each scene's exchange built from them.
 * Every message carries its real source and destination address and port, so the tests can
 * check DORA hop by hop. Timings are the lesson's own (scripted); addresses come from RFC 1918
 * ranges and the MAC addresses are made up.
 */
import { ipToString, ipv4 } from '../../core/ipv4';
import type { Rnd } from '../../core/random';
import type { Tone } from '../../core/tone';

export const CLIENT_PORT = 68;
export const SERVER_PORT = 67;
export const BROADCAST = '255.255.255.255';
export const UNSPECIFIED = '0.0.0.0';

/** RFC 2131 §4.4.5 defaults: renew at T1, rebind at T2, as shares of the lease. */
export const T1_SHARE = 0.5;
export const T2_SHARE = 0.875;
/** How long a server holds an offered address for a client that never requests it (illustrative). */
export const OFFER_HOLD_S = 60;
/** The client's first DISCOVER retry waits about 4 s, then 8 s (RFC 2131 §4.1, randomised ±1 s). */
export const RETRY_S = [4, 8] as const;

export const LAPTOP_MAC = '02:00:5e:10:00:01';
export const OTHER_MAC = '02:00:5e:10:00:02';

export const leaseTimers = (lease: number) => ({ t1: lease * T1_SHARE, t2: lease * T2_SHARE, expiry: lease });

// ── Addresses ───────────────────────────────────────────────────────────

/** RFC 3927: link-local hosts pick from 169.254.1.0 to 169.254.254.255 (the first and last /24 are reserved). */
export const APIPA_FIRST = '169.254.1.0';
export const APIPA_LAST = '169.254.254.255';
export const isApipa = (ip: string) => ipv4(ip) >= ipv4(APIPA_FIRST) && ipv4(ip) <= ipv4(APIPA_LAST);
/** A pseudo-random link-local address, as a client picks one (RFC 3927 seeds it from the MAC). */
export function apipaAddress(rnd: Rnd): string {
  const span = ipv4(APIPA_LAST) - ipv4(APIPA_FIRST) + 1;
  return ipToString(ipv4(APIPA_FIRST) + Math.floor(rnd() * span));
}

/** `count` consecutive addresses from `first`. */
export const range = (first: string, count: number) => Array.from({ length: count }, (_, i) => ipToString(ipv4(first) + i));

// ── The pool ────────────────────────────────────────────────────────────

export type SlotStatus = 'free' | 'offered' | 'leased';

export interface Slot {
  status: SlotStatus;
  mac?: string;
  /** When the offer or lease runs out (seconds). */
  until?: number;
}

export interface Pool {
  addrs: readonly string[];
  slots: Readonly<Record<string, Slot>>;
}

export const createPool = (addrs: readonly string[], taken: Record<string, Slot> = {}): Pool => ({
  addrs,
  slots: Object.fromEntries(addrs.map((a) => [a, taken[a] ?? { status: 'free' }])),
});

const withSlot = (pool: Pool, addr: string, slot: Slot): Pool => ({ ...pool, slots: { ...pool.slots, [addr]: slot } });

/** Offers and leases whose time is up go back to free. */
export function expire(pool: Pool, now: number): Pool {
  let next = pool;
  for (const a of pool.addrs) {
    const s = pool.slots[a];
    if (s.status !== 'free' && s.until !== undefined && s.until <= now) next = withSlot(next, a, { status: 'free' });
  }
  return next;
}

/**
 * Pick an address for `mac`: the one it already holds (a lease or an earlier offer), else
 * the first free one. Never an address leased or offered to anyone else; null when there's none.
 */
export function offer(pool: Pool, mac: string, now: number): { pool: Pool; addr: string | null } {
  const p = expire(pool, now);
  const own = p.addrs.find((a) => p.slots[a].status !== 'free' && p.slots[a].mac === mac);
  const addr = own ?? p.addrs.find((a) => p.slots[a].status === 'free') ?? null;
  if (addr === null) return { pool: p, addr };
  if (p.slots[addr].status === 'leased') return { pool: p, addr };
  return { pool: withSlot(p, addr, { status: 'offered', mac, until: now + OFFER_HOLD_S }), addr };
}

/** The client asks for `addr`: ACK (and lease it) only if it's free or already this client's. */
export function request(pool: Pool, mac: string, addr: string, now: number, lease: number): { pool: Pool; ack: boolean } {
  const p = expire(pool, now);
  const s = p.slots[addr];
  if (!s || (s.status !== 'free' && s.mac !== mac)) return { pool: p, ack: false };
  return { pool: withSlot(p, addr, { status: 'leased', mac, until: now + lease }), ack: true };
}

/** The client took another server's offer: this server returns its offered address to the pool. */
export function withdraw(pool: Pool, mac: string): Pool {
  let next = pool;
  for (const a of pool.addrs) if (pool.slots[a].status === 'offered' && pool.slots[a].mac === mac) next = withSlot(next, a, { status: 'free' });
  return next;
}

export function release(pool: Pool, mac: string): Pool {
  let next = pool;
  for (const a of pool.addrs) if (pool.slots[a].mac === mac) next = withSlot(next, a, { status: 'free' });
  return next;
}

// ── Scenes ──────────────────────────────────────────────────────────────

export type MsgType = 'DHCPDISCOVER' | 'DHCPOFFER' | 'DHCPREQUEST' | 'DHCPACK';

export interface Endpoint {
  ip: string;
  port: number;
}

/** One message on the wire, with its real addressing. */
export interface Wire {
  type: MsgType;
  src: Endpoint;
  dst: Endpoint;
  /** The address offered or acknowledged (yiaddr), or requested. */
  addr?: string;
  /** Which server the client chose (option 54), on a REQUEST. */
  server?: string;
  /** Set when a relay agent forwarded it (giaddr). */
  giaddr?: string;
}

export type FieldKey = 'ip' | 'mask' | 'router' | 'dns' | 'lease';
export type FieldState = 'empty' | 'offered' | 'set' | 'link-local';

export interface ConfigField {
  value: string;
  state: FieldState;
}

export type Config = Record<FieldKey, ConfigField>;

export interface PoolView {
  label: string;
  pool: Pool;
}

export interface Step {
  id: string;
  /** For the ladder: sender, receiver ('*' = broadcast) and its label. */
  from: string;
  to: string;
  label: string;
  note?: string;
  lost?: boolean;
  tone: Tone;
  /** What happened, for the caption. */
  event: StepEvent;
  wire?: Wire;
  config: Config;
  pools: PoolView[];
  /** Scripted seconds since the scene began. */
  t: number;
}

export type StepEvent =
  | 'discover' | 'offer' | 'request' | 'ack' | 'withdraw' | 'configure' | 'no-offer' | 'retry' | 'apipa'
  | 'relay-up' | 'relay-down' | 'renew' | 'renew-ack' | 'renew-lost' | 'rebind' | 'rebind-lost' | 'expire';

export interface Actor {
  id: string;
  label: string;
}

export interface Scene {
  actors: Actor[];
  steps: Step[];
}

export const LAN = { mask: '255.255.255.0', router: '192.168.1.1', dns: '192.168.1.1' };
export const SERVER_A = '192.168.1.2';
export const SERVER_B = '192.168.1.3';
export const RELAY_IP = '192.168.2.1';
export const REMOTE_SERVER = '10.0.0.5';
export const REMOTE_LAN = { mask: '255.255.255.0', router: RELAY_IP, dns: '10.0.0.53' };
export const DEFAULT_LEASE_S = 24 * 3600;
const POOL_SIZE = 6;

export const emptyConfig = (): Config => ({
  ip: { value: UNSPECIFIED, state: 'empty' },
  mask: { value: '', state: 'empty' },
  router: { value: '', state: 'empty' },
  dns: { value: '', state: 'empty' },
  lease: { value: '', state: 'empty' },
});

function fill(config: Config, values: Record<FieldKey, string>, state: FieldState): Config {
  return Object.fromEntries((Object.keys(config) as FieldKey[]).map((k) => [k, { value: values[k], state }])) as Config;
}

const hoursLabel = (s: number) => `${s / 3600} h`;

/** Builds steps one at a time, carrying the config and pools forward. */
function builder(config: Config, pools: PoolView[]) {
  const steps: Step[] = [];
  let state = { config, pools, t: 0 };
  return {
    get: () => state,
    push(s: Omit<Step, 'config' | 'pools' | 't'>, patch: Partial<typeof state> = {}) {
      state = { ...state, ...patch };
      steps.push({ ...s, config: state.config, pools: state.pools, t: state.t });
    },
    steps,
  };
}

const values = (ip: string, net: typeof LAN, lease: number): Record<FieldKey, string> => ({
  ip, mask: net.mask, router: net.router, dns: net.dns, lease: hoursLabel(lease),
});

/**
 * The client's broadcast DISCOVER. `to` is '*' on a LAN where every lifeline hears it; in the
 * relay scene only the relay is on the laptop's link, so it's drawn to the relay alone.
 */
const discover = (id = 'discover', to = '*'): Omit<Step, 'config' | 'pools' | 't'> => ({
  id, from: 'laptop', to, label: 'DHCPDISCOVER', note: `${UNSPECIFIED}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}`, tone: 'info', event: 'discover',
  wire: { type: 'DHCPDISCOVER', src: { ip: UNSPECIFIED, port: CLIENT_PORT }, dst: { ip: BROADCAST, port: SERVER_PORT } },
});

/** One server on the LAN: the four-message DORA exchange. */
export function doraScene(lease = DEFAULT_LEASE_S): Scene {
  let pool = createPool(range('192.168.1.100', POOL_SIZE), { '192.168.1.100': { status: 'leased', mac: OTHER_MAC, until: lease } });
  const b = builder(emptyConfig(), [{ label: `server ${SERVER_A}`, pool }]);
  b.push(discover());
  const o = offer(pool, LAPTOP_MAC, 0);
  pool = o.pool;
  const addr = o.addr!;
  b.push(
    {
      id: 'offer', from: 'server', to: 'laptop', label: `DHCPOFFER ${addr}`, note: `${SERVER_A}:${SERVER_PORT} → ${addr}:${CLIENT_PORT}`, tone: 'violet', event: 'offer',
      wire: { type: 'DHCPOFFER', src: { ip: SERVER_A, port: SERVER_PORT }, dst: { ip: addr, port: CLIENT_PORT }, addr },
    },
    { config: fill(b.get().config, values(addr, LAN, lease), 'offered'), pools: [{ label: `server ${SERVER_A}`, pool }] },
  );
  b.push({
    id: 'request', from: 'laptop', to: '*', label: `DHCPREQUEST ${addr}`, note: `${UNSPECIFIED}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}`, tone: 'info', event: 'request',
    wire: { type: 'DHCPREQUEST', src: { ip: UNSPECIFIED, port: CLIENT_PORT }, dst: { ip: BROADCAST, port: SERVER_PORT }, addr, server: SERVER_A },
  });
  const r = request(pool, LAPTOP_MAC, addr, 1, lease);
  pool = r.pool;
  b.push(
    {
      id: 'ack', from: 'server', to: 'laptop', label: 'DHCPACK', note: `${SERVER_A}:${SERVER_PORT} → ${addr}:${CLIENT_PORT}`, tone: 'ok', event: 'ack',
      wire: { type: 'DHCPACK', src: { ip: SERVER_A, port: SERVER_PORT }, dst: { ip: addr, port: CLIENT_PORT }, addr },
    },
    { config: fill(b.get().config, values(addr, LAN, lease), 'set'), pools: [{ label: `server ${SERVER_A}`, pool }], t: 1 },
  );
  return { actors: [{ id: 'laptop', label: 'Laptop' }, { id: 'server', label: 'DHCP server' }], steps: b.steps };
}

/** Two servers both offer; the broadcast REQUEST names one, and the other withdraws its offer. */
export function twoServersScene(lease = DEFAULT_LEASE_S): Scene {
  let a = createPool(range('192.168.1.100', POOL_SIZE));
  let bp = createPool(range('192.168.1.200', POOL_SIZE));
  const views = () => [{ label: `server A ${SERVER_A}`, pool: a }, { label: `server B ${SERVER_B}`, pool: bp }];
  const b = builder(emptyConfig(), views());
  b.push(discover());
  const oa = offer(a, LAPTOP_MAC, 0);
  a = oa.pool;
  b.push(
    {
      id: 'offerA', from: 'serverA', to: 'laptop', label: `DHCPOFFER ${oa.addr}`, note: `${SERVER_A}:${SERVER_PORT} → ${oa.addr}:${CLIENT_PORT}`, tone: 'violet', event: 'offer',
      wire: { type: 'DHCPOFFER', src: { ip: SERVER_A, port: SERVER_PORT }, dst: { ip: oa.addr!, port: CLIENT_PORT }, addr: oa.addr! },
    },
    { config: fill(b.get().config, values(oa.addr!, LAN, lease), 'offered'), pools: views() },
  );
  const ob = offer(bp, LAPTOP_MAC, 0);
  bp = ob.pool;
  b.push(
    {
      id: 'offerB', from: 'serverB', to: 'laptop', label: `DHCPOFFER ${ob.addr}`, note: `${SERVER_B}:${SERVER_PORT} → ${ob.addr}:${CLIENT_PORT}`, tone: 'violet', event: 'offer',
      wire: { type: 'DHCPOFFER', src: { ip: SERVER_B, port: SERVER_PORT }, dst: { ip: ob.addr!, port: CLIENT_PORT }, addr: ob.addr! },
    },
    { pools: views() },
  );
  b.push({
    id: 'request', from: 'laptop', to: '*', label: `DHCPREQUEST ${oa.addr} from A`, note: `${UNSPECIFIED}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}`, tone: 'info', event: 'request',
    wire: { type: 'DHCPREQUEST', src: { ip: UNSPECIFIED, port: CLIENT_PORT }, dst: { ip: BROADCAST, port: SERVER_PORT }, addr: oa.addr!, server: SERVER_A },
  });
  bp = withdraw(bp, LAPTOP_MAC);
  b.push({ id: 'withdraw', from: 'serverB', to: 'serverB', label: `withdraw ${ob.addr}`, tone: 'dim', event: 'withdraw' }, { pools: views() });
  const r = request(a, LAPTOP_MAC, oa.addr!, 1, lease);
  a = r.pool;
  b.push(
    {
      id: 'ack', from: 'serverA', to: 'laptop', label: 'DHCPACK', note: `${SERVER_A}:${SERVER_PORT} → ${oa.addr}:${CLIENT_PORT}`, tone: 'ok', event: 'ack',
      wire: { type: 'DHCPACK', src: { ip: SERVER_A, port: SERVER_PORT }, dst: { ip: oa.addr!, port: CLIENT_PORT }, addr: oa.addr! },
    },
    { config: fill(b.get().config, values(oa.addr!, LAN, lease), 'set'), pools: views(), t: 1 },
  );
  return {
    actors: [{ id: 'laptop', label: 'Laptop' }, { id: 'serverA', label: 'Server A' }, { id: 'serverB', label: 'Server B' }],
    steps: b.steps,
  };
}

/** Every address is leased: no offer comes, the client retries, then falls back to link-local. */
export function exhaustedScene(rnd: Rnd): Scene {
  const taken = Object.fromEntries(range('192.168.1.100', POOL_SIZE).map((a, i) => [a, { status: 'leased' as const, mac: `02:00:5e:20:00:0${i}`, until: DEFAULT_LEASE_S }]));
  const pool = createPool(range('192.168.1.100', POOL_SIZE), taken);
  const b = builder(emptyConfig(), [{ label: `server ${SERVER_A}`, pool }]);
  b.push(discover());
  if (offer(pool, LAPTOP_MAC, 0).addr !== null) throw new Error('the exhausted pool should have nothing to offer');
  b.push({ id: 'none1', from: 'laptop', to: 'laptop', label: `no offer after ${RETRY_S[0]} s`, tone: 'bad', event: 'no-offer' }, { t: RETRY_S[0] });
  b.push({ ...discover('retry'), event: 'retry', note: `retry: ${UNSPECIFIED}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}` });
  b.push({ id: 'none2', from: 'laptop', to: 'laptop', label: `still nothing after ${RETRY_S[1]} s`, tone: 'bad', event: 'no-offer' }, { t: RETRY_S[0] + RETRY_S[1] });
  const ip = apipaAddress(rnd);
  b.push(
    { id: 'apipa', from: 'laptop', to: 'laptop', label: `use ${ip}`, note: 'link-local: this link only', tone: 'orange', event: 'apipa' },
    {
      config: {
        ip: { value: ip, state: 'link-local' },
        mask: { value: '255.255.0.0', state: 'link-local' },
        router: { value: 'none', state: 'empty' },
        dns: { value: 'none', state: 'empty' },
        lease: { value: 'none', state: 'empty' },
      },
    },
  );
  return { actors: [{ id: 'laptop', label: 'Laptop' }, { id: 'server', label: 'DHCP server' }], steps: b.steps };
}

/** The server is on another subnet: a relay agent on the router forwards DORA as unicast. */
export function relayScene(lease = DEFAULT_LEASE_S): Scene {
  let pool = createPool(range('192.168.2.100', POOL_SIZE));
  const view = () => [{ label: `server ${REMOTE_SERVER}, pool for 192.168.2.0/24`, pool }];
  const b = builder(emptyConfig(), view());
  const relayed = (type: MsgType, from: string, to: string, src: Endpoint, dst: Endpoint, addr?: string): Omit<Step, 'config' | 'pools' | 't'> => ({
    id: `${type}-${from}`, from, to, label: `${type}${addr && type !== 'DHCPACK' ? ` ${addr}` : ''}`, note: `${src.ip}:${src.port} → ${dst.ip}:${dst.port}`,
    tone: type === 'DHCPACK' ? 'ok' : dst.ip === BROADCAST ? 'info' : 'violet', event: from === 'relay' ? (to === 'server' ? 'relay-up' : 'relay-down') : type === 'DHCPOFFER' ? 'offer' : 'ack',
    wire: { type, src, dst, addr, giaddr: RELAY_IP },
  });
  const relayEnd = { ip: RELAY_IP, port: SERVER_PORT };
  const serverEnd = { ip: REMOTE_SERVER, port: SERVER_PORT };
  b.push(discover('discover', 'relay'));
  b.push(relayed('DHCPDISCOVER', 'relay', 'server', relayEnd, serverEnd));
  const o = offer(pool, LAPTOP_MAC, 0);
  pool = o.pool;
  const addr = o.addr!;
  b.push(relayed('DHCPOFFER', 'server', 'relay', serverEnd, relayEnd, addr), { pools: view() });
  b.push(relayed('DHCPOFFER', 'relay', 'laptop', relayEnd, { ip: addr, port: CLIENT_PORT }, addr), {
    config: fill(b.get().config, values(addr, REMOTE_LAN, lease), 'offered'),
  });
  b.push({
    id: 'request', from: 'laptop', to: 'relay', label: `DHCPREQUEST ${addr}`, note: `${UNSPECIFIED}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}`, tone: 'info', event: 'request',
    wire: { type: 'DHCPREQUEST', src: { ip: UNSPECIFIED, port: CLIENT_PORT }, dst: { ip: BROADCAST, port: SERVER_PORT }, addr, server: REMOTE_SERVER },
  });
  b.push(relayed('DHCPREQUEST', 'relay', 'server', relayEnd, serverEnd, addr));
  pool = request(pool, LAPTOP_MAC, addr, 1, lease).pool;
  b.push(relayed('DHCPACK', 'server', 'relay', serverEnd, relayEnd, addr), { pools: view(), t: 1 });
  b.push(relayed('DHCPACK', 'relay', 'laptop', relayEnd, { ip: addr, port: CLIENT_PORT }, addr), {
    config: fill(b.get().config, values(addr, REMOTE_LAN, lease), 'set'),
  });
  return {
    actors: [{ id: 'laptop', label: 'Laptop' }, { id: 'relay', label: `Relay ${RELAY_IP}` }, { id: 'server', label: `Server ${REMOTE_SERVER}` }],
    steps: b.steps,
  };
}

/**
 * A bound lease running out the clock: renew by unicast at T1; if the server is gone, rebind
 * by broadcast at T2; with no answer by the end of the lease, the address must be dropped.
 */
export function leaseScene(lease: number, serverUp: boolean): Scene {
  const ip = '192.168.1.101';
  const { t1, t2, expiry } = leaseTimers(lease);
  let pool = createPool(range('192.168.1.100', POOL_SIZE), { [ip]: { status: 'leased', mac: LAPTOP_MAC, until: lease } });
  const view = () => [{ label: `server ${SERVER_A}`, pool }];
  const bound = fill(emptyConfig(), values(ip, LAN, lease), 'set');
  const b = builder(bound, view());
  const self = { ip, port: CLIENT_PORT };
  b.push(
    {
      id: 'renew', from: 'laptop', to: 'server', label: 'DHCPREQUEST (renew)', note: `${ip}:${CLIENT_PORT} → ${SERVER_A}:${SERVER_PORT}`, tone: 'violet', event: 'renew', lost: !serverUp,
      wire: { type: 'DHCPREQUEST', src: self, dst: { ip: SERVER_A, port: SERVER_PORT }, addr: ip },
    },
    { t: t1 },
  );
  if (serverUp) {
    pool = request(pool, LAPTOP_MAC, ip, t1, lease).pool;
    b.push(
      {
        id: 'renewack', from: 'server', to: 'laptop', label: 'DHCPACK', note: `${SERVER_A}:${SERVER_PORT} → ${ip}:${CLIENT_PORT}`, tone: 'ok', event: 'renew-ack',
        wire: { type: 'DHCPACK', src: { ip: SERVER_A, port: SERVER_PORT }, dst: self, addr: ip },
      },
      { pools: view() },
    );
  } else {
    b.push(
      {
        id: 'rebind', from: 'laptop', to: '*', label: 'DHCPREQUEST (rebind)', note: `${ip}:${CLIENT_PORT} → ${BROADCAST}:${SERVER_PORT}`, tone: 'info', event: 'rebind',
        wire: { type: 'DHCPREQUEST', src: self, dst: { ip: BROADCAST, port: SERVER_PORT }, addr: ip },
      },
      { t: t2 },
    );
    b.push({ id: 'nothing', from: 'laptop', to: 'laptop', label: 'no answer to the rebind', tone: 'bad', event: 'rebind-lost' });
    b.push(
      { id: 'expire', from: 'laptop', to: 'laptop', label: `lease over: drop ${ip}`, tone: 'bad', event: 'expire' },
      { t: expiry, config: emptyConfig(), pools: [{ label: `server ${SERVER_A}`, pool: expire(pool, expiry) }] },
    );
  }
  return { actors: [{ id: 'laptop', label: 'Laptop' }, { id: 'server', label: 'DHCP server' }], steps: b.steps };
}
