/**
 * The VPC model: one network, three subnets, three instances, and the rule lists that decide whether a
 * flow gets through. Pure logic, no React.
 *
 * Semantics follow the AWS-style documentation as remembered (the lesson chips them "from memory"):
 * - A route table is longest-prefix match over the implicit `local` route for the VPC range plus the
 *   learner's routes. A destination with no match has no route.
 * - A security group belongs to an instance. It is allow-only (a union of rules), stateful (a reply to an
 *   allowed request needs no rule), default-deny inbound. Outbound is also allow-only: "default allow outbound"
 *   is the one `all 0.0.0.0/0` rule a new group starts with, which can be deleted.
 * - A network ACL belongs to a subnet. Rules are numbered, the lowest matching number wins, allow or deny, and
 *   nothing matching means deny. It is stateless: the reply needs its own rule. Traffic between two instances
 *   in the same subnet is not checked by the ACL.
 *
 * Order of checks (a flow is dropped at the first failing one, request leg then reply leg):
 *   instance to instance: sender group out, sender-subnet ACL out, receiver-subnet ACL in, receiver group in;
 *                         reply: receiver-subnet ACL out, sender-subnet ACL in (groups let the reply through).
 *   instance to outside:  sender group out, sender-subnet ACL out, route lookup (no route; internet gateway needs
 *                         a public IP on the instance; NAT gateway needs its own subnet to route to an internet
 *                         gateway); reply: sender-subnet ACL in.
 *   outside to instance:  public IP on the receiver, receiver-subnet ACL in, receiver group in;
 *                         reply: route lookup for the outside address (must be the internet gateway),
 *                         receiver-subnet ACL out.
 * The NAT gateway's own subnet ACL is not evaluated (a simplification, said on screen).
 */
import { contains, ipv4, ipToString, longestPrefixMatch, type Route } from '../../core/ipv4';

export const VPC_NET = ipv4('10.0.0.0');
export const VPC_PREFIX = 16;
export const MAX_RULES = 20;
export const PORT_MAX = 65535;
/** The client's source port in every flow: inside the ephemeral range the reply's ACL rule has to cover. */
export const EPHEMERAL_PORT = 49152;
export const EPHEMERAL_RANGE = { lo: 1024, hi: 65535 } as const;

export type SubnetId = 'public' | 'private' | 'isolated';
export type InstanceId = 'web' | 'app' | 'db';
export type Outside = 'internet' | 'updates';
export type Direction = 'in' | 'out';
export type GroupId = 'web-sg' | 'app-sg' | 'db-sg';

export const SUBNETS: readonly SubnetId[] = ['public', 'private', 'isolated'];
export const INSTANCES: readonly InstanceId[] = ['web', 'app', 'db'];
export const GROUP_OF: Record<InstanceId, GroupId> = { web: 'web-sg', app: 'app-sg', db: 'db-sg' };
export const GROUPS: readonly GroupId[] = ['web-sg', 'app-sg', 'db-sg'];
export const INSTANCE_OF_GROUP: Record<GroupId, InstanceId> = { 'web-sg': 'web', 'app-sg': 'app', 'db-sg': 'db' };

export interface Cidr {
  net: number;
  prefix: number;
}
export const cidrText = (c: Cidr) => `${ipToString(c.net)}/${c.prefix}`;

export const SUBNET_CIDR: Record<SubnetId, Cidr> = {
  public: { net: ipv4('10.0.1.0'), prefix: 24 },
  private: { net: ipv4('10.0.2.0'), prefix: 24 },
  isolated: { net: ipv4('10.0.3.0'), prefix: 24 },
};
const HOST_NUMBER: Record<InstanceId, number> = { web: 10, app: 20, db: 30 };
/** Documentation-range addresses (RFC 5737): the internet user, an update server, the public side of instances and of the NAT gateway. */
export const OUTSIDE_IP: Record<Outside, number> = { internet: ipv4('203.0.113.50'), updates: ipv4('192.0.2.80') };
export const OUTSIDE_NAME: Record<Outside, string> = { internet: 'internet user', updates: 'update server' };
const PUBLIC_IP_BASE = ipv4('198.51.100.0');
export const NAT_PUBLIC_IP = ipv4('198.51.100.7');

export interface PortRange {
  lo: number;
  hi: number;
}
export type Proto = 'tcp' | 'all';
export type Peer = { kind: 'cidr'; cidr: Cidr } | { kind: 'group'; group: GroupId };
export interface SgRule {
  proto: Proto;
  ports: PortRange;
  /** The source for an inbound rule, the destination for an outbound one. */
  peer: Peer;
}
export interface NaclRule {
  num: number;
  action: 'allow' | 'deny';
  proto: Proto;
  ports: PortRange;
  cidr: Cidr;
}
export interface RouteEntry extends Route {
  target: 'igw' | 'nat';
}

export interface InstanceConfig {
  subnet: SubnetId;
  publicIp: boolean;
}
export interface VpcConfig {
  instances: Record<InstanceId, InstanceConfig>;
  routes: Record<SubnetId, RouteEntry[]>;
  sgIn: Record<InstanceId, SgRule[]>;
  sgOut: Record<InstanceId, SgRule[]>;
  naclIn: Record<SubnetId, NaclRule[]>;
  naclOut: Record<SubnetId, NaclRule[]>;
}

export const ALL_PORTS: PortRange = { lo: 0, hi: PORT_MAX };
export const ANYWHERE: Cidr = { net: 0, prefix: 0 };

export const ipOf = (cfg: VpcConfig, id: InstanceId): number => SUBNET_CIDR[cfg.instances[id].subnet].net + HOST_NUMBER[id];
export const publicIpOf = (id: InstanceId): number => PUBLIC_IP_BASE + HOST_NUMBER[id];

// ---- rule lists the learner edits -----------------------------------------------------------------

export type ListRef =
  | { kind: 'route'; subnet: SubnetId }
  | { kind: 'sg'; dir: Direction; instance: InstanceId }
  | { kind: 'nacl'; dir: Direction; subnet: SubnetId };
export type AnyRule = RouteEntry | SgRule | NaclRule;

export function rulesOf(cfg: VpcConfig, ref: ListRef): AnyRule[] {
  if (ref.kind === 'route') return cfg.routes[ref.subnet];
  if (ref.kind === 'sg') return (ref.dir === 'in' ? cfg.sgIn : cfg.sgOut)[ref.instance];
  return (ref.dir === 'in' ? cfg.naclIn : cfg.naclOut)[ref.subnet];
}

/** A copy of the config with one list replaced. */
export function withRules(cfg: VpcConfig, ref: ListRef, rules: AnyRule[]): VpcConfig {
  if (ref.kind === 'route') return { ...cfg, routes: { ...cfg.routes, [ref.subnet]: rules as RouteEntry[] } };
  if (ref.kind === 'sg') {
    const key = ref.dir === 'in' ? 'sgIn' : 'sgOut';
    return { ...cfg, [key]: { ...cfg[key], [ref.instance]: rules as SgRule[] } };
  }
  const key = ref.dir === 'in' ? 'naclIn' : 'naclOut';
  return { ...cfg, [key]: { ...cfg[key], [ref.subnet]: rules as NaclRule[] } };
}

export const sameList = (a: ListRef, b: ListRef): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---- text for rules -------------------------------------------------------------------------------

export const portsText = (proto: Proto, p: PortRange) => (proto === 'all' ? 'all ports' : p.lo === p.hi ? `port ${p.lo}` : `ports ${p.lo}-${p.hi}`);
export const peerText = (p: Peer) => (p.kind === 'group' ? p.group : cidrText(p.cidr));
export const sgRuleText = (r: SgRule) => `${r.proto === 'all' ? 'all traffic' : 'tcp'} ${portsText(r.proto, r.ports)} ${peerText(r.peer)}`;
export const naclRuleText = (r: NaclRule) => `rule ${r.num} ${r.action}s ${r.proto === 'all' ? 'all traffic' : 'tcp'} ${portsText(r.proto, r.ports)} ${cidrText(r.cidr)}`;

// ---- route lookup ---------------------------------------------------------------------------------

export interface LocalRoute extends Route {
  target: 'local';
}
const LOCAL: LocalRoute = { net: VPC_NET, prefix: VPC_PREFIX, target: 'local' };

/** The subnet's whole table, the implicit `local` route first. */
export const tableOf = (cfg: VpcConfig, subnet: SubnetId): (LocalRoute | RouteEntry)[] => [LOCAL, ...cfg.routes[subnet]];
export const lookup = (cfg: VpcConfig, subnet: SubnetId, addr: number) => longestPrefixMatch(tableOf(cfg, subnet), addr);

/** What the subnet's table does with a default route, which decides what the subnet really is. */
export type Behaviour = 'public' | 'private' | 'isolated';
export function behaviourOf(cfg: VpcConfig, subnet: SubnetId): Behaviour {
  const hit = lookup(cfg, subnet, OUTSIDE_IP.updates);
  return hit?.target === 'igw' ? 'public' : hit?.target === 'nat' ? 'private' : 'isolated';
}

// ---- rule evaluation ------------------------------------------------------------------------------

const inRange = (p: PortRange, port: number) => port >= p.lo && port <= p.hi;
const protoMatches = (proto: Proto) => proto === 'all' || proto === 'tcp';

/** The peer of a packet: an address, and the group of the instance that owns it if there is one. */
interface Endpoint {
  ip: number;
  group: GroupId | null;
}

export function sgMatch(rules: readonly SgRule[], port: number, peer: Endpoint): SgRule | null {
  for (const r of rules) {
    if (!protoMatches(r.proto) || (r.proto === 'tcp' && !inRange(r.ports, port))) continue;
    const hit = r.peer.kind === 'group' ? peer.group === r.peer.group : contains(r.peer.cidr.net, r.peer.cidr.prefix, peer.ip);
    if (hit) return r;
  }
  return null;
}

/** The lowest-numbered rule that matches wins, allow or deny; null means no rule matched (implicit deny). */
export function naclMatch(rules: readonly NaclRule[], port: number, ip: number): NaclRule | null {
  const sorted = [...rules].sort((a, b) => a.num - b.num);
  for (const r of sorted) {
    if (protoMatches(r.proto) && (r.proto === 'all' || inRange(r.ports, port)) && contains(r.cidr.net, r.cidr.prefix, ip)) return r;
  }
  return null;
}

// ---- flows and the trace --------------------------------------------------------------------------

export type FlowEnd = InstanceId | Outside;
export interface Flow {
  id: string;
  label: string;
  from: FlowEnd;
  to: FlowEnd;
  port: number;
  /** What the design wants: the flow should get through, or should be stopped. */
  intended: 'reach' | 'blocked';
}
export const FLOWS: readonly Flow[] = [
  { id: 'user-web', label: 'internet user to web:443', from: 'internet', to: 'web', port: 443, intended: 'reach' },
  { id: 'web-app', label: 'web to app:8080', from: 'web', to: 'app', port: 8080, intended: 'reach' },
  { id: 'app-db', label: 'app to db:5432', from: 'app', to: 'db', port: 5432, intended: 'reach' },
  { id: 'app-updates', label: 'app to the internet: an update download (443)', from: 'app', to: 'updates', port: 443, intended: 'reach' },
  { id: 'db-updates', label: 'db to the internet (443)', from: 'db', to: 'updates', port: 443, intended: 'blocked' },
  { id: 'user-db', label: 'internet user to db:5432', from: 'internet', to: 'db', port: 5432, intended: 'blocked' },
];

export type NodeId = 'internet' | 'igw' | 'nat' | InstanceId;
export type DropKind = 'sg-out' | 'sg-in' | 'nacl-out' | 'nacl-in' | 'nacl-return-out' | 'nacl-return-in' | 'no-route' | 'no-route-back' | 'no-public-ip' | 'nat-no-igw';

export interface Hop {
  leg: 'request' | 'reply';
  /** The drawing node the check belongs to, and the subnet box when the check is the subnet's. */
  node: NodeId;
  subnet?: SubnetId;
  /** `drop` is the check that stopped the packet; `info` is a note that is not a check. */
  verdict: 'pass' | 'drop' | 'info';
  title: string;
  text: string;
  drop?: DropKind;
}
export interface Trace {
  hops: Hop[];
  delivered: boolean;
  drop: DropKind | null;
  /** The nodes the packet visited, in order, repeats removed (for the drawing). */
  path: NodeId[];
}

const isInstance = (e: FlowEnd): e is InstanceId => e === 'web' || e === 'app' || e === 'db';

function endpointOf(cfg: VpcConfig, e: FlowEnd): Endpoint {
  return isInstance(e) ? { ip: ipOf(cfg, e), group: GROUP_OF[e] } : { ip: OUTSIDE_IP[e], group: null };
}

const ipLabel = (ip: number) => ipToString(ip);

/** Walk one flow through the config. Pure: the same config and flow always give the same hops. */
export function traceFlow(cfg: VpcConfig, flow: Flow): Trace {
  const hops: Hop[] = [];
  const path: NodeId[] = [];
  const visit = (n: NodeId) => {
    if (path[path.length - 1] !== n) path.push(n);
  };
  const finish = (): Trace => {
    const dropped = hops.find((h) => h.verdict === 'drop');
    return { hops, delivered: dropped === undefined, drop: dropped?.drop ?? null, path };
  };
  const pass = (leg: Hop['leg'], node: NodeId, title: string, text: string, subnet?: SubnetId) => {
    hops.push({ leg, node, subnet, verdict: 'pass', title, text });
  };
  const info = (leg: Hop['leg'], node: NodeId, title: string, text: string, subnet?: SubnetId) => {
    hops.push({ leg, node, subnet, verdict: 'info', title, text });
  };
  const drop = (leg: Hop['leg'], node: NodeId, kind: DropKind, title: string, text: string, subnet?: SubnetId): Trace => {
    hops.push({ leg, node, subnet, verdict: 'drop', title, text, drop: kind });
    return finish();
  };

  const src = endpointOf(cfg, flow.from);
  const dst = endpointOf(cfg, flow.to);
  const srcInst = isInstance(flow.from) ? flow.from : null;
  const dstInst = isInstance(flow.to) ? flow.to : null;
  const naclIn = (inst: InstanceId, ip: number, port: number) => naclMatch(cfg.naclIn[cfg.instances[inst].subnet], port, ip);
  const naclOut = (inst: InstanceId, ip: number, port: number) => naclMatch(cfg.naclOut[cfg.instances[inst].subnet], port, ip);
  const aclAllow = (r: NaclRule | null) => r !== null && r.action === 'allow';
  const aclWhy = (r: NaclRule | null) => (r === null ? 'no rule matches, so the implicit deny applies' : `${naclRuleText(r)}`);
  const subnetOf = (inst: InstanceId) => cfg.instances[inst].subnet;

  visit(srcInst ?? 'internet');

  // Sender's security group, outbound (only when the sender is an instance).
  if (srcInst) {
    const g = GROUP_OF[srcInst];
    const hit = sgMatch(cfg.sgOut[srcInst], flow.port, dst);
    if (!hit) return drop('request', srcInst, 'sg-out', `${g} outbound`, `No outbound rule of ${g} allows tcp ${flow.port} to ${ipLabel(dst.ip)}.`);
    pass('request', srcInst, `${g} outbound`, `Allowed by ${sgRuleText(hit)}.`);
  }

  if (srcInst && dstInst) {
    // Instance to instance, inside the VPC: the local route always applies.
    const a = subnetOf(srcInst);
    const b = subnetOf(dstInst);
    pass('request', srcInst, 'route table', `${ipLabel(dst.ip)} is inside ${cidrText({ net: VPC_NET, prefix: VPC_PREFIX })}: the local route delivers it.`, a);
    if (a !== b) {
      const out = naclOut(srcInst, dst.ip, flow.port);
      if (!aclAllow(out)) return drop('request', srcInst, 'nacl-out', `network ACL of ${a}, outbound`, `Dropped: ${aclWhy(out)}.`, a);
      pass('request', srcInst, `network ACL of ${a}, outbound`, `Allowed: ${aclWhy(out)}.`, a);
      const inn = naclIn(dstInst, src.ip, flow.port);
      if (!aclAllow(inn)) return drop('request', dstInst, 'nacl-in', `network ACL of ${b}, inbound`, `Dropped: ${aclWhy(inn)}.`, b);
      pass('request', dstInst, `network ACL of ${b}, inbound`, `Allowed: ${aclWhy(inn)}.`, b);
    } else {
      info('request', dstInst, 'network ACL', `Both are in the ${a} subnet, so no network ACL is consulted.`, a);
    }
    visit(dstInst);
    const g = GROUP_OF[dstInst];
    const hit = sgMatch(cfg.sgIn[dstInst], flow.port, src);
    if (!hit) return drop('request', dstInst, 'sg-in', `${g} inbound`, `No inbound rule of ${g} allows tcp ${flow.port} from ${ipLabel(src.ip)} (${GROUP_OF[srcInst]}).`);
    pass('request', dstInst, `${g} inbound`, `Allowed by ${sgRuleText(hit)}.`);
    // Reply leg.
    info('reply', dstInst, `${g}, the reply`, 'A security group is stateful: the reply to an allowed request leaves without any outbound rule.');
    if (a !== b) {
      const out = naclOut(dstInst, src.ip, EPHEMERAL_PORT);
      if (!aclAllow(out)) return drop('reply', dstInst, 'nacl-return-out', `network ACL of ${b}, outbound, the reply`, `Dropped: the reply goes to port ${EPHEMERAL_PORT}; ${aclWhy(out)}. A network ACL is stateless, so the reply needs its own rule.`, b);
      pass('reply', dstInst, `network ACL of ${b}, outbound, the reply`, `Allowed: ${aclWhy(out)}.`, b);
      const inn = naclIn(srcInst, dst.ip, EPHEMERAL_PORT);
      if (!aclAllow(inn)) return drop('reply', srcInst, 'nacl-return-in', `network ACL of ${a}, inbound, the reply`, `Dropped: ${aclWhy(inn)}.`, a);
      pass('reply', srcInst, `network ACL of ${a}, inbound, the reply`, `Allowed: ${aclWhy(inn)}.`, a);
    }
    visit(srcInst);
    return finish();
  }

  if (srcInst && !dstInst) {
    // Instance to the outside: route lookup decides the way out.
    const a = subnetOf(srcInst);
    const out = naclOut(srcInst, dst.ip, flow.port);
    if (!aclAllow(out)) return drop('request', srcInst, 'nacl-out', `network ACL of ${a}, outbound`, `Dropped: ${aclWhy(out)}.`, a);
    pass('request', srcInst, `network ACL of ${a}, outbound`, `Allowed: ${aclWhy(out)}.`, a);
    const route = lookup(cfg, a, dst.ip);
    if (!route) return drop('request', srcInst, 'no-route', `route table of ${a}`, `No route: the table has no entry that matches ${ipLabel(dst.ip)} (no 0.0.0.0/0).`, a);
    if (route.target === 'igw') {
      pass('request', srcInst, `route table of ${a}`, `${cidrText(route)} sends ${ipLabel(dst.ip)} to the internet gateway.`, a);
      visit('igw');
      if (!cfg.instances[srcInst].publicIp) return drop('request', 'igw', 'no-public-ip', 'internet gateway', `Dropped: ${srcInst} has only a private address, and the gateway has no public address to translate it to.`);
      pass('request', 'igw', 'internet gateway', `Translates ${ipLabel(ipOf(cfg, srcInst))} to its public address ${ipLabel(publicIpOf(srcInst))}.`);
    } else if (route.target === 'nat') {
      pass('request', srcInst, `route table of ${a}`, `${cidrText(route)} sends ${ipLabel(dst.ip)} to the NAT gateway.`, a);
      visit('nat');
      const next = lookup(cfg, 'public', dst.ip);
      if (next?.target !== 'igw') return drop('request', 'nat', 'nat-no-igw', 'NAT gateway', 'Dropped: the NAT gateway lives in the public subnet, and that subnet has no route to an internet gateway for this destination.', 'public');
      pass('request', 'nat', 'NAT gateway', `Translates to its own public address ${ipLabel(NAT_PUBLIC_IP)} and hands the packet to the internet gateway.`, 'public');
      visit('igw');
    } else {
      return drop('request', srcInst, 'no-route', `route table of ${a}`, `Dropped: the local route is the only match and ${ipLabel(dst.ip)} is outside the VPC.`, a);
    }
    visit('internet');
    pass('request', 'internet', flow.to === 'updates' ? 'update server' : 'the internet', `${OUTSIDE_NAME[flow.to as Outside]} ${ipLabel(dst.ip)} answers.`);
    visit('igw');
    if (route.target === 'nat') visit('nat');
    const inn = naclIn(srcInst, dst.ip, EPHEMERAL_PORT);
    if (!aclAllow(inn)) return drop('reply', srcInst, 'nacl-return-in', `network ACL of ${a}, inbound, the reply`, `Dropped: ${aclWhy(inn)}.`, a);
    pass('reply', srcInst, `network ACL of ${a}, inbound, the reply`, `Allowed: ${aclWhy(inn)}.`, a);
    info('reply', srcInst, `${GROUP_OF[srcInst]}, the reply`, 'A security group is stateful: the reply to an allowed request is let in without an inbound rule.');
    visit(srcInst);
    return finish();
  }

  // From the outside to an instance.
  const inst = dstInst as InstanceId;
  const b = subnetOf(inst);
  visit('igw');
  if (!cfg.instances[inst].publicIp) return drop('request', 'igw', 'no-public-ip', 'internet gateway', `Dropped: ${inst} has only a private address, so nothing on the internet can address it.`);
  pass('request', 'igw', 'internet gateway', `Translates the public address ${ipLabel(publicIpOf(inst))} to ${ipLabel(dst.ip)}.`);
  visit(inst);
  const inn = naclIn(inst, src.ip, flow.port);
  if (!aclAllow(inn)) return drop('request', inst, 'nacl-in', `network ACL of ${b}, inbound`, `Dropped: ${aclWhy(inn)}.`, b);
  pass('request', inst, `network ACL of ${b}, inbound`, `Allowed: ${aclWhy(inn)}.`, b);
  const g = GROUP_OF[inst];
  const hit = sgMatch(cfg.sgIn[inst], flow.port, src);
  if (!hit) return drop('request', inst, 'sg-in', `${g} inbound`, `No inbound rule of ${g} allows tcp ${flow.port} from ${ipLabel(src.ip)}.`);
  pass('request', inst, `${g} inbound`, `Allowed by ${sgRuleText(hit)}.`);
  info('reply', inst, `${g}, the reply`, 'A security group is stateful: the reply leaves without an outbound rule.');
  const back = lookup(cfg, b, src.ip);
  if (back?.target !== 'igw') return drop('reply', inst, 'no-route-back', `route table of ${b}`, `No route back: the reply to ${ipLabel(src.ip)} must go to the internet gateway, and the table ${back ? `sends it to ${back.target}` : 'has no matching route'}.`, b);
  pass('reply', inst, `route table of ${b}`, `${cidrText(back)} sends the reply to the internet gateway.`, b);
  const out = naclOut(inst, src.ip, EPHEMERAL_PORT);
  if (!aclAllow(out)) return drop('reply', inst, 'nacl-return-out', `network ACL of ${b}, outbound, the reply`, `Dropped: the reply goes to port ${EPHEMERAL_PORT}; ${aclWhy(out)}. A network ACL is stateless, so the reply needs its own rule.`, b);
  pass('reply', inst, `network ACL of ${b}, outbound, the reply`, `Allowed: ${aclWhy(out)}.`, b);
  visit('igw');
  visit('internet');
  return finish();
}

export const asIntended = (flow: Flow, t: Trace): boolean => t.delivered === (flow.intended === 'reach');

// ---- presets --------------------------------------------------------------------------------------

const allowAllSg = (): SgRule => ({ proto: 'all', ports: ALL_PORTS, peer: { kind: 'cidr', cidr: ANYWHERE } });
const tcp = (port: number, peer: Peer): SgRule => ({ proto: 'tcp', ports: { lo: port, hi: port }, peer });
const fromGroup = (group: GroupId): Peer => ({ kind: 'group', group });
const fromAnywhere: Peer = { kind: 'cidr', cidr: ANYWHERE };
const aclAllowAll = (): NaclRule => ({ num: 100, action: 'allow', proto: 'all', ports: ALL_PORTS, cidr: ANYWHERE });
const route = (target: 'igw' | 'nat'): RouteEntry => ({ net: 0, prefix: 0, target });

export type PresetId = 'three-tier' | 'all-public' | 'db-public' | 'acl-replies' | 'app-db' | 'no-updates';
export const PRESETS: { id: PresetId; label: string; note: string }[] = [
  { id: 'three-tier', label: 'three-tier app', note: 'The intended design.' },
  { id: 'all-public', label: 'everything public (the mistake)', note: 'Every subnet routes to the internet gateway, every instance has a public address and every group allows everything.' },
  { id: 'db-public', label: 'database in the public subnet', note: 'The database sits in the public subnet with a public address, and its group was opened to the world "to debug".' },
  { id: 'acl-replies', label: 'ACL blocks replies', note: 'The isolated subnet\'s ACL allows tcp 5432 both ways, which looks symmetric but forgets the reply\'s port.' },
  { id: 'app-db', label: 'app cannot reach db', note: 'The database group has no inbound rule for the app.' },
  { id: 'no-updates', label: 'no way out for updates', note: 'The private subnet\'s table has no default route.' },
];

export function presetConfig(id: PresetId): VpcConfig {
  const base: VpcConfig = {
    instances: { web: { subnet: 'public', publicIp: true }, app: { subnet: 'private', publicIp: false }, db: { subnet: 'isolated', publicIp: false } },
    routes: { public: [route('igw')], private: [route('nat')], isolated: [] },
    sgIn: { web: [tcp(443, fromAnywhere)], app: [tcp(8080, fromGroup('web-sg'))], db: [tcp(5432, fromGroup('app-sg'))] },
    sgOut: { web: [allowAllSg()], app: [allowAllSg()], db: [allowAllSg()] },
    naclIn: { public: [aclAllowAll()], private: [aclAllowAll()], isolated: [aclAllowAll()] },
    naclOut: { public: [aclAllowAll()], private: [aclAllowAll()], isolated: [aclAllowAll()] },
  };
  if (id === 'all-public') {
    return {
      ...base,
      instances: { web: { subnet: 'public', publicIp: true }, app: { subnet: 'private', publicIp: true }, db: { subnet: 'isolated', publicIp: true } },
      routes: { public: [route('igw')], private: [route('igw')], isolated: [route('igw')] },
      sgIn: { web: [allowAllSg()], app: [allowAllSg()], db: [allowAllSg()] },
    };
  }
  if (id === 'db-public') {
    return {
      ...base,
      instances: { ...base.instances, db: { subnet: 'public', publicIp: true } },
      sgIn: { ...base.sgIn, db: [tcp(5432, fromAnywhere)] },
    };
  }
  if (id === 'acl-replies') {
    const toApp: Cidr = SUBNET_CIDR.private;
    const fiveFourThreeTwo: PortRange = { lo: 5432, hi: 5432 };
    return {
      ...base,
      naclIn: { ...base.naclIn, isolated: [{ num: 100, action: 'allow', proto: 'tcp', ports: fiveFourThreeTwo, cidr: toApp }] },
      naclOut: { ...base.naclOut, isolated: [{ num: 100, action: 'allow', proto: 'tcp', ports: fiveFourThreeTwo, cidr: toApp }] },
    };
  }
  if (id === 'app-db') return { ...base, sgIn: { ...base.sgIn, db: [] } };
  if (id === 'no-updates') return { ...base, routes: { ...base.routes, private: [] } };
  return base;
}
