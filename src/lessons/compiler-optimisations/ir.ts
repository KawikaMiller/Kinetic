/**
 * The lesson's toy SSA IR: three-address instructions in basic blocks, a pretty-printer and an
 * interpreter that counts what it executes. Lesson data, never learner-typed text, and nothing
 * here is evaluated with eval or new Function.
 */

/** An operand: a literal number or the name of a value. */
export type Val = number | string;
export type Ty = 'i32' | 'f64';
export type BinKind = 'add' | 'sub' | 'mul' | 'lt';

export type Instr =
  | { op: 'bin'; kind: BinKind; dst: string; a: Val; b: Val; ty: Ty }
  | { op: 'copy'; dst: string; a: Val }
  | { op: 'phi'; dst: string; from: { block: string; val: Val }[] }
  | { op: 'load'; dst: string; addr: Val }
  | { op: 'store'; addr: Val; val: Val }
  | { op: 'call'; dst: string; fn: string; args: Val[] }
  | { op: 'br'; cond: Val; then: string; else: string }
  | { op: 'jmp'; to: string }
  | { op: 'ret'; a: Val };

export interface Block {
  label: string;
  instrs: Instr[];
}

/** A callee: one block of straight-line code ending in `ret`. `pure` means a call has no effect but its result. */
export interface Func {
  params: string[];
  instrs: Instr[];
  pure: boolean;
}

export interface Program {
  params: string[];
  blocks: Block[];
  funcs: Record<string, Func>;
}

/** Wrap-around 32-bit arithmetic, as C's unsigned or -fwrapv signed ints behave and as this toy's i32 does. */
export function evalBin(kind: BinKind, a: number, b: number, ty: Ty): number {
  if (kind === 'lt') return a < b ? 1 : 0;
  if (ty === 'f64') return kind === 'add' ? a + b : kind === 'sub' ? a - b : a * b;
  return kind === 'add' ? (a + b) | 0 : kind === 'sub' ? (a - b) | 0 : Math.imul(a, b);
}

const val = (v: Val) => String(v);

/** One instruction as the listing prints it, e.g. `t1 = mul a, 2`. */
export function formatInstr(i: Instr): string {
  switch (i.op) {
    case 'bin': return `${i.dst} = ${i.kind} ${val(i.a)}, ${val(i.b)}`;
    case 'copy': return `${i.dst} = copy ${val(i.a)}`;
    case 'phi': return `${i.dst} = phi ${i.from.map((f) => `[${f.block}: ${val(f.val)}]`).join(', ')}`;
    case 'load': return `${i.dst} = load ${val(i.addr)}`;
    case 'store': return `store ${val(i.addr)}, ${val(i.val)}`;
    case 'call': return `${i.dst} = call ${i.fn}(${i.args.map(val).join(', ')})`;
    case 'br': return `br ${val(i.cond)}, ${i.then}, ${i.else}`;
    case 'jmp': return `jmp ${i.to}`;
    case 'ret': return `ret ${val(i.a)}`;
  }
}

/** The listing: each block's label line, then its instructions indented. `at(b, i)` is the line of instruction i in block b. */
export interface Listing {
  lines: string[];
  at: (block: number, instr: number) => number;
}

const INDENT = '  ';

export function listing(p: Program): Listing {
  const lines: string[] = [];
  const starts: number[] = [];
  for (const b of p.blocks) {
    lines.push(`${b.label}:`);
    starts.push(lines.length);
    for (const i of b.instrs) lines.push(INDENT + formatInstr(i));
  }
  return { lines, at: (block, instr) => starts[block] + instr };
}

/** Every instruction of a program, blocks in order. */
export const allInstrs = (p: Program): Instr[] => p.blocks.flatMap((b) => b.instrs);

/** Number of instructions in the printed listing (labels are not instructions). */
export const staticCount = (p: Program): number => allInstrs(p).length;

export function defOf(i: Instr): string | null {
  return i.op === 'bin' || i.op === 'copy' || i.op === 'phi' || i.op === 'load' || i.op === 'call' ? i.dst : null;
}

/** The operands an instruction reads, literals and names alike. */
export function operandsOf(i: Instr): Val[] {
  switch (i.op) {
    case 'bin': return [i.a, i.b];
    case 'copy': return [i.a];
    case 'phi': return i.from.map((f) => f.val);
    case 'load': return [i.addr];
    case 'store': return [i.addr, i.val];
    case 'call': return i.args;
    case 'br': return [i.cond];
    case 'jmp': return [];
    case 'ret': return [i.a];
  }
}

/** The names an instruction reads. */
export const usesOf = (i: Instr): string[] => operandsOf(i).filter((v): v is string => typeof v === 'string');

/** A copy of the instruction with every operand mapped through `f`. */
export function mapOperands(i: Instr, f: (v: Val) => Val): Instr {
  switch (i.op) {
    case 'bin': return { ...i, a: f(i.a), b: f(i.b) };
    case 'copy': return { ...i, a: f(i.a) };
    case 'phi': return { ...i, from: i.from.map((x) => ({ block: x.block, val: f(x.val) })) };
    case 'load': return { ...i, addr: f(i.addr) };
    case 'store': return { ...i, addr: f(i.addr), val: f(i.val) };
    case 'call': return { ...i, args: i.args.map(f) };
    case 'br': return { ...i, cond: f(i.cond) };
    case 'jmp': return i;
    case 'ret': return { ...i, a: f(i.a) };
  }
}

export const sameInstr = (a: Instr, b: Instr): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Every name the program defines or takes as a parameter. */
export function namesOf(p: Program): Set<string> {
  const names = new Set<string>(p.params);
  for (const i of allInstrs(p)) {
    const d = defOf(i);
    if (d) names.add(d);
  }
  return names;
}

/** Where a run is: the instruction about to execute. */
export interface Step {
  block: number;
  instr: number;
}

export interface RunResult {
  value: number;
  /** Instructions executed, a call and its callee's instructions included. */
  executed: number;
  loads: number;
  stores: number;
  /** The first `TRACE_LIMIT` steps of the top-level function, for stepping through. */
  trace: Step[];
}

export const TRACE_LIMIT = 200;
const MAX_STEPS = 5_000_000;

export interface RunOptions {
  /** Memory cells by address; the run writes into it. */
  memory?: Map<number, number>;
}

function runFunc(f: Func, args: number[], counters: { executed: number; loads: number; stores: number }): number {
  const env = new Map<string, number>(f.params.map((n, k) => [n, args[k]]));
  const read = (v: Val) => (typeof v === 'number' ? v : (env.get(v) as number));
  for (const i of f.instrs) {
    counters.executed++;
    if (i.op === 'ret') return read(i.a);
    if (i.op === 'bin') env.set(i.dst, evalBin(i.kind, read(i.a), read(i.b), i.ty));
    else if (i.op === 'copy') env.set(i.dst, read(i.a));
    else throw new Error(`a callee may only hold bin, copy and ret, got ${i.op}`);
  }
  throw new Error('a callee must end in ret');
}

/** Run a program on integer or float arguments with the toy interpreter. Throws if it never terminates within the step limit. */
export function run(p: Program, args: number[], o: RunOptions = {}): RunResult {
  const env = new Map<string, number>(p.params.map((n, k) => [n, args[k]]));
  const memory = o.memory ?? new Map<number, number>();
  const read = (v: Val) => {
    if (typeof v === 'number') return v;
    const x = env.get(v);
    if (x === undefined) throw new Error(`${v} is read before it is defined`);
    return x;
  };
  const counters = { executed: 0, loads: 0, stores: 0 };
  const trace: Step[] = [];
  let b = 0;
  let prev = '';
  for (;;) {
    const block = p.blocks[b];
    // phis read the values from the edge just taken, all at once
    const phiValues: [string, number][] = [];
    for (const i of block.instrs) {
      if (i.op !== 'phi') break;
      const edge = i.from.find((f) => f.block === prev);
      if (!edge) throw new Error(`phi ${i.dst} has no value from ${prev}`);
      phiValues.push([i.dst, read(edge.val)]);
    }
    let next = -1;
    for (let k = 0; k < block.instrs.length; k++) {
      const i = block.instrs[k];
      if (++counters.executed > MAX_STEPS) throw new Error('step limit reached');
      if (trace.length < TRACE_LIMIT) trace.push({ block: b, instr: k });
      if (i.op === 'phi') env.set(i.dst, phiValues[k][1]);
      else if (i.op === 'bin') env.set(i.dst, evalBin(i.kind, read(i.a), read(i.b), i.ty));
      else if (i.op === 'copy') env.set(i.dst, read(i.a));
      else if (i.op === 'load') {
        counters.loads++;
        env.set(i.dst, memory.get(read(i.addr)) ?? 0);
      } else if (i.op === 'store') {
        counters.stores++;
        memory.set(read(i.addr), read(i.val));
      } else if (i.op === 'call') {
        const f = p.funcs[i.fn];
        env.set(i.dst, runFunc(f, i.args.map(read), counters));
      } else if (i.op === 'ret') {
        return { value: read(i.a), ...counters, trace };
      } else if (i.op === 'jmp') {
        next = p.blocks.findIndex((x) => x.label === i.to);
        break;
      } else if (i.op === 'br') {
        const to = read(i.cond) !== 0 ? i.then : i.else;
        next = p.blocks.findIndex((x) => x.label === to);
        break;
      }
    }
    if (next < 0) throw new Error(`block ${block.label} fell off its end`);
    prev = block.label;
    b = next;
  }
}

/** Control-flow edges of a program: block label to the labels its terminator can reach. */
export function successors(block: Block): string[] {
  const t = block.instrs[block.instrs.length - 1];
  if (t.op === 'jmp') return [t.to];
  if (t.op === 'br') return [t.then, t.else];
  return [];
}
