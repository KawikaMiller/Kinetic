/**
 * IPv6 addresses for the lesson: a strict parser, the RFC 5952 canonical text form and the
 * steps that get there, the address-type classifier, SLAAC interface IDs (EUI-64 from a MAC,
 * or random per RFC 8981), and the Happy Eyeballs race (RFC 8305). An address is its eight
 * 16-bit groups ("hextets"), most significant first.
 */
import type { Bit } from '../../core/bits';
import type { FieldParse } from '../../core/parse';
import type { Rnd } from '../../core/random';

export type Hextets = readonly number[];

export const GROUPS = 8;
export const BITS = 128;
const MAX_TEXT = 45;

// ── Parsing ─────────────────────────────────────────────────────────────

const HEX_GROUP = /^[0-9a-f]{1,4}$/;

/** One typed address, compressed or full, or the reason it isn't one. */
export function parseIPv6(text: string): FieldParse<number[]> {
  const s = text.trim().toLowerCase();
  if (!s) return { ok: false, error: 'Type an IPv6 address, like 2001:db8::1.' };
  if (s.length > MAX_TEXT) return { ok: false, error: 'Too long: a full IPv6 address is at most 39 characters.' };
  if (s.includes('%')) return { ok: false, error: 'Zone IDs like %eth0 are not modelled here: type the address alone.' };
  if (s.includes('.')) return { ok: false, error: 'Embedded IPv4 forms like ::ffff:192.0.2.1 are not modelled here.' };
  if (!/^[0-9a-f:]+$/.test(s)) return { ok: false, error: 'Only hex digits (0-9, a-f) and colons.' };
  if (s.includes(':::')) return { ok: false, error: '":::" is not valid: "::" stands for the zero groups, and a single ":" separates groups.' };
  const doubles = s.split('::').length - 1;
  if (doubles > 1) return { ok: false, error: '"::" can appear only once, or nobody could tell how many zero groups each one stands for.' };
  const [head, tail] = doubles ? s.split('::') : [s, null];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  for (const g of [...left, ...right]) {
    if (g === '') return { ok: false, error: 'An empty group: a single ":" at the start or end, or two separators with nothing between.' };
    if (!HEX_GROUP.test(g)) return { ok: false, error: `Each group is at most 4 hex digits; "${g.length > 8 ? `${g.slice(0, 8)}…` : g}" has ${g.length}.` };
  }
  const given = left.length + right.length;
  if (doubles) {
    if (given > GROUPS - 1) return { ok: false, error: `With "::" there must be fewer than 8 other groups (it stands for at least one); that has ${given}.` };
    return { ok: true, value: [...left, ...Array(GROUPS - given).fill('0'), ...right].map((g) => parseInt(g, 16)) };
  }
  if (given !== GROUPS) return { ok: false, error: `An IPv6 address has 8 groups (or uses "::" for a run of zeros); that has ${given}.` };
  return { ok: true, value: left.map((g) => parseInt(g, 16)) };
}

// ── Text forms ──────────────────────────────────────────────────────────

/** Every group as four hex digits: the form the bits literally spell. */
export const formatFull = (h: Hextets) => h.map((g) => g.toString(16).padStart(4, '0')).join(':');

/** The longest run of two or more zero groups (the first if tied), or null (RFC 5952 §4.2). */
export function zeroRun(h: Hextets): { from: number; len: number } | null {
  let best: { from: number; len: number } | null = null;
  for (let i = 0; i < GROUPS; ) {
    if (h[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < GROUPS && h[j] === 0) j++;
    if (j - i >= 2 && (!best || j - i > best.len)) best = { from: i, len: j - i };
    i = j;
  }
  return best;
}

/** RFC 5952 canonical text: lowercase, no leading zeros, the longest zero run (2+ groups) as "::". */
export function formatCanonical(h: Hextets): string {
  const run = zeroRun(h);
  const groups = h.map((g) => g.toString(16));
  if (!run) return groups.join(':');
  return `${groups.slice(0, run.from).join(':')}::${groups.slice(run.from + run.len).join(':')}`;
}

export type CompressStage = 0 | 1 | 2;

/**
 * One group as the compress animation draws it at each stage: its leading zeros (dropped at
 * stage 1) and the digits that stay; at stage 2 a group in the collapsed run disappears.
 */
export function groupParts(h: Hextets, i: number): { zeros: string; digits: string; inRun: boolean } {
  const full = h[i].toString(16).padStart(4, '0');
  const digits = h[i].toString(16);
  const run = zeroRun(h);
  return { zeros: full.slice(0, 4 - digits.length), digits, inRun: !!run && i >= run.from && i < run.from + run.len };
}

/** The text at each stage: full, leading zeros dropped, then the zero run collapsed (canonical). */
export function stageText(h: Hextets, stage: CompressStage): string {
  if (stage === 0) return formatFull(h);
  if (stage === 1) return h.map((g) => g.toString(16)).join(':');
  return formatCanonical(h);
}

// ── Bits and fields ─────────────────────────────────────────────────────

export function addressBits(h: Hextets): Bit[] {
  return h.flatMap((g) => Array.from({ length: 16 }, (_, k) => ((g >> (15 - k)) & 1) as Bit));
}

/** The usual split of a global address: /48 site prefix, 16-bit subnet ID, 64-bit interface ID. */
export const SITE_PREFIX_BITS = 48;
export const SUBNET_BITS = 64;
export type Field = 'site' | 'subnet' | 'iid';
export const fieldOfBit = (i: number): Field => (i < SITE_PREFIX_BITS ? 'site' : i < SUBNET_BITS ? 'subnet' : 'iid');

// ── Types ───────────────────────────────────────────────────────────────

export type AddressType = 'unspecified' | 'loopback' | 'multicast' | 'link-local' | 'unique-local' | 'documentation' | 'global-unicast' | 'other';

/** Does the address start with `prefix` (hextets) for `len` bits? */
function startsWith(h: Hextets, prefix: Hextets, len: number): boolean {
  for (let bit = 0; bit < len; bit++) {
    const g = Math.floor(bit / 16);
    const k = 15 - (bit % 16);
    if (((h[g] >> k) & 1) !== (((prefix[g] ?? 0) >> k) & 1)) return false;
  }
  return true;
}

export const TYPE_RULES: { type: AddressType; prefix: string; len: number }[] = [
  { type: 'multicast', prefix: 'ff00::', len: 8 },
  { type: 'link-local', prefix: 'fe80::', len: 10 },
  { type: 'unique-local', prefix: 'fc00::', len: 7 },
  // documentation: RFC 3849, and RFC 9637's 3fff::/20
  { type: 'documentation', prefix: '2001:db8::', len: 32 },
  { type: 'documentation', prefix: '3fff::', len: 20 },
  { type: 'global-unicast', prefix: '2000::', len: 3 },
];

export function classify(h: Hextets): AddressType {
  if (h.every((g) => g === 0)) return 'unspecified';
  if (h.slice(0, 7).every((g) => g === 0) && h[7] === 1) return 'loopback';
  for (const r of TYPE_RULES) {
    const p = parseIPv6(r.prefix);
    if (p.ok && startsWith(h, p.value, r.len)) return r.type;
  }
  return 'other';
}

export const TYPE_LABEL: Record<AddressType, string> = {
  unspecified: 'unspecified (::)',
  loopback: 'loopback (::1)',
  multicast: 'multicast (ff00::/8)',
  'link-local': 'link-local (fe80::/10)',
  'unique-local': 'unique local (fc00::/7)',
  documentation: 'documentation (2001:db8::/32, 3fff::/20)',
  'global-unicast': 'global unicast (2000::/3)',
  other: 'reserved / other',
};

// ── SLAAC ───────────────────────────────────────────────────────────────

export const EXAMPLE_MAC = '00:1a:2b:3c:4d:5e';

/**
 * Modified EUI-64 (RFC 4291 appendix A): split the 48-bit MAC in half, insert ff:fe, and flip
 * the universal/local bit (0x02 of the first byte). Returns the 64-bit interface ID as 4 hextets.
 */
export function eui64(mac: string): number[] {
  const b = mac.split(':').map((x) => parseInt(x, 16));
  const bytes = [b[0] ^ 0x02, b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
  return [0, 2, 4, 6].map((i) => (bytes[i] << 8) | bytes[i + 1]);
}

/** A random 64-bit interface ID, as RFC 8981 temporary addresses use (seeded here, so it's reproducible). */
export const randomIid = (rnd: Rnd): number[] => Array.from({ length: 4 }, () => Math.floor(rnd() * 0x10000));

/** A /64 prefix's first four hextets plus a 64-bit interface ID. */
export const withIid = (prefix: Hextets, iid: Hextets): number[] => [...prefix.slice(0, 4), ...iid];
export const LINK_LOCAL_PREFIX = [0xfe80, 0, 0, 0];
/** The /64 the router advertises in the SLAAC scene (documentation range). */
export const PREFIX_HEXTETS = [0x2001, 0xdb8, 1, 2];
export const EXAMPLE_PREFIX = formatCanonical([...PREFIX_HEXTETS, 0, 0, 0, 0]);

// ── Happy Eyeballs (RFC 8305) ───────────────────────────────────────────

/** RFC 8305 §8: the recommended Connection Attempt Delay. */
export const ATTEMPT_DELAY_MS = 250;

export interface RaceInput {
  /** When the DNS answers (A and AAAA) are in. */
  dnsMs: number;
  /** IPv6 handshake time, or null when the IPv6 path silently drops packets. */
  v6Ms: number | null;
  v4Ms: number;
}

export interface Race {
  v6Start: number;
  /** null when IPv6 never connects. */
  v6Done: number | null;
  /** null when IPv4 never had to start (IPv6 won within the delay). */
  v4Start: number | null;
  v4Done: number | null;
  winner: 'v6' | 'v4';
  connectedAt: number;
}

/**
 * Prefer IPv6: try it first; if it hasn't connected within the attempt delay, start IPv4 too,
 * and use whichever connects first.
 */
export function happyEyeballs({ dnsMs, v6Ms, v4Ms }: RaceInput, delay = ATTEMPT_DELAY_MS): Race {
  const v6Start = dnsMs;
  const v6Done = v6Ms === null ? null : v6Start + v6Ms;
  if (v6Done !== null && v6Done <= v6Start + delay) return { v6Start, v6Done, v4Start: null, v4Done: null, winner: 'v6', connectedAt: v6Done };
  const v4Start = v6Start + delay;
  const v4Done = v4Start + v4Ms;
  if (v6Done !== null && v6Done <= v4Done) return { v6Start, v6Done, v4Start, v4Done, winner: 'v6', connectedAt: v6Done };
  return { v6Start, v6Done, v4Start, v4Done, winner: 'v4', connectedAt: v4Done };
}

/** Illustrative timings for the race scene. */
export const RACE = { dnsMs: 20, v6Ms: 40, v4Ms: 35 } as const;

/** A huge power of two as "≈ m × 10^k" parts, from the exact bigint. */
export function approx(bits: number): { mantissa: string; exponent: number; exact: string } {
  const exact = (1n << BigInt(bits)).toString();
  return { mantissa: `${exact[0]}.${exact[1]}`, exponent: exact.length - 1, exact };
}

// ── Presets ─────────────────────────────────────────────────────────────

export const PRESETS: { label: string; text: string }[] = [
  { label: 'Documentation', text: '2001:0db8:0000:0000:0001:0000:0000:0001' },
  { label: 'Link-local', text: 'fe80::021a:2bff:fe3c:4d5e' },
  { label: 'Unique local', text: 'fd12:3456:789a:0001::1' },
  { label: 'Loopback', text: '::1' },
  { label: 'Multicast', text: 'ff02::1' },
];
