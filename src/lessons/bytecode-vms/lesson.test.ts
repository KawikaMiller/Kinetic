import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { spawnSync } from '../../core/testing/node';
import { mulberry32, randInt, type Rnd } from '../../core/random';
import { lastText, stateCaption } from './captions';
import { DISPATCH_LINES, DISPATCH_SOURCE, FETCH_LINES, linesForOp } from './dispatch';
import lesson from './index';
import {
  compileSource, formatInstr, formatReg, LANG_LIMITS, MAX_PROGRAM, parseExpression, parseProgram, registerCodeFor, runRegister, stackCodeFor,
  type Expr, type Instr, type Op,
} from './lang';
import { EXPRESSION_PRESETS, LISTING_PRESETS, SAMPLE_SLOTS, SOURCE_PRESETS } from './presets';
import { compareExpression } from './compare';
import { CPYTHON_LISTING, JVM_LISTING, OWN_LISTING } from './listings';
import { assemble, listing, OP_NAMES, runFrames, startVm, STACK_LIMIT, STEP_BUDGET, stepVm, type VmState } from './vm';

const must = (text: string): Instr[] => {
  const c = compileSource(text);
  if (!c.ok) throw new Error(`${text}: ${c.error}`);
  return c.value;
};
const last = (frames: VmState[]) => frames[frames.length - 1];
const asm = (text: string): Instr[] => {
  const a = assemble(text);
  if (!a.ok) throw new Error(a.error);
  return a.program;
};

// ---- random programs, written so the same text is valid JavaScript ----

const VARS = ['a', 'b', 'c', 'd'];
const OPS = ['+', '-', '*'];
/** Arithmetic only at the top; a comparison appears only inside parentheses as a number operand. */
function arith(rnd: Rnd, depth: number, vars: string[]): string {
  if (depth <= 0 || rnd() < 0.3) return rnd() < 0.5 ? String(randInt(0, 9, rnd)) : vars[randInt(0, vars.length - 1, rnd)];
  const roll = rnd();
  if (roll < 0.12) return `(${arith(rnd, depth - 1, vars)} < ${arith(rnd, depth - 1, vars)})`;
  const op = OPS[randInt(0, OPS.length - 1, rnd)];
  const l = arith(rnd, depth - 1, vars);
  const r = arith(rnd, depth - 1, vars);
  return roll < 0.5 ? `(${l} ${op} ${r})` : `${l} ${op} ${r}`;
}
/** + 0 makes a top-level comparison a number: this VM's LT pushes 1 or 0 where JavaScript says true or false. */
const numeric = (rnd: Rnd, depth: number) => `(${arith(rnd, depth, VARS)}) + 0`;
function randomSource(rnd: Rnd): string {
  const parts: string[] = [];
  const stmts = randInt(1, 4, rnd);
  for (let i = 0; i < stmts; i++) {
    const roll = rnd();
    if (roll < 0.4) parts.push(`${VARS[randInt(0, 2, rnd)]} = ${arith(rnd, 2, VARS)}`);
    else if (roll < 0.7) parts.push(`print(${numeric(rnd, 2)})`);
    else {
      const bound = randInt(1, 5, rnd);
      const inner = `${VARS[randInt(0, 2, rnd)]} = ${numeric(rnd, 1)}; print(${numeric(rnd, 1)})`;
      parts.push(`d = 0; while (d < ${bound}) { ${inner}; d = d + 1 }`);
    }
  }
  return parts.join('; ');
}
function runJs(source: string): number[] {
  const out: number[] = [];
  // Test only: runs a fixed, randomly generated program text as real JavaScript to check the compiler against it.
  new Function('print', `let a = 0, b = 0, c = 0, d = 0; ${source}`)((n: number) => out.push(n));
  return out;
}

describe('the compiler against real JavaScript', () => {
  it('prints what JavaScript prints on 500 seeded random programs (assignments, nested expressions, bounded while loops)', () => {
    const rnd = mulberry32(8080);
    let checked = 0;
    let withLoop = 0;
    while (checked < 500) {
      const source = randomSource(rnd);
      const compiled = compileSource(source);
      if (!compiled.ok) {
        expect(compiled.error, source).toMatch(/characters|instructions|nested/);
        continue;
      }
      const frames = runFrames(compiled.value);
      expect(last(frames).status, source).toBe('halted');
      expect(last(frames).out, source).toEqual(runJs(source));
      if (source.includes('while')) withLoop++;
      checked++;
    }
    expect(withLoop).toBeGreaterThan(50);
  });

  it('pins the hand-worked listing: print 1 + 2 * 3 is 7 instructions, depth 3, prints 7', () => {
    const program = must('print 1 + 2 * 3');
    expect(program.map(formatInstr)).toEqual(['PUSH 1', 'PUSH 2', 'PUSH 3', 'MUL', 'ADD', 'PRINT', 'HALT']);
    const end = last(runFrames(program));
    expect([end.out, end.peak, end.steps, end.status]).toEqual([[7], 3, 7, 'halted']);
  });

  it('pins the loop preset: the 20-instruction listing, output 10, and 63 instructions run (4 + 4 x 13 + 4 + 3 by hand)', () => {
    const program = must(SOURCE_PRESETS[1].text);
    expect(program.map(formatInstr)).toEqual([
      'PUSH 0', 'STORE 0', 'PUSH 1', 'STORE 1',
      'LOAD 1', 'PUSH 5', 'LT', 'JZ 17',
      'LOAD 0', 'LOAD 1', 'ADD', 'STORE 0', 'LOAD 1', 'PUSH 1', 'ADD', 'STORE 1', 'JMP 4',
      'LOAD 0', 'PRINT', 'HALT',
    ]);
    const end = last(runFrames(program));
    expect([end.out, end.steps, end.slots]).toEqual([[10], 63, [10, 5, 0, 0]]);
  });

  it('the countdown preset prints 3 2 1; subtraction and comparison take their operands in the order written', () => {
    expect(last(runFrames(must(SOURCE_PRESETS[2].text))).out).toEqual([3, 2, 1]);
    expect(last(runFrames(asm('PUSH 5\nPUSH 3\nSUB\nPRINT\nHALT'))).out).toEqual([2]);
    expect(last(runFrames(asm('PUSH 3\nPUSH 5\nLT\nPRINT\nPUSH 5\nPUSH 3\nLT\nPRINT\nHALT'))).out).toEqual([1, 0]);
  });

  it('accepts print with or without parentheses, newlines between statements and no separator after a block', () => {
    expect(last(runFrames(must('print(2 * 3)'))).out).toEqual([6]);
    expect(last(runFrames(must('a = 2\nprint a * a'))).out).toEqual([4]);
    expect(last(runFrames(must('a = 0; while (a < 2) { a = a + 1 } print a'))).out).toEqual([2]);
  });
});

describe('the source parser refuses with a message', () => {
  const refusal = (t: string) => {
    const p = parseProgram(t);
    return p.ok ? null : p.error;
  };
  it('names what is wrong and where', () => {
    expect(refusal('')).toMatch(/Type a program/);
    expect(refusal('sum = 1')).toMatch(/not a variable here: this machine has four slots/);
    expect(refusal('print -1')).toMatch(/no unary minus/);
    expect(refusal('print 1 $ 2')).toMatch(/Unexpected character "\$"/);
    expect(refusal('print (1 + 2')).toMatch(/Expected "\)"/);
    expect(refusal('while (a < 3) { a = 1')).toMatch(/Expected "\}"/);
    expect(refusal('print')).toMatch(/ends too soon/);
    expect(refusal('a = ')).toMatch(/ends too soon/);
    expect(refusal('} a = 1')).toMatch(/Expected a statement/);
    expect(refusal('print 1000001')).toMatch(/over 1,000,000/);
    expect(refusal('print 2a')).toMatch(/run into a letter/);
  });

  it('caps the source at 120 characters and the nesting at 12 levels, and the listing at 60 instructions', () => {
    expect(LANG_LIMITS).toMatchObject({ maxChars: 120, maxDepth: 12 });
    expect(refusal(`print ${'1 + '.repeat(40)}1`)).toMatch(/120 or fewer/);
    expect(refusal(`print ${'('.repeat(13)}1${')'.repeat(13)}`)).toMatch(/nested more than 12/);
    const long = 'a=1;'.repeat(30);
    const c = compileSource(long);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toMatch(new RegExp(`compiles to \\d+ instructions; the listing holds ${MAX_PROGRAM}`));
  });

  it('an expression field refuses a program and anything over 40 characters', () => {
    expect(parseExpression('a = 1').ok).toBe(false);
    expect(parseExpression('1 + '.repeat(12) + '1').ok).toBe(false);
    expect(parseExpression('(a + b) * 2').ok).toBe(true);
    expect(parseExpression('').ok).toBe(false);
  });
});

describe('the assembler', () => {
  it('round-trips every compiler output: the listing assembles back to the same instructions', () => {
    const rnd = mulberry32(31);
    const sources = [...SOURCE_PRESETS.map((p) => p.text), ...Array.from({ length: 100 }, () => randomSource(rnd))];
    let n = 0;
    for (const source of sources) {
      const c = compileSource(source);
      if (!c.ok) continue;
      expect(asm(listing(c.value)), source).toEqual(c.value);
      n++;
    }
    expect(n).toBeGreaterThan(60);
  });

  it('refuses each kind of bad listing with the line named', () => {
    const e = (t: string) => {
      const a = assemble(t);
      return a.ok ? null : a.error;
    };
    expect(e('PUSH 1\nFOO')).toMatch(/^Line 2: unknown opcode "FOO"/);
    expect(e('PUSH')).toBe('Line 1: PUSH needs an operand.');
    expect(e('PUSH x')).toBe('Line 1: "x" is not a whole number.');
    expect(e('PUSH 1.5')).toMatch(/not a whole number/);
    expect(e('ADD 3')).toBe('Line 1: ADD takes no operand.');
    expect(e('PUSH 1 2')).toMatch(/one operand, but this line has 2 words/);
    expect(e('LOAD 4')).toBe('Line 1: slot 4 does not exist: the slots are 0 to 3.');
    expect(e('LOAD -1')).toMatch(/slot -1 does not exist/);
    expect(e('PUSH 1000001')).toMatch(/outside −1,000,000 to 1,000,000/);
    expect(e('JMP 3\nHALT')).toMatch(/jump target 3 is outside the program: use 0 to 2/);
    expect(e('JMP -1')).toMatch(/jump target -1 is outside/);
    expect(e('')).toMatch(/listing is empty/);
    expect(e(`PUSH ${'1'.repeat(40)}`)).toMatch(/keep each instruction to 30 or fewer/);
  });

  it('accepts a jump to just past the end, lower-case opcodes, blank lines and # comments, and numbers the lines by instruction', () => {
    expect(asm('jmp 1')).toEqual([{ op: 'JMP', arg: 1 }]);
    expect(asm('# a comment\n\npush 4\nprint\n# done').map(formatInstr)).toEqual(['PUSH 4', 'PRINT']);
  });

  it('refuses more than 60 instructions and names the first one over', () => {
    const sixty = Array.from({ length: 60 }, () => 'PUSH 1').join('\n');
    expect(assemble(sixty).ok).toBe(true);
    const a = assemble(`${sixty}\nPUSH 1`);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toBe('Line 61: more than 60 instructions; delete one first.');
  });
});

describe('running a bad program fails visibly and says why', () => {
  it('ADD with one value stops with its own message, the pc and the stack at that moment', () => {
    const end = last(runFrames(asm(LISTING_PRESETS[0].text)));
    expect(end.status).toBe('error');
    expect(end.error).toBe('ADD needs 2 values, the stack has 1');
    expect([end.pc, end.stack, end.steps]).toEqual([1, [1], 1]);
    expect(expectCaption(stateCaption(end, asm(LISTING_PRESETS[0].text)))).toContain('pc = 1 and the stack [1]');
  });

  it('every opcode that pops names how many values it needs and how many the stack has', () => {
    const needs: [Op, number][] = [['POP', 1], ['ADD', 2], ['SUB', 2], ['MUL', 2], ['LT', 2], ['STORE', 1], ['JZ', 1], ['PRINT', 1]];
    for (const [op, n] of needs) {
      const text = ['STORE', 'JZ'].includes(op) ? `${op} 0` : op;
      const end = last(runFrames(asm(`${text}\nHALT`)));
      expect(end.error, op).toBe(`${op} needs ${n} value${n === 1 ? '' : 's'}, the stack has 0`);
    }
  });

  it('running off the end and jumping past it both stop with the pc named', () => {
    expect(last(runFrames(asm('PUSH 1\nPRINT'))).error).toBe('pc 2 is past the end of the program: no HALT was reached');
    const jump = last(runFrames(asm(LISTING_PRESETS[1].text)));
    expect(jump.error).toBe('pc 3 is past the end of the program: no HALT was reached');
    expect(jump.out).toEqual([1]);
  });

  it('a stack past 32 stops at the 33rd push, after 64 instructions', () => {
    const end = last(runFrames(asm(LISTING_PRESETS[2].text)));
    expect(end.status).toBe('error');
    expect(end.error).toBe('the stack is full (32 values): PUSH would make it 33');
    expect([end.stack.length, end.steps, STACK_LIMIT]).toEqual([32, 64, 32]);
  });

  it('an endless loop is cut at the 2,000-step budget and called "did not halt within 2,000 steps", never an infinite loop', () => {
    const program = asm(LISTING_PRESETS[3].text);
    const frames = runFrames(program);
    const end = last(frames);
    expect([end.status, end.steps, frames.length]).toEqual(['budget', STEP_BUDGET, STEP_BUDGET + 2]);
    const text = expectCaption(stateCaption(end, program));
    expect(text).toContain('did not halt within 2,000 steps');
    expect(text).not.toMatch(/infinite|forever|never/i);
  });

  it('the fixed listing prints 3', () => {
    expect(last(runFrames(asm(LISTING_PRESETS[4].text))).out).toEqual([3]);
  });

  it('a stopped state does not move again', () => {
    const end = last(runFrames(asm('ADD')));
    expect(stepVm([{ op: 'ADD' }], end)).toBe(end);
    expect(startVm().status).toBe('running');
  });
});

describe('the dispatch loop shown on screen is code that behaves like the VM', () => {
  // Test only: runs the text the page shows, a fixed lesson-authored function, as real JavaScript.
  const step = new Function(`${DISPATCH_SOURCE}; return step;`)() as (vm: Record<string, unknown>, program: [string, number | undefined][]) => void;

  const traceWithSnippet = (program: Instr[]) => {
    const vm = { pc: 0, stack: [] as number[], slots: [0, 0, 0, 0], out: [] as number[], steps: 0, status: 'running', error: null as string | null };
    const states = [JSON.stringify([vm.pc, vm.stack, vm.slots, vm.out, vm.steps, vm.status, vm.error])];
    const code = program.map((i): [string, number | undefined] => [i.op, i.arg]);
    while (vm.status === 'running' && vm.steps < STEP_BUDGET) {
      step(vm, code);
      states.push(JSON.stringify([vm.pc, vm.stack, vm.slots, vm.out, vm.steps, vm.status, vm.error]));
    }
    return states;
  };
  const traceWithVm = (program: Instr[]) =>
    runFrames(program)
      .filter((s) => s.status !== 'budget')
      .map((s) => JSON.stringify([s.pc, s.stack, s.slots, s.out, s.steps, s.status, s.error]));

  it('gives the same trace, state by state, on every preset, every listing preset and 300 random listings', () => {
    const programs: Instr[][] = [...SOURCE_PRESETS.map((p) => must(p.text)), ...LISTING_PRESETS.map((p) => asm(p.text))];
    const rnd = mulberry32(5150);
    for (let k = 0; k < 300; k++) {
      const n = randInt(1, 12, rnd);
      const lines = Array.from({ length: n }, () => {
        const op = OP_NAMES[randInt(0, OP_NAMES.length - 1, rnd)];
        const arg = op === 'PUSH' ? randInt(-3, 9, rnd) : op === 'LOAD' || op === 'STORE' ? randInt(0, 3, rnd) : randInt(0, n, rnd);
        return ['PUSH', 'LOAD', 'STORE', 'JMP', 'JZ'].includes(op) ? `${op} ${arg}` : op;
      });
      programs.push(asm(lines.join('\n')));
    }
    let errors = 0;
    for (const p of programs) {
      const ours = traceWithVm(p);
      const theirs = traceWithSnippet(p);
      expect(theirs, listing(p)).toEqual(ours);
      if (JSON.parse(ours[ours.length - 1])[5] === 'error') errors++;
    }
    expect(errors).toBeGreaterThan(30);
  });

  it('highlights, for each opcode, the lines of its own case and nothing of another', () => {
    for (const op of OP_NAMES) {
      const lines = linesForOp(op);
      expect(lines.length, op).toBeGreaterThan(0);
      expect(DISPATCH_LINES[lines[0]], op).toContain(`case '${op}'`);
      for (const i of lines.slice(1)) expect(DISPATCH_LINES[i], `${op} line ${i}`).not.toMatch(/^\s{4}case /);
    }
    expect(linesForOp('ADD').some((i) => DISPATCH_LINES[i].includes('a + b'))).toBe(true);
    expect(linesForOp('NOPE')).toEqual([]);
    expect(FETCH_LINES.map((i) => DISPATCH_LINES[i])[4]).toContain('switch (op)');
  });
});

describe('stack code against register code', () => {
  /** An independent evaluator of the expression tree, written from the semantics. */
  const evalAst = (e: Expr, slots: readonly number[]): number =>
    e.k === 'num' ? e.n : e.k === 'var' ? slots[e.slot] : e.op === '+' ? evalAst(e.l, slots) + evalAst(e.r, slots) : e.op === '-' ? evalAst(e.l, slots) - evalAst(e.r, slots) : e.op === '*' ? evalAst(e.l, slots) * evalAst(e.r, slots) : evalAst(e.l, slots) < evalAst(e.r, slots) ? 1 : 0;
  const nodes = (e: Expr): number => (e.k === 'bin' ? 1 + nodes(e.l) + nodes(e.r) : 1);
  const internal = (e: Expr): number => (e.k === 'bin' ? 1 + internal(e.l) + internal(e.r) : 0);
  const parse = (t: string): Expr => {
    const p = parseExpression(t);
    if (!p.ok) throw new Error(p.error);
    return p.value;
  };

  it('counts match a hand count on three expressions: 6 and 3, 8 and 4, 6 and 3', () => {
    const hand: [string, number, number][] = [['1 + 2 * 3', 6, 3], ['(a + b) * (c - d)', 8, 4], ['a * a + a', 6, 3]];
    for (const [text, stack, register] of hand) {
      const c = compareExpression(text);
      expect(c.ok).toBe(true);
      if (c.ok) expect([c.value.stack.length, c.value.register.length], text).toEqual([stack, register]);
    }
    expect(registerCodeFor(parse('1 + 2 * 3')).map(formatReg)).toEqual(['MUL t0, 2, 3', 'ADD t1, 1, t0', 'PRINT t1']);
    expect(stackCodeFor(parse('a * a + a')).map(formatInstr)).toEqual(['LOAD 0', 'LOAD 0', 'MUL', 'LOAD 0', 'ADD', 'PRINT']);
  });

  it('on 300 random expressions both listings print what the tree evaluates to, and the counts follow the tree’s size', () => {
    const rnd = mulberry32(77);
    for (let k = 0; k < 300; k++) {
      const text = arith(rnd, 3, VARS);
      const parsed = parseExpression(text);
      if (!parsed.ok) continue;
      const e = parsed.value;
      const stack = stackCodeFor(e);
      const reg = registerCodeFor(e);
      const frames = runFrames([...stack, { op: 'HALT' }], SAMPLE_SLOTS);
      expect(last(frames).out, text).toEqual([evalAst(e, SAMPLE_SLOTS)]);
      expect(runRegister(reg, SAMPLE_SLOTS), text).toEqual([evalAst(e, SAMPLE_SLOTS)]);
      expect(stack.length, text).toBe(nodes(e) + 1);
      expect(reg.length, text).toBe(internal(e) + 1);
    }
  });

  it('a single number takes 2 stack instructions and 1 register instruction', () => {
    const c = compareExpression('7');
    expect(c.ok && [c.value.stack.length, c.value.register.length, c.value.stackOut, c.value.registerOut]).toEqual([2, 1, 7, 7]);
    expect(EXPRESSION_PRESETS.length).toBe(3);
  });
});

describe('real bytecode, shown', () => {
  it('this lesson’s own listing for print a + b is LOAD 0, LOAD 1, ADD, PRINT, HALT', () => {
    expect(OWN_LISTING).toEqual(['LOAD 0', 'LOAD 1', 'ADD', 'PRINT', 'HALT']);
    expect(JVM_LISTING).toEqual(['iload_1', 'iload_2', 'iadd', 'ireturn']);
  });

  const dis = spawnSync('python', ['-I', '-c', "import dis, sys\nif sys.version_info[:2] != (3, 12): raise SystemExit(3)\ndef add(a, b):\n    return a + b\ndis.dis(add)"], { timeout: 20_000 });
  it.skipIf(dis.status !== 0)('the CPython listing matches `dis` on CPython 3.12 (skipped where that is not installed)', () => {
    const ops = dis.stdout.split('\n').map((l) => l.replace(/^\s*(\d+\s+)?\d+\s+/, '').trim()).filter(Boolean).map((l) => l.split(/\s+/)[0]);
    expect(ops).toEqual(CPYTHON_LISTING.map((l) => l.split(' ')[0]));
  });
});

describe('captions', () => {
  it('every state of every preset has a caption that passes the glue check and agrees with the state', () => {
    for (const text of [...SOURCE_PRESETS.map((p) => p.text), ...LISTING_PRESETS.map((p) => p.text)]) {
      const program = text.startsWith('PUSH') || text.startsWith('JMP') ? asm(text) : must(text);
      for (const s of runFrames(program)) {
        const caption = expectCaption(stateCaption(s, program));
        if (s.status === 'halted') expect(caption).toContain(`after ${s.steps} instruction`);
        if (s.status === 'error') expect(caption).toContain(s.error!);
        if (s.status === 'running' && s.last?.instr.op === 'PUSH') expect(caption).toContain(`puts ${s.last.instr.arg} on the stack`);
      }
    }
  });

  it('describes each opcode from the values it moved', () => {
    const frames = runFrames(must(SOURCE_PRESETS[1].text));
    const texts = frames.map((s) => lastText(s));
    expect(texts.some((t) => t.startsWith('JZ 17 pops 0, which is zero, so pc jumps to 17'))).toBe(true);
    expect(texts.some((t) => /^JZ 17 pops 1, which is not zero, so execution goes on at 8/.test(t))).toBe(true);
    expect(texts.some((t) => t.startsWith('LT pops 5, then 1, and pushes 1: 1 is less than 5'))).toBe(true);
    expect(texts.some((t) => t.startsWith('STORE 0 pops 10 into slot a'))).toBe(true);
    expect(texts.some((t) => t === 'PRINT pops 10 and prints it.')).toBe(true);
  });
});

describe('no eval of learner text', () => {
  it('only the tests build a Function; no source file of the lesson does', () => {
    const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(8);
    for (const [name, source] of files) {
      expect(source, name).not.toMatch(/\beval\s*\(/);
      expect(source.replace(/DISPATCH_SOURCE = `[\s\S]*?`;/, ''), name).not.toMatch(/new Function|\bFunction\s*\(/);
    }
  });
});

describe('try-this entries, from the default state', () => {
  it('try-this 1: print 1 + 2 * 3 is 7 instructions, peaks at depth 3 and prints 7', () => {
    const end = last(runFrames(must(SOURCE_PRESETS[0].text)));
    expect([end.steps, end.peak, end.out]).toEqual([7, 3, [7]]);
    expect(lesson.tryThis[0]).toContain('7 instructions');
  });

  it('try-this 2: the loop preset prints 10 after 63 instructions and its JZ jumps exactly once', () => {
    const frames = runFrames(must(SOURCE_PRESETS[1].text));
    const jumps = frames.filter((s) => s.last?.instr.op === 'JZ' && s.last.jumped).length;
    expect([last(frames).out, last(frames).steps, jumps]).toEqual([[10], 63, 1]);
    expect(lesson.tryThis[1]).toContain('63 instructions');
  });

  it('try-this 3: the default listing stops at pc 1 with ADD needing 2 values; with PUSH 2 added it prints 3', () => {
    const end = last(runFrames(asm(LISTING_PRESETS[0].text)));
    expect([end.error, end.pc]).toEqual(['ADD needs 2 values, the stack has 1', 1]);
    expect(last(runFrames(asm('PUSH 1\nPUSH 2\nADD\nPRINT\nHALT'))).out).toEqual([3]);
    expect(lesson.tryThis[2]).toContain('pc 1');
  });

  it('try-this 4: stack over 32 stops after 64 instructions; the endless loop is cut at 2,000', () => {
    expect(last(runFrames(asm(LISTING_PRESETS[2].text))).steps).toBe(64);
    expect(last(runFrames(asm(LISTING_PRESETS[3].text))).status).toBe('budget');
    expect(lesson.tryThis[3]).toContain('64 instructions');
    expect(lesson.tryThis[3]).toContain('2,000');
  });

  it('try-this 5: (a + b) * (c - d) is 8 stack instructions against 4 register ones, both printing 6', () => {
    const c = compareExpression('(a + b) * (c - d)');
    expect(c.ok && [c.value.stack.length, c.value.register.length, c.value.stackOut, c.value.registerOut]).toEqual([8, 4, 6, 6]);
    expect(lesson.tryThis[4]).toContain('8 stack instructions');
  });
});
