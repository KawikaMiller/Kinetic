import { cssVar, type TokenName } from '../../core/palette';
import { parseBoundedBigInt, parseBoundedInt, type FieldParse } from '../../core/parse';

/** Register widths: 16 and 32 bits through setUint16/32, 64 through setBigUint64. */
export type Width = 16 | 32 | 64;
export const WIDTHS: readonly Width[] = [16, 32, 64];

export const byteCount = (width: Width) => width / 8;

/** Where the memory row starts. */
export const BASE_ADDRESS = 0x1000;

/** A starting value per width, chosen so every byte is different: 0x12 34 56 78. */
export const DEFAULT_VALUE: Record<Width, bigint> = {
  16: 0x1234n,
  32: 0x12345678n,
  64: 0x0123456789abcdefn,
};

/**
 * One colour per byte position, following the byte from register to memory. These are
 * plain categories, so they skip the status colours: ok and bad mean success and failure,
 * and hi marks the current address.
 */
const BYTE_HUES: readonly TokenName[] = ['info', 'violet', 'amber', 'pink', 'orange', 'sky', 'trkHw', 'trkLang'];
export const byteHue = (k: number) => cssVar(BYTE_HUES[k % BYTE_HUES.length]);

export const fits = (value: bigint, width: Width) => value >= 0n && value < 1n << BigInt(width);

/**
 * The bytes at addresses base, base+1, … after writing `value` with this byte order.
 * Straight from DataView, the same API a binary-file parser uses, never hand-rolled.
 */
export function storeBytes(value: bigint, width: Width, little: boolean): number[] {
  const view = new DataView(new ArrayBuffer(byteCount(width)));
  if (width === 16) view.setUint16(0, Number(value), little);
  else if (width === 32) view.setUint32(0, Number(value), little);
  else view.setBigUint64(0, value, little);
  return [...new Uint8Array(view.buffer)];
}

/** The value a reader gets from these bytes when it assumes this byte order. */
export function loadValue(bytes: readonly number[], width: Width, little: boolean): bigint {
  const view = new DataView(Uint8Array.from(bytes).buffer);
  if (width === 16) return BigInt(view.getUint16(0, little));
  if (width === 32) return BigInt(view.getUint32(0, little));
  return view.getBigUint64(0, little);
}

/** The register's bytes, most significant first: how the number is written down. */
export const registerBytes = (value: bigint, width: Width) => storeBytes(value, width, false);

/** Memory offset (from the base address) that register byte k (0 = most significant) is stored at. */
export const offsetOf = (k: number, width: Width, little: boolean) => (little ? byteCount(width) - 1 - k : k);

/** Register byte (0 = most significant) found at memory offset j. Reversing is its own inverse, so it's offsetOf again. */
export const registerIndexAt = offsetOf;

/** Write with one order, read with another: the classic wrong-endianness bug. */
export function readBack(value: bigint, width: Width, writeLittle: boolean, readLittle: boolean): bigint {
  return loadValue(storeBytes(value, width, writeLittle), width, readLittle);
}

/** "0x12345678", zero-padded to the width. */
export const hexValue = (value: bigint, width: Width) => `0x${value.toString(16).toUpperCase().padStart(width / 4, '0')}`;

export const address = (j: number) => `0x${(BASE_ADDRESS + j).toString(16).toUpperCase()}`;

/**
 * A register value typed in hex, with or without 0x; underscores and spaces are ignored
 * (0x1234_5678). Anything that isn't hex, or doesn't fit the width, is refused and the old
 * value stays.
 */
export function parseHexValue(text: string, width: Width): FieldParse<bigint> {
  return parseBoundedBigInt(text, {
    min: 0n,
    max: (1n << BigInt(width)) - 1n,
    prefixes: ['hex'],
    plainRadix: 16,
    underscores: true,
    spaces: true,
    messages: {
      empty: 'Type a hex value, like 0x12345678.',
      invalid: (typed) => `"${typed}" isn't hex: use 0-9 and A-F, optionally after 0x.`,
      tooBig: (value) => `0x${value.toString(16).toUpperCase()} needs more than ${width} bits (${byteCount(width)} bytes).`,
    },
  });
}

// ── The machine this page runs on ────────────────────────────────────────

/**
 * Probe the host's byte order: write the 32-bit number 1 and look at the byte at the
 * lowest address. A little-endian machine put the 1 there; a big-endian one put it last.
 */
export function probeHost(): { firstByte: number; little: boolean } {
  const firstByte = new Uint8Array(new Uint32Array([1]).buffer)[0];
  return { firstByte, little: firstByte === 1 };
}

// ── Network byte order ───────────────────────────────────────────────────

export const MAX_PORT = 65535;

/** A port typed in decimal, 0..65535. */
export function parsePort(text: string): FieldParse<number> {
  const invalid = (typed: string) => `"${typed}" isn't a whole number. Ports are typed in decimal, like 443.`;
  const range = (n: number) => `${n} isn't a port: ports are 16 bits, 0 to ${MAX_PORT}.`;
  return parseBoundedInt(text, { min: 0, max: MAX_PORT, messages: { empty: invalid(''), invalid, tooSmall: range, tooBig: range } });
}

const swap16 = (v: number) => ((v & 0xff) << 8) | (v >> 8);

/**
 * C's htons ("host to network short"): the 16-bit value whose bytes, stored in host order,
 * come out in network order (big-endian). A byte swap on a little-endian host, a no-op on a
 * big-endian one.
 */
export const htons = (port: number, hostLittle: boolean) => (hostLittle ? swap16(port) : port);

/** The first 8 bytes of a TCP header: source port, destination port, sequence number, all big-endian. */
export function tcpHeader(srcPort: number, dstPort: number, seq: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  // DataView's setters default to big-endian: network order, with no flag to forget.
  view.setUint16(0, srcPort);
  view.setUint16(2, dstPort);
  view.setUint32(4, seq);
  return [...new Uint8Array(view.buffer)];
}

/** Example values for the parts of the header the learner doesn't set: labelled as examples on screen. */
export const EXAMPLE_SRC_PORT = 51514;
export const EXAMPLE_SEQ = 0x2a0b3c4d;
export const HTTPS_PORT = 443;

// ── Presets ──────────────────────────────────────────────────────────────

/** The 8-byte PNG file signature, then the first chunk's length (IHDR is always 13 bytes). */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const PNG_IHDR_LENGTH = 13;

/** U+FEFF, the byte order mark that starts a UTF-16 file. */
export const BOM = 0xfeffn;

export interface Preset {
  id: string;
  label: string;
  width: Width;
  value: bigint;
  /** null keeps the current order (the probe sets it from the host). */
  little: boolean | null;
}

export const PRESETS: readonly Preset[] = [
  { id: 'png', label: 'PNG chunk length', width: 32, value: BigInt(PNG_IHDR_LENGTH), little: false },
  { id: 'bom', label: 'UTF-16 BOM', width: 16, value: BOM, little: null },
];
