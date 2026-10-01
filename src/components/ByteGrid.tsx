import type { Tone } from '../core/tone';
import { CellGrid, type GridHighlight } from './CellGrid';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';
import { byteRows, fieldAt, hexByte, printable, type ByteField } from '../core/bytes';

export type { ByteField } from '../core/bytes';

/**
 * A hex dump: each byte as two hex digits in rows of `perRow`, the address of each row on
 * the left (from `offsetBase`), optional printable ASCII on the right, and `fields` (a
 * header, a varint, a 16-byte block) tinted with their tone and named in a key below.
 * Built on CellGrid, so it gets the same keyboard model when `onByteClick` is set.
 * BitStrip stays the bit-level view: a lesson can expand a field into one.
 */
export function ByteGrid({
  bytes, perRow: perRowProp, offsetBase = 0, fields = [], toneOf, ascii = false, highlight = [], onByteClick, size = 'sm',
  ariaLabel,
}: {
  bytes: Uint8Array | readonly number[];
  /** Bytes per row (default 16, or 8 on a phone so the digits stay readable). */
  perRow?: 8 | 16;
  /** Address of the first byte, shown in the left column. */
  offsetBase?: number;
  fields?: readonly ByteField[];
  /** Per-byte tone, overriding the field's (e.g. the byte being decoded). */
  toneOf?: (i: number) => Tone | undefined;
  ascii?: boolean;
  /** Byte indexes to ring, with a tone. */
  highlight?: readonly { i: number; tone: Tone }[];
  onByteClick?: (i: number) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const perRow = perRowProp ?? (phone ? 8 : 16);
  const data = Array.from(bytes);
  const rows = byteRows(data.length, perRow);
  const offsets = Array.from({ length: rows }, (_, r) => (offsetBase + r * perRow).toString(16).padStart(4, '0'));
  const rings: GridHighlight[] = highlight.map((h) => ({ r: Math.floor(h.i / perRow), c: h.i % perRow, tone: h.tone }));

  return (
    <div className="bytegrid">
      <CellGrid
        rows={rows}
        cols={perRow}
        size={size}
        rowLabels={offsets}
        ariaLabel={ariaLabel}
        cell={(r, c) => {
          const i = r * perRow + c;
          if (i >= data.length) return { fill: 'none' };
          const tone = toneOf?.(i) ?? fieldAt(fields, i)?.tone;
          return { text: hexByte(data[i]), tone, fill: tone ? 'tint' : undefined, intensity: tone ? 0.22 : undefined };
        }}
        cellTitle={(r, c) => {
          const i = r * perRow + c;
          if (i >= data.length) return '';
          const f = fieldAt(fields, i);
          return `byte ${offsetBase + i}: 0x${hexByte(data[i])} = ${data[i]}${f ? ` (${f.label})` : ''}`;
        }}
        cellAriaLabel={(r, c) => {
          const i = r * perRow + c;
          return i < data.length ? `byte ${offsetBase + i}, 0x${hexByte(data[i])}` : 'empty';
        }}
        onCellClick={onByteClick && ((r, c) => r * perRow + c < data.length && onByteClick(r * perRow + c))}
        highlight={rings}
        rowSuffix={ascii ? { width: perRow * 6.2, render: (r) => printable(data.slice(r * perRow, (r + 1) * perRow)) } : undefined}
      />
      {fields.length > 0 && (
        <div className="bytegrid-fields">
          {fields.map((f, k) => (
            <span key={k} className={`bytegrid-field tone-${f.tone}`}>
              <i />
              {f.label} <span className="muted">(bytes {f.from}–{f.to})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
