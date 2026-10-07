import { describe, expect, it } from 'vitest';
import { assemble, CONDITIONS, mask, parseOperand, readMem, RETURN_TO_CALLER, runToEnd, signed, startCpu, step, unsigned, type Cpu, type Program, type Width } from './x86';

const BASE = 0x1000;
/** Assembles one-instruction-per-line text, giving every instruction 4 bytes. */
function prog(...asm: string[]): Program {
  let off = 0;
  const lines = asm.map((a) => {
    if (a.endsWith(':')) return { label: a.slice(0, -1) };
    off += 4;
    return { asm: a, offset: off - 4 };
  });
  return assemble(lines, BASE, off);
}
const cpuWith = (regs: Partial<Cpu['regs']> = {}): Cpu => startCpu({ regs, rip: BASE, rsp: 0x8000 });
const run1 = (asm: string, regs: Partial<Cpu['regs']> = {}) => step(prog(asm), cpuWith(regs)).cpu;

const INT_MIN = -(1n << 63n);
const INT_MAX = (1n << 63n) - 1n;
const EDGES = [0n, 1n, -1n, 2n, -2n, INT_MIN, INT_MAX, INT_MIN + 1n, 0x80n, 0x7fn, 0xffn, 0x7fffffffn, 0x80000000n, 0xffffffffn];

/** The Intel SDM's own bit-level rules for SUB/CMP and ADD (Vol. 2, flags affected). */
function sdmFlags(kind: 'add' | 'sub', a: bigint, b: bigint, bits: Width) {
  const m = mask(bits);
  const top = 1n << BigInt(bits - 1);
  const ua = a & m;
  const ub = b & m;
  const res = (kind === 'add' ? ua + ub : ua - ub) & m;
  const sa = (ua & top) !== 0n;
  const sb = (ub & top) !== 0n;
  const sr = (res & top) !== 0n;
  return {
    ZF: res === 0n,
    SF: sr,
    CF: kind === 'add' ? ua + ub > m : ua < ub,
    OF: kind === 'add' ? sa === sb && sr !== sa : sa !== sb && sr !== sa,
  };
}

describe('flags after cmp, sub and add follow the SDM bit rules', () => {
  const regFor: Record<Width, [string, string]> = { 64: ['rax', 'rbx'], 32: ['eax', 'ebx'], 16: ['ax', 'bx'], 8: ['al', 'bl'] };
  for (const bits of [64, 32, 16, 8] as Width[]) {
    for (const op of ['cmp', 'sub', 'add'] as const) {
      it(`${op} at ${bits} bits over every pair of edge values`, () => {
        const [d, s] = regFor[bits];
        for (const a of EDGES) {
          for (const b of EDGES) {
            const c = run1(`${op} ${d}, ${s}`, { rax: unsigned(a), rbx: unsigned(b) });
            expect(c.flags, `${a} ${op} ${b}`).toEqual(sdmFlags(op === 'add' ? 'add' : 'sub', a, b, bits));
            if (op !== 'cmp') expect(c.regs.rax & mask(bits)).toBe((op === 'add' ? a + b : a - b) & mask(bits));
            else expect(c.regs.rax).toBe(unsigned(a));
          }
        }
      });
    }
  }
  it('hand-checked cases', () => {
    expect(run1('cmp rax, rbx', { rax: 0n, rbx: 1n }).flags).toEqual({ ZF: false, SF: true, CF: true, OF: false });
    expect(run1('cmp rax, rbx', { rax: unsigned(INT_MIN), rbx: 1n }).flags).toEqual({ ZF: false, SF: false, CF: false, OF: true });
    expect(run1('cmp rax, rbx', { rax: unsigned(-1n), rbx: unsigned(-1n) }).flags).toEqual({ ZF: true, SF: false, CF: false, OF: false });
    expect(run1('cmp rax, rbx', { rax: unsigned(-1n), rbx: 1n }).flags).toEqual({ ZF: false, SF: true, CF: false, OF: false });
    expect(run1('test rax, rax', { rax: 0n }).flags).toEqual({ ZF: true, SF: false, CF: false, OF: false });
    expect(run1('test rax, rax', { rax: unsigned(INT_MIN) }).flags).toEqual({ ZF: false, SF: true, CF: false, OF: false });
  });
});

describe('conditions read the flags the way signed and unsigned comparisons need', () => {
  const want: Record<string, (a: bigint, b: bigint) => boolean> = {
    e: (a, b) => a === b, ne: (a, b) => a !== b,
    l: (a, b) => signed(a) < signed(b), le: (a, b) => signed(a) <= signed(b), g: (a, b) => signed(a) > signed(b), ge: (a, b) => signed(a) >= signed(b),
    b: (a, b) => unsigned(a) < unsigned(b), be: (a, b) => unsigned(a) <= unsigned(b), a: (a, b) => unsigned(a) > unsigned(b), ae: (a, b) => unsigned(a) >= unsigned(b),
  };
  for (const [cc, fn] of Object.entries(want)) {
    it(`j${cc} after cmp a, b is taken exactly when ${cc} holds`, () => {
      for (const a of EDGES) {
        for (const b of EDGES) {
          const p = prog('cmp rax, rbx', `j${cc} out`, 'nop', 'out:', 'nop');
          let c = cpuWith({ rax: unsigned(a), rbx: unsigned(b) });
          c = step(p, c).cpu;
          const r = step(p, c);
          expect(r.effect.taken, `${a} ${cc} ${b}`).toBe(fn(unsigned(a), unsigned(b)));
          expect(r.effect.readFlags).toEqual(CONDITIONS[cc].flags);
          expect(r.cpu.rip).toBe(fn(unsigned(a), unsigned(b)) ? p.labels.out : BASE + 8);
        }
      }
    });
  }
  it('cmovl copies only when signed less; cmovb only when unsigned below', () => {
    const p = prog('cmp rdi, rsi', 'cmovl rax, rdx');
    let c = cpuWith({ rdi: unsigned(-1n), rsi: 1n, rax: 5n, rdx: 9n });
    c = runSteps(p, c, 2);
    expect(c.regs.rax).toBe(9n);
    const q = prog('cmp rdi, rsi', 'cmovb rax, rdx');
    c = runSteps(q, cpuWith({ rdi: unsigned(-1n), rsi: 1n, rax: 5n, rdx: 9n }), 2);
    expect(c.regs.rax).toBe(5n);
  });
});

function runSteps(p: Program, c: Cpu, n: number): Cpu {
  for (let i = 0; i < n; i++) c = step(p, c).cpu;
  return c;
}

describe('register widths', () => {
  const full = 0x1122334455667788n;
  it('writing a 32-bit register zero-extends into all 64 bits', () => {
    expect(run1('mov eax, -1', { rax: full }).regs.rax).toBe(0xffffffffn);
    expect(run1('mov edx, 0', { rdx: full }).regs.rdx).toBe(0n);
    expect(run1('add eax, ebx', { rax: full, rbx: 1n }).regs.rax).toBe(0x55667789n);
    expect(run1('mov r8d, 7', { r8: full }).regs.r8).toBe(7n);
  });
  it('writing an 8- or 16-bit register leaves the rest alone', () => {
    expect(run1('mov al, -1', { rax: full }).regs.rax).toBe(0x11223344556677ffn);
    expect(run1('mov ax, -1', { rax: full }).regs.rax).toBe(0x112233445566ffffn);
    expect(run1('mov sil, 0', { rsi: full }).regs.rsi).toBe(0x1122334455667700n);
  });
  it('a 32-bit cmov zero-extends even when it does not move', () => {
    const p = prog('cmp rax, rax', 'cmovne ecx, edx');
    expect(runSteps(p, cpuWith({ rcx: full, rdx: 3n }), 2).regs.rcx).toBe(0x55667788n);
  });
});

describe('memory, stack and calls', () => {
  it('reads and writes little-endian', () => {
    const c = run1('mov QWORD PTR [rdi+8], rax', { rdi: 0x2000n, rax: 0x0102030405060708n });
    expect(c.mem.get(0x2008)).toBe(0x08);
    expect(c.mem.get(0x200f)).toBe(0x01);
    expect(readMem(c.mem, 0x2008, 64)).toBe(0x0102030405060708n);
    expect(readMem(c.mem, 0x2008, 32)).toBe(0x05060708n);
  });
  it('lea computes an address and touches neither memory nor flags', () => {
    const c = run1('lea rcx, [rdi+rsi*8]', { rdi: 0x404020n, rsi: 4n });
    expect(c.regs.rcx).toBe(0x404040n);
    expect(c.mem.size).toBe(0);
  });
  it('push and pop move rsp by 8; call pushes the next address; ret pops it', () => {
    const p = prog('call f', 'nop', 'f:', 'push rbx', 'pop rcx', 'ret');
    let c = cpuWith({ rbx: 42n });
    c = step(p, c).cpu;
    expect(c.regs.rsp).toBe(0x8000n - 8n);
    expect(readMem(c.mem, 0x8000 - 8, 64)).toBe(BigInt(BASE + 4));
    c = step(p, c).cpu;
    expect(c.regs.rsp).toBe(0x8000n - 16n);
    c = step(p, c).cpu;
    expect(c.regs.rcx).toBe(42n);
    c = step(p, c).cpu;
    expect(c.rip).toBe(BASE + 4);
    expect(c.regs.rsp).toBe(0x8000n);
  });
  it('leave restores rsp from rbp and pops the saved rbp', () => {
    const p = prog('push rbp', 'mov rbp, rsp', 'sub rsp, 32', 'leave');
    const c = runSteps(p, cpuWith({ rbp: 0x9999n }), 4);
    expect(c.regs.rbp).toBe(0x9999n);
    expect(c.regs.rsp).toBe(0x8000n);
  });
  it('ret to the caller sentinel halts', () => {
    const p = prog('mov eax, 1', 'ret');
    const r = runToEnd(p, startCpu({ rip: BASE, rsp: 0x8000, called: true }));
    expect(r.cpus.at(-1)!.halted).toBe(true);
    expect(r.cpus.at(-1)!.rip).toBe(RETURN_TO_CALLER);
  });
  it('imul sets CF and OF exactly when the signed product does not fit', () => {
    expect(run1('imul rax, rbx', { rax: 6n, rbx: 7n }).regs.rax).toBe(42n);
    expect(run1('imul rax, rbx', { rax: 6n, rbx: 7n }).flags.OF).toBe(false);
    const big = run1('imul rax, rbx', { rax: 1n << 62n, rbx: 2n });
    expect(big.flags.CF && big.flags.OF).toBe(true);
    expect(run1('imul rax, rbx', { rax: unsigned(-3n), rbx: 5n }).regs.rax).toBe(unsigned(-15n));
  });
});

describe('parser', () => {
  it('reads Intel operands', () => {
    expect(parseOperand('QWORD PTR [rdi+16]')).toEqual({ kind: 'mem', base: 'rdi', index: null, scale: 1n, disp: 16n, size: 64 });
    expect(parseOperand('[rdi+rsi*8]')).toEqual({ kind: 'mem', base: 'rdi', index: 'rsi', scale: 8n, disp: 0n, size: null });
    expect(parseOperand('QWORD PTR [rbp-8]')).toMatchObject({ base: 'rbp', disp: -8n });
    expect(parseOperand('.L3')).toEqual({ kind: 'label', name: '.L3' });
    expect(parseOperand('-1')).toEqual({ kind: 'imm', value: -1n });
  });
  it('refuses instructions it does not model', () => {
    expect(() => step(prog('div rbx'), cpuWith())).toThrow(/not modelled/);
  });
});
