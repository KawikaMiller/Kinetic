import type { ReactNode } from 'react';
import { power } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  FLAG_NAMES, maskOf, testFlag, type FlagOp,
  bitNumber, bitsOf, column, expression, hex, isPowerOfTwo, isPowerOfTwoNaive, isShift, jsEval, kernighanTrail, lowestSetBit8,
  negate8, powerTrap, resultBits, resultValue, shiftCount, SWAP_LINES, xorSwap, type Op, type Width,
} from './model';

// ── Operators: the output fills one column at a time ─────────────────────

export interface OpFrame extends Frame {
  /** Columns worked out so far, counted from bit 0 (the right). */
  filled: number;
  /** MSB-first index of the column being worked out, or null. */
  col: number | null;
}

const OP_MEANING: Partial<Record<Op, ReactNode>> = {
  '&': <>A 1 survives only where B also has a 1: that's <b>masking</b>, keeping just the bits you ask for.</>,
  '|': <>Any column with a 1 in either register comes out 1: that's <b>setting</b> bits.</>,
  '^': <>Columns that differ come out 1 and equal columns cancel to 0: that's <b>toggling</b> bits.</>,
};

/** "202 (0xCA)". */
const shown = (v: number, width: Width) => <><b>{v}</b> ({hex(v, width)})</>;

export function opSummary(op: Op, a: number, b: number, n: number, width: Width): ReactNode {
  const value = resultValue(op, resultBits(op, a, b, n, width), width);
  const head = <><code>{expression(op, n)}</code> = {shown(value, width)}.</>;
  const k = shiftCount(n, width);
  const mod = width === 32 && isShift(op) && n !== k ? <> The count is taken mod 32, so {n} shifts by <b>{k}</b>.</> : null;
  if (op === '~') {
    return width === 8
      ? <>{head} Every bit flipped. Real JS gives <code>~{a}</code> = <b>{jsEval('~', a, b, n)}</b>, because it flips all 32 bits, not 8.</>
      : <>{head} Every bit flipped, which is always −A − 1.</>;
  }
  if (op === '<<') {
    return <>{head}{mod} Shifting left by {k} multiplies by {power(k)}, as long as no 1 falls off the top{width === 32 ? ' or lands in the sign bit' : ''}.</>;
  }
  if (op === '>>' || op === '>>>') {
    const other: Op = op === '>>' ? '>>>' : '>>';
    const otherValue = resultValue(other, resultBits(other, a, b, n, width), width);
    const signBit = bitsOf(a, width)[0];
    return otherValue === value ? (
      <>{head}{mod} {k === 0 ? 'Nothing moved' : `A's sign bit is ${signBit}`}, so <code>&gt;&gt;</code> and <code>&gt;&gt;&gt;</code> agree
        here. Set A's top bit to see them split.</>
    ) : (
      <>{head}{mod} <code>{op}</code> filled the top {k} {k === 1 ? 'bit' : 'bits'} with {op === '>>' ? 'copies of the sign bit (1)' : 'zeros'};{' '}
        <code>{other}</code> would {op === '>>' ? 'fill zeros' : 'copy the sign bit'} and give <span className="hl bad">{otherValue}</span>.</>
    );
  }
  return <>{head} {OP_MEANING[op]}</>;
}

export function opFrames(op: Op, a: number, b: number, n: number, width: Width): OpFrame[] {
  const ab = bitsOf(a, width);
  const bb = bitsOf(b, width);
  const r = createRecorder<OpFrame>({ filled: 0, col: null });
  r.snap(<><code>{expression(op, n)}</code>, worked out one column at a time, from bit 0 on the right.</>);
  for (let done = 0; done < width; done++) {
    const i = width - 1 - done;
    r.snap(<>Bit {bitNumber(i, width)}: {column(op, ab, bb, n, i).rule}.</>, undefined, { filled: done + 1, col: i, quiet: true });
  }
  r.set({ col: null, quiet: false });
  r.close(opSummary(op, a, b, n, width), 2);
  return r.frames;
}

// ── Flags ────────────────────────────────────────────────────────────────

/** What the chosen flag operation does to this flag word, from the bits alone. */
export function flagCaption(op: FlagOp, f: number, k: number): ReactNode {
  const name = FLAG_NAMES[k];
  const mask = maskOf(k);
  const on = testFlag(f, mask);
  switch (op) {
    case 'set':
      return on
        ? <>{name} is already on, so <code>flags | {name}</code> changes nothing: OR can only turn bits on.</>
        : <><code>flags | {name}</code> turns <b>{name}</b> on (bit {k}) and leaves the other seven bits alone.</>;
    case 'clear':
      return on
        ? <><code>~{name}</code> is all ones except bit {k}, so <code>flags &amp; ~{name}</code> turns <b>{name}</b> off and keeps the rest.</>
        : <>{name} is already off, so <code>flags &amp; ~{name}</code> changes nothing: AND with ~MASK can only turn bits off.</>;
    case 'toggle':
      return <><code>flags ^ {name}</code> flips bit {k}: {name} goes <b>{on ? 'off' : 'on'}</b>. Do it twice and you're back where you started.</>;
    case 'test':
      return <><code>flags &amp; {name}</code> is {f & mask}, so {name} is <b>{on ? 'on' : 'off'}</b>. Compare with !== 0, not === 1: the AND
        gives the mask's own value ({mask}), which is only 1 for bit 0.</>;
  }
}

// ── Tricks: stepped, on an 8-bit register ────────────────────────────────

export type Trick = 'popcount' | 'lowest' | 'power' | 'swap';

export interface TrickRow {
  label: string;
  value: number;
  /** MSB-first indexes that changed in this step: drawn with a tick. */
  changed?: number[];
  /** The mask-like operand of this step, drawn violet. */
  operand?: boolean;
}

export interface TrickFrame extends Frame {
  rows: TrickRow[];
  /** Code line running now. */
  line: number | null;
  /** Loop counter (popcount) or null. */
  counter: number | null;
  /** Test results shown as true/false chips (power of two). */
  verdicts: { label: string; value: boolean }[];
}

export const TRICK_CODE: Record<Trick, readonly string[]> = {
  popcount: ['let count = 0;', 'while (x !== 0) {', '  x = x & (x - 1);', '  count++;', '}'],
  lowest: ['const neg = -x;   // ~x + 1', 'const low = x & neg;'],
  power: ['(x & (x - 1)) === 0          // tempting', 'x > 0 && (x & (x - 1)) === 0 // fixed'],
  swap: [...SWAP_LINES],
};

const lowBit = (v: number) => Math.log2(v & -v);
const diff = (before: number, after: number) => {
  const a = bitsOf(before, 8);
  const b = bitsOf(after, 8);
  return a.flatMap((bit, i) => (bit !== b[i] ? [i] : []));
};

export function popcountFrames(x: number): TrickFrame[] {
  const r = createRecorder<TrickFrame>({ rows: [{ label: 'x', value: x }], line: 0, counter: 0, verdicts: [] });
  r.snap(<>Count the 1s in x = <b>{x}</b>. Kernighan's trick loops once per <i>set</i> bit, not once per bit.</>);
  const trail = kernighanTrail(x);
  for (let s = 1; s < trail.length; s++) {
    const before = trail[s - 1];
    const after = trail[s];
    const minus = (before - 1) & 0xff;
    r.snap(
      <>x − 1 flips the lowest set bit (bit {lowBit(before)}) and every 0 below it. AND keeps only what both share, so that bit is cleared.</>,
      undefined,
      {
        line: 2,
        rows: [
          { label: 'x', value: before },
          { label: 'x - 1', value: minus, operand: true },
          { label: 'x & (x-1)', value: after, changed: diff(before, after) },
        ],
      },
    );
    r.snap(<>count is now <b>{s}</b>. x = {after}{after === 0 ? ': no 1s left' : ''}.</>, undefined, { line: 3, counter: s, rows: [{ label: 'x', value: after }] });
  }
  r.set({ line: 1 });
  r.close(
    <>x is 0, so the loop stops after <span className="hl">{trail.length - 1}</span> {trail.length === 2 ? 'pass' : 'passes'}: exactly the
      number of 1s in {x}. A plain loop over every bit would always take 8.</>,
    2,
  );
  return r.frames;
}

export function lowestFrames(x: number): TrickFrame[] {
  const not = ~x & 0xff;
  const neg = negate8(x);
  const low = lowestSetBit8(x);
  const r = createRecorder<TrickFrame>({ rows: [{ label: 'x', value: x }], line: null, counter: null, verdicts: [] });
  r.snap(<>Keep only the lowest set bit of x = <b>{x}</b>, with no loop.</>);
  r.snap(<>Two's complement: −x is ~x + 1. First ~x flips every bit…</>, undefined, {
    rows: [{ label: 'x', value: x }, { label: '~x', value: not, operand: true }],
  });
  r.snap(<>…then + 1 carries up through the trailing 1s of ~x and stops at x's lowest set bit. Above it, −x is still x flipped.</>, undefined, {
    line: 0,
    rows: [{ label: 'x', value: x }, { label: '-x', value: neg, operand: true }],
  });
  r.snap(
    x === 0 ? <>x is 0, and so is −x: x & −x is 0. There is no set bit to keep.</>
      : <>x & −x: above the lowest set bit the two disagree everywhere, below it both are 0. Only bit {lowBit(x)} survives.</>,
    undefined,
    { line: 1, rows: [{ label: 'x', value: x }, { label: '-x', value: neg, operand: true }, { label: 'x & -x', value: low }] },
  );
  r.close(
    x === 0 ? <>x & −x = <b>0</b>: zero has no lowest set bit.</>
      : <>x & −x = <span className="hl">{low}</span> = {power(lowBit(x))}, the lowest set bit of {x}. Fenwick trees use this on every step.</>,
    2,
  );
  return r.frames;
}

/** The power-of-two verdict caption, from the two tests alone. */
export function powerCaption(x: number): ReactNode {
  const trap = powerTrap(x);
  if (trap === 'zero') {
    return <>0 &amp; (0 − 1) is 0, so the tempting test calls <span className="hl bad">0 a power of two</span>. It isn't: x &gt; 0 fixes it.</>;
  }
  if (trap === 'negative') {
    return <>{x} has only its sign bit set, so the tempting test passes; it's negative, so <span className="hl bad">it isn't a power of two</span>. x &gt; 0 fixes it.</>;
  }
  return isPowerOfTwo(x)
    ? <>{x} has exactly one 1, so x − 1 has none of x's bits: x &amp; (x − 1) is 0. Both tests say <b>yes</b>.</>
    : <>{x} has more than one 1, so its top 1 survives in x − 1: the AND isn't 0. Both tests say <b>no</b>.</>;
}

export function powerFrames(x: number): TrickFrame[] {
  const minus = (x - 1) & 0xff;
  const and = x & minus;
  const r = createRecorder<TrickFrame>({ rows: [{ label: 'x', value: x }], line: null, counter: null, verdicts: [] });
  r.snap(<>Is x = <b>{x}</b> a power of two? A power of two has exactly one bit set.</>);
  r.snap(<>x − 1 = {minus}: the lowest set bit becomes 0 and everything below it becomes 1{x === 0 ? ' (0 − 1 wraps to all ones)' : ''}.</>, undefined, {
    rows: [{ label: 'x', value: x }, { label: 'x - 1', value: minus, operand: true }],
  });
  r.snap(<>x &amp; (x − 1) = {and}. The tempting test only asks whether that is 0.</>, undefined, {
    line: 0,
    rows: [{ label: 'x', value: x }, { label: 'x - 1', value: minus, operand: true }, { label: 'x & (x-1)', value: and }],
    verdicts: [{ label: 'tempting', value: isPowerOfTwoNaive(x) }],
  });
  r.snap(<>The fix also asks x &gt; 0.</>, undefined, {
    line: 1,
    verdicts: [{ label: 'tempting', value: isPowerOfTwoNaive(x) }, { label: 'fixed', value: isPowerOfTwo(x) }],
  });
  r.close(powerCaption(x), 2);
  return r.frames;
}

export function swapFrames(a: number, b: number, alias: boolean): TrickFrame[] {
  const states = xorSwap(a, b, alias);
  const rowsAt = (k: number): TrickRow[] => [
    { label: alias ? 'a (= x)' : 'a', value: states[k].a, changed: k ? diff(states[k - 1].a, states[k].a) : undefined },
    { label: alias ? 'b (= x)' : 'b', value: states[k].b, changed: k ? diff(states[k - 1].b, states[k].b) : undefined },
  ];
  const r = createRecorder<TrickFrame>({ rows: rowsAt(0), line: null, counter: null, verdicts: [] });
  r.snap(
    alias ? <>swap(x, x): a and b are two names for the <b>same</b> variable, holding {a}.</>
      : <>Swap a = <b>{a}</b> and b = <b>{b}</b> with three XORs and no temporary variable.</>,
  );
  SWAP_LINES.forEach((code, line) => {
    const s = states[line + 1];
    r.snap(
      <><code>{code}</code>: a = {s.a}, b = {s.b}.{line === 0 && alias ? <> x ^ x is always 0: the value is already gone.</> : ''}</>,
      undefined,
      { line, rows: rowsAt(line + 1) },
    );
  });
  const end = states[states.length - 1];
  r.close(
    alias ? <>Both names now read <span className="hl bad">{end.a}</span>: XOR-swapping a variable with itself zeroes it. Real code
      checks <code>if (a !== b)</code> first, or just uses a temporary.</>
      : <>Swapped: a = <b>{end.a}</b>, b = <b>{end.b}</b>. Each XOR stores the difference, and XORing the difference back undoes it.</>,
    2,
  );
  return r.frames;
}

export function trickFrames(trick: Trick, x: number, y: number, alias: boolean): TrickFrame[] {
  switch (trick) {
    case 'popcount': return popcountFrames(x);
    case 'lowest': return lowestFrames(x);
    case 'power': return powerFrames(x);
    case 'swap': return swapFrames(x, y, alias);
  }
}
