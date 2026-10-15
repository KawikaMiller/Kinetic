/**
 * The lesson's own small interpreter of the opcode subset the modules use, run over the function
 * bodies it decodes from the module's bytes. It is a teaching tool: the real engine is the oracle
 * and the tests compare the two (add, sum, div including its traps, sum_array including its
 * out-of-bounds trap).
 */
import { readU32, sectionsOf } from './modules';

export interface Ins {
  /** The text-format name: `local.get`, `i32.add`, `br_if`. */
  op: string;
  /** Immediates as written: a local index, a constant, a label depth, a memory offset. */
  imm: number[];
  /** Nesting depth of the instruction, for indenting the listing. */
  depth: number;
  /** For block and loop: the index of their `end`. */
  end?: number;
}

export interface Body {
  /** Total locals including parameters is `params + extra`. */
  extra: number;
  code: Ins[];
}

const OPS: Record<number, { op: string; imm: 'none' | 'blocktype' | 'u32' | 's32' | 'mem' }> = {
  0x02: { op: 'block', imm: 'blocktype' },
  0x03: { op: 'loop', imm: 'blocktype' },
  0x0b: { op: 'end', imm: 'none' },
  0x0c: { op: 'br', imm: 'u32' },
  0x0d: { op: 'br_if', imm: 'u32' },
  0x20: { op: 'local.get', imm: 'u32' },
  0x21: { op: 'local.set', imm: 'u32' },
  0x28: { op: 'i32.load', imm: 'mem' },
  0x41: { op: 'i32.const', imm: 's32' },
  0x4e: { op: 'i32.ge_s', imm: 'none' },
  0x6a: { op: 'i32.add', imm: 'none' },
  0x6b: { op: 'i32.sub', imm: 'none' },
  0x6c: { op: 'i32.mul', imm: 'none' },
  0x6d: { op: 'i32.div_s', imm: 'none' },
  0x74: { op: 'i32.shl', imm: 'none' },
};

function readS32(bytes: Uint8Array, at: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    const b = bytes[i++];
    result |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) {
      if (shift < 32 && (b & 0x40) !== 0) result |= -1 << shift;
      return { value: result | 0, next: i };
    }
  }
}

/** The number of functions the module imports (they come before its own in the index space). */
export function importCount(module: Uint8Array): number {
  const section = sectionsOf(module).find((s) => s.name === 'import');
  return section ? readU32(module, readU32(module, section.from + 1).next).value : 0;
}

/** Decodes the `index`-th function body of the code section (counting only the module's own functions). */
export function decodeBody(module: Uint8Array, index: number): Body {
  const code = sectionsOf(module).find((s) => s.name === 'code');
  if (!code) throw new Error('no code section');
  let at = readU32(module, code.from + 1).next;
  const count = readU32(module, at);
  at = count.next;
  for (let k = 0; k < count.value; k++) {
    const size = readU32(module, at);
    if (k === index) return decodeInstructions(module, size.next, size.next + size.value);
    at = size.next + size.value;
  }
  throw new Error(`no function body ${index}`);
}

function decodeInstructions(m: Uint8Array, from: number, to: number): Body {
  let at = from;
  const groups = readU32(m, at);
  at = groups.next;
  let extra = 0;
  for (let g = 0; g < groups.value; g++) {
    const n = readU32(m, at);
    extra += n.value;
    at = n.next + 1;
  }
  const code: Ins[] = [];
  const open: number[] = [];
  while (at < to) {
    const spec = OPS[m[at++]];
    if (!spec) throw new Error(`opcode 0x${m[at - 1].toString(16)} is outside this interpreter's subset`);
    const imm: number[] = [];
    if (spec.imm === 'blocktype') at++;
    else if (spec.imm === 'u32') {
      const r = readU32(m, at);
      imm.push(r.value);
      at = r.next;
    } else if (spec.imm === 's32') {
      const r = readS32(m, at);
      imm.push(r.value);
      at = r.next;
    } else if (spec.imm === 'mem') {
      const align = readU32(m, at);
      const offset = readU32(m, align.next);
      imm.push(align.value, offset.value);
      at = offset.next;
    }
    if (spec.op === 'end') open.pop();
    code.push({ op: spec.op, imm, depth: open.length });
    if (spec.op === 'block' || spec.op === 'loop') open.push(code.length - 1);
  }
  // Match each block and loop with its end.
  const stack: number[] = [];
  code.forEach((ins, i) => {
    if (ins.op === 'block' || ins.op === 'loop') stack.push(i);
    else if (ins.op === 'end') {
      const start = stack.pop();
      if (start !== undefined) code[start].end = i;
    }
  });
  return { extra, code };
}

/** `local.get 1` as the listing prints it. */
export const insText = (i: Ins): string => (i.op === 'i32.load' ? `${i.op} offset=${i.imm[1]}` : [i.op, ...i.imm].join(' '));

/** The listing lines, indented by nesting depth. */
export const listingOf = (body: Body): string[] => body.code.map((i) => `${'  '.repeat(i.depth)}${insText(i)}`);

// ---- running ----

interface Label {
  kind: 'block' | 'loop';
  start: number;
  end: number;
}

export interface Frame {
  /** The instruction about to run, or code.length when the function has returned. */
  pc: number;
  stack: number[];
  locals: number[];
  labels: Label[];
  steps: number;
  /** What the last instruction did, in words. */
  note: string;
  status: 'running' | 'returned' | 'trapped';
  /** The function's result (the top of the stack at the end), when it returned. */
  result?: number;
  trap?: string;
}

/** A linear memory the interpreter reads, as bytes; loads past its end trap. */
export type MemoryBytes = Uint8Array;

/** The interpreter gives up past this many instructions: far above anything the page's input limits allow. */
const MAX_STEPS = 1_000_000;

export function start(body: Body, params: readonly number[]): Frame {
  return { pc: 0, stack: [], locals: [...params.map((p) => p | 0), ...Array(body.extra).fill(0)], labels: [], steps: 0, note: 'The function starts with its parameters in the first locals.', status: 'running' };
}

/** One instruction. Pure: the given frame is untouched. */
export function step(body: Body, f: Frame, memory?: MemoryBytes): Frame {
  if (f.status !== 'running') return f;
  if (f.pc >= body.code.length) return { ...f, status: 'returned', result: f.stack[f.stack.length - 1] };
  const ins = body.code[f.pc];
  const stack = [...f.stack];
  const locals = [...f.locals];
  let labels = f.labels;
  let pc = f.pc + 1;
  let note = '';
  const trap = (reason: string): Frame => ({ ...f, status: 'trapped', trap: reason, note: `trap: ${reason}` });
  const binary = (fn: (a: number, b: number) => number, word: string) => {
    const b = stack.pop()!;
    const a = stack.pop()!;
    const r = fn(a, b) | 0;
    stack.push(r);
    note = `${ins.op} pops ${b} and ${a} (${word}) and pushes ${r}.`;
  };
  switch (ins.op) {
    case 'block':
    case 'loop':
      labels = [...labels, { kind: ins.op, start: f.pc, end: ins.end! }];
      note = `${ins.op} opens a label${ins.op === 'loop' ? ': a br to it jumps back to the top' : ': a br to it jumps past its end'}.`;
      break;
    case 'end':
      if (labels.length && labels[labels.length - 1].end === f.pc) labels = labels.slice(0, -1);
      note = labels.length === f.labels.length ? 'end of the function.' : 'end closes the label.';
      break;
    case 'local.get':
      stack.push(locals[ins.imm[0]]);
      note = `local.get ${ins.imm[0]} pushes ${locals[ins.imm[0]]}.`;
      break;
    case 'local.set': {
      const v = stack.pop()!;
      locals[ins.imm[0]] = v;
      note = `local.set ${ins.imm[0]} pops ${v} into local ${ins.imm[0]}.`;
      break;
    }
    case 'i32.const':
      stack.push(ins.imm[0]);
      note = `i32.const pushes ${ins.imm[0]}.`;
      break;
    case 'i32.add': binary((a, b) => a + b, 'wrapping to 32 bits'); break;
    case 'i32.sub': binary((a, b) => a - b, 'wrapping to 32 bits'); break;
    case 'i32.mul': binary((a, b) => Math.imul(a, b), 'wrapping to 32 bits'); break;
    case 'i32.shl': binary((a, b) => a << (b & 31), 'shift left'); break;
    case 'i32.ge_s': {
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(a >= b ? 1 : 0);
      note = `i32.ge_s compares ${a} >= ${b} (signed) and pushes ${a >= b ? 1 : 0}.`;
      break;
    }
    case 'i32.div_s': {
      const b = stack.pop()!;
      const a = stack.pop()!;
      if (b === 0) return trap('integer divide by zero');
      if (a === -2147483648 && b === -1) return trap('integer overflow');
      const r = Math.trunc(a / b) | 0;
      stack.push(r);
      note = `i32.div_s pops ${b} and ${a} and pushes ${r} (rounding toward zero).`;
      break;
    }
    case 'i32.load': {
      const addr = (stack.pop()! >>> 0) + ins.imm[1];
      if (!memory || addr + 4 > memory.length) return trap('out of bounds memory access');
      const v = new DataView(memory.buffer, memory.byteOffset, memory.byteLength).getInt32(addr, true);
      stack.push(v);
      note = `i32.load reads 4 bytes at address ${addr} and pushes ${v}.`;
      break;
    }
    case 'br':
    case 'br_if': {
      const taken = ins.op === 'br' || stack.pop() !== 0;
      if (!taken) {
        note = 'br_if pops 0, so it falls through.';
        break;
      }
      const target = labels[labels.length - 1 - ins.imm[0]];
      if (target.kind === 'loop') {
        pc = target.start + 1;
        labels = labels.slice(0, labels.length - ins.imm[0]);
        note = `${ins.op} ${ins.imm[0]} jumps back to the top of the loop.`;
      } else {
        pc = target.end + 1;
        labels = labels.slice(0, labels.length - 1 - ins.imm[0]);
        note = `${ins.op} ${ins.imm[0]} jumps past the end of the block.`;
      }
      break;
    }
    default:
      throw new Error(`${ins.op} is not interpreted`);
  }
  const steps = f.steps + 1;
  if (steps > MAX_STEPS) return trap('the interpreter step limit');
  const next: Frame = { pc, stack, locals, labels, steps, note, status: 'running' };
  return pc >= body.code.length ? { ...next, status: 'returned', result: stack[stack.length - 1] } : next;
}

/** Every frame of a run, from the start to the return or the trap. */
export function frames(body: Body, params: readonly number[], memory?: MemoryBytes): Frame[] {
  const out = [start(body, params)];
  for (;;) {
    const next = step(body, out[out.length - 1], memory);
    if (next === out[out.length - 1]) return out;
    out.push(next);
    if (next.status !== 'running') return out;
  }
}

export type Outcome = { kind: 'value'; value: number | undefined } | { kind: 'trap'; reason: string };

export function interpret(module: Uint8Array, bodyIndex: number, params: readonly number[], memory?: MemoryBytes): Outcome {
  const body = decodeBody(module, bodyIndex);
  let f = start(body, params);
  while (f.status === 'running') f = step(body, f, memory);
  return f.status === 'trapped' ? { kind: 'trap', reason: f.trap! } : { kind: 'value', value: f.result };
}
