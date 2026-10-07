import { describe, expect, it } from 'vitest';
import type { Bit } from '../../core/bits';
import { captionText } from '../../core/testing/captions';
import { aluCaption, flagsCaption, tickFrames } from './frames';
import {
  BITS, FIRST_TICK, FULL_ADDER, HALF_ADDER, HOP_TICKS, LOOKAHEAD_TICKS, PAIRS, alu, evaluate, fullAdd, halfAdd, longestPropagateRun,
  lookaheadAdd, parsePair, rippleAdd, signed4, valueOf,
} from './model';

const ALL_PAIRS = Array.from({ length: 256 }, (_, k) => [k >> 4, k & 15] as const);
const bit = (v: boolean): Bit => (v ? 1 : 0);
/** Signed overflow by the textbook rule: both inputs share a sign and the result's sign differs. */
const signRule = (a: number, b: number, r: number) => ((a ^ r) & (b ^ r) & 8) !== 0;

describe('half and full adders', () => {
  it('the gate circuits match the formulas on every row', () => {
    for (const a of [0, 1] as Bit[]) {
      for (const b of [0, 1] as Bit[]) {
        const h = evaluate(HALF_ADDER, { A: !!a, B: !!b });
        expect({ sum: bit(h.sum), carry: bit(h.carry) }).toEqual(halfAdd(a, b));
        for (const c of [0, 1] as Bit[]) {
          const f = evaluate(FULL_ADDER, { A: !!a, B: !!b, Cin: !!c });
          const want = fullAdd(a, b, c);
          expect(bit(f.sum)).toBe(want.sum);
          expect(bit(f.cout)).toBe(want.carry);
          expect(want.sum + 2 * want.carry).toBe(a + b + c);
        }
      }
    }
  });
});

describe('4-bit adders', () => {
  it('ripple sum is (a + b) & 15 and carry out is (a + b) > 15, for all 256 pairs', () => {
    for (const [a, b] of ALL_PAIRS) {
      const run = rippleAdd(a, b);
      expect(valueOf(run.sum)).toBe((a + b) & 15);
      expect(run.carries[BITS].value).toBe(bit(a + b > 15));
    }
  });

  it('V (carry into the MSB XOR carry out) matches the sign rule for all pairs', () => {
    for (const [a, b] of ALL_PAIRS) {
      const run = rippleAdd(a, b);
      const v = run.carries[BITS - 1].value ^ run.carries[BITS].value;
      expect(v === 1, `${a}+${b}`).toBe(signRule(a, b, (a + b) & 15));
      expect(v === 1).toBe(signed4(a) + signed4(b) !== signed4((a + b) & 15));
    }
  });

  it('lookahead carries equal ripple carries for all pairs, with carry-in 0 and 1', () => {
    for (const [a, b] of ALL_PAIRS) {
      for (const cin of [0, 1] as Bit[]) {
        expect(lookaheadAdd(a, b, cin).carries.map((c) => c.value)).toEqual(rippleAdd(a, b, cin).carries.map((c) => c.value));
        expect(valueOf(lookaheadAdd(a, b, cin).sum)).toBe((a + b + cin) & 15);
      }
    }
  });

  it('ripple delay is FIRST_TICK + HOP_TICKS x the longest propagate chain; lookahead is fixed', () => {
    for (const [a, b] of ALL_PAIRS) {
      expect(rippleAdd(a, b).delay, `${a}+${b}`).toBe(FIRST_TICK + HOP_TICKS * longestPropagateRun(a, b));
      expect(lookaheadAdd(a, b).delay).toBe(LOOKAHEAD_TICKS);
    }
    expect(FIRST_TICK).toBe(1);
    expect(HOP_TICKS).toBe(1);
  });

  it('the misconception pairs: 0111 + 0001 sets V not C, 1111 + 0001 sets C not V', () => {
    const flags = (a: number, b: number) => {
      const run = rippleAdd(a, b);
      return { c: run.carries[BITS].value, v: run.carries[BITS - 1].value ^ run.carries[BITS].value };
    };
    expect(flags(0b0111, 0b0001)).toEqual({ c: 0, v: 1 });
    expect(flags(0b1111, 0b0001)).toEqual({ c: 1, v: 0 });
    expect(rippleAdd(0b1111, 0b0001).delay).toBeGreaterThan(rippleAdd(0b0011, 0b0011).delay);
    expect(rippleAdd(0b0011, 0b0011).delay).toBe(FIRST_TICK);
    expect(PAIRS.map((p) => p.label)).toContain('0111 + 0001');
  });
});

describe('ALU', () => {
  it('SUB is (a - b) & 15 with Z, N, C (no borrow) and V matching a reference, for all pairs', () => {
    for (const [a, b] of ALL_PAIRS) {
      const { result, flags, bIn, cin } = alu('SUB', a, b);
      const r = (a - b) & 15;
      expect(result).toBe(r);
      expect(bIn).toBe(~b & 15);
      expect(cin).toBe(1);
      expect(flags).toEqual({
        z: bit(r === 0),
        n: bit((r & 8) !== 0),
        c: bit(a >= b),
        v: bit(signed4(a) - signed4(b) !== signed4(r)),
      });
    }
  });

  it('ADD, AND and OR give the right result and flags for all pairs', () => {
    for (const [a, b] of ALL_PAIRS) {
      const add = alu('ADD', a, b);
      expect(add.result).toBe((a + b) & 15);
      expect(add.flags.c).toBe(bit(a + b > 15));
      expect(add.flags.v).toBe(bit(signRule(a, b, add.result)));
      expect(alu('AND', a, b)).toMatchObject({ result: a & b, flags: { c: 0, v: 0, z: bit((a & b) === 0) } });
      expect(alu('OR', a, b)).toMatchObject({ result: a | b, flags: { c: 0, v: 0, n: bit(((a | b) & 8) !== 0) } });
    }
  });
});

describe('parsePair', () => {
  it('takes two values 0-15 and refuses the rest', () => {
    expect(parsePair('7, 1')).toEqual({ ok: true, a: 7, b: 1 });
    expect(parsePair(' 15 1 ')).toEqual({ ok: true, a: 15, b: 1 });
    for (const t of ['', '7', '7, 1, 2', '16, 1', '-1, 2', '1.5, 2', '1e400, 1', '🙂', '<b>1</b>, 2', '9'.repeat(23) + ', 1']) {
      expect(parsePair(t).ok, t).toBe(false);
    }
  });
});

describe('captions', () => {
  it('the C/V caption names exactly the flags the adder sets, for all pairs', () => {
    for (const [a, b] of ALL_PAIRS) {
      const run = rippleAdd(a, b);
      const c = run.carries[BITS].value;
      const v = run.carries[BITS - 1].value ^ c;
      const text = captionText(flagsCaption(a, b));
      expect(text, `${a}+${b}`).toContain(`C = ${c}`);
      expect(text).toContain(`V = ${v}`);
    }
  });

  it('one frame per tick, and each tick caption lists the carries that settle then', () => {
    for (const [a, b] of ALL_PAIRS) {
      for (const mode of ['ripple', 'lookahead'] as const) {
        const run = mode === 'ripple' ? rippleAdd(a, b) : lookaheadAdd(a, b);
        const fs = tickFrames(a, b, mode);
        expect(fs).toHaveLength(run.delay + 2);
        for (let t = 1; t <= run.delay; t++) {
          const text = captionText(fs[t].say as never);
          run.carries.forEach((c, i) => {
            if (i > 0 && c.at === t) expect(text).toContain(`C${i} = ${c.value}`);
          });
        }
      }
    }
  });

  it('the SUB caption states borrow exactly when A < B', () => {
    for (const [a, b] of ALL_PAIRS) {
      expect(captionText(aluCaption('SUB', a, b)).includes('a borrow happened')).toBe(a < b);
    }
  });
});
