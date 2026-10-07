import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { ABSDIFF_SIGNED, ABSDIFF_UNSIGNED, AREA, MAX_BRANCH, MAX_CMOV, SUM, type Listing } from './listings';
import { assembleListing, cResult, PRESETS, runProgram, STACK_TOP, type ProgId, type Variant } from './model';
import { signed, unsigned } from './x86';

/**
 * Fixture: the instruction lines of `gcc -O1 -masm=intel -S` (gcc 13.3.0, Ubuntu 24.04,
 * x86-64, plus -fno-asynchronous-unwind-tables -fcf-protection=none -fno-pie and each
 * listing's extra flags), directives removed, tabs as printed. The listings must say exactly this.
 */
const GCC: Record<string, string> = {
  sum: 'sum:|test\trsi, rsi|jle\t.L4|mov\trax, rdi|lea\trcx, [rdi+rsi*8]|mov\tedx, 0|.L3:|add\trdx, QWORD PTR [rax]|add\trax, 8|cmp\trax, rcx|jne\t.L3|.L1:|mov\trax, rdx|ret|.L4:|mov\tedx, 0|jmp\t.L1',
  'max-cmov': 'max:|cmp\trdi, rsi|mov\trax, rsi|cmovge\trax, rdi|ret',
  'max-branch': 'max:|cmp\trdi, rsi|jg\t.L3|mov\trax, rsi|ret|.L3:|mov\trax, rdi|ret',
  absdiff: 'absdiff:|cmp\trdi, rsi|jl\t.L4|mov\trax, rdi|sub\trax, rsi|ret|.L4:|mov\trax, rsi|sub\trax, rdi|ret',
  // absdiff_u in the compiled file
  'absdiff-u': 'absdiff_u:|cmp\trdi, rsi|jb\t.L8|mov\trax, rdi|sub\trax, rsi|ret|.L8:|mov\trax, rsi|sub\trax, rdi|ret',
  area: 'area:|mov\trax, QWORD PTR [rdi+8]|imul\trax, QWORD PTR [rdi+16]|ret',
};

/** Byte offsets from `objdump -d` of the same build (absdiff_u rebased to 0). */
const OBJDUMP_OFFSETS: Record<string, number[]> = {
  sum: [0x0, 0x3, 0x5, 0x8, 0xc, 0x11, 0x14, 0x18, 0x1b, 0x1d, 0x20, 0x21, 0x26],
  'max-cmov': [0x0, 0x3, 0x6, 0xa],
  'max-branch': [0x0, 0x3, 0x5, 0x8, 0x9, 0xc],
  absdiff: [0x0, 0x3, 0x5, 0x8, 0xb, 0xc, 0xf, 0x12],
  'absdiff-u': [0x13, 0x16, 0x18, 0x1b, 0x1e, 0x1f, 0x22, 0x25].map((o) => o - 0x13),
  area: [0x0, 0x4, 0x9],
};

const ALL: Listing[] = [SUM, MAX_CMOV, MAX_BRANCH, ABSDIFF_SIGNED, ABSDIFF_UNSIGNED, AREA];

describe('the listings are the compiler\'s output', () => {
  for (const l of ALL) {
    it(`${l.id}: same instructions, same order, same offsets`, () => {
      const ours = l.asm.map((a) => (a.label !== undefined ? `${a.label}:` : a.asm!));
      const theirs = GCC[l.id].split('|').map((s) => s.replace('\t', ' '));
      // the unsigned listing is shown under its C name
      expect(ours.slice(1)).toEqual(theirs.slice(1));
      expect(l.asm.filter((a) => a.asm).map((a) => a.offset)).toEqual(OBJDUMP_OFFSETS[l.id]);
      const p = assembleListing(l);
      expect(p.instrs.reduce((s, i) => s + i.size, 0)).toBe(l.endOffset);
      for (const i of p.instrs) expect(i.size).toBeGreaterThan(0);
      for (const a of l.asm) if (a.asm) expect(a.cLine! >= 1 && a.cLine! <= l.c.length).toBe(true);
    });
  }
});

/**
 * Fixture: what the real compiled functions returned on this machine (the same objects,
 * linked into a small harness and run). The interpreter must agree on every one.
 */
const REAL: { prog: ProgId; v: Variant; values: bigint[]; rax: bigint }[] = [
  { prog: 'sum', v: { cmov: false, unsignedTypes: false }, values: [10n, 20n, 30n, 40n], rax: 100n },
  { prog: 'sum', v: { cmov: false, unsignedTypes: false }, values: [5n, -7n, 2n], rax: 0n },
  { prog: 'sum', v: { cmov: false, unsignedTypes: false }, values: [], rax: 0n },
  { prog: 'sum', v: { cmov: false, unsignedTypes: false }, values: [(1n << 63n) - 1n], rax: (1n << 63n) - 1n },
  ...[
    [3n, 7n, 7n], [7n, 3n, 7n], [-5n, 2n, 2n], [-(1n << 63n), (1n << 63n) - 1n, (1n << 63n) - 1n], [-1n, -1n, -1n], [(1n << 63n) - 1n, -(1n << 63n), (1n << 63n) - 1n],
  ].flatMap(([a, b, r]) => [true, false].map((cmov) => ({ prog: 'max' as const, v: { cmov, unsignedTypes: false }, values: [a, b], rax: r }))),
  ...[
    [3n, 10n, 7n, 7n], [10n, 3n, 7n, 7n], [-1n, 1n, 2n, 18446744073709551614n], [-100n, 250n, 350n, 18446744073709551266n], [0n, 0n, 0n, 0n],
  ].flatMap(([a, b, s, u]) => [
    { prog: 'absdiff' as const, v: { cmov: false, unsignedTypes: false }, values: [a, b], rax: s },
    { prog: 'absdiff' as const, v: { cmov: false, unsignedTypes: true }, values: [a, b], rax: u },
  ]),
  { prog: 'area', v: { cmov: false, unsignedTypes: false }, values: [7n, 6n, 4n], rax: 24n },
  { prog: 'area', v: { cmov: false, unsignedTypes: false }, values: [2n, 120n, 35n], rax: 4200n },
  { prog: 'area', v: { cmov: false, unsignedTypes: false }, values: [0n, -3n, 5n], rax: -15n },
];

describe('what the lesson says about the for line', () => {
  it('line 3 of sum maps to instructions before the loop and inside it, none after', () => {
    const idx = (label: string) => SUM.asm.findIndex((a) => a.label === label);
    const loopStart = idx('.L3');
    const loopEnd = SUM.asm.findIndex((a) => a.asm === 'jne .L3');
    const lines3 = SUM.asm.map((a, i) => ({ a, i })).filter(({ a }) => a.cLine === 3).map(({ i }) => i);
    expect(lines3.some((i) => i < loopStart)).toBe(true);
    expect(lines3.some((i) => i > loopStart && i <= loopEnd)).toBe(true);
    expect(lines3.some((i) => i > loopEnd)).toBe(false);
  });
});

describe('running the listings', () => {
  it('matches what the compiled code returned on real hardware', () => {
    for (const r of REAL) {
      const got = runProgram(r.prog, r.v, r.values).cpus.at(-1)!.regs.rax;
      expect(got, `${r.prog}(${r.values.join(', ')})`).toBe(unsigned(r.rax));
    }
  });
  it('matches the C semantics on seeded random inputs, negatives and unsigned included', () => {
    const rnd = mulberry32(64);
    const big = () => BigInt(randInt(-2_000_000_000, 2_000_000_000, rnd)) * BigInt(randInt(-2_000_000_000, 2_000_000_000, rnd));
    for (let t = 0; t < 300; t++) {
      const arr = Array.from({ length: randInt(0, 9, rnd) }, () => BigInt(randInt(-1e6, 1e6, rnd)));
      const pair = [big(), big()];
      const cases: [ProgId, Variant, bigint[]][] = [
        ['sum', { cmov: false, unsignedTypes: false }, arr],
        ['max', { cmov: false, unsignedTypes: false }, pair],
        ['max', { cmov: true, unsignedTypes: false }, pair],
        ['absdiff', { cmov: false, unsignedTypes: false }, pair],
        ['absdiff', { cmov: false, unsignedTypes: true }, pair],
        ['area', { cmov: false, unsignedTypes: false }, [1n, BigInt(randInt(-1e6, 1e6, rnd)), BigInt(randInt(-1e6, 1e6, rnd))]],
      ];
      for (const [prog, v, values] of cases) {
        const run = runProgram(prog, v, values);
        expect(run.cpus.at(-1)!.regs.rax, `${prog} ${JSON.stringify(v)} ${values.join(',')}`).toBe(cResult(prog, v, values));
      }
    }
  });
  it('every preset runs, returns, and leaves rsp where the caller had it', () => {
    for (const [prog, presets] of Object.entries(PRESETS) as [ProgId, typeof PRESETS.sum][]) {
      for (const p of presets) {
        for (const v of [{ cmov: false, unsignedTypes: false }, { cmov: true, unsignedTypes: true }]) {
          const run = runProgram(prog, v, p.values);
          const end = run.cpus.at(-1)!;
          expect(end.halted).toBe(true);
          expect(end.regs.rsp).toBe(BigInt(STACK_TOP));
          expect(end.regs.rax).toBe(cResult(prog, v, p.values));
        }
      }
    }
  });
  it('the signed/unsigned twist: absdiff(-1, 1) is 2 as long, 2⁶⁴ − 2 as unsigned long', () => {
    expect(signed(cResult('absdiff', { cmov: false, unsignedTypes: false }, [-1n, 1n]))).toBe(2n);
    expect(cResult('absdiff', { cmov: false, unsignedTypes: true }, [-1n, 1n])).toBe((1n << 64n) - 2n);
  });
});
