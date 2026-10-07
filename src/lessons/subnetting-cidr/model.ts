/**
 * IPv4 CIDR arithmetic for the subnetting lesson: the host range of a block, the membership
 * AND bit by bit, and carving a block into smaller ones. Parsing, masks and the network /
 * broadcast / membership maths come from core/ipv4. Every address is an unsigned 32-bit number.
 */
import type { Bit } from '../../core/bits';
import { IPV4_BITS, IPV4_MAX_INPUT, blockSize, broadcastOf, contains, ipToString, maskOf, networkOf, wildcardOf } from '../../core/ipv4';
import type { FieldParse } from '../../core/parse';

/** Longest text the fields accept: as much as the core/ipv4 parsers read before refusing it as too long. */
export const MAX_FIELD_CHARS = IPV4_MAX_INPUT;

export interface Block {
  /** The network address (host bits all zero). */
  net: number;
  prefix: number;
}

// ── Text ⇄ number ───────────────────────────────────────────────────────

export const blockToString = (b: Block) => `${ipToString(b.net)}/${b.prefix}`;
export const hex32 = (a: number) => `0x${a.toString(16).toUpperCase().padStart(8, '0')}`;

/** The 32 bits of an address, most significant first. */
export function addressBits(a: number): Bit[] {
  return Array.from({ length: IPV4_BITS }, (_, i) => ((a >>> (IPV4_BITS - 1 - i)) & 1) as Bit);
}

// ── One block ───────────────────────────────────────────────────────────

export type BlockKind = 'normal' | 'point-to-point' | 'single-host';

export interface BlockInfo {
  network: number;
  /** null for /31 and /32: RFC 3021 point-to-point links and host routes have no broadcast address. */
  broadcast: number | null;
  first: number;
  last: number;
  usable: number;
  total: number;
  kind: BlockKind;
  mask: number;
  wildcard: number;
}

/**
 * What a block holds. Normally the first address names the network and the last is the
 * broadcast, so 2 are lost; a /31 (RFC 3021) uses both addresses as hosts on a point-to-point
 * link, and a /32 is one host.
 */
export function blockInfo(a: number, prefix: number): BlockInfo {
  const network = networkOf(a, prefix);
  const top = broadcastOf(a, prefix);
  const base = { network, total: blockSize(prefix), mask: maskOf(prefix), wildcard: wildcardOf(prefix) };
  if (prefix === 32) return { ...base, broadcast: null, first: network, last: network, usable: 1, kind: 'single-host' };
  if (prefix === 31) return { ...base, broadcast: null, first: network, last: top, usable: 2, kind: 'point-to-point' };
  return { ...base, broadcast: top, first: network + 1, last: top - 1, usable: blockSize(prefix) - 2, kind: 'normal' };
}

/** The first network bit (0 = most significant) where `a` and `net` disagree; null when `a` is inside. */
export function firstDifference(net: number, prefix: number, a: number): number | null {
  for (let i = 0; i < prefix; i++) {
    const bit = IPV4_BITS - 1 - i;
    if (((a >>> bit) & 1) !== ((net >>> bit) & 1)) return i;
  }
  return null;
}

/** The address with its host bits cleared, bit by bit: the AND row the membership test draws. */
export const andBits = (a: number, prefix: number) => addressBits(networkOf(a, prefix));

// ── Splitting a block ───────────────────────────────────────────────────

export const isAligned = (b: Block) => (b.net & wildcardOf(b.prefix)) >>> 0 === 0;
export const blockEnd = (b: Block) => b.net + blockSize(b.prefix) - 1;
const overlaps = (a: Block, b: Block) => a.net <= blockEnd(b) && b.net <= blockEnd(a);
export const within = (outer: Block, inner: Block) => inner.prefix >= outer.prefix && contains(outer.net, outer.prefix, inner.net);

/** `parent` cut into equal blocks of `prefix`, in address order. */
export function splitEqual(parent: Block, prefix: number): Block[] {
  if (prefix < parent.prefix || prefix > IPV4_BITS) throw new RangeError(`can't split /${parent.prefix} into /${prefix}`);
  const step = blockSize(prefix);
  return Array.from({ length: 2 ** (prefix - parent.prefix) }, (_, i) => ({ net: parent.net + i * step, prefix }));
}

/** The nearest aligned starts at or below and above `net` for a block of this size. */
export function alignedNeighbours(net: number, prefix: number): [number, number] {
  const size = blockSize(prefix);
  const below = Math.floor(net / size) * size;
  return [below, below + size];
}

const groupDigits = (n: number) => n.toLocaleString('en-US');

/**
 * Add `candidate` to the blocks already carved out of `parent`, or say why not: it must sit
 * inside the parent, start on a multiple of its own size, and not overlap another block.
 */
export function placeBlock(parent: Block, placed: readonly Block[], candidate: Block): FieldParse<Block> {
  const { net, prefix } = candidate;
  if (prefix < parent.prefix) return { ok: false, error: `A /${prefix} is bigger than the /${parent.prefix} you're splitting.` };
  if (!isAligned(candidate)) {
    const [lo, hi] = alignedNeighbours(net, prefix);
    const nearby = [lo, hi].filter((x) => x <= blockEnd(parent) && x >= parent.net).map(ipToString);
    return {
      ok: false,
      error: `A /${prefix} must start on a multiple of ${groupDigits(blockSize(prefix))} addresses, and ${ipToString(net)} doesn't.${nearby.length ? ` Try ${nearby.join(' or ')}.` : ''}`,
    };
  }
  if (!within(parent, candidate)) return { ok: false, error: `${blockToString(candidate)} isn't inside ${blockToString(parent)}.` };
  const clash = placed.find((b) => overlaps(b, candidate));
  if (clash) return { ok: false, error: `${blockToString(candidate)} overlaps ${blockToString(clash)}, which is already carved out.` };
  return { ok: true, value: candidate };
}

/** Usable hosts in a LAN subnet of this prefix (routers need /30 or shorter, so /31 and /32 are excluded). */
export const lanHosts = (prefix: number) => blockSize(prefix) - 2;
export const LONGEST_LAN_PREFIX = 30;

/** The smallest LAN block (the longest prefix, at most /30) with room for `hosts`; null if no IPv4 block is big enough. */
export function prefixForHosts(hosts: number): number | null {
  for (let p = LONGEST_LAN_PREFIX; p >= 0; p--) if (lanHosts(p) >= hosts) return p;
  return null;
}

export interface Allocation extends Block {
  /** Index of the demand (team) this block serves. */
  team: number;
  hosts: number;
}

/**
 * Variable-length subnetting: give each team the smallest block that fits it, largest first,
 * each at the lowest aligned free address. Placing power-of-two blocks largest first never
 * leaves a gap a later block could have used, so this succeeds exactly when the sizes add up
 * to no more than the parent.
 */
export function allocate(parent: Block, demands: readonly number[]): FieldParse<Allocation[]> {
  const sized = demands.map((hosts, team) => ({ team, hosts, prefix: prefixForHosts(hosts) }));
  const tooBig = sized.find((d) => d.prefix === null || d.prefix < parent.prefix);
  if (tooBig) return { ok: false, error: `${groupDigits(tooBig.hosts)} hosts need more than the whole /${parent.prefix} (${groupDigits(lanHosts(parent.prefix))} usable).` };
  const need = sized.reduce((sum, d) => sum + blockSize(d.prefix!), 0);
  if (need > blockSize(parent.prefix)) {
    return { ok: false, error: `Doesn't fit: those blocks need ${groupDigits(need)} addresses and a /${parent.prefix} has ${groupDigits(blockSize(parent.prefix))}.` };
  }
  const order = [...sized].sort((a, b) => a.prefix! - b.prefix! || a.team - b.team);
  const placed: Allocation[] = [];
  for (const d of order) {
    const size = blockSize(d.prefix!);
    for (let net = parent.net; net + size - 1 <= blockEnd(parent); net += size) {
      const candidate = { net, prefix: d.prefix! };
      if (placed.some((b) => overlaps(b, candidate))) continue;
      placed.push({ ...candidate, team: d.team, hosts: d.hosts });
      break;
    }
  }
  return { ok: true, value: placed.sort((a, b) => a.net - b.net) };
}

/**
 * Aggregation (route summarisation): the fewest CIDR blocks covering exactly the same
 * addresses. Two aligned siblings of the same size merge into their parent, repeatedly.
 */
export function summarize(blocks: readonly Block[]): Block[] {
  let list = [...blocks].sort((a, b) => a.net - b.net || a.prefix - b.prefix);
  // drop blocks already covered by another
  list = list.filter((b, i) => !list.some((o, j) => j !== i && within(o, b) && (o.prefix < b.prefix || j < i)));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (a.prefix === b.prefix && a.prefix > 0 && b.net === a.net + blockSize(a.prefix) && isAligned({ net: a.net, prefix: a.prefix - 1 })) {
        list.splice(i, 2, { net: a.net, prefix: a.prefix - 1 });
        merged = true;
        break;
      }
    }
  }
  return list;
}

export const MAX_TEAMS = 8;

/**
 * Host counts per team, comma-separated ("50, 10, 2"). Stricter than core/parse's
 * parseIntegers on purpose: a gap between two commas is refused, not skipped.
 */
export function parseTeams(text: string): FieldParse<number[]> {
  const s = text.trim();
  if (!s) return { ok: false, error: 'Type host counts separated by commas, like 50, 10, 2.' };
  if (s.length > MAX_FIELD_CHARS * 2) return { ok: false, error: 'That list is too long: up to 8 teams.' };
  const tokens = s.split(',').map((t) => t.trim());
  if (tokens.some((t) => !t)) return { ok: false, error: "There's a gap between two commas: give every team a host count." };
  if (tokens.length > MAX_TEAMS) return { ok: false, error: `Up to ${MAX_TEAMS} teams, so the bar stays readable.` };
  const counts: number[] = [];
  for (const t of tokens) {
    if (/^-\d+$/.test(t) || t === '0') return { ok: false, error: 'Every team needs at least 1 host.' };
    if (!/^\d+$/.test(t)) return { ok: false, error: `${t.length > 12 ? `${t.slice(0, 12)}…` : t} isn't a whole number of hosts.` };
    if (t.length > 10 || Number(t) >= 2 ** IPV4_BITS) return { ok: false, error: 'More hosts than IPv4 has addresses (about 4.3 billion).' };
    counts.push(Number(t));
  }
  return { ok: true, value: counts };
}

// ── Presets ─────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  cidr: string;
}

/** Documentation (RFC 5737) and private (RFC 1918) ranges only. */
export const PRESETS: readonly Preset[] = [
  { id: 'home', label: 'Home LAN /24', cidr: '192.168.1.10/24' },
  { id: 'ten', label: '10.0.0.0/8', cidr: '10.20.30.40/8' },
  { id: 'p2p', label: '/31 point-to-point', cidr: '198.51.100.6/31' },
  { id: 'host', label: '/32 one host', cidr: '203.0.113.10/32' },
  { id: 'all', label: '0.0.0.0/0 everything', cidr: '0.0.0.0/0' },
];

export const DEFAULT_CIDR = PRESETS[0].cidr;
export const DEFAULT_PROBE = '192.168.2.7';
export const DEFAULT_PARENT = '192.168.1.0/24';
export const DEFAULT_TEAMS = '50, 10, 2';
