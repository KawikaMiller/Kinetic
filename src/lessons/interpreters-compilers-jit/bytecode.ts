import { applyOp, truthy, type BinOp, type Env, type Expr, type Fn, type Stmt, type Value } from './lang';

/**
 * A real compiler from the lesson's AST to a short stack bytecode, and the VM that runs it.
 * The compiler walks the tree once; after that the VM never looks at the tree again, it just
 * steps a program counter through a flat array.
 */

export type Instr =
  | { op: 'PUSH'; arg: number }
  | { op: 'LOAD'; arg: string }
  | { op: 'STORE'; arg: string }
  | { op: 'ADD' }
  | { op: 'MUL' }
  | { op: 'LE' }
  | { op: 'JMP'; arg: number }
  | { op: 'JMP_IF_FALSE'; arg: number }
  | { op: 'RET' };

const OP_OF: Record<BinOp, 'ADD' | 'MUL' | 'LE'> = { '+': 'ADD', '*': 'MUL', '<=': 'LE' };

export interface Compiled {
  code: Instr[];
  /** Index of the loop's first instruction (its condition): where the back-edge jumps. */
  loopHead: number;
}

export function compile(fn: Fn): Compiled {
  const code: Instr[] = [];
  let loopHead = -1;
  const expr = (e: Expr) => {
    if (e.kind === 'num') code.push({ op: 'PUSH', arg: e.value });
    else if (e.kind === 'var') code.push({ op: 'LOAD', arg: e.name });
    else {
      expr(e.left);
      expr(e.right);
      code.push({ op: OP_OF[e.op] });
    }
  };
  const stmt = (s: Stmt) => {
    if (s.kind === 'let' || s.kind === 'assign') {
      expr(s.kind === 'let' ? s.init : s.value);
      code.push({ op: 'STORE', arg: s.name });
    } else if (s.kind === 'return') {
      expr(s.value);
      code.push({ op: 'RET' });
    } else {
      const head = code.length;
      if (loopHead < 0) loopHead = head;
      expr(s.cond);
      const exit = code.length;
      code.push({ op: 'JMP_IF_FALSE', arg: -1 });
      s.body.forEach(stmt);
      code.push({ op: 'JMP', arg: head });
      code[exit] = { op: 'JMP_IF_FALSE', arg: code.length };
    }
  };
  fn.body.forEach(stmt);
  return { code, loopHead };
}

/** One line of the bytecode listing, as the lesson prints it. */
export function formatInstr(ins: Instr, at: number): string {
  const addr = String(at).padStart(2, '0');
  return 'arg' in ins ? `${addr}  ${ins.op.padEnd(12)} ${ins.arg}` : `${addr}  ${ins.op}`;
}

export interface VmStep {
  pc: number;
  /** The value stack after this instruction. */
  stack: Value[];
  env: Env;
}

export interface VmResult {
  result: Value;
  /** Instructions executed. */
  executed: number;
  /** Instructions executed before the first time the loop head runs (the call's set-up). */
  entry: number;
  /** How many times the loop head ran: iterations + 1. */
  headVisits: number;
  steps?: VmStep[];
}

export const MAX_INSTRUCTIONS = 50_000_000;

export function runVm({ code, loopHead }: Compiled, param: string, arg: Value, { trace = false } = {}): VmResult {
  const env: Env = { [param]: arg };
  const stack: Value[] = [];
  const steps: VmStep[] | undefined = trace ? [] : undefined;
  let pc = 0;
  let executed = 0;
  let entry = -1;
  let headVisits = 0;
  const pop = () => {
    const x = stack.pop();
    if (x === undefined) throw new Error('runVm: stack underflow');
    return x;
  };
  for (;;) {
    if (pc === loopHead) {
      headVisits++;
      if (entry < 0) entry = executed;
    }
    const ins = code[pc];
    const at = pc;
    executed++;
    if (executed > MAX_INSTRUCTIONS) throw new Error('runVm: instruction limit reached');
    pc++;
    switch (ins.op) {
      case 'PUSH': stack.push(ins.arg); break;
      case 'LOAD': stack.push(env[ins.arg]); break;
      case 'STORE': env[ins.arg] = pop(); break;
      case 'ADD':
      case 'MUL':
      case 'LE': {
        const b = pop();
        const a = pop();
        stack.push(applyOp(ins.op === 'ADD' ? '+' : ins.op === 'MUL' ? '*' : '<=', a, b));
        break;
      }
      case 'JMP': pc = ins.arg; break;
      case 'JMP_IF_FALSE': if (!truthy(pop())) pc = ins.arg; break;
      case 'RET': {
        const result = pop();
        steps?.push({ pc: at, stack: [...stack], env: { ...env } });
        return { result, executed, entry, headVisits, steps };
      }
    }
    steps?.push({ pc: at, stack: [...stack], env: { ...env } });
  }
}
