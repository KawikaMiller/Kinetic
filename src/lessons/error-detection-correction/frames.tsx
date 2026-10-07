import type { ReactNode } from 'react';
import type { Bit } from '../../core/bits';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  CRC4_GENERATOR, PARITY_POSITIONS, applyFlips, checkFails, crcCodeword, crcVerdict, divide, hammingDecode, hammingEncode,
  hammingVerdict, overallFails, parityVerdict, syndrome, type DivisionStep,
} from './model';

const bitsText = (bits: readonly Bit[]) => bits.join('');
const list = (xs: readonly number[]) => [...xs].sort((a, b) => a - b).join(' and ');

// ── Parity ───────────────────────────────────────────────────────────────

export function parityCaption(sent: readonly Bit[], flips: ReadonlySet<number>): ReactNode {
  const n = flips.size;
  const ones = applyFlips(sent, flips).filter((b) => b === 1).length;
  switch (parityVerdict(sent, flips)) {
    case 'clean':
      return <>Sent as-is: {plural(ones, 'one')} in all 9 bits, an even number, so the check passes. <b>No errors.</b></>;
    case 'detected':
      return <>{plural(n, 'bit')} flipped, so there are now {ones} ones, an odd number: the check fails, <b>detected</b>. Parity can't say which
        bit, though.</>;
    case 'undetected':
      return <>{n} bits flipped. Each flip changes the count of 1s by one, so it's even again ({ones}) and the check passes:{' '}
        <span className="hl bad">undetected</span>. A passing check doesn't mean the data is intact.</>;
  }
}

// ── Hamming ──────────────────────────────────────────────────────────────

export function hammingCaption(data: readonly Bit[], flips: ReadonlySet<number>, secded: boolean): ReactNode {
  const received = applyFlips(hammingEncode(data), flips);
  const s = syndrome(received);
  const failing = PARITY_POSITIONS.filter((p) => checkFails(received, p)).map((p) => `p${p}`);
  const sBits = s.toString(2).padStart(3, '0');
  const fix = hammingDecode(received, secded).flipped;
  switch (hammingVerdict(data, flips, secded)) {
    case 'clean':
      return <>Nothing flipped: every check passes and the syndrome is 000. <b>No errors.</b></>;
    case 'corrected':
      return fix === 0 ? (
        <>Only the overall parity bit flipped: the three checks pass but overall parity is odd. The data is fine: <b>corrected</b>.</>
      ) : (
        <>{failing.join(', ')} {failing.length === 1 ? 'fails' : 'fail'}, so the syndrome p4 p2 p1 is {sBits} = <b>{s}</b>: position {s}{' '}
          flipped. The decoder flips it back: <b>corrected</b>.</>
      );
    case 'miscorrected':
      return <>{plural(flips.size, 'flip')} (at {list([...flips])}) give syndrome {sBits} = {s}, which names position {s}. The decoder
        "fixes" a bit that was fine and hands back the wrong data: <span className="hl orange">miscorrected</span>, with no warning.</>;
    case 'uncorrectable':
      return <>The syndrome is {sBits} but overall parity is {overallFails(received) ? 'odd' : 'even'}, so an even number of bits flipped:{' '}
        <span className="hl bad">two errors, can't fix</span>. SECDED reports it instead of guessing.</>;
    case 'undetected':
      return <>{plural(flips.size, 'flip')} happen to turn the word into another valid codeword: every check passes and the wrong data goes
        through <span className="hl bad">undetected</span>.</>;
  }
}

// ── CRC long division ────────────────────────────────────────────────────

export interface CrcFrame extends Frame {
  /** The row being divided, before this step's XOR. */
  work: Bit[];
  /** The step on screen, or null before the first and after the last. */
  step: DivisionStep | null;
  /** XOR steps done so far. */
  done: number;
}

export type CrcMode = 'send' | 'check';

/**
 * Stepped long division: one frame per XOR. `send` divides the message plus four 0s to get
 * the CRC; `check` divides the received codeword (with any flips) and expects 0000.
 */
export function crcFrames(message: readonly Bit[], mode: CrcMode, flips: ReadonlySet<number>): CrcFrame[] {
  const dividend = mode === 'send' ? [...message, ...Array<Bit>(CRC4_GENERATOR.length - 1).fill(0)] : applyFlips(crcCodeword(message), flips);
  const { steps, remainder } = divide(dividend);
  const gen = bitsText(CRC4_GENERATOR);
  const r = createRecorder<CrcFrame>({ work: dividend, step: null, done: 0 });
  r.snap(
    mode === 'send'
      ? <>The sender appends four 0s to the message and divides by {gen} (x⁴ + x + 1), mod 2: subtraction is XOR, with no borrows.</>
      : <>The receiver divides the whole codeword, CRC included, by {gen}. A clean codeword leaves remainder 0000.</>,
  );
  steps.forEach((s, k) => {
    r.snap(
      <>Leading 1 at bit {s.at + 1}: line {gen} up under it and XOR. {bitsText(s.before.slice(s.at, s.at + 5))} XOR {gen} ={' '}
        {bitsText(s.after.slice(s.at, s.at + 5))}.</>,
      undefined,
      { work: s.before, step: s, done: k + 1 },
    );
  });
  r.set({ work: steps.length ? steps[steps.length - 1].after : dividend, step: null });
  r.close(crcSummary(message, mode, flips, remainder), 2);
  return r.frames;
}

export function crcSummary(message: readonly Bit[], mode: CrcMode, flips: ReadonlySet<number>, remainder: readonly Bit[]): ReactNode {
  const rem = bitsText(remainder);
  if (mode === 'send') {
    return <>No room left to line up the generator, so the last four bits, <b>{rem}</b>, are the remainder: that's the CRC. The sender
      transmits {bitsText(message)} followed by {rem}.</>;
  }
  switch (crcVerdict(message, flips)) {
    case 'clean':
      return <>Remainder <b>{rem}</b>: the codeword divides evenly, so the receiver accepts it. <b>No errors.</b></>;
    case 'detected':
      return <>Remainder <span className="hl bad">{rem}</span>, not 0000: the receiver knows something flipped and rejects the frame:{' '}
        <b>detected</b>.</>;
    case 'undetected':
      return <>Remainder {rem}, so the receiver accepts it, but bits were flipped: this error pattern is a multiple of the generator, so CRC
        can't see it. <span className="hl bad">Undetected</span>.</>;
  }
}
