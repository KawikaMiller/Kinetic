import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { flagCaption, lowestFrames, opFrames, opSummary, popcountFrames, powerCaption, powerFrames, swapFrames, type TrickFrame } from './frames';
import {
  JS_FACTS, OPS, PRESETS, applyFlag, bitsOf, isPowerOfTwo, isPowerOfTwoNaive, jsDifference, jsEval, kernighanTrail, lowestSetBit8,
  maskOf, negate8, parseRegister, popcount, powerTrap, resultBits, resultValue, testFlag, xorSwap, type Op, type Width,
} from './model';

const valueOf = (op: Op, a: number, b: number, n: number, width: Width) => resultValue(op, resultBits(op, a, b, n, width), width);

/**
 * The 8-bit view, written with JS's own operators: a byte sits in the top 8 bits of a
 * 32-bit word so that >> copies the byte's bit 7 (the word's sign bit), then comes back down.
 */
function js8(op: Op, a: number, b: number, n: number): number {
  switch (op) {
    case '&': return a & b;
    case '|': return a | b;
    case '^': return a ^ b;
    case '~': return ~a & 0xff;
    case '<<': return (a << n) & 0xff;
    case '>>': return ((a << 24) >> n) >>> 24;
    case '>>>': return (a >>> n) & 0xff;
  }
}

describe('operators, worked out column by column', () => {
  it('match JavaScript on all 65,536 8-bit pairs for &, |, ^ and ~', () => {
    for (const op of ['&', '|', '^', '~'] as Op[]) {
      for (let a = 0; a < 256; a++) {
        for (let b = 0; b < 256; b++) {
          if (valueOf(op, a, b, 0, 8) !== js8(op, a, b, 0)) throw new Error(`${a} ${op} ${b}`);
        }
      }
    }
  });

  it('match JavaScript on every 8-bit value and shift count', () => {
    for (const op of ['<<', '>>', '>>>'] as Op[]) {
      for (let a = 0; a < 256; a++) {
        for (let n = 0; n < 8; n++) expect(valueOf(op, a, 0, n, 8), `${a} ${op} ${n}`).toBe(js8(op, a, 0, n));
      }
    }
  });

  it('match JavaScript on 10,000 seeded 32-bit pairs, shift counts 0-40 included', () => {
    const rnd = mulberry32(2024);
    for (let t = 0; t < 10_000; t++) {
      const a = (rnd() * 2 ** 32) | 0;
      const b = (rnd() * 2 ** 32) | 0;
      const n = Math.floor(rnd() * 41);
      for (const op of OPS) {
        if (valueOf(op, a, b, n, 32) !== jsEval(op, a, b, n)) throw new Error(`${a} ${op} ${op.length > 1 ? n : b}`);
      }
    }
  });

  it('show the 32-bit surprises JS really has', () => {
    expect(valueOf('<<', 1, 0, 31, 32)).toBe(1 << 31);
    expect(1 << 31).toBe(-2147483648);
    expect(valueOf('>>>', -1, 0, 0, 32)).toBe(4294967295);
    for (const x of [1, 5, -7, 2 ** 30, -(2 ** 31)]) expect(valueOf('<<', x, 0, 32, 32)).toBe(x << 32);
    expect(5 << 32).toBe(5);
    expect(valueOf('>>', -16, 0, 2, 32)).toBe(-4);
    expect(valueOf('>>>', -16, 0, 2, 32)).toBe(1073741820);
  });

  it('every JS-fact chip states what its own values compute', () => {
    const say = (id: string) => JS_FACTS.find((f) => f.id === id)!;
    const run = (id: string) => {
      const f = say(id);
      return valueOf(f.op, f.a, f.b, f.n, f.width);
    };
    expect(run('sign')).toBeLessThan(0);
    expect(run('unsigned')).toBe(4294967295);
    expect(run('mod32')).toBe(5);
    expect(run('arith')).toBe(-16 / 4);
    expect(run('logical')).toBe(1073741820);
  });

  it('preset notes match their values', () => {
    const p = (id: string) => PRESETS.find((x) => x.id === id)!;
    const chmod = p('chmod');
    expect(valueOf(chmod.op, chmod.a, chmod.b, 0, 32)).toBe(0o775);
    const feature = p('feature');
    expect(valueOf(feature.op, feature.a, feature.b, 0, 8)).not.toBe(0);
    expect(bitsOf(feature.b, 8)[7 - 2]).toBe(1);
    const pack = p('rgb-pack');
    expect(valueOf(pack.op, pack.a, pack.b, 0, 32)).toBe((0xff << 16) | (0x88 << 8) | 0x00);
    const unpack = p('rgb-unpack');
    expect(valueOf(unpack.op, unpack.a, 0, unpack.n, 32) & 0xff).toBe(0x88);
  });
});

describe('8-bit view vs real JS', () => {
  it('only >> on a byte with bit 7 set differs in its low 8 bits', () => {
    for (let a = 0; a < 256; a++) {
      for (let n = 1; n < 8; n++) expect(jsDifference('>>', a, 0, n)).toBe(a >= 128 ? 'sign' : 'same');
      expect(jsDifference('~', a, 0, 0)).toBe('wider');
      expect(jsDifference('&', a, 0x0f, 0)).toBe('same');
    }
    expect(jsDifference('<<', 200, 0, 1)).toBe('wider');
    expect(jsDifference('<<', 5, 0, 1)).toBe('same');
  });
});

describe('parseRegister', () => {
  it('reads decimal, hex and binary', () => {
    expect(parseRegister('202', 8)).toEqual({ ok: true, value: 202 });
    expect(parseRegister(' 0xCA ', 8)).toEqual({ ok: true, value: 202 });
    expect(parseRegister('0b1100_1010', 8)).toEqual({ ok: true, value: 202 });
    expect(parseRegister('-1', 32)).toEqual({ ok: true, value: -1 });
    expect(parseRegister('4294967295', 32)).toEqual({ ok: true, value: -1 });
    expect(parseRegister('0x80000000', 32)).toEqual({ ok: true, value: -2147483648 });
  });

  it('refuses hostile input instead of masking or rounding it', () => {
    const refused = ['', '   ', '1.5', '1e400', '1e3', '256', '-1', '12345678901234567890123', 'abc', '0x', '0b2', '<b>1</b>', '🙂', '1, 2', 'Infinity', 'NaN'];
    for (const t of refused) expect(parseRegister(t, 8).ok, t).toBe(false);
    for (const t of ['4294967296', '-2147483649', '0x100000000', '1e400', '9'.repeat(23)]) expect(parseRegister(t, 32).ok, t).toBe(false);
  });
});

describe('flags', () => {
  it('set, clear and toggle change only the masked bit; test reads it', () => {
    for (let f = 0; f < 256; f++) {
      for (let k = 0; k < 8; k++) {
        const m = maskOf(k);
        expect(applyFlag('set', f, m)).toBe(f | m);
        expect(applyFlag('clear', f, m)).toBe(f & ~m & 0xff);
        expect(applyFlag('toggle', f, m) ^ f).toBe(m);
        expect(testFlag(f, m)).toBe(((f >> k) & 1) === 1);
      }
    }
  });

  it('captions say what each operation does to this flag word, for every word, bit and operation', () => {
    for (let f = 0; f < 256; f++) {
      for (let k = 0; k < 8; k++) {
        const on = testFlag(f, maskOf(k));
        const say = (op: 'set' | 'clear' | 'toggle' | 'test') => captionText(flagCaption(op, f, k));
        expect(say('set').includes('changes nothing')).toBe(applyFlag('set', f, maskOf(k)) === f);
        expect(say('clear').includes('changes nothing')).toBe(applyFlag('clear', f, maskOf(k)) === f);
        expect(say('toggle')).toContain(on ? 'goes off' : 'goes on');
        expect(say('test')).toContain(`is ${f & maskOf(k)}, so`);
        expect(say('test')).toContain(on ? 'is on.' : 'is off.');
      }
    }
  });
});

describe('tricks', () => {
  it("Kernighan's loop runs once per set bit, for 0..65535", () => {
    for (let x = 0; x <= 65535; x++) {
      const trail = kernighanTrail(x);
      if (trail.length - 1 !== popcount(x) || trail[trail.length - 1] !== 0) throw new Error(String(x));
    }
  });

  it('x & -x isolates the lowest set bit, and -x is ~x + 1', () => {
    for (let x = 0; x < 256; x++) {
      expect(negate8(x)).toBe((256 - x) & 0xff);
      expect(lowestSetBit8(x)).toBe(x === 0 ? 0 : 2 ** Math.log2(x & -x));
    }
  });

  it('the power-of-two test is right at the 32-bit boundaries, with 0 and -2^31 as the traps', () => {
    const powers = new Set(Array.from({ length: 32 }, (_, k) => 2 ** k));
    const probes = [0, 1, 2, 3, 4, 255, 256, 2 ** 30, 2 ** 30 + 1, 2 ** 31 - 1, 2 ** 31, -1, -2, -(2 ** 31), -(2 ** 31) + 1];
    for (const x of probes) expect(isPowerOfTwo(x), String(x)).toBe(powers.has(x));
    expect(isPowerOfTwoNaive(0)).toBe(true);
    expect(isPowerOfTwoNaive(-(2 ** 31))).toBe(true);
    expect(powerTrap(0)).toBe('zero');
    expect(powerTrap(-(2 ** 31))).toBe('negative');
    for (let x = 1; x < 256; x++) expect(powerTrap(x)).toBe(null);
  });

  it('power-of-two captions say what the tests compute', () => {
    expect(captionText(powerCaption(0))).toContain('0 a power of two');
    expect(captionText(powerCaption(-(2 ** 31)))).toContain("it isn't a power of two");
    for (let x = 1; x < 256; x++) expect(captionText(powerCaption(x))).toContain(isPowerOfTwo(x) ? 'say yes' : 'say no');
  });

  it('XOR swap swaps two variables, and zeroes one swapped with itself', () => {
    for (let a = 0; a < 256; a += 7) {
      for (let b = 0; b < 256; b += 5) {
        const end = xorSwap(a, b, false).at(-1)!;
        expect(end).toEqual({ a: b, b: a });
      }
      expect(xorSwap(a, a, true).at(-1)).toEqual({ a: 0, b: 0 });
      expect(xorSwap(a, a, true)[1]).toEqual({ a: 0, b: 0 });
    }
  });
});

describe('frames', () => {
  const last = <F extends { say?: unknown }>(fs: F[]) => fs[fs.length - 1];

  it('fill one column per frame, bit 0 first, and end with a summary', () => {
    for (const width of [8, 32] as Width[]) {
      const fs = opFrames('&', 202, 166, 0, width);
      expect(fs).toHaveLength(width + 2);
      fs.forEach((f, k) => expect(f.filled).toBe(Math.min(k, width)));
      expect(fs[1].col).toBe(width - 1);
      expect(last(fs).col).toBe(null);
    }
  });

  it('column captions state the bits on screen', () => {
    const fs = opFrames('&', 0b1100_1010, 0b1010_0110, 0, 8);
    const a = bitsOf(0b1100_1010, 8);
    const b = bitsOf(0b1010_0110, 8);
    for (let k = 1; k <= 8; k++) {
      const i = 8 - k;
      expect(captionText(fs[k].say as never)).toBe(`Bit ${k - 1}: ${a[i]} & ${b[i]} → ${a[i] & b[i]}.`);
    }
  });

  it('the >> / >>> summary says they split exactly when they do', () => {
    for (const width of [8, 32] as Width[]) {
      for (const a of width === 8 ? [0, 5, 127, 128, 202, 255] : [0, 5, -1, -16, 2 ** 31 - 1, -(2 ** 31)]) {
        for (let n = 0; n <= (width === 8 ? 7 : 33); n++) {
          for (const op of ['>>', '>>>'] as Op[]) {
            const other: Op = op === '>>' ? '>>>' : '>>';
            const differ = valueOf(op, a, 0, n, width) !== valueOf(other, a, 0, n, width);
            const text = captionText(opSummary(op, a, 0, n, width));
            expect(text.includes('agree here'), `${a} ${op} ${n}`).toBe(!differ);
            expect(text).toContain(`= ${valueOf(op, a, 0, n, width)} (`);
          }
        }
      }
    }
  });

  it('mentions the mod-32 rule exactly when the count is 32 or more', () => {
    expect(captionText(opSummary('<<', 5, 0, 33, 32))).toContain('33 shifts by 1');
    expect(captionText(opSummary('<<', 5, 0, 31, 32))).not.toContain('mod 32');
  });

  const ends = (fs: TrickFrame[]) => captionText(last(fs).say as never);

  it('trick captions agree with the model for every 8-bit value', () => {
    for (let x = 0; x < 256; x++) {
      const pc = popcountFrames(x);
      expect(ends(pc)).toContain(`after ${popcount(x)} pass`);
      expect(last(pc).counter).toBe(popcount(x));
      expect(ends(lowestFrames(x))).toContain(`= ${lowestSetBit8(x)}`);
      expect(last(powerFrames(x)).verdicts).toEqual([
        { label: 'tempting', value: isPowerOfTwoNaive(x) },
        { label: 'fixed', value: isPowerOfTwo(x) },
      ]);
    }
    expect(ends(swapFrames(3, 9, false))).toContain('a = 9, b = 3');
    expect(ends(swapFrames(3, 3, true))).toContain('zeroes it');
  });
});
