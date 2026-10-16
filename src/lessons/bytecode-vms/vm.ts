/**
 * The teaching VM: twelve instructions, a program counter, an operand stack (limit 32), four
 * slots and printed output. `assemble` reads a learner-typed listing with refusals; `stepVm`
 * runs one instruction and describes what moved, so the stage can show it. Values are JavaScript
 * numbers. A real VM's instruction set and error handling are its own.
 */
import { parseRows, type FieldParse } from '../../core/parse';
import { formatInstr, type Instr, type Op } from './lang';

export const STACK_LIMIT = 32;
export const STEP_BUDGET = 2000;
export const SLOT_COUNT = 4;
export const ASSEMBLE_LIMITS = { maxLines: 60, maxLineChars: 30, maxOperand: 1_000_000 } as const;

/** What each opcode needs on the stack, and whether it takes an operand. */
export const OPCODES: Record<Op, { pops: number; operand: 'none' | 'value' | 'slot' | 'target' }> = {
  PUSH: { pops: 0, operand: 'value' },
  POP: { pops: 1, operand: 'none' },
  ADD: { pops: 2, operand: 'none' },
  SUB: { pops: 2, operand: 'none' },
  MUL: { pops: 2, operand: 'none' },
  LT: { pops: 2, operand: 'none' },
  LOAD: { pops: 0, operand: 'slot' },
  STORE: { pops: 1, operand: 'slot' },
  JMP: { pops: 0, operand: 'target' },
  JZ: { pops: 1, operand: 'target' },
  PRINT: { pops: 1, operand: 'none' },
  HALT: { pops: 0, operand: 'none' },
};
export const OP_NAMES = Object.keys(OPCODES) as Op[];

// ---- assembling ----

export type Assembled = { ok: true; program: Instr[] } | { ok: false; error: string; line: number };

const isOp = (s: string): s is Op => s in OPCODES;
const WHOLE = /^-?\d+$/;

function readLine(text: string): FieldParse<{ op: Op; operand: string | null }> {
  const parts = text.split(/\s+/);
  const name = parts[0].toUpperCase();
  if (!isOp(name)) return { ok: false, error: `unknown opcode "${parts[0]}". The opcodes are ${OP_NAMES.join(', ')}.` };
  if (parts.length > 2) return { ok: false, error: `${name} takes ${OPCODES[name].operand === 'none' ? 'no operand' : 'one operand'}, but this line has ${parts.length - 1} words after it.` };
  return { ok: true, value: { op: name, operand: parts[1] ?? null } };
}

/** Reads a listing, one instruction per line (`#` starts a comment). Refuses by line: an unknown opcode, a bad or missing operand, a slot outside 0 to 3, a jump target outside the program, more than 60 instructions. */
export function assemble(text: string): Assembled {
  const rows = parseRows(text, {
    maxRows: ASSEMBLE_LIMITS.maxLines * 4,
    maxLineChars: ASSEMBLE_LIMITS.maxLineChars,
    noun: { one: 'instruction', many: 'instructions' },
    row: readLine,
  });
  if (!rows.ok) return { ok: false, error: rows.error, line: rows.line };
  if (rows.rows.length > ASSEMBLE_LIMITS.maxLines) {
    const line = rows.rows[ASSEMBLE_LIMITS.maxLines].line;
    return { ok: false, line, error: `Line ${line}: more than ${ASSEMBLE_LIMITS.maxLines} instructions; delete one first.` };
  }
  if (rows.rows.length === 0) return { ok: false, line: 1, error: 'The listing is empty. Write at least one instruction, like HALT.' };
  const count = rows.rows.length;
  const program: Instr[] = [];
  for (const { line, value } of rows.rows) {
    const spec = OPCODES[value.op];
    const fail = (why: string): Assembled => ({ ok: false, line, error: `Line ${line}: ${why}` });
    if (spec.operand === 'none') {
      if (value.operand !== null) return fail(`${value.op} takes no operand.`);
      program.push({ op: value.op });
      continue;
    }
    if (value.operand === null) return fail(`${value.op} needs an operand.`);
    if (!WHOLE.test(value.operand)) return fail(`"${value.operand}" is not a whole number.`);
    const n = Number(value.operand);
    if (Math.abs(n) > ASSEMBLE_LIMITS.maxOperand) return fail(`${value.operand} is outside −${ASSEMBLE_LIMITS.maxOperand.toLocaleString('en-US')} to ${ASSEMBLE_LIMITS.maxOperand.toLocaleString('en-US')}.`);
    if (spec.operand === 'slot' && (n < 0 || n >= SLOT_COUNT)) return fail(`slot ${n} does not exist: the slots are 0 to ${SLOT_COUNT - 1}.`);
    if (spec.operand === 'target' && (n < 0 || n > count)) return fail(`jump target ${n} is outside the program: use 0 to ${count} (${count} is just past the last instruction).`);
    program.push({ op: value.op, arg: n });
  }
  return { ok: true, program };
}

export const listing = (program: readonly Instr[]) => program.map(formatInstr).join('\n');

// ---- running ----

export type Status = 'running' | 'halted' | 'error' | 'budget';

/** What the last instruction did, for the stage to show. */
export interface LastStep {
  pcBefore: number;
  instr: Instr;
  popped: number[];
  pushed: number[];
  /** A jump that changed pc to a target (JMP, or JZ that took it). */
  jumped: boolean;
  /** A slot STORE wrote. */
  stored: number | null;
  printed: number | null;
}

export interface VmState {
  pc: number;
  stack: number[];
  slots: number[];
  out: number[];
  steps: number;
  peak: number;
  status: Status;
  error: string | null;
  last: LastStep | null;
}

export function startVm(slots: readonly number[] = []): VmState {
  return { pc: 0, stack: [], slots: Array.from({ length: SLOT_COUNT }, (_, i) => slots[i] ?? 0), out: [], steps: 0, peak: 0, status: 'running', error: null, last: null };
}

const needMessage = (op: Op, have: number) => `${op} needs ${OPCODES[op].pops} value${OPCODES[op].pops === 1 ? '' : 's'}, the stack has ${have}`;

/** One instruction. Pure: the given state is untouched. A stopped state is returned as it is. */
export function stepVm(program: readonly Instr[], s: VmState): VmState {
  if (s.status !== 'running') return s;
  if (s.steps >= STEP_BUDGET) return { ...s, status: 'budget' };
  if (s.pc >= program.length) return { ...s, status: 'error', error: `pc ${s.pc} is past the end of the program: no HALT was reached` };
  const instr = program[s.pc];
  const spec = OPCODES[instr.op];
  if (s.stack.length < spec.pops) return { ...s, status: 'error', error: needMessage(instr.op, s.stack.length) };
  const stack = [...s.stack];
  const slots = [...s.slots];
  const out = [...s.out];
  const popped: number[] = [];
  const pushed: number[] = [];
  let pc = s.pc + 1;
  let jumped = false;
  let stored: number | null = null;
  let printed: number | null = null;
  let status: Status = 'running';
  const pop = () => {
    const x = stack.pop()!;
    popped.push(x);
    return x;
  };
  const push = (x: number) => {
    stack.push(x);
    pushed.push(x);
  };
  if ((instr.op === 'PUSH' || instr.op === 'LOAD') && stack.length >= STACK_LIMIT) {
    return { ...s, status: 'error', error: `the stack is full (${STACK_LIMIT} values): ${instr.op} would make it ${STACK_LIMIT + 1}` };
  }
  switch (instr.op) {
    case 'PUSH': push(instr.arg!); break;
    case 'POP': pop(); break;
    case 'ADD': { const b = pop(); const a = pop(); push(a + b); break; }
    case 'SUB': { const b = pop(); const a = pop(); push(a - b); break; }
    case 'MUL': { const b = pop(); const a = pop(); push(a * b); break; }
    case 'LT': { const b = pop(); const a = pop(); push(a < b ? 1 : 0); break; }
    case 'LOAD': push(slots[instr.arg!]); break;
    case 'STORE': slots[instr.arg!] = pop(); stored = instr.arg!; break;
    case 'JMP': pc = instr.arg!; jumped = true; break;
    case 'JZ': if (pop() === 0) { pc = instr.arg!; jumped = true; } break;
    case 'PRINT': printed = pop(); out.push(printed); break;
    case 'HALT': status = 'halted'; pc = s.pc; break;
  }
  return {
    pc, stack, slots, out, steps: s.steps + 1, peak: Math.max(s.peak, stack.length), status, error: null,
    last: { pcBefore: s.pc, instr, popped, pushed, jumped, stored, printed },
  };
}

/** Every state of a run, from the start until it halts, errors or reaches the budget. */
export function runFrames(program: readonly Instr[], slots: readonly number[] = []): VmState[] {
  const states = [startVm(slots)];
  for (;;) {
    const prev = states[states.length - 1];
    const next = stepVm(program, prev);
    if (next === prev) return states;
    states.push(next);
    if (next.status !== 'running') return states;
  }
}
