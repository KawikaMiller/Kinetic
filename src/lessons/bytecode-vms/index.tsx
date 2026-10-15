import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { compileSource, type Instr } from './lang';
import { LISTING_PRESETS, SOURCE_PRESETS } from './presets';
import { compareExpression } from './compare';
import { assemble, runFrames, STACK_LIMIT, STEP_BUDGET, type VmState } from './vm';

const program = (text: string): Instr[] => {
  const c = compileSource(text);
  if (c.ok) return c.value;
  const a = assemble(text);
  if (a.ok) return a.program;
  throw new Error(c.error);
};
const final = (states: VmState[]) => states[states.length - 1];

const sum = runFrames(program(SOURCE_PRESETS[0].text));
const loop = runFrames(program(SOURCE_PRESETS[1].text));
const bad = final(runFrames(program(LISTING_PRESETS[0].text)));
const overflow = final(runFrames(program(LISTING_PRESETS[2].text)));
const cmpResult = compareExpression('(a + b) * (c - d)');
const cmp = cmpResult.ok ? cmpResult.value : null;
if (!cmp) throw new Error('the comparison expression must parse');
const budget = STEP_BUDGET.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A bytecode VM is a loop that fetches an instruction, switches on it and moves values around a stack: a CPU made of software.',
    what: 'You type a tiny program and watch this page’s compiler turn it into numbered instructions, then step the VM: the program counter, the operand stack and four slots change one instruction at a time. You write a listing yourself and see bad ones stop with a named error, read the dispatch loop that runs everything, compare stack code with register code, and set the result beside real CPython and JVM listings for the same addition.',
    analogy: 'Like a pocket calculator in reverse-Polish mode driven by a list of key presses: each instruction is one key press, and the stack is the display you cannot see all of at once.',
    useCases: [
      'Reading python -m dis or javap -c output when debugging or tuning',
      'Seeing why an interpreter is a loop around a switch, and what a JIT sets out to replace',
      'Understanding why a VM has to check the stack and the program counter, or it can corrupt itself',
      'Judging what "compiles to bytecode" means for a language you use',
    ],
    why: 'CPython and the JVM run on stack machines of this shape, and many other languages use some kind of VM. Knowing what a stack, a program counter and a dispatch loop do makes their listings, errors and performance advice readable.',
    watch: 'In the listing, the instruction about to run is yellow, an error line is red, and a jump taken is marked in purple with its target. On the stack the top value is blue and a value just pushed is green; the values the last instruction popped are listed in grey. The four slots a to d each have their own hue, and a slot just written gets a green ring. The status reads green when the program halted, red when an error stopped it, and grey when the budget cut it off, which proves nothing about later steps.',
  },
  tryThis: [
    `On Source to bytecode, the default print 1 + 2 * 3 compiles to ${final(sum).steps} instructions (PUSH 1, PUSH 2, PUSH 3, MUL, ADD, PRINT, HALT). Step through it: the stack peaks at ${final(sum).peak} and it prints ${final(sum).out.join(' ')}.`,
    `Pick sum 1 to 4 (a loop): it prints ${final(loop).out.join(' ')} after ${final(loop).steps} instructions, and the JZ at the top of the loop jumps just once, at the end.`,
    `On Write the bytecode, press play on the default listing: it stops with "${bad.error}" at pc ${bad.pc}. Add a PUSH 2 line before the ADD and play again: it prints 3.`,
    `Press stack over 32: the machine stops after ${final(runFrames(program(LISTING_PRESETS[2].text))).steps} instructions with ${overflow.stack.length} values on the stack. Press an endless loop: it is cut off at ${budget} steps, which shows it had not halted by then and nothing more.`,
    `On Stack or registers, (a + b) * (c - d) takes ${cmp.stack.length} stack instructions and ${cmp.register.length} register instructions, and both print ${cmp.stackOut} with a = 1, b = 2, c = 5 and d = 3.`,
  ],
  keyIdeas: [
    'A VM is a loop: fetch the instruction at the program counter, switch on its opcode, change the stack, the slots or the counter, and repeat.',
    'Bytecode is not machine code: a program (the VM’s switch) runs it, not a processor, and each real VM has its own instruction set.',
    'A VM that does not check can corrupt itself: popping an empty stack or running past the end has to be caught, as the errors here show.',
    `Stack code uses more, simpler instructions and register code fewer, wider ones: in this lesson’s unit one expression takes ${cmp.stack.length} against ${cmp.register.length}.`,
  ],
  quiz: [
    {
      q: 'The stack holds one value and the next instruction is ADD. What happens in this lesson’s VM?',
      options: [
        'It adds the value to zero and pushes the result back onto the stack',
        'It stops with an error saying ADD needs 2 values and the stack has 1',
        'It waits until another value has been pushed by a later instruction',
        'It skips the ADD and carries on with the next instruction in the listing',
      ],
      answer: 1,
      why: `The page’s VM stops with "${bad.error}" at pc ${bad.pc}. A real VM’s behaviour is its own: some verify code before running it and refuse it, others trust it and misbehave.`,
    },
    {
      q: 'Which statement about bytecode is right?',
      options: [
        'A processor runs it directly, like machine code, once the source is compiled',
        'A program, the VM, interprets it, so the processor does not run it directly',
        'It is the source text with the spaces removed, run by the compiler',
        'It runs only on the machine that compiled it and nowhere else',
      ],
      answer: 1,
      why: 'The VM fetches each instruction and acts on it in a switch. A JIT can translate hot bytecode to machine code, but that is a separate step the lesson does not run.',
    },
    {
      q: 'What does the dispatch loop do on each pass?',
      options: [
        'It compiles the next line of source into machine code',
        'It checks the whole program for syntax errors once more',
        'It runs the entire program at once and then reports',
        'It fetches the instruction at the program counter and carries it out',
      ],
      answer: 3,
      why: 'Fetch, switch on the opcode, execute, move the counter: the few lines shown on the dispatch scene are the code that the page’s VM follows.',
    },
    {
      q: 'In print 1 + 2 * 3 the stack peaks at 3 values. Why?',
      options: [
        'Each instruction in the listing adds one more value to the stack',
        'The 1, the 2 and the 3 are all on the stack before MUL pops two of them',
        'ADD needs three operands, so three values have to be waiting',
        'The stack is always filled to three values before it is used',
      ],
      answer: 1,
      why: `The listing pushes 1, 2 and 3 before MUL, so the depth reaches ${final(sum).peak}; MUL then leaves 1 and 6, and ADD leaves ${final(sum).out[0]}.`,
    },
    {
      q: `A run was cut off at ${budget} steps. What does that show?`,
      options: [
        'That the program loops, so no budget would ever see it stop, on any input at all',
        'That the VM has a bug somewhere in its dispatch loop or its stack',
        'That it did not halt within the budget, which settles nothing about later steps',
        'That the stack has overflowed and the machine is stuck at that point in the listing, so it stopped',
      ],
      answer: 2,
      why: `A run that reaches the ${budget}-step budget says "did not halt within ${budget} steps": the program might be endless or just long. The stack limit of ${STACK_LIMIT} values is a different stop, with its own message.`,
    },
  ],
};

export default lesson;
