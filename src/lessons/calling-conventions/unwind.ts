import { readMem, RETURN_TO_CALLER, type Cpu, type Program } from './x86';

/**
 * Where a function's return address is, at each of its instructions: what the .eh_frame
 * unwind tables (the .cfi directives gcc emits) record. Worked out here by reading the
 * listing the way the assembler's CFI does: start at "return address at [rsp]", then
 * follow every push, pop, rsp adjustment, `mov rbp, rsp` and `leave`.
 */
export interface UnwindRule {
  /** The return address is at [base + offset]. */
  base: 'rsp' | 'rbp';
  offset: number;
  /** The caller's rbp is saved just below the return address (after `push rbp`). */
  rbpSaved: boolean;
}

export interface FunctionInfo {
  name: string;
  start: number;
  end: number;
}

/** Functions are the labels that don't start with a dot, in address order. */
export function functionsOf(program: Program, endAddr: number): FunctionInfo[] {
  const starts = Object.entries(program.labels)
    .filter(([n]) => !n.startsWith('.'))
    .sort((a, b) => a[1] - b[1]);
  return starts.map(([name, start], i) => ({ name, start, end: starts[i + 1]?.[1] ?? endAddr }));
}

export const functionAt = (fns: readonly FunctionInfo[], addr: number) => fns.find((f) => addr >= f.start && addr < f.end) ?? null;

const imm = (text: string) => Number(/, (-?\d+)$/.exec(text)?.[1] ?? NaN);

export function unwindRules(program: Program, fns: readonly FunctionInfo[]): Map<number, UnwindRule> {
  const rules = new Map<number, UnwindRule>();
  const labelAt = new Map(Object.entries(program.labels).map(([n, a]) => [a, n]));
  for (const fn of fns) {
    let state: UnwindRule | null = { base: 'rsp', offset: 0, rbpSaved: false };
    const atLabel = new Map<string, UnwindRule>();
    for (const ins of program.instrs.filter((i) => i.addr >= fn.start && i.addr < fn.end)) {
      const label = labelAt.get(ins.addr);
      if (!state && label) state = atLabel.get(label) ?? null;
      if (!state) throw new Error(`unreachable code at 0x${ins.addr.toString(16)}`);
      rules.set(ins.addr, state);
      const s: UnwindRule = { ...state };
      const t = ins.text;
      if (ins.op === 'push') {
        if (s.base === 'rsp') s.offset += 8;
        if (t === 'push rbp') s.rbpSaved = true;
      } else if (ins.op === 'pop') {
        if (t === 'pop rbp') {
          s.base = 'rsp';
          s.offset = 0;
          s.rbpSaved = false;
        } else if (s.base === 'rsp') s.offset -= 8;
      } else if (t.startsWith('sub rsp,')) {
        if (s.base === 'rsp') s.offset += imm(t);
      } else if (t.startsWith('add rsp,')) {
        if (s.base === 'rsp') s.offset -= imm(t);
      } else if (t === 'mov rbp, rsp') {
        s.base = 'rbp';
      } else if (ins.op === 'leave') {
        s.base = 'rsp';
        s.offset = 0;
        s.rbpSaved = false;
      }
      if (ins.op.startsWith('j')) {
        const target = ins.operands[0];
        if (target.kind === 'label') atLabel.set(target.name, ins.op === 'jmp' ? s : { ...s });
      }
      state = ins.op === 'ret' || ins.op === 'jmp' ? null : s;
    }
  }
  return rules;
}

export interface Unwound {
  /** Function names, newest first. */
  frames: string[];
  /** For each frame after the newest: where its return address was read. */
  retSlots: number[];
}

/** Unwinds with the per-instruction rules, the way a debugger uses .eh_frame. */
export function unwind(cpu: Cpu, rules: Map<number, UnwindRule>, fns: readonly FunctionInfo[]): Unwound {
  const frames: string[] = [];
  const retSlots: number[] = [];
  let rip = cpu.rip;
  let rsp = Number(cpu.regs.rsp);
  let rbp = Number(cpu.regs.rbp);
  for (let guard = 0; guard < 10_000; guard++) {
    const fn = functionAt(fns, rip);
    const rule = rules.get(rip);
    if (!fn || !rule) break;
    frames.push(fn.name);
    const slot = (rule.base === 'rsp' ? rsp : rbp) + rule.offset;
    const ret = Number(readMem(cpu.mem, slot, 64));
    if (ret === RETURN_TO_CALLER) break;
    retSlots.push(slot);
    if (rule.rbpSaved) rbp = Number(readMem(cpu.mem, slot - 8, 64));
    rsp = slot + 8;
    rip = ret;
  }
  return { frames, retSlots };
}

/**
 * The naive frame-pointer walk a profiler without unwind tables does: the newest frame
 * from rip, then follow rbp → [rbp] and read each return address at [rbp + 8].
 */
export function walkFramePointers(cpu: Cpu, fns: readonly FunctionInfo[]): { frames: string[]; savedRbpSlots: number[] } {
  const first = functionAt(fns, cpu.rip);
  const frames = first ? [first.name] : [];
  const savedRbpSlots: number[] = [];
  let rbp = Number(cpu.regs.rbp);
  for (let guard = 0; guard < 10_000 && rbp !== 0; guard++) {
    const ret = Number(readMem(cpu.mem, rbp + 8, 64));
    if (ret === RETURN_TO_CALLER) break;
    const fn = functionAt(fns, ret);
    if (!fn) break;
    frames.push(fn.name);
    savedRbpSlots.push(rbp);
    rbp = Number(readMem(cpu.mem, rbp, 64));
  }
  return { frames, savedRbpSlots };
}
