import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { BITS, MAX, alu, bitAt, lookaheadAdd, rippleAdd, signed4, valueOf, type AdderRun, type AluOp } from './model';

const bin = (v: number) => v.toString(2).padStart(BITS, '0');

// ── Ripple / lookahead: one frame per tick ───────────────────────────────

export type AdderMode = 'ripple' | 'lookahead';

export interface TickFrame extends Frame {
  /** Ticks elapsed: signals with `at <= tick` are final. */
  tick: number;
}

export const runFor = (a: number, b: number, mode: AdderMode): AdderRun => (mode === 'ripple' ? rippleAdd(a, b) : lookaheadAdd(a, b));

export function tickFrames(a: number, b: number, mode: AdderMode): TickFrame[] {
  const run = runFor(a, b, mode);
  const r = createRecorder<TickFrame>({ tick: 0 });
  r.snap(
    mode === 'ripple'
      ? <>{bin(a)} + {bin(b)}: four full adders in a row. Each tick, a waiting carry moves one stage left.</>
      : <>{bin(a)} + {bin(b)} with carry lookahead: a separate unit works out every carry from G, P and C₀ at once.</>,
  );
  for (let t = 1; t <= run.delay; t++) r.snap(tickCaption(a, b, run, mode, t), undefined, { tick: t });
  r.close(<>Settled after <b>{run.delay}</b> {run.delay === 1 ? 'tick' : 'ticks'}. {flagsCaption(a, b)}</>, 2);
  return r.frames;
}

/** What becomes final at tick t, read off the run's timing. */
export function tickCaption(a: number, b: number, run: AdderRun, mode: AdderMode, t: number): ReactNode {
  const arriving = run.carries.flatMap((c, i) => (i > 0 && c.at === t ? [i] : []));
  const now = arriving.map((i) => `C${i} = ${run.carries[i].value}`).join(', ');
  if (t === 1) {
    const gens = Array.from({ length: BITS }, (_, i) => i).filter((i) => bitAt(a & b, i));
    const generated = gens.length === 0 ? '' : gens.length === 1 ? `Stage ${gens[0]} generates a carry. ` : `Stages ${gens.join(', ')} generate carries. `;
    return mode === 'ripple' ? (
      <>Tick 1: every stage forms G (A AND B) and P (A XOR B). {generated}Stages that decide their own carry settle now
        {now ? `: ${now}` : ''}.</>
    ) : (
      <>Tick 1: every stage forms G and P. The lookahead unit needs only these and C₀.</>
    );
  }
  if (mode === 'lookahead') return <>Tick {t}: the lookahead unit's AND-OR logic delivers every carry together: {now}.</>;
  const stages = arriving.map((i) => i - 1).join(', ');
  return <>Tick {t}: {now} arrives. Stage {stages} had P = 1, so it could only pass the carry on once it got there.</>;
}

/**
 * C vs V, from the adder alone: C is the carry out of the top bit (unsigned wraparound), V is
 * the carry into the top bit XOR the carry out of it (signed overflow).
 */
export function flagsCaption(a: number, b: number): ReactNode {
  const run = rippleAdd(a, b);
  const c = run.carries[BITS].value;
  const v = run.carries[BITS - 1].value ^ c;
  const sum = valueOf(run.sum);
  const unsigned = <>unsigned {a} + {b} = {a + b}{c ? <>, which doesn't fit, so it wrapped to {sum}</> : ''}</>;
  const signed = <>signed {signed4(a)} + {signed4(b)} = {signed4(a) + signed4(b)}{v ? <>, but 4 bits read {signed4(sum)}</> : ''}</>;
  if (c && v) return <><span className="hl orange">C = 1</span> and <span className="hl bad">V = 1</span>: {unsigned}; {signed}. Wrong both ways.</>;
  if (c) return <><span className="hl orange">C = 1</span>, V = 0: {unsigned}; but {signed} is right. Carry isn't overflow.</>;
  if (v) return <>C = 0, <span className="hl bad">V = 1</span>: {unsigned} fits fine; {signed}. Overflow isn't carry.</>;
  return <>C = 0, V = 0: {unsigned} and {signed} both fit.</>;
}

// ── ALU ──────────────────────────────────────────────────────────────────

export function aluCaption(op: AluOp, a: number, b: number): ReactNode {
  const { result, flags } = alu(op, a, b);
  if (op === 'AND' || op === 'OR') {
    return <>{op} works bit by bit and skips the adder: {bin(a)} {op} {bin(b)} = <b>{bin(result)}</b>. C and V are cleared.</>;
  }
  if (op === 'ADD') return <>ADD: {bin(a)} + {bin(b)} = <b>{bin(result)}</b>. {flagsCaption(a, b)}</>;
  const borrow = a < b;
  return <>SUB reuses the adder: A + ~B + 1 = {bin(a)} + {bin(~b & MAX)} + 1 = <b>{bin(result)}</b> = {a} − {b} mod 16.
    C = {flags.c} means {borrow ? 'a borrow happened (A < B as unsigned)' : 'no borrow (A ≥ B as unsigned)'}.
    {flags.v ? <> <span className="hl bad">V = 1</span>: signed {signed4(a)} − {signed4(b)} = {signed4(a) - signed4(b)} doesn't fit in 4 bits.</> : ''}</>;
}

