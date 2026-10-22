import { describe, expect, it } from 'vitest';
import { ipv4 } from '../../core/ipv4';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import {
  ALL_PORTS, ANYWHERE, EPHEMERAL_PORT, FLOWS, GROUP_OF, INSTANCES, NAT_PUBLIC_IP, OUTSIDE_IP, PRESETS, SUBNETS, SUBNET_CIDR,
  asIntended, behaviourOf, ipOf, lookup, presetConfig, rulesOf, tableOf, traceFlow, withRules,
  type Cidr, type DropKind, type Flow, type FlowEnd, type InstanceId, type NaclRule, type Peer, type RouteEntry, type SgRule, type SubnetId, type VpcConfig,
} from './vpc';

// ---- an independent reference evaluator, written from the documented semantics -----------------
// AWS-style semantics, FROM MEMORY (verify against the provider documentation):
//   route table: longest prefix wins, the VPC range has an implicit local route;
//   security group: union of allow rules, default deny inbound, stateful (the reply needs no rule);
//   network ACL: lowest-numbered matching rule wins, no match = deny, stateless (the reply needs its own rule),
//   not consulted between two instances of one subnet.

const bits = (n: number) => n.toString(2).padStart(32, '0');
const within = (c: Cidr, a: number) => bits(c.net).slice(0, c.prefix) === bits(a).slice(0, c.prefix);

type RefDrop = 'sgOut' | 'sgIn' | 'aclOut' | 'aclIn' | 'aclRetOut' | 'aclRetIn' | 'noRoute' | 'noRouteBack' | 'noPublicIp' | 'natNoIgw';
const REF_TO_MODEL: Record<RefDrop, DropKind> = {
  sgOut: 'sg-out', sgIn: 'sg-in', aclOut: 'nacl-out', aclIn: 'nacl-in', aclRetOut: 'nacl-return-out', aclRetIn: 'nacl-return-in',
  noRoute: 'no-route', noRouteBack: 'no-route-back', noPublicIp: 'no-public-ip', natNoIgw: 'nat-no-igw',
};

function reference(cfg: VpcConfig, flow: Flow): RefDrop | null {
  const isInst = (e: FlowEnd): e is InstanceId => e === 'web' || e === 'app' || e === 'db';
  const ipOfEnd = (e: FlowEnd) => (isInst(e) ? ipOf(cfg, e) : OUTSIDE_IP[e]);
  const a = flow.from;
  const b = flow.to;
  const ipA = ipOfEnd(a);
  const ipB = ipOfEnd(b);
  const sgAllows = (rules: SgRule[], port: number, peerIp: number, peerEnd: FlowEnd) =>
    rules.some((r) => {
      const portOk = r.proto === 'all' || (port >= r.ports.lo && port <= r.ports.hi);
      const peerOk = r.peer.kind === 'cidr' ? within(r.peer.cidr, peerIp) : isInst(peerEnd) && GROUP_OF[peerEnd] === r.peer.group;
      return portOk && peerOk;
    });
  const aclAllows = (rules: NaclRule[], port: number, ip: number) => {
    const hits = rules.filter((r) => (r.proto === 'all' || (port >= r.ports.lo && port <= r.ports.hi)) && within(r.cidr, ip));
    if (hits.length === 0) return false;
    const lowest = hits.reduce((m, h) => (h.num < m.num ? h : m));
    return lowest.action === 'allow';
  };
  const bestRoute = (s: SubnetId, ip: number): 'local' | 'igw' | 'nat' | null => {
    const entries: { c: Cidr; t: 'local' | 'igw' | 'nat' }[] = [{ c: { net: ipv4('10.0.0.0'), prefix: 16 }, t: 'local' }, ...cfg.routes[s].map((r) => ({ c: { net: r.net, prefix: r.prefix }, t: r.target }))];
    const hits = entries.filter((e) => within(e.c, ip)).sort((x, y) => y.c.prefix - x.c.prefix);
    return hits.length ? hits[0].t : null;
  };

  if (isInst(a) && isInst(b)) {
    const sa = cfg.instances[a].subnet;
    const sb = cfg.instances[b].subnet;
    if (!sgAllows(cfg.sgOut[a], flow.port, ipB, b)) return 'sgOut';
    if (sa !== sb) {
      if (!aclAllows(cfg.naclOut[sa], flow.port, ipB)) return 'aclOut';
      if (!aclAllows(cfg.naclIn[sb], flow.port, ipA)) return 'aclIn';
    }
    if (!sgAllows(cfg.sgIn[b], flow.port, ipA, a)) return 'sgIn';
    if (sa !== sb) {
      if (!aclAllows(cfg.naclOut[sb], EPHEMERAL_PORT, ipA)) return 'aclRetOut';
      if (!aclAllows(cfg.naclIn[sa], EPHEMERAL_PORT, ipB)) return 'aclRetIn';
    }
    return null;
  }
  if (isInst(a)) {
    const sa = cfg.instances[a].subnet;
    if (!sgAllows(cfg.sgOut[a], flow.port, ipB, b)) return 'sgOut';
    if (!aclAllows(cfg.naclOut[sa], flow.port, ipB)) return 'aclOut';
    const way = bestRoute(sa, ipB);
    if (way === null || way === 'local') return 'noRoute';
    if (way === 'igw' && !cfg.instances[a].publicIp) return 'noPublicIp';
    if (way === 'nat' && bestRoute('public', ipB) !== 'igw') return 'natNoIgw';
    if (!aclAllows(cfg.naclIn[sa], EPHEMERAL_PORT, ipB)) return 'aclRetIn';
    return null;
  }
  const inst = b as InstanceId;
  const sb = cfg.instances[inst].subnet;
  if (!cfg.instances[inst].publicIp) return 'noPublicIp';
  if (!aclAllows(cfg.naclIn[sb], flow.port, ipA)) return 'aclIn';
  if (!sgAllows(cfg.sgIn[inst], flow.port, ipA, a)) return 'sgIn';
  if (bestRoute(sb, ipA) !== 'igw') return 'noRouteBack';
  if (!aclAllows(cfg.naclOut[sb], EPHEMERAL_PORT, ipA)) return 'aclRetOut';
  return null;
}

// ---- seeded random configurations and packets ---------------------------------------------------

const PORTS = [22, 443, 5432, 8080];
const CIDRS: Cidr[] = [
  ANYWHERE, { net: ipv4('10.0.0.0'), prefix: 16 }, SUBNET_CIDR.public, SUBNET_CIDR.private, SUBNET_CIDR.isolated,
  { net: ipv4('203.0.113.0'), prefix: 24 }, { net: ipv4('192.0.2.0'), prefix: 24 }, { net: ipv4('198.51.100.0'), prefix: 24 },
];
const EXTERNAL_ROUTES: Cidr[] = [ANYWHERE, { net: ipv4('192.0.2.0'), prefix: 24 }, { net: ipv4('203.0.113.0'), prefix: 24 }, { net: ipv4('198.51.100.0'), prefix: 24 }, { net: ipv4('192.0.0.0'), prefix: 8 }];

function randomPeer(rnd: Rnd): Peer {
  return rnd() < 0.35 ? { kind: 'group', group: pick(['web-sg', 'app-sg', 'db-sg'] as const, rnd) } : { kind: 'cidr', cidr: pick(CIDRS, rnd) };
}
function randomSg(rnd: Rnd): SgRule[] {
  return Array.from({ length: randInt(0, 3, rnd) }, (): SgRule => {
    if (rnd() < 0.2) return { proto: 'all', ports: ALL_PORTS, peer: randomPeer(rnd) };
    const lo = pick(PORTS, rnd);
    return { proto: 'tcp', ports: { lo, hi: lo + randInt(0, 1, rnd) * 100 }, peer: randomPeer(rnd) };
  });
}
function randomNacl(rnd: Rnd): NaclRule[] {
  const nums = [100, 110, 120, 130];
  const rules: NaclRule[] = Array.from({ length: randInt(0, 4, rnd) }, (_, i) => {
    const all = rnd() < 0.25;
    const lo = pick([22, 443, 1024, 5432, 8080], rnd);
    const hi = lo === 1024 ? 65535 : lo;
    return { num: nums[i], action: rnd() < 0.7 ? 'allow' : 'deny', proto: all ? 'all' : 'tcp', ports: all ? ALL_PORTS : { lo, hi }, cidr: pick(CIDRS, rnd) };
  });
  return rnd() < 0.5 ? rules.reverse() : rules;
}
function randomRoutes(rnd: Rnd): RouteEntry[] {
  const chosen = EXTERNAL_ROUTES.filter(() => rnd() < 0.4);
  return chosen.map((c) => ({ net: c.net, prefix: c.prefix, target: rnd() < 0.5 ? ('igw' as const) : ('nat' as const) }));
}
function randomConfig(rnd: Rnd): VpcConfig {
  const subnet = () => pick(SUBNETS, rnd);
  const perSubnet = <T,>(f: () => T): Record<SubnetId, T> => ({ public: f(), private: f(), isolated: f() });
  const perInstance = <T,>(f: () => T): Record<InstanceId, T> => ({ web: f(), app: f(), db: f() });
  return {
    instances: { web: { subnet: subnet(), publicIp: rnd() < 0.5 }, app: { subnet: subnet(), publicIp: rnd() < 0.5 }, db: { subnet: subnet(), publicIp: rnd() < 0.5 } },
    routes: perSubnet(() => randomRoutes(rnd)),
    sgIn: perInstance(() => randomSg(rnd)),
    sgOut: perInstance(() => (rnd() < 0.5 ? [{ proto: 'all' as const, ports: ALL_PORTS, peer: { kind: 'cidr' as const, cidr: ANYWHERE } }] : randomSg(rnd))),
    naclIn: perSubnet(() => randomNacl(rnd)),
    naclOut: perSubnet(() => randomNacl(rnd)),
  };
}
function randomFlow(rnd: Rnd): Flow {
  const port = pick(PORTS, rnd);
  const kind = randInt(0, 2, rnd);
  const x = pick(INSTANCES, rnd);
  const y = pick(INSTANCES.filter((i) => i !== x), rnd);
  if (kind === 0) return { id: 'r', label: 'random', from: x, to: y, port, intended: 'reach' };
  if (kind === 1) return { id: 'r', label: 'random', from: x, to: 'updates', port, intended: 'reach' };
  return { id: 'r', label: 'random', from: 'internet', to: x, port, intended: 'reach' };
}

describe('the tracer equals an independent reference evaluator', () => {
  it('agrees with the reference on 2,000 seeded random configurations and packets, drop reason included', () => {
    const rnd = mulberry32(30);
    const tally = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const cfg = randomConfig(rnd);
      const flow = randomFlow(rnd);
      const expected = reference(cfg, flow);
      const got = traceFlow(cfg, flow);
      expect(got.delivered, `case ${i}`).toBe(expected === null);
      expect(got.drop, `case ${i}`).toBe(expected === null ? null : REF_TO_MODEL[expected]);
      tally.set(expected ?? 'delivered', (tally.get(expected ?? 'delivered') ?? 0) + 1);
    }
    // The comparison is not vacuous: every outcome the model can report shows up many times.
    for (const k of ['delivered', 'sgOut', 'sgIn', 'aclOut', 'aclIn', 'aclRetOut', 'aclRetIn', 'noRoute', 'noRouteBack', 'noPublicIp', 'natNoIgw']) {
      expect(tally.get(k) ?? 0, k).toBeGreaterThanOrEqual(2);
    }
  });

  it('a broken variant is caught: a model that skips the reply-leg ACL disagrees with the reference somewhere', () => {
    const rnd = mulberry32(31);
    let disagreements = 0;
    for (let i = 0; i < 400; i++) {
      const cfg = randomConfig(rnd);
      const flow = randomFlow(rnd);
      const noReplyAcl = { ...cfg, naclOut: { public: [], private: [], isolated: [] } } as VpcConfig;
      // Swapping every outbound ACL for an empty list changes outcomes: the reference must notice it too.
      if ((reference(noReplyAcl, flow) === null) !== (reference(cfg, flow) === null)) disagreements++;
    }
    expect(disagreements).toBeGreaterThan(0);
  });
});

describe('hand cases', () => {
  it('a stateful return path passes without a rule: empty outbound lists on the replying side do not stop the reply', () => {
    const base = presetConfig('three-tier');
    expect(traceFlow(base, FLOWS[0]).delivered).toBe(true);
    const noOutWeb = { ...base, sgOut: { ...base.sgOut, web: [] } } as VpcConfig;
    // the reply of internet -> web leaves web with no outbound rule at all
    const t = traceFlow(noOutWeb, FLOWS[0]);
    expect(t.delivered).toBe(true);
    expect(t.hops.some((h) => h.leg === 'reply' && h.verdict === 'info' && h.title === 'web-sg, the reply')).toBe(true);
    const noOutDb = { ...base, sgOut: { ...base.sgOut, db: [] } } as VpcConfig;
    expect(traceFlow(noOutDb, FLOWS[2]).delivered).toBe(true);
    // while the request leg does need the sender's outbound rule
    const noOutApp = { ...base, sgOut: { ...base.sgOut, app: [] } } as VpcConfig;
    expect(traceFlow(noOutApp, FLOWS[2]).drop).toBe('sg-out');
  });

  it('the same return path is dropped by a stateless ACL without the ephemeral-port rule, and passes once it has one', () => {
    const broken = presetConfig('acl-replies');
    const t = traceFlow(broken, FLOWS[2]);
    expect(t.drop).toBe('nacl-return-out');
    expect(t.hops.filter((h) => h.leg === 'request').every((h) => h.verdict !== 'drop')).toBe(true);
    const fixedRule: NaclRule = { num: 110, action: 'allow', proto: 'tcp', ports: { lo: 1024, hi: 65535 }, cidr: SUBNET_CIDR.private };
    const fixed = withRules(broken, { kind: 'nacl', dir: 'out', subnet: 'isolated' }, [...rulesOf(broken, { kind: 'nacl', dir: 'out', subnet: 'isolated' }), fixedRule]);
    expect(traceFlow(fixed, FLOWS[2]).delivered).toBe(true);
    // a port range that stops short of 49152 does not fix it
    const short = withRules(broken, { kind: 'nacl', dir: 'out', subnet: 'isolated' }, [{ ...fixedRule, ports: { lo: 1024, hi: 49151 } }]);
    expect(traceFlow(short, FLOWS[2]).drop).toBe('nacl-return-out');
  });

  it('the lowest-numbered rule wins: a deny before an allow blocks, and the order they were added in does not matter', () => {
    const base = presetConfig('three-tier');
    const deny: NaclRule = { num: 50, action: 'deny', proto: 'tcp', ports: { lo: 8080, hi: 8080 }, cidr: ANYWHERE };
    const lists = [[deny, ...base.naclIn.private], [...base.naclIn.private, deny]];
    for (const l of lists) {
      const cfg = withRules(base, { kind: 'nacl', dir: 'in', subnet: 'private' }, l);
      expect(traceFlow(cfg, FLOWS[1]).drop).toBe('nacl-in');
    }
    const late: NaclRule = { ...deny, num: 500 };
    const cfg = withRules(base, { kind: 'nacl', dir: 'in', subnet: 'private' }, [late, ...base.naclIn.private]);
    expect(traceFlow(cfg, FLOWS[1]).delivered).toBe(true);
  });

  it('two instances of one subnet are not checked by the ACL', () => {
    const cfg0 = presetConfig('db-public');
    const denyAll: NaclRule = { num: 100, action: 'deny', proto: 'all', ports: ALL_PORTS, cidr: ANYWHERE };
    const cfg = withRules(withRules(cfg0, { kind: 'nacl', dir: 'in', subnet: 'public' }, [denyAll]), { kind: 'nacl', dir: 'out', subnet: 'public' }, [denyAll]);
    const webToDb: Flow = { id: 'x', label: 'web to db', from: 'web', to: 'db', port: 5432, intended: 'reach' };
    const t = traceFlow(cfg, webToDb);
    expect(t.delivered).toBe(true);
    expect(t.hops.some((h) => h.verdict === 'info' && h.text.includes('no network ACL is consulted'))).toBe(true);
    // the same flow across subnets is stopped by the same ACL
    const across: Flow = { ...webToDb, from: 'app' };
    expect(traceFlow(cfg, across).drop).toBe('nacl-in');
  });

  it('a private instance reaches the internet through the NAT gateway but needs a public address to go through the gateway directly', () => {
    const base = presetConfig('three-tier');
    const viaNat = traceFlow(base, FLOWS[3]);
    expect(viaNat.delivered).toBe(true);
    expect(viaNat.path).toEqual(['app', 'nat', 'igw', 'internet', 'igw', 'nat', 'app']);
    const direct = withRules(base, { kind: 'route', subnet: 'private' }, [{ net: 0, prefix: 0, target: 'igw' }]);
    expect(traceFlow(direct, FLOWS[3]).drop).toBe('no-public-ip');
    expect(traceFlow({ ...direct, instances: { ...direct.instances, app: { subnet: 'private', publicIp: true } } }, FLOWS[3]).delivered).toBe(true);
    // the NAT gateway cannot help if its own subnet has no way out
    const stuck = withRules(base, { kind: 'route', subnet: 'public' }, []);
    expect(traceFlow(stuck, FLOWS[3]).drop).toBe('nat-no-igw');
    expect(NAT_PUBLIC_IP).toBe(ipv4('198.51.100.7'));
  });

  it('a subnet is public because of its route, not its name', () => {
    const base = presetConfig('three-tier');
    expect(SUBNETS.map((s) => behaviourOf(base, s))).toEqual(['public', 'private', 'isolated']);
    const renamed = withRules(base, { kind: 'route', subnet: 'public' }, []);
    expect(behaviourOf(renamed, 'public')).toBe('isolated');
    const allPublic = presetConfig('all-public');
    expect(SUBNETS.map((s) => behaviourOf(allPublic, s))).toEqual(['public', 'public', 'public']);
  });

  it('every preset: the intended design is as intended, and each broken one fails exactly where its note says', () => {
    const outcomes = (id: Parameters<typeof presetConfig>[0]) => FLOWS.map((f) => [f.id, traceFlow(presetConfig(id), f)] as const);
    expect(outcomes('three-tier').every(([id, t]) => asIntended(FLOWS.find((f) => f.id === id)!, t))).toBe(true);
    const wrong = (id: Parameters<typeof presetConfig>[0]) =>
      outcomes(id).filter(([fid, t]) => !asIntended(FLOWS.find((f) => f.id === fid)!, t)).map(([fid, t]) => `${fid}:${t.drop ?? 'delivered'}`);
    expect(wrong('all-public')).toEqual(['db-updates:delivered', 'user-db:delivered']);
    expect(wrong('db-public')).toEqual(['db-updates:delivered', 'user-db:delivered']);
    expect(wrong('acl-replies')).toEqual(['app-db:nacl-return-out']);
    expect(wrong('app-db')).toEqual(['app-db:sg-in']);
    expect(wrong('no-updates')).toEqual(['app-updates:no-route']);
    expect(PRESETS.map((p) => p.id)).toEqual(['three-tier', 'all-public', 'db-public', 'acl-replies', 'app-db', 'no-updates']);
  });

  it('db-public puts the db address in the public subnet range', () => {
    const cfg = presetConfig('db-public');
    expect(ipOf(cfg, 'db')).toBe(ipv4('10.0.1.30'));
    expect(ipOf(presetConfig('three-tier'), 'db')).toBe(ipv4('10.0.3.30'));
  });
});

describe('route lookup', () => {
  it('a 0.0.0.0/0 route never wins over a more specific route, on 300 seeded tables', () => {
    const rnd = mulberry32(32);
    for (let i = 0; i < 300; i++) {
      const cfg = presetConfig('three-tier');
      const table = withRules(cfg, { kind: 'route', subnet: 'private' }, [{ net: 0, prefix: 0, target: 'nat' }, ...EXTERNAL_ROUTES.slice(1).filter(() => rnd() < 0.6).map((c) => ({ net: c.net, prefix: c.prefix, target: 'igw' as const }))]);
      const addr = pick([ipv4('192.0.2.80'), ipv4('203.0.113.50'), ipv4('198.51.100.9'), ipv4('192.168.1.1'), ipv4('8.8.8.8')], rnd);
      const hit = lookup(table, 'private', addr)!;
      const longest = Math.max(...tableOf(table, 'private').filter((r) => within({ net: r.net, prefix: r.prefix }, addr)).map((r) => r.prefix));
      expect(hit.prefix).toBe(longest);
      if (longest > 0) expect(hit.target).not.toBe('nat');
    }
  });

  it('an address inside the VPC always matches the local route first', () => {
    const t = presetConfig('all-public');
    for (const inst of INSTANCES) expect(lookup(t, 'public', ipOf(t, inst))?.target).toBe('local');
  });

  it('list helpers keep other lists untouched', () => {
    const cfg = presetConfig('three-tier');
    const next = withRules(cfg, { kind: 'sg', dir: 'in', instance: 'app' }, []);
    expect(next.sgIn.web).toBe(cfg.sgIn.web);
    expect(next.sgIn.app).toEqual([]);
    expect(cfg.sgIn.app).toHaveLength(1);
  });
});
