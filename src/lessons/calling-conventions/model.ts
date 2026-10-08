import { CALLS_FP, CALLS_NOFP, CLOBBER, CLOBBER_SAVED, DEEP, SEVEN, type Listing } from './listings';
import { functionAt, functionsOf, unwindRules, type FunctionInfo, type UnwindRule } from './unwind';
import { assemble, hex, readMem, startCpu, step, type Cpu, type Program, type Reg64, type StepEffect } from '../../core/x86';

/**
 * System V AMD64 ABI facts this lesson shows (System V Application Binary Interface,
 * AMD64 Architecture Processor Supplement, §3.2 "Function Calling Sequence"; Linux and
 * macOS use it, Windows x64 does not).
 */
export const ABI = {
  /** §3.2.3: the first six INTEGER-class arguments, in order. */
  argRegs: ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9'] as Reg64[],
  /** §3.2.3: INTEGER-class return values come back in rax. */
  returnReg: 'rax' as Reg64,
  /** §3.2.1, Figure 3.4: registers the callee must preserve. */
  calleeSaved: ['rbx', 'rbp', 'rsp', 'r12', 'r13', 'r14', 'r15'] as Reg64[],
  /** Everything else is caller-saved ("scratch"): a call may clobber it. */
  callerSaved: ['rax', 'rcx', 'rdx', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11'] as Reg64[],
  /** §3.2.2: (rsp + 8) is a multiple of 16 when control enters a function, i.e. rsp is 16-aligned at the call. */
  callAlignment: 16,
};

export const CODE_BASE = 0x401126;
/** rsp just before libc calls main: 16-byte aligned. */
export const STACK_TOP = 0x7ffd1c4e3a60;
/**
 * Deep recursion: a toy stack of this many bytes, then a guard page. A real Linux main
 * thread gets 8 MiB by default (`ulimit -s`), so the same program would go about 500,000
 * calls deep before it hit the guard page.
 */
export const TOY_STACK_BYTES = 0xa0;
export const REAL_STACK_BYTES = 8 * 1024 * 1024;
export const GUARD_BYTES = 0x20;

/** The rsp mod 16 readout's label: a plain fact about the value, true at every step. */
export const alignLabel = (rsp: number) => (rsp % 16 === 0 ? '16-byte aligned' : rsp % 16 === 8 ? '8 off (normal right after a call)' : `${rsp % 16} off`);

export type SceneId = 'calls' | 'seven' | 'saved' | 'deep';

export interface SceneOptions {
  framePointers: boolean;
  callerSavesRcx: boolean;
}

export function listingFor(scene: SceneId, o: SceneOptions): Listing {
  switch (scene) {
    case 'calls':
      return o.framePointers ? CALLS_FP : CALLS_NOFP;
    case 'seven':
      return SEVEN;
    case 'saved':
      return o.callerSavesRcx ? CLOBBER_SAVED : CLOBBER;
    case 'deep':
      return DEEP;
  }
}

/** What a stack slot holds, set when it was written. */
export type SlotRole = 'ret' | 'saved-rbp' | 'saved-reg' | 'arg' | 'pad';

export interface Slot {
  addr: number;
  role: SlotRole;
  /** Function whose frame the slot belongs to. */
  owner: string;
  /** What to print in the cell. */
  text: string;
  /** For saved-rbp: the address it points at. */
  points?: number;
}

export interface CallRecord {
  id: number;
  fn: string;
  /** Argument values at the call, by register. */
  args: bigint[];
  /** Address of the return-address slot. */
  retSlot: number;
  /** rsp just before the call instruction. */
  rspAtCall: number;
}

export interface Step {
  cpu: Cpu;
  effect: StepEffect | null;
  /** The real call stack, outermost first (main included). */
  calls: CallRecord[];
  slots: Slot[];
  /** Set on the step that ran into the guard page. */
  overflow: boolean;
}

export interface RunResult {
  scene: SceneId;
  listing: Listing;
  program: Program;
  fns: FunctionInfo[];
  rules: Map<number, UnwindRule>;
  steps: Step[];
  /** Lowest address the stack may use; below it is the guard page (deep scene only). */
  guard: { from: number; to: number } | null;
}

const ARG_COUNT: Record<string, number> = { mul: 2, area: 2, sum7: 7, helper: 0, depth: 1, main: 0 };
export const argCount = (fn: string) => ARG_COUNT[fn] ?? 0;
export const STEP_CAP = 600;

export function runScene(scene: SceneId, o: SceneOptions): RunResult {
  const listing = listingFor(scene, o);
  const program = assemble(listing.asm, CODE_BASE, listing.endOffset);
  const fns = functionsOf(program, CODE_BASE + listing.endOffset);
  const rules = unwindRules(program, fns);
  const guard = scene === 'deep' ? { from: STACK_TOP - TOY_STACK_BYTES - GUARD_BYTES, to: STACK_TOP - TOY_STACK_BYTES } : null;
  let cpu = startCpu({ rip: program.labels[listing.entry], rsp: STACK_TOP, called: true });
  let calls: CallRecord[] = [{ id: 0, fn: listing.entry, args: [], retSlot: STACK_TOP - 8, rspAtCall: STACK_TOP }];
  let slots: Slot[] = [{ addr: STACK_TOP - 8, role: 'ret', owner: listing.entry, text: 'ret → libc' }];
  const steps: Step[] = [{ cpu, effect: null, calls, slots, overflow: false }];
  let nextId = 1;

  while (!cpu.halted && steps.length < STEP_CAP) {
    const fnNow = functionAt(fns, cpu.rip)!.name;
    const r = step(program, cpu);
    const e = r.effect;
    const ins = e.instr;
    let overflow = false;
    calls = [...calls];
    for (const w of e.wroteMem) {
      if (guard && w.addr < guard.to) overflow = true;
      let slot: Slot;
      if (ins.op === 'call') {
        const callee = functionAt(fns, r.cpu.rip)!.name;
        const back = functionAt(fns, ins.addr + ins.size)!;
        slot = { addr: w.addr, role: 'ret', owner: callee, text: `ret → ${back.name}+${hex(ins.addr + ins.size - back.start)}` };
        calls.push({ id: nextId++, fn: callee, args: ABI.argRegs.slice(0, Math.min(6, argCount(callee))).map((reg) => cpu.regs[reg]), retSlot: w.addr, rspAtCall: Number(cpu.regs.rsp) });
      } else if (ins.text === 'push rbp') {
        const v = readMem(r.cpu.mem, w.addr, 64);
        slot = { addr: w.addr, role: 'saved-rbp', owner: fnNow, text: 'saved rbp', points: Number(v) };
      } else if (ins.op === 'push' && ins.operands[0].kind === 'imm') {
        slot = { addr: w.addr, role: 'arg', owner: fnNow, text: `arg 7 = ${ins.operands[0].value}` };
      } else {
        const what = ins.op === 'push' && ins.operands[0].kind === 'reg' ? ins.operands[0].ref.reg : 'value';
        slot = { addr: w.addr, role: 'saved-reg', owner: fnNow, text: `saved ${what}` };
      }
      slots = [...slots.filter((s) => s.addr !== w.addr), slot];
    }
    // Space made by `sub rsp, N` that nothing has written yet: alignment padding.
    if (ins.text.startsWith('sub rsp,')) {
      for (let a = Number(r.cpu.regs.rsp); a < Number(cpu.regs.rsp); a += 8) {
        if (!slots.some((s) => s.addr === a)) slots = [...slots, { addr: a, role: 'pad', owner: fnNow, text: '(padding)' }];
      }
    }
    if (ins.op === 'ret') calls = calls.slice(0, -1);
    cpu = r.cpu;
    if (overflow) cpu = { ...cpu, halted: true };
    steps.push({ cpu, effect: e, calls, slots, overflow });
    if (overflow) break;
  }
  return { scene, listing, program, fns, rules, steps, guard };
}

/** Slots still on the stack (at or above rsp), and the popped ones below it. */
export function liveSlots(s: Step): { live: Slot[]; popped: Slot[] } {
  const rsp = Number(s.cpu.regs.rsp);
  return { live: s.slots.filter((x) => x.addr >= rsp), popped: s.slots.filter((x) => x.addr < rsp) };
}

export const HONESTY =
  'System V AMD64 (Linux, macOS) only: Windows x64 passes the first four arguments in rcx, rdx, r8, r9 and reserves 32 bytes of shadow space. The frame sizes shown are what this listing uses; code and stack addresses are typical, not from a real run.';
