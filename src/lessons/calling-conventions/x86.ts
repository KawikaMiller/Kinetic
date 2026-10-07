/**
 * A tiny x86-64 interpreter for lesson-authored Intel-syntax listings (as `gcc -masm=intel`
 * prints them). It runs only the instructions the lessons use, over a register file,
 * the four flags the lessons show (ZF SF CF OF), and a byte-addressed little-endian memory.
 * It is not an emulator: no real machine code is decoded or run.
 *
 * Kept byte-identical in isa-assembly/x86.ts and calling-conventions/x86.ts (lessons can't
 * import each other); a test fails if the two copies drift. Phase 2: promote to core/x86.ts.
 *
 * Semantics follow the Intel SDM, Vol. 2:
 * - writing a 32-bit register zero-extends into the full 64 bits; writing an 8- or 16-bit
 *   register leaves the other bits alone;
 * - add/sub/cmp set CF on unsigned carry/borrow and OF on signed overflow; test/and/or/xor
 *   clear CF and OF; imul sets CF = OF = "the signed product didn't fit" (SF and ZF are
 *   undefined after imul: here they keep their old values);
 * - lea, mov, cmov, push, pop, call, ret, leave and jumps leave the flags alone.
 */

export const REGS64 = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'] as const;
export type Reg64 = (typeof REGS64)[number];
export type Width = 8 | 16 | 32 | 64;
export interface RegRef {
  reg: Reg64;
  bits: Width;
}

const LEGACY: Record<string, [string, string, string]> = {
  rax: ['eax', 'ax', 'al'], rbx: ['ebx', 'bx', 'bl'], rcx: ['ecx', 'cx', 'cl'], rdx: ['edx', 'dx', 'dl'],
  rsi: ['esi', 'si', 'sil'], rdi: ['edi', 'di', 'dil'], rbp: ['ebp', 'bp', 'bpl'], rsp: ['esp', 'sp', 'spl'],
};
/** Every register name the parser knows, by its 64-bit register and width. */
export const REG_NAMES: Record<string, RegRef> = (() => {
  const m: Record<string, RegRef> = {};
  for (const r of REGS64) {
    m[r] = { reg: r, bits: 64 };
    const [d, w, b] = LEGACY[r] ?? [`${r}d`, `${r}w`, `${r}b`];
    m[d] = { reg: r, bits: 32 };
    m[w] = { reg: r, bits: 16 };
    m[b] = { reg: r, bits: 8 };
  }
  return m;
})();

/** The name a register is written as, e.g. { rdx, 32 } → "edx". */
export const regName = (ref: RegRef) => Object.keys(REG_NAMES).find((n) => REG_NAMES[n].reg === ref.reg && REG_NAMES[n].bits === ref.bits)!;

/** An operand as Intel syntax writes it (without the size prefix). */
export function operandText(o: Operand): string {
  if (o.kind === 'reg') return regName(o.ref);
  if (o.kind === 'imm') return o.value.toString();
  if (o.kind === 'label') return o.name;
  const parts = [o.base, o.index ? `${o.index}*${o.scale}` : null].filter(Boolean).join('+');
  return `[${parts}${o.disp ? (o.disp > 0n ? `+${o.disp}` : `${o.disp}`) : ''}]`;
}

export type Flag = 'ZF' | 'SF' | 'CF' | 'OF';
export type Flags = Record<Flag, boolean>;

export type Operand =
  | { kind: 'reg'; ref: RegRef }
  | { kind: 'imm'; value: bigint }
  | { kind: 'mem'; base: Reg64 | null; index: Reg64 | null; scale: bigint; disp: bigint; size: Width | null }
  | { kind: 'label'; name: string };

export interface Instr {
  op: string;
  operands: Operand[];
  /** As written, e.g. "add rdx, QWORD PTR [rax]". */
  text: string;
  /** Code address of the instruction. */
  addr: number;
  /** Encoded length in bytes (from the listing's objdump). */
  size: number;
}

export interface ListingLine {
  /** Label defined on this line (e.g. "sum" or ".L3"), or an instruction. */
  label?: string;
  asm?: string;
  /** Byte offset of the instruction from the function start, as objdump printed it. */
  offset?: number;
}

export interface Program {
  instrs: Instr[];
  /** Label → code address. */
  labels: Record<string, number>;
  /** Listing line index → instruction index (labels map to null). */
  lineOf: (number | null)[];
}

export const MASK64 = (1n << 64n) - 1n;
export const mask = (bits: Width) => (1n << BigInt(bits)) - 1n;
/** Two's-complement reading of the low `bits` bits. */
export const signed = (v: bigint, bits: Width = 64) => {
  const x = v & mask(bits);
  return x >> BigInt(bits - 1) ? x - (1n << BigInt(bits)) : x;
};
export const unsigned = (v: bigint, bits: Width = 64) => v & mask(bits);

const SIZES: Record<string, Width> = { BYTE: 8, WORD: 16, DWORD: 32, QWORD: 64 };

function parseImm(s: string): bigint | null {
  const m = /^(-)?(0x[0-9a-f]+|\d+)$/i.exec(s.trim());
  if (!m) return null;
  const v = BigInt(m[2]);
  return m[1] ? -v : v;
}

export function parseOperand(raw: string): Operand {
  const s = raw.trim();
  const reg = REG_NAMES[s];
  if (reg) return { kind: 'reg', ref: reg };
  const imm = parseImm(s);
  if (imm !== null) return { kind: 'imm', value: imm };
  const mm = /^(?:(BYTE|WORD|DWORD|QWORD) PTR )?\[([^\]]+)\]$/.exec(s);
  if (mm) {
    let base: Reg64 | null = null;
    let index: Reg64 | null = null;
    let scale = 1n;
    let disp = 0n;
    const terms = mm[2].replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
    for (const t of terms) {
      const scaled = /^([a-z0-9]+)\*([1248])$/.exec(t);
      if (scaled && REG_NAMES[scaled[1]]?.bits === 64) {
        index = REG_NAMES[scaled[1]].reg;
        scale = BigInt(scaled[2]);
      } else if (REG_NAMES[t]?.bits === 64) {
        if (base === null) base = REG_NAMES[t].reg;
        else index = REG_NAMES[t].reg;
      } else {
        const v = parseImm(t);
        if (v === null) throw new Error(`bad address term "${t}" in "${s}"`);
        disp += v;
      }
    }
    return { kind: 'mem', base, index, scale, disp, size: mm[1] ? SIZES[mm[1]] : null };
  }
  if (/^[.a-z_][\w.]*$/i.test(s)) return { kind: 'label', name: s };
  throw new Error(`bad operand "${s}"`);
}

/** Splits "add rdx, QWORD PTR [rax]" into op and operands (commas inside [] stay put). */
export function parseInstr(asm: string, addr: number, size: number): Instr {
  const text = asm.trim().replace(/\s+/, ' ');
  const sp = text.indexOf(' ');
  const op = sp < 0 ? text : text.slice(0, sp);
  const rest = sp < 0 ? '' : text.slice(sp + 1);
  const operands = rest ? rest.split(/,(?![^[]*\])/).map(parseOperand) : [];
  return { op, operands, text: sp < 0 ? op : `${op} ${rest.split(/,(?![^[]*\])/).map((o) => o.trim()).join(', ')}`, addr, size };
}

/** Builds a program from listing lines whose instructions carry objdump offsets. */
export function assemble(lines: readonly ListingLine[], base: number, endOffset: number): Program {
  const instrs: Instr[] = [];
  const labels: Record<string, number> = {};
  const lineOf: (number | null)[] = [];
  const withOffsets = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.asm !== undefined);
  let pendingLabels: string[] = [];
  lines.forEach((l, i) => {
    if (l.label !== undefined) {
      pendingLabels.push(l.label);
      lineOf.push(null);
      return;
    }
    const k = withOffsets.findIndex((w) => w.i === i);
    const next = withOffsets[k + 1]?.l.offset ?? endOffset;
    const ins = parseInstr(l.asm!, base + l.offset!, next - l.offset!);
    for (const name of pendingLabels) labels[name] = ins.addr;
    pendingLabels = [];
    lineOf.push(instrs.length);
    instrs.push(ins);
  });
  if (pendingLabels.length) throw new Error(`label with no instruction: ${pendingLabels.join(', ')}`);
  return { instrs, labels, lineOf };
}

export interface Cpu {
  regs: Record<Reg64, bigint>;
  rip: number;
  flags: Flags;
  /** Byte address → byte value. */
  mem: Map<number, number>;
  halted: boolean;
}

export interface StepEffect {
  instr: Instr;
  /** 64-bit registers whose value changed (rip not included). */
  wroteRegs: Reg64[];
  /** Memory written: start address and byte count. */
  wroteMem: { addr: number; bytes: number }[];
  /** Memory read, the same way (a memory operand, or the stack slot pop and ret read). */
  readMem: { addr: number; bytes: number }[];
  /** Flags this instruction read (a jump or cmov condition). */
  readFlags: Flag[];
  /** For conditional jumps and moves: whether the condition held. */
  taken: boolean | null;
  /** Flags this instruction wrote. */
  wroteFlags: Flag[];
}

export const NO_FLAGS: Flags = { ZF: false, SF: false, CF: false, OF: false };

export function readMem(mem: Map<number, number>, addr: number, bits: Width): bigint {
  let v = 0n;
  for (let i = bits / 8 - 1; i >= 0; i--) v = (v << 8n) | BigInt(mem.get(addr + i) ?? 0);
  return v;
}

export function writeMem(mem: Map<number, number>, addr: number, bits: Width, value: bigint) {
  let v = unsigned(value, bits);
  for (let i = 0; i < bits / 8; i++) {
    mem.set(addr + i, Number(v & 0xffn));
    v >>= 8n;
  }
}

/** Reads a register by name-width: the low `bits` bits of its 64-bit register. */
export const readReg = (cpu: Cpu, ref: RegRef) => cpu.regs[ref.reg] & mask(ref.bits);

/** Writes a register: a 32-bit write zero-extends to 64 bits; 8- and 16-bit writes merge. */
export function writeReg(regs: Record<Reg64, bigint>, ref: RegRef, value: bigint) {
  const v = unsigned(value, ref.bits);
  if (ref.bits === 64 || ref.bits === 32) regs[ref.reg] = v;
  else regs[ref.reg] = (regs[ref.reg] & ~mask(ref.bits) & MASK64) | v;
}

export const CONDITIONS: Record<string, { flags: Flag[]; test: (f: Flags) => boolean }> = {
  e: { flags: ['ZF'], test: (f) => f.ZF },
  z: { flags: ['ZF'], test: (f) => f.ZF },
  ne: { flags: ['ZF'], test: (f) => !f.ZF },
  nz: { flags: ['ZF'], test: (f) => !f.ZF },
  l: { flags: ['SF', 'OF'], test: (f) => f.SF !== f.OF },
  nge: { flags: ['SF', 'OF'], test: (f) => f.SF !== f.OF },
  ge: { flags: ['SF', 'OF'], test: (f) => f.SF === f.OF },
  nl: { flags: ['SF', 'OF'], test: (f) => f.SF === f.OF },
  le: { flags: ['ZF', 'SF', 'OF'], test: (f) => f.ZF || f.SF !== f.OF },
  g: { flags: ['ZF', 'SF', 'OF'], test: (f) => !f.ZF && f.SF === f.OF },
  b: { flags: ['CF'], test: (f) => f.CF },
  c: { flags: ['CF'], test: (f) => f.CF },
  nae: { flags: ['CF'], test: (f) => f.CF },
  ae: { flags: ['CF'], test: (f) => !f.CF },
  nb: { flags: ['CF'], test: (f) => !f.CF },
  nc: { flags: ['CF'], test: (f) => !f.CF },
  be: { flags: ['CF', 'ZF'], test: (f) => f.CF || f.ZF },
  a: { flags: ['CF', 'ZF'], test: (f) => !f.CF && !f.ZF },
  s: { flags: ['SF'], test: (f) => f.SF },
  ns: { flags: ['SF'], test: (f) => !f.SF },
};

/** The flags after `a op b` at `bits` width, from the exact (unbounded) results. */
export function arithFlags(kind: 'add' | 'sub', a: bigint, b: bigint, bits: Width): { result: bigint; flags: Flags } {
  const ua = unsigned(a, bits);
  const ub = unsigned(b, bits);
  const sa = signed(a, bits);
  const sb = signed(b, bits);
  const exactU = kind === 'add' ? ua + ub : ua - ub;
  const exactS = kind === 'add' ? sa + sb : sa - sb;
  const result = unsigned(exactU, bits);
  const lo = -(1n << BigInt(bits - 1));
  const hi = (1n << BigInt(bits - 1)) - 1n;
  return {
    result,
    flags: {
      ZF: result === 0n,
      SF: signed(result, bits) < 0n,
      CF: exactU < 0n || exactU > mask(bits),
      OF: exactS < lo || exactS > hi,
    },
  };
}

const logicFlags = (result: bigint, bits: Width): Flags => ({ ZF: unsigned(result, bits) === 0n, SF: signed(result, bits) < 0n, CF: false, OF: false });

/** A sentinel return address: `ret` to it ends the run (the caller isn't part of the listing). */
export const RETURN_TO_CALLER = 0x401196;

export interface CpuInit {
  regs?: Partial<Record<Reg64, bigint>>;
  rip: number;
  rsp: number;
  mem?: Map<number, number>;
  /** Push a return address to RETURN_TO_CALLER first, as if a caller had just done `call`. */
  called?: boolean;
}

export function startCpu(init: CpuInit): Cpu {
  const regs = Object.fromEntries(REGS64.map((r) => [r, 0n])) as Record<Reg64, bigint>;
  Object.assign(regs, init.regs);
  regs.rsp = BigInt(init.rsp);
  const mem = new Map(init.mem ?? []);
  if (init.called) {
    regs.rsp -= 8n;
    writeMem(mem, Number(regs.rsp), 64, BigInt(RETURN_TO_CALLER));
  }
  return { regs, rip: init.rip, flags: { ...NO_FLAGS }, mem, halted: false };
}

const cloneCpu = (c: Cpu): Cpu => ({ regs: { ...c.regs }, rip: c.rip, flags: { ...c.flags }, mem: new Map(c.mem), halted: c.halted });

function width(op: Operand, other?: Operand): Width {
  if (op.kind === 'reg') return op.ref.bits;
  if (op.kind === 'mem' && op.size) return op.size;
  if (other?.kind === 'reg') return other.ref.bits;
  if (other?.kind === 'mem' && other.size) return other.size;
  throw new Error('operand size unknown');
}

export function effectiveAddress(cpu: Cpu, m: Extract<Operand, { kind: 'mem' }>): number {
  const base = m.base ? cpu.regs[m.base] : 0n;
  const index = m.index ? cpu.regs[m.index] * m.scale : 0n;
  return Number(unsigned(base + index + m.disp));
}

/** Executes the instruction at rip and returns the new state plus what it touched. */
export function step(program: Program, before: Cpu): { cpu: Cpu; effect: StepEffect } {
  if (before.halted) throw new Error('already halted');
  const ins = program.instrs.find((i) => i.addr === before.rip);
  if (!ins) throw new Error(`no instruction at 0x${before.rip.toString(16)}`);
  const cpu = cloneCpu(before);
  const eff: StepEffect = { instr: ins, wroteRegs: [], wroteMem: [], readMem: [], readFlags: [], taken: null, wroteFlags: [] };
  let next = ins.addr + ins.size;
  const [d, s] = ins.operands;

  const read = (o: Operand, bits: Width): bigint => {
    if (o.kind === 'reg') return readReg(cpu, o.ref);
    if (o.kind === 'imm') return unsigned(o.value, bits);
    if (o.kind === 'mem') {
      const a = effectiveAddress(cpu, o);
      eff.readMem.push({ addr: a, bytes: bits / 8 });
      return readMem(cpu.mem, a, bits);
    }
    throw new Error(`can't read ${o.kind}`);
  };
  const write = (o: Operand, bits: Width, v: bigint) => {
    if (o.kind === 'reg') writeReg(cpu.regs, o.ref, v);
    else if (o.kind === 'mem') {
      const a = effectiveAddress(cpu, o);
      writeMem(cpu.mem, a, bits, v);
      eff.wroteMem.push({ addr: a, bytes: bits / 8 });
    } else throw new Error(`can't write ${o.kind}`);
  };
  const setFlags = (f: Flags, which: Flag[] = ['ZF', 'SF', 'CF', 'OF']) => {
    for (const k of which) cpu.flags[k] = f[k];
    eff.wroteFlags = which;
  };
  const push = (v: bigint) => {
    cpu.regs.rsp = unsigned(cpu.regs.rsp - 8n);
    writeMem(cpu.mem, Number(cpu.regs.rsp), 64, v);
    eff.wroteMem.push({ addr: Number(cpu.regs.rsp), bytes: 8 });
  };
  const pop = () => {
    eff.readMem.push({ addr: Number(cpu.regs.rsp), bytes: 8 });
    const v = readMem(cpu.mem, Number(cpu.regs.rsp), 64);
    cpu.regs.rsp = unsigned(cpu.regs.rsp + 8n);
    return v;
  };
  const target = (o: Operand) => {
    if (o.kind !== 'label' || program.labels[o.name] === undefined) throw new Error(`unknown jump target in "${ins.text}"`);
    return program.labels[o.name];
  };
  const cond = (suffix: string) => {
    const c = CONDITIONS[suffix];
    if (!c) throw new Error(`unknown condition "${suffix}"`);
    eff.readFlags = c.flags;
    eff.taken = c.test(cpu.flags);
    return eff.taken;
  };

  const op = ins.op;
  switch (true) {
    // movabs: the name gas and objdump print for mov with a full 64-bit immediate
    case op === 'mov' || op === 'movabs': {
      const w = width(d, s);
      write(d, w, read(s, w));
      break;
    }
    case op === 'lea':
      if (s.kind !== 'mem') throw new Error('lea needs a memory operand');
      write(d, width(d), BigInt(effectiveAddress(cpu, s)));
      break;
    case op === 'add' || op === 'sub' || op === 'cmp': {
      const w = width(d, s);
      const r = arithFlags(op === 'add' ? 'add' : 'sub', read(d, w), read(s, w), w);
      if (op !== 'cmp') write(d, w, r.result);
      setFlags(r.flags);
      break;
    }
    case op === 'test' || op === 'and' || op === 'or' || op === 'xor': {
      const w = width(d, s);
      const a = read(d, w);
      const b = read(s, w);
      const r = op === 'or' ? a | b : op === 'xor' ? a ^ b : a & b;
      if (op !== 'test') write(d, w, r);
      setFlags(logicFlags(r, w));
      break;
    }
    case op === 'neg': {
      const w = width(d);
      const r = arithFlags('sub', 0n, read(d, w), w);
      write(d, w, r.result);
      setFlags(r.flags);
      break;
    }
    case op === 'imul': {
      if (ins.operands.length === 3) throw new Error('3-operand imul is not modelled');
      const w = width(d, s);
      const exact = signed(read(d, w), w) * signed(read(s, w), w);
      const fits = signed(exact, w) === exact;
      write(d, w, exact);
      setFlags({ ...cpu.flags, CF: !fits, OF: !fits }, ['CF', 'OF']);
      break;
    }
    case op === 'jmp':
      next = target(d);
      break;
    case op.startsWith('j'):
      if (cond(op.slice(1))) next = target(d);
      break;
    case op.startsWith('cmov'): {
      const w = width(d, s);
      const v = read(s, w);
      if (cond(op.slice(4))) write(d, w, v);
      // A 32-bit cmov zero-extends its destination even when the condition is false.
      else if (d.kind === 'reg' && w === 32) writeReg(cpu.regs, d.ref, readReg(cpu, d.ref));
      break;
    }
    case op === 'push':
      push(read(d, 64));
      break;
    case op === 'pop':
      write(d, 64, pop());
      break;
    case op === 'call':
      push(BigInt(next));
      next = target(d);
      break;
    case op === 'ret':
      next = Number(pop());
      if (next === RETURN_TO_CALLER) cpu.halted = true;
      break;
    case op === 'leave':
      cpu.regs.rsp = cpu.regs.rbp;
      cpu.regs.rbp = pop();
      break;
    case op === 'nop':
      break;
    default:
      throw new Error(`instruction "${op}" is not modelled`);
  }
  cpu.rip = next;
  eff.wroteRegs = REGS64.filter((r) => cpu.regs[r] !== before.regs[r]);
  return { cpu, effect: eff };
}

export const STEP_LIMIT = 10_000;

/** Runs until `ret` returns to the caller. Returns every state, the first included. */
export function runToEnd(program: Program, start: Cpu): { cpus: Cpu[]; effects: StepEffect[] } {
  const cpus = [start];
  const effects: StepEffect[] = [];
  let cpu = start;
  while (!cpu.halted) {
    if (effects.length >= STEP_LIMIT) throw new Error('step limit reached');
    const r = step(program, cpu);
    cpus.push(r.cpu);
    effects.push(r.effect);
    cpu = r.cpu;
  }
  return { cpus, effects };
}

export const hex = (v: bigint | number) => `0x${(typeof v === 'number' ? BigInt(v) : v).toString(16)}`;
