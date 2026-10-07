import type { ReactNode } from 'react';
import { mod } from '../../core/numberTheory';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { bezoutRows, euclid, inverse } from './model';

/** Grouped digits: 1,071. */
export const group = (n: number | bigint) => n.toLocaleString('en-US');
/** A coefficient in brackets when negative: (−3). */
export const signed = (n: number) => (n < 0 ? `(−${group(-n)})` : group(n));

/** Above this many squares in one row, they're placed in one frame instead of one by one. */
export const ONE_BY_ONE_MAX = 6;

export interface TilingFrame extends Frame {
  /** The remainder-table row being worked on: −1 before the first, rows.length once finished. */
  row: number;
  /** Squares placed so far on that row. */
  placed: number;
}

/** Frames for Euclid's tiling of a × b (at least one of them non-zero). */
export function tilingFrames(a: number, b: number): TilingFrame[] {
  const { g, rows } = euclid(a, b);
  const r = createRecorder<TilingFrame>({ row: -1, placed: 0 });
  if (a === 0 || b === 0) {
    r.snap(<>gcd({group(a)}, {group(b)}) = <span className="hl ok">{group(g)}</span>: every number divides 0, so the largest number
      dividing both is {group(g)} itself. Nothing to tile.</>);
    return r.frames;
  }
  const [w, h] = [Math.max(a, b), Math.min(a, b)];
  r.snap(<>Tile a {group(w)} × {group(h)} rectangle with the biggest squares that fit, then do the same to what's left. The last
    square size that fits exactly is gcd({group(a)}, {group(b)}).</>);

  rows.forEach((row, i) => {
    const eq = <>{group(row.a)} = {group(row.q)}·{group(row.b)} + {group(row.r)}</>;
    if (row.q === 0) {
      r.snap(<>Step {i + 1}: {eq}. {group(row.a)} is smaller than {group(row.b)}, so no square of {group(row.b)} fits: q = 0 and the
        pair simply swaps. That costs one step.</>, 1.4, { row: i, placed: 0 });
      return;
    }
    const after = row.r === 0
      ? <>{group(row.q)} squares of {group(row.b)} fill it exactly: remainder 0, so the gcd is <span className="hl ok">{group(row.b)}</span>.</>
      : <>That leaves a {group(row.b)} × {group(row.r)} strip: the next rectangle.</>;
    if (row.q > ONE_BY_ONE_MAX) {
      r.snap(<>Step {i + 1}: <span className="hl">{eq}</span>. All {group(row.q)} squares of side {group(row.b)} go down at once.{' '}
        {after}</>, 1.6, { row: i, placed: row.q });
      return;
    }
    for (let k = 1; k <= row.q; k++) {
      let say: ReactNode;
      if (k === row.q) say = <>Step {i + 1}: <span className="hl">{eq}</span>. {after}</>;
      else if (k === 1) say = <>Step {i + 1}: squares of side {group(row.b)}, the short side, along the long side.</>;
      r.snap(say, k === row.q ? 1.4 : 0.7, { row: i, placed: k });
    }
  });

  r.set({ row: rows.length, placed: 0 });
  r.close(<>gcd({group(a)}, {group(b)}) = <span className="hl ok">{group(g)}</span> after {rows.length}{' '}
    {rows.length === 1 ? 'division' : 'divisions'}. Every square is a whole number of {group(g)} × {group(g)} squares, so {group(g)}{' '}
    divides both sides, and no bigger square could tile it. No prime factorisation needed.</>, 2.2);
  return r.frames;
}

export interface ExtendedFrame extends Frame {
  /** Table rows shown so far (at least the two starting rows). */
  shown: number;
}

/** Frames that build the extended table one row at a time. */
export function extendedFrames(a: number, b: number): ExtendedFrame[] {
  const rows = bezoutRows(a, b);
  const { g, x, y } = euclid(a, b);
  const r = createRecorder<ExtendedFrame>({ shown: Math.min(2, rows.length) });
  if (rows.length === 1) {
    r.snap(<>With b = 0 the first row is already the answer: {group(a)} = {group(a)}·1 + 0·0, so gcd = {group(a)}, x = 1, y = 0.</>);
    return r.frames;
  }
  r.snap(<>Two rows that are trivially true: {group(a)} = {group(a)}·1 + {group(b)}·0 and {group(b)} = {group(a)}·0 +{' '}
    {group(b)}·1. Every new row will keep r = a·x + b·y.</>);
  for (let j = 2; j < rows.length; j++) {
    const [two, one, row] = [rows[j - 2], rows[j - 1], rows[j]];
    r.snap(<>r = {group(two.r)} − {group(row.q!)}·{group(one.r)} = {group(row.r)}. Do exactly the same to x and y: x = {signed(two.x)} −
      {' '}{group(row.q!)}·{signed(one.x)} = <span className="hl violet">{signed(row.x)}</span>, y = {signed(two.y)} − {group(row.q!)}·
      {signed(one.y)} = <span className="hl violet">{signed(row.y)}</span>.</>, 1.6, { shown: j + 1 });
  }
  r.close(<>{group(a)}·{signed(x)} + {group(b)}·{signed(y)} = <span className="hl ok">{group(g)}</span>, the gcd.{' '}
    {g === 1 && b > 1
      ? <>Because it's 1, reading it mod {group(b)} gives {group(a)}·{group(mod(BigInt(x), BigInt(b)))} ≡ 1: that's {group(a)}'s inverse mod{' '}
          {group(b)}.</>
      : <>x and y are Bézout coefficients: some multiple of a plus some multiple of b always reaches the gcd.</>}</>, 2.2);
  return r.frames;
}

/** The inverse panel's verdict, computed from core modInverse. */
export function inverseCaption(a: number, m: number): ReactNode {
  if (m < 2) return <>Pick a modulus of at least 2: mod 1, everything is 0.</>;
  const inv = inverse(a, m);
  if (inv === null) return <>No inverse: gcd({group(a)}, {group(m)}) is {group(euclid(a, m).g)}, not 1.</>;
  const product = BigInt(a) * BigInt(inv);
  return <>{group(a)}⁻¹ mod {group(m)} = <span className="hl ok">{group(inv)}</span>: {group(a)} × {group(inv)} = {group(product)} ={' '}
    {group(product / BigInt(m))}·{group(m)} + 1.</>;
}
