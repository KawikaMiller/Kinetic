/**
 * A simplified iptables-style host firewall: one INPUT chain of rules checked top to bottom,
 * first match wins, a default policy when nothing matches, and optional connection tracking
 * (conntrack) so replies to the host's own outbound connections can be let back in. Outbound
 * packets aren't filtered here (OUTPUT policy ACCEPT); they only teach conntrack about flows.
 *
 * Every address is from the documentation ranges (RFC 5737). Nothing here sees real traffic.
 */
import { contains, ipToString, ipv4, networkOf, parseCidr } from '../../core/ipv4';
import { parseBoundedInt, type FieldParse } from '../../core/parse';

export type Proto = 'tcp' | 'udp';
export type Action = 'ACCEPT' | 'DROP' | 'REJECT';
export type StateMatch = 'any' | 'NEW' | 'ESTABLISHED,RELATED';
export type CtState = 'NEW' | 'ESTABLISHED';

export interface Net {
  net: number;
  prefix: number;
}
export interface PortRange {
  lo: number;
  hi: number;
}

export interface Rule {
  id: string;
  enabled: boolean;
  /** null = any source. */
  src: Net | null;
  /** null = any destination port. */
  dport: PortRange | null;
  /** null = any protocol. */
  proto: Proto | null;
  state: StateMatch;
  action: Action;
  /** A human note shown beside the rule. */
  note?: string;
}

export interface Packet {
  id: string;
  /** in: arriving at the host (filtered by INPUT). out: leaving it (not filtered, tracked). */
  dir: 'in' | 'out';
  src: number;
  sport: number;
  dst: number;
  dport: number;
  proto: Proto;
  flags: string;
  label: string;
}

export const SERVER = ipv4('203.0.113.10');
export const PORT_MIN = 0;
export const PORT_MAX = 65535;
/** Linux's default ephemeral range: where the host's own outbound connections get their ports. */
export const EPHEMERAL: PortRange = { lo: 32768, hi: 60999 };

// ── Matching ────────────────────────────────────────────────────────────

/** Does this rule's match part (ignoring `enabled`) cover the packet? `ct` is null when tracking is off. */
export function ruleMatches(r: Rule, p: Packet, ct: CtState | null): boolean {
  if (r.proto && r.proto !== p.proto) return false;
  if (r.src && !contains(r.src.net, r.src.prefix, p.src)) return false;
  if (r.dport && (p.dport < r.dport.lo || p.dport > r.dport.hi)) return false;
  if (r.state !== 'any') {
    if (ct === null) return false;
    if (r.state === 'NEW' && ct !== 'NEW') return false;
    if (r.state === 'ESTABLISHED,RELATED' && ct !== 'ESTABLISHED') return false;
  }
  return true;
}

/** The first field that stops a rule matching, checked in column order, or null if it matches. */
export function mismatch(r: Rule, p: Packet, ct: CtState | null): 'src' | 'port' | 'proto' | 'state' | null {
  if (r.src && !contains(r.src.net, r.src.prefix, p.src)) return 'src';
  if (r.dport && (p.dport < r.dport.lo || p.dport > r.dport.hi)) return 'port';
  if (r.proto && r.proto !== p.proto) return 'proto';
  if (!ruleMatches(r, p, ct)) return 'state';
  return null;
}

export type RuleOutcome = 'match' | 'pass' | 'off' | 'needs-tracking' | 'unreached';

export interface Verdict {
  action: Action;
  /** Index of the rule that decided, or null when the default policy did. */
  rule: number | null;
  /** What happened at every rule, in order. */
  outcomes: RuleOutcome[];
}

/** First match wins: walk the rules in order; the first enabled rule that matches decides. */
export function evaluate(rules: readonly Rule[], p: Packet, ct: CtState | null, policy: Action): Verdict {
  const outcomes: RuleOutcome[] = [];
  let decided: number | null = null;
  rules.forEach((r, i) => {
    if (decided !== null) return outcomes.push('unreached');
    if (!r.enabled) return outcomes.push('off');
    if (r.state !== 'any' && ct === null) return outcomes.push('needs-tracking');
    if (ruleMatches(r, p, ct)) {
      decided = i;
      return outcomes.push('match');
    }
    return outcomes.push('pass');
  });
  return { action: decided === null ? policy : rules[decided].action, rule: decided, outcomes };
}

// ── Connection tracking ─────────────────────────────────────────────────

export interface CtEntry {
  id: number;
  proto: Proto;
  /** The flow as its first packet saw it. */
  src: number;
  sport: number;
  dst: number;
  dport: number;
  state: CtState;
}

const sameFlow = (e: CtEntry, p: Packet) => e.proto === p.proto && e.src === p.src && e.sport === p.sport && e.dst === p.dst && e.dport === p.dport;
const replyOf = (e: CtEntry, p: Packet) => e.proto === p.proto && e.src === p.dst && e.sport === p.dport && e.dst === p.src && e.dport === p.sport;

/** What conntrack says about a packet: ESTABLISHED for a reply to (or more of) a seen flow, otherwise NEW. */
export function ctLookup(table: readonly CtEntry[], p: Packet): { state: CtState; entry: CtEntry | null; reply: boolean } {
  for (const e of table) {
    if (replyOf(e, p)) return { state: 'ESTABLISHED', entry: e, reply: true };
    if (sameFlow(e, p)) return { state: e.state, entry: e, reply: false };
  }
  return { state: 'NEW', entry: null, reply: false };
}

export interface StreamStep {
  packet: Packet;
  /** Conntrack's view of the packet, or null when tracking is off. */
  ct: CtState | null;
  /** Null for outbound packets: OUTPUT isn't filtered in this model. */
  verdict: Verdict | null;
  /** The table after this packet. */
  table: CtEntry[];
  /** Entry created or updated by this packet. */
  touched: number | null;
}

/**
 * Run a stream of packets through the firewall in order. With tracking on, an outbound packet
 * or an accepted inbound one records its flow; a reply makes the flow ESTABLISHED. An accepted
 * inbound packet is answered by the host straight away (OUTPUT isn't filtered), so its flow is
 * ESTABLISHED from then on.
 */
export function runStream(rules: readonly Rule[], packets: readonly Packet[], tracking: boolean, policy: Action): StreamStep[] {
  let table: CtEntry[] = [];
  let nextId = 1;
  return packets.map((p) => {
    const look = tracking ? ctLookup(table, p) : null;
    const ct = look ? look.state : null;
    let touched: number | null = null;
    if (p.dir === 'out') {
      if (tracking && !look!.entry) {
        const e: CtEntry = { id: nextId++, proto: p.proto, src: p.src, sport: p.sport, dst: p.dst, dport: p.dport, state: 'NEW' };
        table = [...table, e];
        touched = e.id;
      }
      return { packet: p, ct, verdict: null, table, touched };
    }
    const verdict = evaluate(rules, p, ct, policy);
    if (tracking && verdict.action === 'ACCEPT') {
      if (look!.entry) {
        const id = look!.entry.id;
        table = table.map((e) => (e.id === id ? { ...e, state: 'ESTABLISHED' } : e));
        touched = id;
      } else {
        const e: CtEntry = { id: nextId++, proto: p.proto, src: p.src, sport: p.sport, dst: p.dst, dport: p.dport, state: 'ESTABLISHED' };
        table = [...table, e];
        touched = e.id;
      }
    }
    return { packet: p, ct, verdict, table, touched };
  });
}

// ── Shadowed rules ──────────────────────────────────────────────────────

/** "any" written out: 0.0.0.0/0 and 0-65535 match everything, just like a blank field. */
const ANY_NET: Net = { net: 0, prefix: 0 };
const ANY_PORTS: PortRange = { lo: PORT_MIN, hi: PORT_MAX };
const netCovers = (a: Net | null, b: Net | null) => {
  const [x, y] = [a ?? ANY_NET, b ?? ANY_NET];
  return x.prefix <= y.prefix && contains(x.net, x.prefix, y.net);
};
const portCovers = (a: PortRange | null, b: PortRange | null) => {
  const [x, y] = [a ?? ANY_PORTS, b ?? ANY_PORTS];
  return x.lo <= y.lo && x.hi >= y.hi;
};
const protoCovers = (a: Proto | null, b: Proto | null) => a === null || a === b;
const stateCovers = (a: StateMatch, b: StateMatch) => a === 'any' || a === b;

/** True when every packet rule `b` matches is also matched by rule `a`. */
export const covers = (a: Rule, b: Rule) => netCovers(a.src, b.src) && portCovers(a.dport, b.dport) && protoCovers(a.proto, b.proto) && stateCovers(a.state, b.state);

/**
 * Rules that can never take effect: the first earlier enabled rule matching a superset of
 * their packets has a different action. Returns, per rule index, the index of the rule hiding it.
 * Without tracking, a rule that matches on state never fires, so it hides nothing.
 */
export function shadowed(rules: readonly Rule[], tracking = true): Map<number, number> {
  const out = new Map<number, number>();
  rules.forEach((b, j) => {
    if (!b.enabled) return;
    for (let i = 0; i < j; i++) {
      const a = rules[i];
      if (!a.enabled || (!tracking && a.state !== 'any') || !covers(a, b)) continue;
      // The first earlier rule covering j takes all of j's packets: j is shadowed if that rule acts differently
      // (same action: merely redundant, not flagged).
      if (a.action !== b.action) out.set(j, i);
      return;
    }
  });
  return out;
}

// ── Text in and out ─────────────────────────────────────────────────────

export const netText = (n: Net | null) => (n ? `${ipToString(n.net)}/${n.prefix}` : 'any');
export const portText = (r: PortRange | null) => (r ? (r.lo === r.hi ? `${r.lo}` : `${r.lo}-${r.hi}`) : 'any');
export const endpoint = (ip: number, port: number) => `${ipToString(ip)}:${port}`;

/** A source field: "any", or a CIDR (a bare address means /32). Host bits are cleared, as iptables does. */
export function parseSource(text: string): FieldParse<Net | null> {
  const t = text.trim();
  if (t.toLowerCase() === 'any') return { ok: true, value: null };
  if (!t) return { ok: false, error: 'Type a CIDR like 198.51.100.0/24, or "any".' };
  const r = parseCidr(t, 32);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, value: { net: networkOf(r.value.addr, r.value.prefix), prefix: r.value.prefix } };
}

const PORT_OPTS = { min: PORT_MIN, max: PORT_MAX, messages: { tooBig: () => `Ports stop at ${PORT_MAX}.`, negative: 'Ports are 0 or more.' } };

/** A port field: "any", one port, or a range "lo-hi". */
export function parsePorts(text: string): FieldParse<PortRange | null> {
  const t = text.trim();
  if (t.toLowerCase() === 'any') return { ok: true, value: null };
  if (!t) return { ok: false, error: 'Type a port like 22, a range like 1024-65535, or "any".' };
  const parts = t.split('-');
  if (parts.length > 2) return { ok: false, error: 'A range is two ports joined by one dash, like 1024-65535.' };
  const nums = parts.map((s) => parseBoundedInt(s, PORT_OPTS));
  const bad = nums.find((n) => !n.ok);
  if (bad && !bad.ok) return { ok: false, error: bad.error };
  const [lo, hi = lo] = nums.map((n) => (n.ok ? n.value : 0));
  if (lo > hi) return { ok: false, error: `The range runs backwards: ${lo} is above ${hi}.` };
  return { ok: true, value: { lo, hi } };
}

// ── Presets ─────────────────────────────────────────────────────────────

const net = (cidr: string): Net => {
  const r = parseCidr(cidr);
  if (!r.ok) throw new RangeError(cidr);
  return { net: networkOf(r.value.addr, r.value.prefix), prefix: r.value.prefix };
};
const port = (lo: number, hi = lo): PortRange => ({ lo, hi });
const rule = (id: string, action: Action, m: Partial<Pick<Rule, 'src' | 'dport' | 'proto' | 'state' | 'note'>> = {}): Rule => ({
  id, enabled: true, src: null, dport: null, proto: null, state: 'any', action, ...m,
});

export const OFFICE = '198.51.100.0/24';
const OFFICE_HOST = ipv4('198.51.100.23');
const STRANGER = ipv4('192.0.2.77');
const UPDATES = ipv4('203.0.113.50');
const OTHER = ipv4('192.0.2.140');
const OUT_PORT = 49800;

const pk = (id: string, dir: Packet['dir'], src: number, sport: number, dst: number, dport: number, flags: string, label: string, proto: Proto = 'tcp'): Packet => ({
  id, dir, src, sport, dst, dport, proto, flags, label,
});

/** The host's own outbound HTTPS call and its reply, plus an unsolicited packet aimed at the same port. */
const OUTBOUND: Packet[] = [
  pk('out', 'out', SERVER, OUT_PORT, UPDATES, 443, 'SYN', 'the server fetches updates'),
  pk('reply', 'in', UPDATES, 443, SERVER, OUT_PORT, 'SYN,ACK', 'the update server replies'),
  pk('stray', 'in', OTHER, 443, SERVER, OUT_PORT, 'SYN', 'an unrelated host tries to open the same port'),
];

export const ESTABLISHED_RULE = (id = 'est') => rule(id, 'ACCEPT', { state: 'ESTABLISHED,RELATED', note: 'replies to flows we know' });
/** The rule a stateless firewall needs for return traffic: every high port, open to everyone. */
export const BROAD_RETURN_RULE = () => rule('broad', 'ACCEPT', { proto: 'tcp', dport: port(1024, PORT_MAX), note: 'stateless return path' });

export interface Preset {
  id: string;
  label: string;
  rules: Rule[];
  packets: Packet[];
  policy: Action;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'ssh',
    label: 'SSH from the office only',
    policy: 'DROP',
    rules: [
      ESTABLISHED_RULE(),
      rule('ssh-office', 'ACCEPT', { proto: 'tcp', src: net(OFFICE), dport: port(22), note: 'office SSH' }),
    ],
    packets: [
      pk('ssh-1', 'in', OFFICE_HOST, 51514, SERVER, 22, 'SYN', 'SSH from the office'),
      pk('ssh-2', 'in', OFFICE_HOST, 51514, SERVER, 22, 'ACK', 'the same SSH session continues'),
      pk('ssh-x', 'in', STRANGER, 40022, SERVER, 22, 'SYN', 'SSH from an unknown address'),
      ...OUTBOUND,
    ],
  },
  {
    id: 'shadow',
    label: 'The shadowed rule',
    policy: 'DROP',
    rules: [
      ESTABLISHED_RULE(),
      rule('ssh-block', 'DROP', { proto: 'tcp', dport: port(22), note: 'block SSH' }),
      rule('ssh-office', 'ACCEPT', { proto: 'tcp', src: net(OFFICE), dport: port(22), note: 'office SSH (never reached)' }),
      rule('web', 'ACCEPT', { proto: 'tcp', dport: port(443), note: 'HTTPS' }),
    ],
    packets: [
      pk('ssh-1', 'in', OFFICE_HOST, 51514, SERVER, 22, 'SYN', 'SSH from the office'),
      pk('ssh-x', 'in', STRANGER, 40022, SERVER, 22, 'SYN', 'SSH from an unknown address'),
      pk('web-1', 'in', STRANGER, 50211, SERVER, 443, 'SYN', 'a visitor opens the website'),
    ],
  },
  {
    id: 'web',
    label: 'Default-deny web server',
    policy: 'DROP',
    rules: [
      ESTABLISHED_RULE(),
      rule('http', 'ACCEPT', { proto: 'tcp', dport: port(80), note: 'HTTP' }),
      rule('https', 'ACCEPT', { proto: 'tcp', dport: port(443), note: 'HTTPS' }),
      rule('db', 'REJECT', { proto: 'tcp', dport: port(5432), note: 'database: say no, fast' }),
    ],
    packets: [
      pk('web-1', 'in', STRANGER, 50211, SERVER, 443, 'SYN', 'a visitor opens the website'),
      pk('web-2', 'in', OFFICE_HOST, 50212, SERVER, 80, 'SYN', 'an old http:// link'),
      pk('db-1', 'in', STRANGER, 50300, SERVER, 5432, 'SYN', 'a database client from outside'),
      pk('rdp-1', 'in', STRANGER, 50301, SERVER, 3389, 'SYN', 'a remote-desktop client'),
      ...OUTBOUND,
    ],
  },
];

/** A fresh, independent copy of a preset's rules (the learner edits them). */
export const cloneRules = (rules: readonly Rule[]): Rule[] => rules.map((r) => ({ ...r, src: r.src && { ...r.src }, dport: r.dport && { ...r.dport } }));

