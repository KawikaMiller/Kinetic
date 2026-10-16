import type { Block, Func, Instr, Program } from './ir';

const i32 = (kind: 'add' | 'sub' | 'mul' | 'lt', dst: string, a: number | string, b: number | string): Instr => ({ op: 'bin', kind, dst, a, b, ty: 'i32' });
const f64 = (kind: 'add' | 'sub' | 'mul' | 'lt', dst: string, a: number | string, b: number | string): Instr => ({ op: 'bin', kind, dst, a, b, ty: 'f64' });
const copy = (dst: string, a: number | string): Instr => ({ op: 'copy', dst, a });
const block = (label: string, ...instrs: Instr[]): Block => ({ label, instrs });

/** P1: straight-line code with a constant, a repeated `a * 2`, a `* 1` and an unused `x * 99`. */
export const P1: Program = {
  params: ['a'],
  funcs: {},
  blocks: [
    block(
      'entry',
      copy('x', 7),
      i32('mul', 't1', 'a', 2),
      i32('mul', 't2', 'a', 2),
      i32('add', 't3', 't1', 't2'),
      i32('mul', 't4', 't3', 1),
      i32('mul', 'u', 'x', 99),
      i32('add', 'y', 'x', 3),
      i32('add', 'r', 't4', 'y'),
      { op: 'ret', a: 'r' },
    ),
  ],
};

/** The default input of P1 and the ranges the learner may type. */
export const P1_DEFAULT_INPUT = 5;

const SQUARE: Func = { params: ['v'], pure: true, instrs: [i32('mul', 'm', 'v', 'v'), { op: 'ret', a: 'm' }] };

/** P2: `s += square(x * 3)` for i < n, with a phi for each loop-carried value. `used: false` is the benchmark that ignores its result. */
export function loopProgram(resultUsed: boolean): Program {
  return {
    params: ['x', 'n'],
    funcs: { square: SQUARE },
    blocks: [
      block('entry', { op: 'jmp', to: 'loop' }),
      block(
        'loop',
        { op: 'phi', dst: 'i', from: [{ block: 'entry', val: 0 }, { block: 'body', val: 'i2' }] },
        { op: 'phi', dst: 's', from: [{ block: 'entry', val: 0 }, { block: 'body', val: 's2' }] },
        i32('lt', 'c', 'i', 'n'),
        { op: 'br', cond: 'c', then: 'body', else: 'exit' },
      ),
      block(
        'body',
        i32('mul', 'k', 'x', 3),
        { op: 'call', dst: 'q', fn: 'square', args: ['k'] },
        i32('add', 's2', 's', 'q'),
        i32('add', 'i2', 'i', 1),
        { op: 'jmp', to: 'loop' },
      ),
      block('exit', { op: 'ret', a: resultUsed ? 's' : 0 }),
    ],
  };
}

export const P2_DEFAULT = { x: 3, n: 1000 };

/** The snippet of the SSA scene, as plain C-like lines (not run: the SSA program beside it is). */
export const SSA_SOURCE: readonly string[] = ['x = 1', 'if (c) x = 2', 'y = x + 1', 'return y'];

/** The same snippet in SSA: every name is assigned once, and a phi picks the value from the edge taken. */
export const SSA_PROGRAM: Program = {
  params: ['c'],
  funcs: {},
  blocks: [
    block('entry', copy('x1', 1), { op: 'br', cond: 'c', then: 'then', else: 'join' }),
    block('then', copy('x2', 2), { op: 'jmp', to: 'join' }),
    block('join', { op: 'phi', dst: 'x3', from: [{ block: 'entry', val: 'x1' }, { block: 'then', val: 'x2' }] }, i32('add', 'y', 'x3', 1), { op: 'ret', a: 'y' }),
  ],
};

/** The non-SSA snippet evaluated directly, the oracle for the phi test. */
export function ssaSourceResult(c: number): number {
  let x = 1;
  if (c !== 0) x = 2;
  return x + 1;
}

/** `store p, 1; store q, 2; v = load p; ret v`: p and q are addresses passed in. */
export const ALIAS_PROGRAM: Program = {
  params: ['p', 'q'],
  funcs: {},
  blocks: [
    block('entry', { op: 'store', addr: 'p', val: 1 }, { op: 'store', addr: 'q', val: 2 }, { op: 'load', dst: 'v', addr: 'p' }, { op: 'ret', a: 'v' }),
  ],
};

/** Two loads of p around a store through q, for the broken-CSE test: with p = q the second load sees the store. */
export const RELOAD_PROGRAM: Program = {
  params: ['p', 'q'],
  funcs: {},
  blocks: [
    block(
      'entry',
      { op: 'store', addr: 'p', val: 1 },
      { op: 'load', dst: 'v1', addr: 'p' },
      { op: 'store', addr: 'q', val: 2 },
      { op: 'load', dst: 'v2', addr: 'p' },
      i32('add', 'r', 'v1', 'v2'),
      { op: 'ret', a: 'r' },
    ),
  ],
};

/** `r = x * 0` at either type. */
export const timesZero = (ty: 'i32' | 'f64'): Program => ({
  params: ['x'],
  funcs: {},
  blocks: [block('entry', ty === 'i32' ? i32('mul', 'r', 'x', 0) : f64('mul', 'r', 'x', 0), { op: 'ret', a: 'r' })],
});

/** `(a + b) + c` and `a + (b + c)` as float programs. */
export const LEFT_ASSOC: Program = {
  params: ['a', 'b', 'c'],
  funcs: {},
  blocks: [block('entry', f64('add', 't', 'a', 'b'), f64('add', 'r', 't', 'c'), { op: 'ret', a: 'r' })],
};
export const RIGHT_ASSOC: Program = {
  params: ['a', 'b', 'c'],
  funcs: {},
  blocks: [block('entry', f64('add', 't', 'b', 'c'), f64('add', 'r', 'a', 't'), { op: 'ret', a: 'r' })],
};

export const REASSOC_DEFAULT = { a: 1e16, b: -1e16, c: 1 };
