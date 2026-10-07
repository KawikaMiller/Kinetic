import { describe, expect, it } from 'vitest';
import { CALLS_FP, CALLS_NOFP, CLOBBER, CLOBBER_SAVED, DEEP, SEVEN, type Listing } from './listings';
import { ABI, GUARD_BYTES, runScene, STACK_TOP, TOY_STACK_BYTES, type RunResult, type SceneId, type SceneOptions } from './model';
import { unwind, walkFramePointers } from './unwind';
import { assemble, signed } from './x86';

const SCENES: [SceneId, SceneOptions][] = [
  ['calls', { framePointers: true, callerSavesRcx: false }],
  ['calls', { framePointers: false, callerSavesRcx: false }],
  ['seven', { framePointers: true, callerSavesRcx: false }],
  ['saved', { framePointers: true, callerSavesRcx: false }],
  ['saved', { framePointers: true, callerSavesRcx: true }],
  ['deep', { framePointers: true, callerSavesRcx: false }],
];
const runs: [string, RunResult][] = SCENES.map(([s, o]) => [`${s} ${JSON.stringify(o)}`, runScene(s, o)]);

describe('the interpreter is the same file as isa-assembly\'s', () => {
  it('byte for byte', () => {
    const files = import.meta.glob<string>(['./x86.ts', '../isa-assembly/x86.ts'], { query: '?raw', import: 'default', eager: true });
    const [here, there] = [files['./x86.ts'], files['../isa-assembly/x86.ts']];
    expect(here.length).toBeGreaterThan(1000);
    expect(here).toBe(there);
  });
});

/** gcc 13.3 -O1 -masm=intel -S output (directives removed), and objdump offsets of the same build. */
const GCC: Record<string, { asm: string; offsets: number[] }> = {
  'calls-fp': {
    asm: 'mul:|mov rax, rdi|imul rax, rsi|ret|area:|push rbp|mov rbp, rsp|push rbx|sub rsp, 8|lea rbx, [rdi+rsi]|call mul|add rax, rbx|mov rbx, QWORD PTR [rbp-8]|leave|ret|main:|push rbp|mov rbp, rsp|mov esi, 4|mov edi, 6|call area|pop rbp|ret',
    offsets: [0x0, 0x3, 0x7, 0x8, 0x9, 0xc, 0xd, 0x11, 0x15, 0x1a, 0x1d, 0x21, 0x22, 0x23, 0x24, 0x27, 0x2c, 0x31, 0x36, 0x37],
  },
  'calls-nofp': {
    asm: 'mul:|mov rax, rdi|imul rax, rsi|ret|area:|push rbx|lea rbx, [rdi+rsi]|call mul|add rax, rbx|pop rbx|ret|main:|mov esi, 4|mov edi, 6|call area|ret',
    offsets: [0x0, 0x3, 0x7, 0x8, 0x9, 0xd, 0x12, 0x15, 0x16, 0x17, 0x1c, 0x21, 0x26],
  },
  seven: {
    asm: 'sum7:|push rbp|mov rbp, rsp|add rdi, rsi|add rdi, rdx|add rdi, rcx|add rdi, r8|lea rax, [rdi+r9]|add rax, QWORD PTR [rbp+16]|pop rbp|ret|main:|push rbp|mov rbp, rsp|sub rsp, 8|push 7|mov r9d, 6|mov r8d, 5|mov ecx, 4|mov edx, 3|mov esi, 2|mov edi, 1|call sum7|add rsp, 16|leave|ret',
    offsets: [0x0, 0x1, 0x4, 0x7, 0xa, 0xd, 0x10, 0x14, 0x18, 0x19, 0x1a, 0x1b, 0x1e, 0x22, 0x24, 0x2a, 0x30, 0x35, 0x3a, 0x3f, 0x44, 0x49, 0x4d, 0x4e],
  },
  deep: {
    asm: 'depth:|mov rax, rdi|test rdi, rdi|jne .L7|ret|.L7:|push rbp|mov rbp, rsp|lea rdi, [rdi-1]|call depth|add rax, 1|pop rbp|ret|main:|push rbp|mov rbp, rsp|mov edi, 1000000000|call depth|pop rbp|ret',
    offsets: [0x0, 0x3, 0x6, 0x8, 0x9, 0xa, 0xd, 0x11, 0x16, 0x1a, 0x1b, 0x1c, 0x1d, 0x20, 0x25, 0x2a, 0x2b],
  },
  // hand-written, assembled with GNU as 2.42: objdump offsets
  clobber: { asm: '', offsets: [0x0, 0x1, 0x4, 0x5, 0x9, 0xe, 0x13, 0x18, 0x1c, 0x1d, 0x1e, 0x1f, 0x22, 0x23, 0x28, 0x2d, 0x2f, 0x31, 0x35, 0x36] },
  'clobber-saved': { asm: '', offsets: [0x0, 0x1, 0x4, 0x5, 0xa, 0xf, 0x10, 0x15, 0x16, 0x1a, 0x1b, 0x1c, 0x1d, 0x20, 0x21, 0x26, 0x2b, 0x2d, 0x2f, 0x33, 0x34] },
};

describe('the listings are what the tools printed', () => {
  for (const l of [CALLS_FP, CALLS_NOFP, SEVEN, DEEP, CLOBBER, CLOBBER_SAVED] as Listing[]) {
    it(l.id, () => {
      const want = GCC[l.id];
      if (want.asm) expect(l.asm.map((a) => (a.label !== undefined ? `${a.label}:` : a.asm)).join('|')).toBe(want.asm);
      expect(l.asm.filter((a) => a.asm).map((a) => a.offset)).toEqual(want.offsets);
      const p = assemble(l.asm, 0, l.endOffset);
      expect(p.instrs.reduce((s, i) => s + i.size, 0)).toBe(l.endOffset);
    });
  }
});

/** gcc 13.3 -O1 main, when area is in another file (or with -fno-ipa-stack-alignment): it pads. */
const MAIN_UNSEEN_CALLEE = 'sub rsp, 8|mov esi, 4|mov edi, 6|call area|add rsp, 8|ret';

describe('System V AMD64 ABI facts (psABI §3.2), pinned', () => {
  it('gcc pads to 16 before a call it cannot see into', () => {
    const p = assemble(MAIN_UNSEEN_CALLEE.split('|').map((asm, i) => ({ asm, offset: i * 5 })), 0, 30);
    // entry rsp ≡ 8; after sub rsp, 8 it is ≡ 0 at the call
    expect(p.instrs[0].text).toBe('sub rsp, 8');
    expect(p.instrs.at(-2)!.text).toBe('add rsp, 8');
  });
  it('argument, return and preserved registers', () => {
    expect(ABI.argRegs).toEqual(['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9']);
    expect(ABI.returnReg).toBe('rax');
    expect(ABI.calleeSaved).toEqual(['rbx', 'rbp', 'rsp', 'r12', 'r13', 'r14', 'r15']);
    expect(new Set([...ABI.calleeSaved, ...ABI.callerSaved]).size).toBe(16);
    expect(ABI.callAlignment).toBe(16);
  });
});

describe('every scene obeys the convention at every step', () => {
  for (const [name, run] of runs) {
    it(`${name}: rsp, alignment and preserved registers`, () => {
      run.steps.forEach((s, i) => {
        const e = s.effect;
        if (!e) return;
        const before = run.steps[i - 1];
        if (e.instr.op === 'call') {
          // the one documented exception: in the no-frame-pointer build gcc can see that area and
          // mul never need an aligned stack, so it pads nowhere (see NO_PAD_NOTE)
          const exempt = run.listing === CALLS_NOFP;
          expect(Number(before.cpu.regs.rsp) % ABI.callAlignment, `rsp before ${e.instr.text}`).toBe(exempt ? 8 : 0);
          if (!exempt) expect(Number(s.cpu.regs.rsp) % 16, 'callee sees rsp ≡ 8 (mod 16)').toBe(8);
        }
        if (e.instr.op === 'ret' && !s.cpu.halted) {
          const call = before.calls.at(-1)!;
          expect(Number(before.cpu.regs.rsp)).toBe(call.rspAtCall - 8);
          expect(Number(s.cpu.regs.rsp)).toBe(call.rspAtCall);
          // find the cpu just before that call
          const at = run.steps.findIndex((x) => x.calls.some((c) => c.id === call.id)) - 1;
          for (const r of ['rbx', 'rbp', 'r12', 'r13', 'r14', 'r15'] as const) {
            expect(s.cpu.regs[r], `${r} preserved across ${call.fn}`).toBe(run.steps[at].cpu.regs[r]);
          }
        }
      });
    });
    it(`${name}: unwinding with the per-instruction rules gives the real call stack at every step`, () => {
      for (const s of run.steps) {
        if (s.overflow || s.cpu.halted) continue;
        const truth = s.calls.map((c) => c.fn).reverse();
        expect(unwind(s.cpu, run.rules, run.fns).frames, `at 0x${s.cpu.rip.toString(16)}`).toEqual(truth);
      }
    });
  }
  it('with frame pointers, following rbp gives the real stack wherever the current function has set up its frame', () => {
    for (const [, run] of runs.filter(([n]) => !n.includes('"framePointers":false'))) {
      for (const s of run.steps) {
        if (s.cpu.halted || s.overflow) continue;
        if (run.rules.get(s.cpu.rip)?.base !== 'rbp') continue;
        expect(walkFramePointers(s.cpu, run.fns).frames).toEqual(s.calls.map((c) => c.fn).reverse());
      }
    }
  });
  it('inside the leaf mul, which sets up no frame, following rbp skips area', () => {
    const run = runScene('calls', { framePointers: true, callerSavesRcx: false });
    const inMul = run.steps.filter((s) => s.calls.at(-1)?.fn === 'mul' && !s.cpu.halted);
    expect(inMul.length).toBeGreaterThan(0);
    for (const s of inMul) {
      expect(walkFramePointers(s.cpu, run.fns).frames).toEqual(['mul', 'main']);
      expect(unwind(s.cpu, run.rules, run.fns).frames).toEqual(['mul', 'area', 'main']);
    }
  });
});

describe('scene results', () => {
  const end = (s: SceneId, o: Partial<SceneOptions> = {}) => runScene(s, { framePointers: true, callerSavesRcx: false, ...o }).steps.at(-1)!;
  it('area(6, 4) = 6 × 4 + (6 + 4) = 34, with and without frame pointers', () => {
    expect(end('calls').cpu.regs.rax).toBe(34n);
    expect(end('calls', { framePointers: false }).cpu.regs.rax).toBe(34n);
  });
  it('seven arguments: exactly one 8-byte argument goes on the stack, and sum7 = 28', () => {
    const run = runScene('seven', { framePointers: true, callerSavesRcx: false });
    const args = run.steps.at(-1)!.slots.filter((s) => s.role === 'arg');
    expect(args).toHaveLength(1);
    const call = run.steps.find((s) => s.effect?.instr.op === 'call')!;
    const callee = call.calls.at(-1)!;
    expect(callee.args).toEqual([1n, 2n, 3n, 4n, 5n, 6n]);
    expect(args[0].addr).toBe(callee.retSlot + 8);
    expect(run.steps.at(-1)!.cpu.regs.rax).toBe(28n);
  });
  it('caller- vs callee-saved: rcx comes back clobbered unless main saved it; rbx always survives', () => {
    const afterCall = (callerSavesRcx: boolean) => {
      const run = runScene('saved', { framePointers: true, callerSavesRcx });
      const i = run.steps.findIndex((s) => s.effect?.instr.text === 'ret' && s.calls.length === 1);
      // the instruction after helper returns, and after main's pop rcx if it has one
      const after = callerSavesRcx ? run.steps[i + 1] : run.steps[i];
      return after.cpu.regs;
    };
    expect(afterCall(false).rcx).toBe(2n);
    expect(afterCall(false).rbx).toBe(200n);
    expect(afterCall(true).rcx).toBe(100n);
    expect(afterCall(true).rbx).toBe(200n);
  });
  it('deep recursion runs into the guard page and stops there', () => {
    const run = runScene('deep', { framePointers: true, callerSavesRcx: false });
    const last = run.steps.at(-1)!;
    expect(last.overflow).toBe(true);
    const w = last.effect!.wroteMem[0];
    expect(w.addr).toBeLessThan(run.guard!.to);
    expect(w.addr).toBeGreaterThanOrEqual(run.guard!.from);
    expect(run.guard!.to - run.guard!.from).toBe(GUARD_BYTES);
    expect(STACK_TOP - run.guard!.to).toBe(TOY_STACK_BYTES);
    // every depth frame is 16 bytes: the return address and the saved rbp
    const depths = last.calls.filter((c) => c.fn === 'depth');
    for (let k = 1; k < depths.length; k++) expect(depths[k - 1].retSlot - depths[k].retSlot).toBe(16);
    expect(signed(depths[0].args[0])).toBe(1_000_000_000n);
  });
});
