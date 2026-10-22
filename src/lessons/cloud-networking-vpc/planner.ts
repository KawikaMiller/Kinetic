/**
 * CIDR planning: usable addresses per subnet under the reserve rule, the overlap check between two ranges,
 * and carving a VPC range into subnets with a gap check. Pure; every text field goes through `parseCidr`.
 */
import { blockSize, broadcastOf, ipToString, networkOf, parseCidr } from '../../core/ipv4';
import type { FieldParse } from '../../core/parse';
import { cidrText, VPC_NET, VPC_PREFIX, type Cidr } from './vpc';

/** AWS-style: five addresses of every subnet are not available to instances (from memory; verify in the VPC documentation). */
export const AWS_RESERVED_PER_SUBNET = 5;
/** AWS-style block-size limits for a VPC and for a subnet (from memory; verify). */
export const BLOCK_PREFIX_RANGE = { min: 16, max: 28 } as const;
export const MAX_SUBNET_ROWS = 6;

export const usableAddresses = (prefix: number): number => Math.max(0, blockSize(prefix) - AWS_RESERVED_PER_SUBNET);

export interface Span {
  first: number;
  last: number;
}
export const spanOf = (c: Cidr): Span => ({ first: networkOf(c.net, c.prefix), last: broadcastOf(c.net, c.prefix) });
export const spanText = (s: Span) => `${ipToString(s.first)} to ${ipToString(s.last)}`;

/** The addresses two spans share, or null when they are disjoint. */
export function overlapOf(a: Span, b: Span): Span | null {
  const first = Math.max(a.first, b.first);
  const last = Math.min(a.last, b.last);
  return first <= last ? { first, last } : null;
}

/** One typed CIDR, refused with the reason and where it went wrong; host bits and out-of-range sizes are refused, never rounded. */
export function parseBlock(text: string, what: string): FieldParse<Cidr> {
  const r = parseCidr(text);
  if (!r.ok) return { ok: false, error: `${what}: ${r.error}` };
  const { addr, prefix } = r.value;
  if (prefix < BLOCK_PREFIX_RANGE.min || prefix > BLOCK_PREFIX_RANGE.max) {
    return { ok: false, error: `${what}: /${prefix} is outside the /${BLOCK_PREFIX_RANGE.min} to /${BLOCK_PREFIX_RANGE.max} sizes this lesson allows (AWS-style limits, from memory).` };
  }
  const start = networkOf(addr, prefix);
  if (start !== addr) {
    return { ok: false, error: `${what}: ${ipToString(addr)}/${prefix} has host bits set; the block starts at ${ipToString(start)}. Write ${ipToString(start)}/${prefix}.` };
  }
  return { ok: true, value: { net: addr, prefix } };
}

/** The smallest list of aligned CIDR blocks that exactly covers `first..last`. */
export function spanToCidrs(first: number, last: number): Cidr[] {
  const out: Cidr[] = [];
  let at = first;
  while (at <= last) {
    let prefix = 32;
    while (prefix > 0) {
      const wider = prefix - 1;
      const start = networkOf(at, wider);
      if (start !== at || broadcastOf(at, wider) > last) break;
      prefix = wider;
    }
    out.push({ net: at, prefix });
    at = broadcastOf(at, prefix) + 1;
    if (at > 0xffffffff) break;
  }
  return out;
}

// ---- carving a VPC range into subnets -------------------------------------------------------------

export interface CarveRow {
  name: string;
  text: string;
}
export type RowStatus = { ok: true; cidr: Cidr; usable: number } | { ok: false; error: string };

export interface Carve {
  vpc: Cidr;
  rows: RowStatus[];
  accepted: Cidr[];
  usable: number;
  /** The unused addresses of the VPC range as aligned blocks, in address order. */
  free: Cidr[];
  freeAddresses: number;
  largestFree: Cidr | null;
}

/** Rows are read in order: a row is counted only if it parses, sits inside the VPC range and overlaps no earlier counted row. */
export function carve(vpc: Cidr, rows: readonly CarveRow[]): Carve {
  const vpcSpan = spanOf(vpc);
  const accepted: Cidr[] = [];
  const names: string[] = [];
  const status: RowStatus[] = rows.map((row, i) => {
    const label = `Row ${i + 1}`;
    const parsed = parseBlock(row.text, label);
    if (!parsed.ok) return parsed;
    const span = spanOf(parsed.value);
    if (span.first < vpcSpan.first || span.last > vpcSpan.last) {
      return { ok: false, error: `${label}: ${cidrText(parsed.value)} falls outside the VPC range ${cidrText(vpc)} and is not counted.` };
    }
    for (let k = 0; k < accepted.length; k++) {
      const shared = overlapOf(span, spanOf(accepted[k]));
      if (shared) return { ok: false, error: `${label} and ${names[k]} overlap at ${spanText(shared)}; ${label} is not counted.` };
    }
    accepted.push(parsed.value);
    names.push(`row ${i + 1}`);
    return { ok: true, cidr: parsed.value, usable: usableAddresses(parsed.value.prefix) };
  });

  const sorted = accepted.map(spanOf).sort((a, b) => a.first - b.first);
  const free: Cidr[] = [];
  let cursor = vpcSpan.first;
  for (const s of sorted) {
    if (s.first > cursor) free.push(...spanToCidrs(cursor, s.first - 1));
    cursor = s.last + 1;
  }
  if (cursor <= vpcSpan.last) free.push(...spanToCidrs(cursor, vpcSpan.last));
  const largestFree = free.reduce<Cidr | null>((best, c) => (best === null || c.prefix < best.prefix ? c : best), null);
  return {
    vpc,
    rows: status,
    accepted,
    usable: status.reduce((n, s) => n + (s.ok ? s.usable : 0), 0),
    free,
    freeAddresses: free.reduce((n, c) => n + blockSize(c.prefix), 0),
    largestFree,
  };
}

/** The first aligned block of this size that fits in the free space, or null when none does. */
export function firstFit(c: Carve, prefix: number): Cidr | null {
  const room = c.free.find((f) => f.prefix <= prefix);
  return room ? { net: room.net, prefix } : null;
}

export const DEFAULT_VPC: Cidr = { net: VPC_NET, prefix: VPC_PREFIX };
export const DEFAULT_ROWS: CarveRow[] = [
  { name: 'public', text: '10.0.1.0/24' },
  { name: 'private', text: '10.0.2.0/24' },
  { name: 'isolated', text: '10.0.3.0/24' },
];
