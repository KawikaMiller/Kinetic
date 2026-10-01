/** Pure helpers for byte views (ByteGrid): hex digits, printable text, named fields. */
import type { Tone } from './tone';

/** A named run of bytes, inclusive at both ends: a header field, a varint, a cipher block. */
export interface ByteField {
  from: number;
  to: number;
  tone: Tone;
  label: string;
}

/** Two uppercase hex digits. */
export const hexByte = (b: number) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0');

/** Rows needed for n bytes at perRow per row (at least one, so an empty dump still draws). */
export const byteRows = (n: number, perRow: number) => Math.max(1, Math.ceil(n / perRow));

/** Printable ASCII, with every other byte shown as '.' (the classic hex-dump right column). */
export const printable = (bytes: readonly number[]) =>
  bytes.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');

/** The field a byte belongs to; the first match wins when fields overlap. */
export const fieldAt = (fields: readonly ByteField[], i: number) => fields.find((f) => i >= f.from && i <= f.to);
