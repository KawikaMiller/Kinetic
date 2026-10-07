/**
 * A simulated LAN for the ARP lesson: four hosts and a router on one switch. Pure pieces:
 * the next-hop decision (the subnet AND), each host's ARP cache with aging, the switch's
 * learn / flood / forward state machine, and the bytes of every frame. `send` strings them
 * together into the steps one transmission takes. MAC addresses are made up (locally
 * administered, 02:…); IPs are RFC 1918 plus the RFC 5737 documentation range.
 */

export const ETHERTYPE_ARP = 0x0806;
export const ETHERTYPE_IPV4 = 0x0800;
export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
export const ZERO_MAC = '00:00:00:00:00:00';
export const ARP_REQUEST = 1;
export const ARP_REPLY = 2;
/** Ethernet header: destination MAC 6 + source MAC 6 + EtherType 2. */
export const ETH_HEADER_BYTES = 14;
/** ARP for IPv4 over Ethernet (RFC 826). */
export const ARP_BODY_BYTES = 28;

export const PREFIX = 24;

export type HostId = 'A' | 'B' | 'C' | 'D' | 'R';

export interface Host {
  id: HostId;
  name: string;
  ip: string;
  mac: string;
  /** Switch port it's plugged into. */
  port: number;
}

export const HOSTS: readonly Host[] = [
  { id: 'A', name: 'Host A', ip: '192.168.1.10', mac: '02:00:00:00:00:0a', port: 1 },
  { id: 'B', name: 'Host B', ip: '192.168.1.20', mac: '02:00:00:00:00:14', port: 2 },
  { id: 'C', name: 'Host C', ip: '192.168.1.30', mac: '02:00:00:00:00:1e', port: 3 },
  { id: 'D', name: 'Host D', ip: '192.168.1.40', mac: '02:00:00:00:00:28', port: 4 },
  { id: 'R', name: 'Router', ip: '192.168.1.1', mac: '02:00:00:00:00:01', port: 5 },
];
export const PORTS = HOSTS.map((h) => h.port);
export const GATEWAY = HOSTS.find((h) => h.id === 'R')!;
export const REMOTE_IP = '203.0.113.10';

export const hostById = (id: HostId) => HOSTS.find((h) => h.id === id)!;
export const hostByIp = (ip: string) => HOSTS.find((h) => h.ip === ip) ?? null;
export const hostByMac = (mac: string) => HOSTS.find((h) => h.mac === mac) ?? null;

// ── Next hop ────────────────────────────────────────────────────────────

const toNum = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
export const networkOf = (ip: string, prefix: number) => (toNum(ip) & maskOf(prefix)) >>> 0;
export const ipOf = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 0xff).join('.');

export interface NextHop {
  onLink: boolean;
  /** The IP whose MAC the frame needs: the target itself, or the default gateway. */
  ip: string;
}

/** Same subnet → deliver to the target directly; otherwise hand it to the default gateway. */
export function nextHop(senderIp: string, targetIp: string, prefix = PREFIX, gateway = GATEWAY.ip): NextHop {
  const onLink = networkOf(senderIp, prefix) === networkOf(targetIp, prefix);
  return { onLink, ip: onLink ? targetIp : gateway };
}

// ── ARP cache ───────────────────────────────────────────────────────────

export interface CacheEntry {
  mac: string;
  /** When it was learned (seconds). */
  at: number;
}

export type Cache = Readonly<Record<string, CacheEntry>>;

export const isExpired = (e: CacheEntry, now: number, timeout: number) => now - e.at >= timeout;

/** A usable mapping, or null on a miss (never learned, or aged out). */
export function lookup(cache: Cache, ip: string, now: number, timeout: number): CacheEntry | null {
  const e = cache[ip];
  return e && !isExpired(e, now, timeout) ? e : null;
}

/** Drop the entries that have aged out. */
export function age(cache: Cache, now: number, timeout: number): Cache {
  return Object.fromEntries(Object.entries(cache).filter(([, e]) => !isExpired(e, now, timeout)));
}

export const learn = (cache: Cache, ip: string, mac: string, now: number): Cache => ({ ...cache, [ip]: { mac, at: now } });

// ── The switch ──────────────────────────────────────────────────────────

export interface SwitchEntry {
  port: number;
  at: number;
}

export type SwitchTable = Readonly<Record<string, SwitchEntry>>;

export type SwitchAction = 'flood' | 'forward' | 'filter';

export interface SwitchResult {
  table: SwitchTable;
  action: SwitchAction;
  out: number[];
  /** True when this frame taught the switch a new or moved source MAC. */
  learned: boolean;
}

/**
 * One frame through a learning switch: learn the source MAC's port; a broadcast or an unknown
 * destination floods every port except the one it came in on; a known destination goes out
 * of its one port (or is dropped if that is the ingress port).
 */
export function switchFrame(table: SwitchTable, src: string, dst: string, inPort: number, ports: readonly number[], now: number): SwitchResult {
  const learned = table[src]?.port !== inPort;
  const next = { ...table, [src]: { port: inPort, at: now } };
  const known = dst === BROADCAST_MAC ? undefined : next[dst];
  if (!known) return { table: next, action: 'flood', out: ports.filter((p) => p !== inPort), learned };
  if (known.port === inPort) return { table: next, action: 'filter', out: [], learned };
  return { table: next, action: 'forward', out: [known.port], learned };
}

// ── Frame bytes ─────────────────────────────────────────────────────────

export const macBytes = (mac: string) => mac.split(':').map((h) => parseInt(h, 16));
export const ipBytes = (ip: string) => ip.split('.').map(Number);
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

export interface ArpBody {
  op: typeof ARP_REQUEST | typeof ARP_REPLY;
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

/** An Ethernet header, followed by an ARP body when there is one (the IPv4 payload isn't drawn). */
export function frameBytes(dst: string, src: string, ethertype: number, arp?: ArpBody): number[] {
  const header = [...macBytes(dst), ...macBytes(src), ...u16(ethertype)];
  if (!arp) return header;
  return [
    ...header,
    ...u16(1), // hardware type: Ethernet
    ...u16(ETHERTYPE_IPV4), // protocol type: IPv4
    6, 4, // address lengths
    ...u16(arp.op),
    ...macBytes(arp.senderMac), ...ipBytes(arp.senderIp),
    ...macBytes(arp.targetMac), ...ipBytes(arp.targetIp),
  ];
}

// ── One transmission ────────────────────────────────────────────────────

export interface World {
  now: number;
  table: SwitchTable;
  caches: Readonly<Record<HostId, Cache>>;
}

export const emptyWorld = (): World => ({ now: 0, table: {}, caches: { A: {}, B: {}, C: {}, D: {}, R: {} } });

export type StepKind = 'decide' | 'hit' | 'miss' | 'arp-request' | 'arp-reply' | 'data';

export interface Frame {
  src: string;
  dst: string;
  ethertype: number;
  bytes: number[];
  arp?: ArpBody;
}

export interface Step {
  kind: StepKind;
  world: World;
  /** The frame on the wire this step, and what the switch did with it. */
  frame?: Frame;
  from?: HostId;
  inPort?: number;
  switchAction?: SwitchAction;
  out?: number[];
  /** Switch-table MAC and cache entries (host + ip) learned this step. */
  learnedMacs: string[];
  learnedCache: { host: HostId; ip: string }[];
  /** For a miss: there was an entry, but it had aged out. */
  agedOut?: boolean;
}

export interface Transmission {
  sender: Host;
  targetIp: string;
  hop: NextHop;
  /** The machine that owns the next-hop IP. */
  owner: Host;
  steps: Step[];
  world: World;
}

/** Host `senderId` sends an IPv4 packet to `targetIp`: next-hop decision, ARP if needed, then the frame. */
export function send(start: World, senderId: HostId, targetIp: string, timeout: number): Transmission {
  const sender = hostById(senderId);
  const hop = nextHop(sender.ip, targetIp);
  const owner = hostByIp(hop.ip);
  if (!owner) throw new RangeError(`no host owns ${hop.ip} on this LAN`);
  let world = start;
  const steps: Step[] = [];
  const push = (s: Omit<Step, 'world'>) => steps.push({ ...s, world });

  push({ kind: 'decide', learnedMacs: [], learnedCache: [] });

  const had = world.caches[senderId][hop.ip];
  let mac = lookup(world.caches[senderId], hop.ip, world.now, timeout)?.mac ?? null;
  if (mac) {
    push({ kind: 'hit', learnedMacs: [], learnedCache: [] });
  } else {
    world = { ...world, caches: { ...world.caches, [senderId]: age(world.caches[senderId], world.now, timeout) } };
    push({ kind: 'miss', agedOut: !!had, learnedMacs: [], learnedCache: [] });

    // Who has <next hop>? Tell <sender>.
    const reqArp: ArpBody = { op: ARP_REQUEST, senderMac: sender.mac, senderIp: sender.ip, targetMac: ZERO_MAC, targetIp: hop.ip };
    const req = switchFrame(world.table, sender.mac, BROADCAST_MAC, sender.port, PORTS, world.now);
    // the owner of the asked-for IP records who asked (RFC 826), so it can reply without ARPing back
    world = { ...world, table: req.table, caches: { ...world.caches, [owner.id]: learn(world.caches[owner.id], sender.ip, sender.mac, world.now) } };
    push({
      kind: 'arp-request', from: senderId, inPort: sender.port, switchAction: req.action, out: req.out,
      frame: { src: sender.mac, dst: BROADCAST_MAC, ethertype: ETHERTYPE_ARP, arp: reqArp, bytes: frameBytes(BROADCAST_MAC, sender.mac, ETHERTYPE_ARP, reqArp) },
      learnedMacs: req.learned ? [sender.mac] : [], learnedCache: [{ host: owner.id, ip: sender.ip }],
    });

    const repArp: ArpBody = { op: ARP_REPLY, senderMac: owner.mac, senderIp: owner.ip, targetMac: sender.mac, targetIp: sender.ip };
    const rep = switchFrame(world.table, owner.mac, sender.mac, owner.port, PORTS, world.now);
    world = { ...world, table: rep.table, caches: { ...world.caches, [senderId]: learn(world.caches[senderId], owner.ip, owner.mac, world.now) } };
    push({
      kind: 'arp-reply', from: owner.id, inPort: owner.port, switchAction: rep.action, out: rep.out,
      frame: { src: owner.mac, dst: sender.mac, ethertype: ETHERTYPE_ARP, arp: repArp, bytes: frameBytes(sender.mac, owner.mac, ETHERTYPE_ARP, repArp) },
      learnedMacs: rep.learned ? [owner.mac] : [], learnedCache: [{ host: senderId, ip: owner.ip }],
    });
    mac = owner.mac;
  }

  const data = switchFrame(world.table, sender.mac, mac, sender.port, PORTS, world.now);
  world = { ...world, table: data.table };
  push({
    kind: 'data', from: senderId, inPort: sender.port, switchAction: data.action, out: data.out,
    frame: { src: sender.mac, dst: mac, ethertype: ETHERTYPE_IPV4, bytes: frameBytes(mac, sender.mac, ETHERTYPE_IPV4) },
    learnedMacs: data.learned ? [sender.mac] : [], learnedCache: [],
  });
  return { sender, targetIp, hop, owner, steps, world };
}

/** Time passes (only when the learner presses Wait): caches keep their entries until a lookup finds them stale. */
export const wait = (world: World, seconds: number): World => ({ ...world, now: world.now + seconds });
export const clearSwitch = (world: World): World => ({ ...world, table: {} });

export const TIMEOUTS_S = { min: 15, max: 120, step: 15, initial: 60 } as const;
export const WAIT_S = 30;
