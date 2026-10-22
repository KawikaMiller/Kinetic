import { describe, expect, it } from 'vitest';
import { ipToString } from '../../core/ipv4';
import { COMPONENT_ID, KINDS, LOCAL_PREFERENCE, candidatePriority, candidatesOf, checksMade, nominatedOf, pairPriority, pairsOf, pairWorks, type Scenario } from './ice';
import { NAT_TYPES, OFFSET_MAX, PROBE_TICKS, SCENE, letsIn, makeNat, matrix, punch, stunTable, type Endpoint, type NatType, type Peer } from './nat';
import { BITRATE_MBPS, CALLS, ONE_WAY_MS, PRICE_PER_GB, SHARE, latencies, relayLoad } from './relay';

// ---- an independent reference simulation ------------------------------------------------------
// Written separately from nat.ts: each NAT is a plain array of mappings plus a map from external port to the set of
// "ip" (address-restricted) or "ip:port" (port-restricted) strings its inside host has sent to. Every packet and every
// table entry is tracked, and the rule is applied from the RFC 4787 vocabulary, not from nat.ts.

interface RefNat {
  ip: string;
  nextPort: number;
  mapping: 'eim' | 'apdm';
  filtering: 'open' | 'addr' | 'port';
  rows: { inside: string; dest: string | null; port: number }[];
  sentTo: Map<number, Set<string>>;
}
const REF_RULES: Record<NatType, Pick<RefNat, 'mapping' | 'filtering'>> = {
  full: { mapping: 'eim', filtering: 'open' },
  restricted: { mapping: 'eim', filtering: 'addr' },
  'port-restricted': { mapping: 'eim', filtering: 'port' },
  symmetric: { mapping: 'apdm', filtering: 'port' },
};
const s = (e: Endpoint) => `${ipToString(e.ip)}:${e.port}`;

function refNat(peer: Peer, type: NatType, rules = REF_RULES): RefNat {
  return { ip: ipToString(SCENE.natIp[peer]), nextPort: SCENE.firstPort[peer], ...rules[type], rows: [], sentTo: new Map() };
}
function refSend(n: RefNat, inside: string, dest: string): string {
  let row = n.rows.find((r) => r.inside === inside && (n.mapping === 'eim' || r.dest === dest));
  if (!row) {
    row = { inside, dest: n.mapping === 'apdm' ? dest : null, port: n.nextPort++ };
    n.rows.push(row);
    n.sentTo.set(row.port, new Set());
  }
  const sent = n.sentTo.get(row.port)!;
  sent.add(dest.split(':')[0]);
  sent.add(dest);
  return `${n.ip}:${row.port}`;
}
function refReceive(n: RefNat, from: string, port: number): boolean {
  if (!n.sentTo.has(port)) return false;
  if (n.filtering === 'open') return true;
  const sent = n.sentTo.get(port)!;
  return n.filtering === 'addr' ? sent.has(from.split(':')[0]) : sent.has(from);
}

interface RefProbe {
  tick: number;
  from: Peer;
  delivered: boolean;
}
function refPunch(a: NatType, b: NatType, offset: number, firstSender: Peer, rules = REF_RULES): { probes: RefProbe[]; connected: boolean } {
  const nat = { A: refNat('A', a, rules), B: refNat('B', b, rules) };
  const inside = { A: s(SCENE.inside.A), B: s(SCENE.inside.B) };
  const stun = s(SCENE.stun);
  const reflexive = { A: refSend(nat.A, inside.A, stun), B: refSend(nat.B, inside.B, stun) };
  const aim = { A: reflexive.B, B: reflexive.A };
  const probes: RefProbe[] = [];
  const got = { A: false, B: false };
  const start = { A: 0, B: offset };
  for (let tick = 0; tick < offset + PROBE_TICKS && !(got.A && got.B); tick++) {
    for (const p of firstSender === 'A' ? (['A', 'B'] as const) : (['B', 'A'] as const)) {
      if (tick < start[p] || tick >= start[p] + PROBE_TICKS) continue;
      const q: Peer = p === 'A' ? 'B' : 'A';
      const dest = aim[p];
      const src = refSend(nat[p], inside[p], dest);
      const [destIp, destPort] = dest.split(':');
      const ok = destIp === nat[q].ip && refReceive(nat[q], src, Number(destPort));
      if (ok) {
        aim[q] = src;
        got[p] = true;
      }
      probes.push({ tick, from: p, delivered: ok });
    }
  }
  return { probes, connected: got.A && got.B };
}

/** The published result (Ford, Srisuresh and Kegel; RFC 4787 vocabulary), from memory: verify. */
const publishedWorks = (a: NatType, b: NatType): boolean => {
  const hard = (t: NatType) => t === 'symmetric';
  if (hard(a) && (b === 'symmetric' || b === 'port-restricted')) return false;
  if (hard(b) && (a === 'port-restricted' || a === 'symmetric')) return false;
  return true;
};

describe('the outcome matrix equals an independent packet simulation and the published result', () => {
  it('every cell, every offset 0..3 and both tie orders: same probes delivered and dropped as the reference', () => {
    let cells = 0;
    for (const a of NAT_TYPES) for (const b of NAT_TYPES) for (let offset = 0; offset <= OFFSET_MAX; offset++) for (const first of ['A', 'B'] as const) {
      const sim = punch(a, b, offset, first);
      const ref = refPunch(a, b, offset, first);
      const label = `${a} x ${b}, offset ${offset}, ${first} first`;
      expect(sim.connected, label).toBe(ref.connected);
      expect(sim.probes.map((p) => [p.tick, p.from, p.delivered]), label).toEqual(ref.probes.map((p) => [p.tick, p.from, p.delivered]));
      cells++;
    }
    expect(cells).toBe(4 * 4 * 4 * 2);
  });

  it('equals the published rule in every cell at every offset: EIM pairs punch, a symmetric NAT fails against port-restricted or symmetric, and works against open or address-restricted', () => {
    for (let offset = 0; offset <= OFFSET_MAX; offset++) {
      for (const first of ['A', 'B'] as const) {
        const m = matrix(offset, first);
        NAT_TYPES.forEach((a, i) => NAT_TYPES.forEach((b, j) => expect(m[i][j], `${a} x ${b} offset ${offset}`).toBe(publishedWorks(a, b))));
      }
    }
  });

  it('13 of the 16 pairs punch and 3 do not, and the matrix is symmetric', () => {
    const m = matrix();
    expect(m.flat().filter(Boolean)).toHaveLength(13);
    NAT_TYPES.forEach((_, i) => NAT_TYPES.forEach((__, j) => expect(m[i][j]).toBe(m[j][i])));
    expect(NAT_TYPES.flatMap((a, i) => NAT_TYPES.filter((_, j) => !m[i][j]).map((b) => `${a}+${b}`))).toEqual(['port-restricted+symmetric', 'symmetric+port-restricted', 'symmetric+symmetric']);
  });

  it('a broken variant is caught: a reference whose NATs ignore filtering connects symmetric x symmetric, which the published rule says fails', () => {
    const noFiltering = Object.fromEntries(NAT_TYPES.map((t) => [t, { ...REF_RULES[t], filtering: 'open' as const }])) as typeof REF_RULES;
    const disagreements = NAT_TYPES.flatMap((a) => NAT_TYPES.filter((b) => refPunch(a, b, 0, 'A', noFiltering).connected !== publishedWorks(a, b)).map((b) => `${a}+${b}`));
    expect(disagreements.length).toBeGreaterThan(0);
    expect(disagreements).toContain('symmetric+symmetric');
  });
});

describe('hand-traced cells', () => {
  const rows = (a: NatType, b: NatType, offset: number, first: Peer = 'A') => punch(a, b, offset, first).probes.map((p) => `${p.tick}${p.from}${p.delivered ? '+' : '-'}`);

  it('restricted x restricted, B starts one tick late: A is dropped twice, then both directions deliver', () => {
    // t0 A: B has contacted only the STUN server -> dropped. t1 A: B still silent -> dropped; B sends and A's NAT already
    // lists B's address (A sent to it at t0) -> delivered. t2 A: B's NAT now lists A -> delivered; B delivers.
    expect(rows('restricted', 'restricted', 1)).toEqual(['0A-', '1A-', '1B+', '2A+', '2B+']);
    const p = punch('restricted', 'restricted', 1);
    expect(p.firstDelivered).toEqual({ A: 2, B: 1 });
    expect(p.probes[0].reason).toContain('198.51.100.20 was never contacted');
  });

  it("restricted x restricted at offset 0: A's first probe is dropped by B's NAT but opens A's NAT for B, so B's first probe gets through, then A's second", () => {
    expect(rows('restricted', 'restricted', 0)).toEqual(['0A-', '0B+', '1A+', '1B+']);
  });

  it('full cone x full cone: the first probe is delivered at once, nothing is dropped', () => {
    expect(rows('full', 'full', 0)).toEqual(['0A+', '0B+']);
    expect(punch('full', 'full', 0).dropped).toBe(0);
  });

  it('symmetric x restricted: the STUN address is the wrong port, the second round gets through, and the receiver learns the real source', () => {
    expect(rows('symmetric', 'restricted', 0)).toEqual(['0A-', '0B-', '1A+', '1B+']);
    const p = punch('symmetric', 'restricted', 0);
    expect(p.probes[2].learned).toBe(true);
    expect(p.probes[2].src.port).toBe(40001);
    expect(p.reflexive.A.port).toBe(40000);
    expect(p.probes[1].reason).toContain('port-restricted');
  });

  it('symmetric x port-restricted and symmetric x symmetric: every probe of both peers is dropped', () => {
    for (const b of ['port-restricted', 'symmetric'] as const) {
      const p = punch('symmetric', b, 0);
      expect(p.connected).toBe(false);
      expect(p.probes).toHaveLength(2 * PROBE_TICKS);
      expect(p.probes.every((x) => !x.delivered)).toBe(true);
    }
  });

  it('a punchable pair still connects when the second peer starts late, at every offset up to the maximum', () => {
    for (let offset = 1; offset <= OFFSET_MAX; offset++) {
      for (const a of NAT_TYPES) for (const b of NAT_TYPES) {
        if (publishedWorks(a, b)) expect(punch(a, b, offset).connected, `${a} ${b} ${offset}`).toBe(true);
      }
    }
  });

  it('a late peer: A\'s probes before B starts are dropped when the receiving NAT filters, and delivered when it is open', () => {
    for (const b of ['restricted', 'port-restricted'] as const) {
      const p = punch('port-restricted', b, 2);
      expect(p.probes.filter((x) => x.from === 'A' && x.tick < 2).every((x) => !x.delivered)).toBe(true);
    }
    expect(punch('port-restricted', 'full', 2).probes[0].delivered).toBe(true);
  });
});

describe('the NAT table itself', () => {
  it('endpoint-independent mapping reuses one port for two destinations, address-and-port-dependent makes a new one', () => {
    const d1: Endpoint = SCENE.stun;
    const d2: Endpoint = { ip: SCENE.stun.ip, port: 9999 };
    const eim = makeNat('A', 'port-restricted');
    expect(eim.outbound(SCENE.inside.A, d1).port).toBe(eim.outbound(SCENE.inside.A, d2).port);
    const sym = makeNat('A', 'symmetric');
    expect(sym.outbound(SCENE.inside.A, d1).port).not.toBe(sym.outbound(SCENE.inside.A, d2).port);
    expect(sym.mappings).toHaveLength(2);
  });

  it('filtering: open lets anyone in, address-restricted lets an address in on any port, port-restricted needs the exact port', () => {
    const contacted: Endpoint = { ip: SCENE.stun.ip, port: 3478 };
    const samePortDifferent: Endpoint = { ip: SCENE.stun.ip, port: 3479 };
    const stranger: Endpoint = { ip: SCENE.signalling.ip, port: 3478 };
    const verdicts = (t: NatType) => {
      const n = makeNat('A', t);
      const out = n.outbound(SCENE.inside.A, contacted);
      return [contacted, samePortDifferent, stranger].map((src) => n.inbound(src, out.port).ok);
    };
    expect(verdicts('full')).toEqual([true, true, true]);
    expect(verdicts('restricted')).toEqual([true, true, false]);
    expect(verdicts('port-restricted')).toEqual([true, false, false]);
    expect(verdicts('symmetric')).toEqual([true, false, false]);
  });

  it('a packet to a port with no mapping is dropped, naming the port', () => {
    const n = makeNat('B', 'full');
    expect(n.inbound(SCENE.stun, 12345)).toEqual({ ok: false, reason: 'no mapping on port 12345' });
  });

  it('after the STUN request each NAT has exactly one mapping, for the STUN server, and the table text says who is let in', () => {
    for (const t of NAT_TYPES) {
      const rowsA = stunTable('A', t);
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0].outside.port).toBe(40000);
      const text = letsIn(t, rowsA[0]);
      if (t === 'full') expect(text).toBe('anyone');
      else if (t === 'restricted') expect(text).toContain('192.0.2.10');
      else expect(text).toBe('192.0.2.10:3478');
    }
  });

  it('the example addresses are private or in the documentation ranges only', () => {
    const docs = ['192.0.2.', '198.51.100.', '203.0.113.'];
    const ok = (ip: number) => {
      const t = ipToString(ip);
      return docs.some((p) => t.startsWith(p)) || t.startsWith('10.') || t.startsWith('192.168.');
    };
    for (const e of [SCENE.inside.A, SCENE.inside.B, SCENE.stun, SCENE.signalling, SCENE.turn]) expect(ok(e.ip)).toBe(true);
    for (const ip of Object.values(SCENE.natIp)) expect(ok(ip)).toBe(true);
  });
});

// ---- ICE ---------------------------------------------------------------------------------------

describe('ICE priorities', () => {
  it('a host candidate with local preference 65535 and component 1 is 2130706431 (the value RFC 8445 uses as an example), by hand: 126 * 2^24 + 65535 * 2^8 + 255', () => {
    expect(126 * 16777216 + 65535 * 256 + 255).toBe(2130706431);
    expect(candidatePriority('host', LOCAL_PREFERENCE, COMPONENT_ID)).toBe(2130706431);
  });
  it('server-reflexive and relayed values by hand', () => {
    expect(candidatePriority('srflx')).toBe(100 * 16777216 + 16776960 + 255);
    expect(candidatePriority('srflx')).toBe(1694498815);
    expect(candidatePriority('relay')).toBe(16777215);
  });
  it('the component id and the local preference enter as written', () => {
    expect(candidatePriority('host', 0, 1)).toBe(126 * 16777216 + 255);
    expect(candidatePriority('host', 0, 2)).toBe(126 * 16777216 + 254);
    expect(candidatePriority('host', 1, 1) - candidatePriority('host', 0, 1)).toBe(256);
  });
  it('pair priority hand vectors: 2^32 * min + 2 * max + (G > D)', () => {
    expect(pairPriority(5, 3)).toBe(3n * 4294967296n + 10n + 1n);
    expect(pairPriority(3, 5)).toBe(3n * 4294967296n + 10n);
    expect(pairPriority(7, 7)).toBe(7n * 4294967296n + 14n);
    expect(pairPriority(5, 3)).toBe(12884901899n);
  });
  it('pair priority needs a bigint: the host-host value is above the largest exact double', () => {
    const p = pairPriority(2130706431, 2130706431);
    expect(p > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(p).toBe(2130706431n * 4294967296n + 2n * 2130706431n);
  });
  it('the controlling agent\'s candidate breaks a tie in its own favour', () => {
    expect(pairPriority(10, 20) < pairPriority(20, 10)).toBe(true);
  });
});

const SCENARIOS: Scenario[] = [
  ...NAT_TYPES.flatMap((a) => NAT_TYPES.map((b) => ({ a, b, sameLan: false }))),
  { a: 'port-restricted', b: 'port-restricted', sameLan: true },
];

describe('candidate pairs and nomination', () => {
  it('nine pairs, sorted by priority, highest first, for every scenario', () => {
    for (const sc of SCENARIOS) {
      const pairs = pairsOf(sc);
      expect(pairs).toHaveLength(9);
      for (let i = 1; i < pairs.length; i++) expect(pairs[i - 1].priority >= pairs[i].priority).toBe(true);
      expect(new Set(pairs.map((p) => p.id)).size).toBe(9);
    }
  });

  it('the nominated pair is the highest-priority pair that works, by brute force over every pair and scenario', () => {
    for (const sc of SCENARIOS) {
      const pairs = pairsOf(sc);
      const working = pairs.filter((p) => p.works);
      const best = working.reduce((m, p) => (p.priority > m.priority ? p : m));
      expect(nominatedOf(pairs)?.id).toBe(best.id);
      expect(working.length).toBeGreaterThan(0);
    }
  });

  it('checks run down the list and stop at the nominated pair', () => {
    for (const sc of SCENARIOS) {
      const pairs = pairsOf(sc);
      const made = checksMade(pairs);
      const nominated = nominatedOf(pairs)!;
      expect(made[made.length - 1].id).toBe(nominated.id);
      expect(made.slice(0, -1).every((p) => !p.works)).toBe(true);
    }
  });

  it('same LAN: the host pair works and wins; both home routers: the host pair fails and the first working pair is host to server-reflexive', () => {
    const lan = pairsOf({ a: 'port-restricted', b: 'port-restricted', sameLan: true });
    expect(nominatedOf(lan)?.id).toBe('host-host');
    const home = pairsOf({ a: 'port-restricted', b: 'port-restricted', sameLan: false });
    expect(home[0].id).toBe('host-host');
    expect(home[0].works).toBe(false);
    expect(nominatedOf(home)?.id).toBe('host-srflx');
  });

  it('both symmetric: no direct pair works, and the first pair that does involves a relayed candidate', () => {
    const pairs = pairsOf({ a: 'symmetric', b: 'symmetric', sameLan: false });
    expect(pairs.filter((p) => p.works).every((p) => p.local.kind === 'relay' || p.remote.kind === 'relay')).toBe(true);
    expect(nominatedOf(pairs)?.id).toBe('host-relay');
    expect(pairs.find((p) => p.id === 'srflx-srflx')?.works).toBe(false);
  });

  it('a pair\'s outcome follows the simulation: server-reflexive pairs work exactly when the matrix says the NAT pair punches', () => {
    const m = matrix();
    NAT_TYPES.forEach((a, i) => NAT_TYPES.forEach((b, j) => expect(pairWorks('srflx', 'srflx', { a, b, sameLan: false })).toBe(m[i][j])));
  });

  it('candidate lists have one of each kind with the formula priority, and the addresses are the scene\'s', () => {
    const sc: Scenario = { a: 'port-restricted', b: 'symmetric', sameLan: false };
    const mine = candidatesOf('A', sc);
    expect(mine.map((c) => c.kind)).toEqual([...KINDS]);
    expect(mine.map((c) => c.priority)).toEqual([2130706431, 1694498815, 16777215]);
    expect(ipToString(mine[1].addr.ip)).toBe('198.51.100.20');
    expect(candidatesOf('B', sc)[1].addr.port).toBe(50000);
  });
});

// ---- the relay ---------------------------------------------------------------------------------

describe('the relay readouts equal their formulas', () => {
  it('latency: the relayed path is the two legs to the relay, 90 ms against 30, 60 ms more', () => {
    expect(latencies()).toEqual({ direct: 30, relayed: 90, extra: 60 });
    expect(ONE_WAY_MS.toRelay * 2 - ONE_WAY_MS.direct).toBe(latencies().extra);
  });
  it('1,000 calls with 20% relayed: 200 relayed calls, 800 Mbit/s out, 360 GB an hour, $18 an hour (hand worked)', () => {
    const l = relayLoad(1000, 20);
    expect(l.relayedCalls).toBe(200);
    expect(l.directCalls).toBe(800);
    expect(l.egressMbps).toBe(200 * 2 * BITRATE_MBPS);
    expect(l.egressMbps).toBe(800);
    expect(l.gbPerHour).toBe(360);
    expect(l.costPerHour).toBeCloseTo(18, 10);
  });
  it('at the slider extremes: nothing relayed costs nothing, everything relayed doubles the stream rate per call', () => {
    expect(relayLoad(CALLS.max, SHARE.min)).toMatchObject({ relayedCalls: 0, egressMbps: 0, gbPerHour: 0, costPerHour: 0 });
    const all = relayLoad(CALLS.max, SHARE.max);
    expect(all.relayedCalls).toBe(CALLS.max);
    expect(all.egressMbps).toBe(CALLS.max * 2 * BITRATE_MBPS);
    expect(all.costPerHour).toBeCloseTo((all.egressMbps * 3600 / 8000) * PRICE_PER_GB, 9);
  });
  it('direct plus relayed calls always add up to the total, for every slider combination', () => {
    for (let calls = CALLS.min; calls <= CALLS.max; calls += CALLS.step) {
      for (let share = SHARE.min; share <= SHARE.max; share += SHARE.step) {
        const l = relayLoad(calls, share);
        expect(l.relayedCalls + l.directCalls).toBe(calls);
        expect(l.relayedCalls).toBe(Math.round((calls * share) / 100));
      }
    }
  });
});
