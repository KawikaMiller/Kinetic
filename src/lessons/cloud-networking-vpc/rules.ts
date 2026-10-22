/**
 * Turning what the learner typed into a rule, or into the sentence that says which field is wrong.
 * Nothing is clamped or guessed: a port outside 0-65535, a CIDR with host bits, a route inside the VPC's own
 * range, a duplicate number and a 21st rule are all refused with the reason.
 */
import { ipToString, networkOf, parseCidr } from '../../core/ipv4';
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import {
  ALL_PORTS, GROUPS, MAX_RULES, PORT_MAX, VPC_NET, VPC_PREFIX, cidrText, rulesOf,
  type AnyRule, type Cidr, type ListRef, type NaclRule, type Peer, type PortRange, type Proto, type RouteEntry, type SgRule, type VpcConfig,
} from './vpc';

export const NACL_NUMBER_RANGE = { min: 1, max: 32766 } as const;

export interface RuleDraft {
  proto: Proto;
  from: string;
  to: string;
  /** The source or destination of a group rule: a CIDR, or the name of a group. */
  peer: string;
  /** A network ACL rule's number. */
  num: string;
  action: 'allow' | 'deny';
  /** A route's destination CIDR and target. */
  dest: string;
  target: 'igw' | 'nat';
}
export const EMPTY_DRAFT: RuleDraft = { proto: 'tcp', from: '', to: '', peer: '', num: '', action: 'allow', dest: '', target: 'igw' };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** A CIDR typed into a rule: any prefix, but the host bits must be clear (the block's own start address). */
export function parseRuleCidr(text: string, what: string): FieldParse<Cidr> {
  const r = parseCidr(text);
  if (!r.ok) return fail(`${what}: ${r.error}`);
  const { addr, prefix } = r.value;
  const start = networkOf(addr, prefix);
  if (start !== addr) return fail(`${what}: ${ipToString(addr)}/${prefix} has host bits set; the block starts at ${ipToString(start)}. Write ${ipToString(start)}/${prefix}.`);
  return { ok: true, value: { net: addr, prefix } };
}

function parsePorts(proto: Proto, from: string, to: string): FieldParse<PortRange> {
  if (proto === 'all') return { ok: true, value: ALL_PORTS };
  const lo = parseBoundedInt(from, { min: 0, max: PORT_MAX, messages: { empty: 'Port from: type a port, 0-65535.', invalid: () => 'Port from: a whole number, 0-65535.', tooSmall: () => 'Port from: ports start at 0.', tooBig: () => `Port from: the highest port is ${PORT_MAX}.` } });
  if (!lo.ok) return lo;
  const hi = parseBoundedInt(to.trim() === '' ? from : to, { min: 0, max: PORT_MAX, messages: { empty: 'Port to: type a port, 0-65535.', invalid: () => 'Port to: a whole number, 0-65535.', tooSmall: () => 'Port to: ports start at 0.', tooBig: () => `Port to: the highest port is ${PORT_MAX}.` } });
  if (!hi.ok) return hi;
  if (hi.value < lo.value) return fail(`Port to (${hi.value}) is below port from (${lo.value}).`);
  return { ok: true, value: { lo: lo.value, hi: hi.value } };
}

function parsePeer(text: string, what: string): FieldParse<Peer> {
  const name = text.trim().toLowerCase();
  const group = GROUPS.find((g) => g === name);
  if (group) return { ok: true, value: { kind: 'group', group } };
  if (/^[a-z]+-sg$/.test(name)) return fail(`${what}: there is no group called ${name.slice(0, 20)}; the groups here are ${GROUPS.join(', ')}.`);
  const cidr = parseRuleCidr(text, `${what} (a CIDR or a group name)`);
  return cidr.ok ? { ok: true, value: { kind: 'cidr', cidr: cidr.value } } : cidr;
}

const insideVpc = (c: Cidr): boolean => c.prefix >= VPC_PREFIX && networkOf(c.net, VPC_PREFIX) === VPC_NET;

/** One new rule for the list, built from the draft; the refusal names the field. */
export function buildRule(cfg: VpcConfig, ref: ListRef, d: RuleDraft): FieldParse<AnyRule> {
  const list = rulesOf(cfg, ref);
  if (list.length >= MAX_RULES) return fail(`This list already has ${MAX_RULES} entries, the most the lesson allows. Remove one first.`);

  if (ref.kind === 'route') {
    const dest = parseRuleCidr(d.dest, 'Destination');
    if (!dest.ok) return dest;
    if (insideVpc(dest.value)) {
      return fail(`Destination: ${cidrText(dest.value)} is inside the VPC range ${cidrText({ net: VPC_NET, prefix: VPC_PREFIX })}, which the local route already covers; it cannot be pointed elsewhere.`);
    }
    if ((list as RouteEntry[]).some((r) => r.net === dest.value.net && r.prefix === dest.value.prefix)) {
      return fail(`Destination: this table already has a route for ${cidrText(dest.value)}.`);
    }
    return { ok: true, value: { net: dest.value.net, prefix: dest.value.prefix, target: d.target } };
  }

  const ports = parsePorts(d.proto, d.from, d.to);
  if (!ports.ok) return ports;

  if (ref.kind === 'sg') {
    const peer = parsePeer(d.peer, ref.dir === 'in' ? 'Source' : 'Destination');
    if (!peer.ok) return peer;
    const rule: SgRule = { proto: d.proto, ports: ports.value, peer: peer.value };
    return { ok: true, value: rule };
  }

  const num = parseBoundedInt(d.num, {
    min: NACL_NUMBER_RANGE.min,
    max: NACL_NUMBER_RANGE.max,
    messages: {
      empty: 'Rule number: type a number, 1-32766.',
      invalid: () => 'Rule number: a whole number, 1-32766.',
      tooSmall: () => 'Rule number: numbers start at 1.',
      tooBig: () => `Rule number: the highest is ${NACL_NUMBER_RANGE.max}.`,
    },
  });
  if (!num.ok) return num;
  if ((list as NaclRule[]).some((r) => r.num === num.value)) return fail(`Rule number: ${num.value} is already used in this list; numbers are unique.`);
  const cidr = parseRuleCidr(d.peer, ref.dir === 'in' ? 'Source' : 'Destination');
  if (!cidr.ok) return cidr;
  const rule: NaclRule = { num: num.value, action: d.action, proto: d.proto, ports: ports.value, cidr: cidr.value };
  return { ok: true, value: rule };
}
