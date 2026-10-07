import type { ReactNode } from 'react';
import { hexByte } from '../../core/bytes';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  address, byteCount, hexValue, htons, readBack, registerBytes, registerIndexAt, storeBytes, type Width,
} from './model';

const orderName = (little: boolean) => (little ? 'little-endian' : 'big-endian');

// ── Store: the bytes move into memory one address at a time ──────────────

export interface StoreFrame extends Frame {
  /** Memory cells filled so far, from the base address up. */
  placed: number;
  /** Offset of the cell being written, or null. */
  current: number | null;
}

export function storeFrames(value: bigint, width: Width, little: boolean): StoreFrame[] {
  const n = byteCount(width);
  const reg = registerBytes(value, width);
  const mem = storeBytes(value, width, little);
  const r = createRecorder<StoreFrame>({ placed: 0, current: null });
  r.snap(
    <>{hexValue(value, width)} is {n} bytes, most significant (0x{hexByte(reg[0])}) on the left. Storing it {orderName(little)} fills
      memory from address {address(0)} up.</>,
  );
  for (let j = 0; j < n; j++) {
    const k = registerIndexAt(j, width, little);
    const which = k === 0 ? 'the most significant byte' : k === n - 1 ? 'the least significant byte' : `register byte ${k + 1} of ${n} from the left`;
    r.snap(<>Address <b>{address(j)}</b> gets 0x{hexByte(mem[j])}: {which}.</>, undefined, { placed: j + 1, current: j });
  }
  r.set({ current: null });
  r.close(
    little ? (
      <>Little-endian: the <b>least</b> significant byte (0x{hexByte(reg[n - 1])}) sits at the lowest address. Same bytes, same number, opposite
        order in memory, and inside each byte the bits are untouched.</>
    ) : (
      <>Big-endian: the <b>most</b> significant byte (0x{hexByte(reg[0])}) sits at the lowest address, so memory reads in the same order as
        the number is written.</>
    ),
    2,
  );
  return r.frames;
}

// ── Read it wrong ────────────────────────────────────────────────────────

export function misreadCaption(value: bigint, width: Width, writeLittle: boolean, readLittle: boolean): ReactNode {
  const got = readBack(value, width, writeLittle, readLittle);
  if (writeLittle === readLittle) {
    return <>Written and read {orderName(writeLittle)}: the reader gets <b>{hexValue(got, width)}</b> back, exactly what was stored.</>;
  }
  if (got === value) {
    return <>Written {orderName(writeLittle)}, read {orderName(readLittle)}, and it still comes back as {hexValue(got, width)}: these bytes
      read the same from either end. Luck, not correctness: try a different value.</>;
  }
  return <>Written {orderName(writeLittle)}, read {orderName(readLittle)}: the same bytes come back as{' '}
    <span className="hl bad">{hexValue(got, width)}</span> instead of {hexValue(value, width)}. Nothing in memory changed; the reader
    started at the wrong end.</>;
}

// ── Network byte order ───────────────────────────────────────────────────

export function networkCaption(port: number, hostLittle: boolean): ReactNode {
  const host = storeBytes(BigInt(port), 16, hostLittle).map(hexByte).join(' ');
  const wire = storeBytes(BigInt(port), 16, false).map(hexByte).join(' ');
  const converted = htons(port, hostLittle);
  return hostLittle ? (
    <>A little-endian host keeps port {port} as <b>{host}</b>, but the wire wants big-endian <b>{wire}</b>. htons swaps the two bytes
      (it returns {converted}), so storing that puts {wire} in the header.</>
  ) : (
    <>A big-endian host already keeps port {port} as <b>{host}</b>, which is network order. htons returns it unchanged ({converted}): a
      no-op, but portable code still calls it.</>
  );
}
