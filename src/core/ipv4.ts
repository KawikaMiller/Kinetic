/**
 * IPv4 addresses as unsigned 32-bit numbers: strict parsing of learner-typed text (with the
 * reason for every refusal), formatting, masks and the network / broadcast / membership
 * arithmetic of a CIDR block. Every bitwise result goes through `>>> 0` so it stays unsigned
 * (JavaScript's & and | return signed 32-bit integers).
 * Used by subnetting-cidr, ethernet-arp and dhcp.
 */
import type { FieldParse } from './parse';

export const IPV4_BITS = 32;
/** Longest text the parsers look at before refusing it as far too long (a dotted quad with a prefix is 18). */
export const IPV4_MAX_INPUT = 40;

// ── Text ⇄ number ───────────────────────────────────────────────────────

/** 0xc0a8010a → '192.168.1.10'. */
export const ipToString = (a: number) => [24, 16, 8, 0].map((s) => (a >>> s) & 0xff).join('.');

const OCTET = /^\d+$/;

/**
 * One learner-typed IPv4 address in dotted-quad form, refused with the reason otherwise.
 * Strict on purpose: no leading zeros (inet_aton would read 010 as octal 8), no shorthand
 * forms like `10.1`, exactly four parts of 0-255.
 */
export function parseIPv4(text: string): FieldParse<number> {
  const s = text.trim();
  if (!s) return { ok: false, error: 'Type an IPv4 address, like 192.168.1.10.' };
  if (s.length > IPV4_MAX_INPUT) return { ok: false, error: "That's far too long for an IPv4 address (at most 15 characters)." };
  if (!/^[\d.]+$/.test(s)) return { ok: false, error: 'Only digits and dots: an IPv4 address looks like 192.168.1.10.' };
  const parts = s.split('.');
  if (parts.length !== 4) return { ok: false, error: `An IPv4 address has exactly four numbers separated by dots; that has ${parts.length}.` };
  let value = 0;
  for (const p of parts) {
    if (!OCTET.test(p)) return { ok: false, error: 'Every part needs a number: there is an empty part between two dots.' };
    if (p.length > 1 && p.startsWith('0')) return { ok: false, error: `No leading zeros: ${p} is ambiguous (some tools read it as octal). Write ${p.replace(/^0+(?=\d)/, '')}.` };
    if (p.length > 3 || Number(p) > 255) return { ok: false, error: `Each part is one byte, 0-255, so ${p.length > 6 ? `${p.slice(0, 6)}…` : p} doesn't fit.` };
    value = value * 256 + Number(p);
  }
  return { ok: true, value };
}

/**
 * A lesson-authored address literal as a number. Throws on anything `parseIPv4` refuses, so a
 * typo in a fixture fails loudly instead of drawing a wrong network. Never use it on learner input.
 */
export function ipv4(text: string): number {
  const r = parseIPv4(text);
  if (!r.ok) throw new RangeError(`not an IPv4 address: ${JSON.stringify(text)} (${r.error})`);
  return r.value;
}

/** A prefix length typed after the slash: 0-32, digits only. */
export function parsePrefix(text: string): FieldParse<number> {
  const s = text.trim();
  if (!s) return { ok: false, error: 'Add a prefix length after the slash, like /24.' };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'The prefix is a whole number of bits, 0-32, like /24.' };
  if (s.length > 1 && s.startsWith('0')) return { ok: false, error: `No leading zeros in the prefix: write /${Number(s)}.` };
  if (s.length > 2 || Number(s) > IPV4_BITS) return { ok: false, error: `/${s.length > 6 ? `${s.slice(0, 6)}…` : s} is too long: an IPv4 address only has 32 bits, so a prefix is 0-32.` };
  return { ok: true, value: Number(s) };
}

/** `address/prefix`. Without a slash, `fallbackPrefix` is used if given, else it's refused. */
export function parseCidr(text: string, fallbackPrefix?: number): FieldParse<{ addr: number; prefix: number }> {
  const s = text.trim();
  if (s.length > IPV4_MAX_INPUT) return { ok: false, error: "That's far too long for an address and prefix (at most 18 characters)." };
  const slash = s.split('/');
  if (slash.length > 2) return { ok: false, error: 'Only one slash: address/prefix, like 192.168.1.0/24.' };
  const addr = parseIPv4(slash[0]);
  if (!addr.ok) return addr;
  if (slash.length === 1) {
    if (fallbackPrefix === undefined) return { ok: false, error: 'Add a prefix length, like /24.' };
    return { ok: true, value: { addr: addr.value, prefix: fallbackPrefix } };
  }
  const prefix = parsePrefix(slash[1]);
  if (!prefix.ok) return prefix;
  return { ok: true, value: { addr: addr.value, prefix: prefix.value } };
}

// ── Block arithmetic ────────────────────────────────────────────────────

/** The netmask: `prefix` ones then zeros. `<< 32` is a no-op in JavaScript, so /0 is special-cased. */
export const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (IPV4_BITS - prefix)) >>> 0);
/** The wildcard (inverse) mask ACLs and OSPF use: the host bits set. */
export const wildcardOf = (prefix: number) => ~maskOf(prefix) >>> 0;
/** Addresses in a block of this prefix: 2^(32 − prefix). */
export const blockSize = (prefix: number) => 2 ** (IPV4_BITS - prefix);

/** The network address: `a` with its host bits cleared. */
export const networkOf = (a: number, prefix: number) => (a & maskOf(prefix)) >>> 0;
/** The last address of `a`'s block: host bits all set. */
export const broadcastOf = (a: number, prefix: number) => (networkOf(a, prefix) | wildcardOf(prefix)) >>> 0;

/** The membership test: do `a` and the network agree on every network bit? */
export const contains = (net: number, prefix: number, a: number) => networkOf(a, prefix) === networkOf(net, prefix);

/** A routing-table entry: the block `net`/`prefix` (host bits in `net` are ignored, as `contains` ignores them). Extra fields ride along. */
export interface Route {
  net: number;
  prefix: number;
}

/**
 * Longest-prefix match: of the routes whose block contains `addr`, the one with the longest prefix
 * (a /0 default route matches everything but loses to any other match). Two routes for the same block
 * tie, and the earlier one in `routes` wins. Null when nothing matches, as with no default route.
 */
export function longestPrefixMatch<R extends Route>(routes: readonly R[], addr: number): R | null {
  let best: R | null = null;
  for (const r of routes) {
    if (contains(r.net, r.prefix, addr) && (best === null || r.prefix > best.prefix)) best = r;
  }
  return best;
}
