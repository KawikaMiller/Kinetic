// A toy CPU invented for this lesson: two registers, a zero flag, 16 bytes of memory
// holding both program and data, and seven instructions.
//
// Instruction word (8 bits):  ooo r aaaa
//   ooo  opcode   (0 HALT, 1 LOAD, 2 STORE, 3 ADD, 4 SUB, 5 JZ, 6 JMP; 7 is undefined)
//   r    register (0 = R0, 1 = R1), used by LOAD and STORE
//   aaaa address  (0-15), used by LOAD, STORE, JZ and JMP
// ADD and SUB always compute R0 ← R0 ± R1 and set Z when the result is 0.
// Values are bytes: arithmetic wraps modulo 256.

export const MEM_SIZE = 16;
export const WORD_MAX = 255;
/** Stop a runaway program (a JMP to itself) after this many instructions. */
export const MAX_INSTRUCTIONS = 200;

export type Opcode = 'HALT' | 'LOAD' | 'STORE' | 'ADD' | 'SUB' | 'JZ' | 'JMP';
const OPCODES: readonly Opcode[] = ['HALT', 'LOAD', 'STORE', 'ADD', 'SUB', 'JZ', 'JMP'];

export interface Instr {
  op: Opcode | 'UNKNOWN';
  reg: 0 | 1;
  addr: number;
}

export const fields = (word: number) => ({ opcode: word >> 5, reg: ((word >> 4) & 1) as 0 | 1, addr: word & 0xf });

export function decode(word: number): Instr {
  const { opcode, reg, addr } = fields(word);
  return { op: OPCODES[opcode] ?? 'UNKNOWN', reg, addr };
}

export function encode(i: { op: Opcode; reg?: 0 | 1; addr?: number }): number {
  return (OPCODES.indexOf(i.op) << 5) | ((i.reg ?? 0) << 4) | ((i.addr ?? 0) & 0xf);
}

/** Which fields an instruction actually reads. */
export const usesReg = (op: Instr['op']) => op === 'LOAD' || op === 'STORE';
export const usesAddr = (op: Instr['op']) => op === 'LOAD' || op === 'STORE' || op === 'JZ' || op === 'JMP';

export function disassemble(word: number): string {
  const i = decode(word);
  if (i.op === 'UNKNOWN') return '???';
  if (i.op === 'LOAD') return `LOAD R${i.reg}, [${i.addr}]`;
  if (i.op === 'STORE') return `STORE R${i.reg}, [${i.addr}]`;
  if (i.op === 'JZ' || i.op === 'JMP') return `${i.op} ${i.addr}`;
  return i.op === 'ADD' ? 'ADD R0, R1' : i.op === 'SUB' ? 'SUB R0, R1' : 'HALT';
}

/** A memory cell as typed by the learner: a number (decimal or 0x hex) or an instruction like "LOAD R1, [14]". */
export function assemble(text: string): number | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^\d+$/.test(t)) return Number(t) <= WORD_MAX ? Number(t) : null;
  if (/^0X[0-9A-F]+$/.test(t)) return parseInt(t.slice(2), 16) <= WORD_MAX ? parseInt(t.slice(2), 16) : null;
  const mem = t.match(/^(LOAD|STORE) R([01]) ?, ?\[(\d+)\]$/);
  if (mem && Number(mem[3]) < MEM_SIZE) return encode({ op: mem[1] as Opcode, reg: Number(mem[2]) as 0 | 1, addr: Number(mem[3]) });
  const jump = t.match(/^(JZ|JMP) (\d+)$/);
  if (jump && Number(jump[2]) < MEM_SIZE) return encode({ op: jump[1] as Opcode, addr: Number(jump[2]) });
  if (/^(ADD|SUB)( R0 ?, ?R1)?$/.test(t)) return encode({ op: t.startsWith('ADD') ? 'ADD' : 'SUB' });
  if (t === 'HALT') return encode({ op: 'HALT' });
  return null;
}

export interface Cpu {
  pc: number;
  ir: number;
  r: [number, number];
  z: boolean;
  mem: number[];
  halted: boolean;
}

export const initialCpu = (mem: readonly number[]): Cpu => ({ pc: 0, ir: 0, r: [0, 0], z: false, mem: [...mem], halted: false });

/** What one instruction did, for narrating and highlighting it. */
export interface Effect {
  /** Address the instruction was fetched from. */
  at: number;
  word: number;
  instr: Instr;
  /** A register that was written, and its new value. */
  wroteReg?: { reg: 0 | 1; value: number };
  /** A memory cell that was written, and its new value. */
  wroteMem?: { addr: number; value: number };
  /** For JZ / JMP: whether the jump happened. */
  jumped?: boolean;
  /** For ADD / SUB: the ALU's inputs and result. */
  alu?: { a: number; b: number; result: number };
}

/** Run one full instruction: fetch (IR ← mem[PC], PC ← PC + 1), decode, execute. */
export function step(cpu: Cpu): { next: Cpu; effect: Effect } {
  const at = cpu.pc;
  const word = cpu.mem[at];
  const instr = decode(word);
  const next: Cpu = { ...cpu, mem: [...cpu.mem], r: [...cpu.r] as [number, number], ir: word, pc: (at + 1) % MEM_SIZE };
  const effect: Effect = { at, word, instr };
  switch (instr.op) {
    case 'LOAD':
      next.r[instr.reg] = next.mem[instr.addr];
      effect.wroteReg = { reg: instr.reg, value: next.r[instr.reg] };
      break;
    case 'STORE':
      next.mem[instr.addr] = next.r[instr.reg];
      effect.wroteMem = { addr: instr.addr, value: next.r[instr.reg] };
      break;
    case 'ADD':
    case 'SUB': {
      const [a, b] = cpu.r;
      const result = (instr.op === 'ADD' ? a + b : a - b + 256) % 256;
      next.r[0] = result;
      next.z = result === 0;
      effect.alu = { a, b, result };
      effect.wroteReg = { reg: 0, value: result };
      break;
    }
    case 'JZ':
    case 'JMP':
      effect.jumped = instr.op === 'JMP' || cpu.z;
      if (effect.jumped) next.pc = instr.addr;
      break;
    case 'HALT':
    case 'UNKNOWN':
      // PC was already moved on by the fetch, as on a real CPU; the machine simply stops.
      next.halted = true;
      break;
  }
  return { next, effect };
}

export type StopReason = 'halt' | 'unknown' | 'limit';

/** Run until HALT (or an undefined opcode, or MAX_INSTRUCTIONS). states[0] is the start. */
export function run(mem: readonly number[]): { states: Cpu[]; effects: Effect[]; reason: StopReason } {
  const states = [initialCpu(mem)];
  const effects: Effect[] = [];
  while (!states[states.length - 1].halted) {
    if (effects.length >= MAX_INSTRUCTIONS) return { states, effects, reason: 'limit' };
    const { next, effect } = step(states[states.length - 1]);
    states.push(next);
    effects.push(effect);
  }
  return { states, effects, reason: effects[effects.length - 1]?.instr.op === 'UNKNOWN' ? 'unknown' : 'halt' };
}

// ── Presets ──────────────────────────────────────────────────────────

export interface Program {
  id: string;
  label: string;
  /** Cells shown as the program listing (the rest are data). */
  codeCells: number;
  mem: number[];
  intro: string;
}

function memory(cells: Record<number, number>): number[] {
  return Array.from({ length: MEM_SIZE }, (_, i) => cells[i] ?? 0);
}

const asm = (text: string) => {
  const w = assemble(text);
  if (w === null) throw new Error(`bad instruction: ${text}`);
  return w;
};

export const PROGRAMS: readonly Program[] = [
  {
    id: 'add', label: 'Add two numbers', codeCells: 5,
    mem: memory({ 0: asm('LOAD R0, [14]'), 1: asm('LOAD R1, [15]'), 2: asm('ADD'), 3: asm('STORE R0, [13]'), 4: asm('HALT'), 14: 7, 15: 5 }),
    intro: 'Load 7 and 5 from memory, add them in the ALU, and store the answer in cell 13.',
  },
  {
    id: 'countdown', label: 'Count down from 3', codeCells: 7,
    mem: memory({
      0: asm('LOAD R0, [13]'), 1: asm('LOAD R1, [14]'), 2: asm('SUB'), 3: asm('STORE R0, [13]'), 4: asm('JZ 6'), 5: asm('JMP 2'),
      6: asm('HALT'), 13: 3, 14: 1,
    }),
    intro: 'A loop: subtract 1, store it, and jump back until the zero flag says the counter hit 0.',
  },
  {
    id: 'self-modify', label: 'Self-modifying code', codeCells: 6,
    mem: memory({
      0: asm('LOAD R0, [15]'), 1: asm('STORE R0, [2]'), 2: asm('HALT'), 3: asm('ADD'), 4: asm('STORE R0, [13]'), 5: asm('HALT'),
      14: 5, 15: asm('LOAD R1, [14]'),
    }),
    intro: 'Cell 2 holds HALT, so this should stop early. But cell 15 holds a number that is also an instruction...',
  },
];
