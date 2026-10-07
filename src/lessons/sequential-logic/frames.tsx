import type { ReactNode } from 'react';
import type { Bit } from '../../core/bits';
import { plural } from '../../core/format';
import { BITS, capture, settleTicks, type Sample, type SrState, type SrStatus } from './model';

const bin = (v: number) => v.toString(2).padStart(BITS, '0');

// ── SR latch ─────────────────────────────────────────────────────────────

export function srCaption(status: SrStatus, state: SrState): ReactNode {
  switch (status) {
    case 'set':
      return <>S = 1 forces Q̄ to 0, and that makes Q = 1: <b>set</b>. Now release S: the loop keeps Q at 1 on its own.</>;
    case 'reset':
      return <>R = 1 forces Q to 0, and Q̄ becomes 1: <b>reset</b>. Release R and Q stays 0.</>;
    case 'hold':
      return <>S = R = 0: each gate's output feeds the other, so Q stays <b>{state.q}</b>. That loop is the memory.</>;
    case 'invalid':
      return <>S = R = 1 drives <span className="hl bad">both</span> outputs to 0, so Q̄ is no longer the opposite of Q: the{' '}
        <span className="hl bad">invalid</span> state.</>;
    case 'unpredictable':
      return <>S and R were released together from the invalid state: both gates flip at once, again and again, and never settle. Which way
        a real latch falls is <span className="hl bad">unpredictable</span>.</>;
  }
}

// ── D latch vs D flip-flop ───────────────────────────────────────────────

/** What toggling D right now does, from the clock level alone. */
export function dToggleCaption(clk: Bit, d: Bit): ReactNode {
  return clk ? (
    <>D is now {d} while CLK is high: the latch is transparent, so its Q follows at once. The flip-flop ignores D until the next rising edge.</>
  ) : (
    <>D is now {d} while CLK is low: both hold. The latch picks it up when CLK goes high; the flip-flop captures it at the rising edge.</>
  );
}

/** What a rising edge did. */
export function edgeCaption(s: Sample): ReactNode {
  return <>Rising edge: the flip-flop captures D = <b>{s.d}</b>, and Q will hold that until the next rising edge, whatever D does in between.</>;
}

// ── Register and counter ─────────────────────────────────────────────────

/** What the register captured at an edge, judged by comparing it with the correct sum. */
export function captureCaption(q: number, period: number): ReactNode {
  const { captured, correct, stale } = capture(q, period);
  const need = settleTicks(q);
  if (captured === correct && period >= need) {
    return <>Edge after {plural(period, 'tick')}: {bin(q)} + 1 had settled ({need} needed), so the register captures <b>{bin(correct)}</b>.</>;
  }
  if (captured === correct) {
    return <>Edge after {plural(period, 'tick')}, before {bin(q)} + 1 had fully settled ({need} needed). The bits still settling weren't
      going to change, so the register got <b>{bin(correct)}</b> anyway: lucky, not safe.</>;
  }
  return <>Edge after only {plural(period, 'tick')}, but {bin(q)} + 1 needs {need}: {stale.length === 1 ? 'bit' : 'bits'} {stale.join(', ')}{' '}
    still showed the old value, so the register captured <span className="hl bad">{bin(captured)}</span> instead of{' '}
    <span className="hl ok">{bin(correct)}</span>. Wrong value captured.</>;
}
