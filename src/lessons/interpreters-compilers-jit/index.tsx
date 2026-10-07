import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The same code can be run by walking its syntax tree, by compiling it to bytecode for a virtual machine, by compiling hot parts to machine code while it runs (a JIT), or by compiling all of it to machine code before it ships (AOT). Which is fastest depends on how long the code runs.',
    what: 'A tree-walking interpreter evaluates the AST directly, revisiting every node on every iteration. A bytecode VM compiles the tree once into a flat list of simple instructions and steps a program counter through it, which is cheaper per operation. A JIT usually starts in an interpreter, counts how often code runs, and compiles the hot parts to machine code using the types it has seen; if a later call breaks that assumption, it throws the code away and falls back (deoptimisation). An AOT compiler does all its work before the program runs, so it starts fast but must know the types up front.',
    analogy: 'Reading a recipe aloud line by line every time you cook (tree-walker), copying it onto a short checklist first (bytecode), memorising the dish you cook every day once you notice you keep making it (JIT), or buying it ready-made from a factory that prepped it in advance (AOT).',
    useCases: [
      'Knowing why a Node.js or JVM service gets faster after a few minutes of traffic (warm-up)',
      'Choosing between a scripting language and a compiled one for a CLI, a service or a hot loop',
      'Reading a profiler that shows "deoptimized" functions, and keeping argument types consistent',
      'Understanding why benchmarks need warm-up runs before measuring',
    ],
    why: 'Every language you use runs on one of these strategies, often several at once: CPython and Ruby run bytecode, the JVM and V8 interpret and then JIT-compile, Go and Rust compile ahead of time. Knowing the trade-off explains warm-up, start-up time and why a type change can make hot code suddenly slower. It builds on `parsing-ast` (the tree), `isa-assembly` (machine code) and `type-systems` (types checked before the run).',
    watch: 'Yellow is what is running now everywhere: the source line, the AST node being visited (a yellow pill), the bytecode or machine-code line just run, the "now" cursor on the timeline and the yellow line on the close-up. In the AST, statements and operators are pills with violet outlines and variables and numbers have blue outlines. The VM\'s value stack is blue cells (an empty stack is one faded cell); locals are grey chips, and registers are a table. The Result stat reads deopt in red when a guard fails. On the timeline and in the close-up, orange is parsing or compiling, grey is interpreting, green is running machine code and red is a deoptimisation. Timeline markers say "hot" in violet where the JIT compiles, "deopt" in red, and "type error" in red where the AOT build fails, which the lane table also shows in red. The JIT hotness counter is a violet bar. In the close-up, the dashed grey line is the bytecode VM for comparison and a dashed red line marks each deopt. A machine-code line that fails its guard turns red.',
  },
  tryThis: [
    'On The race, play Long server: the JIT starts as slowly as the VM, pauses in orange to compile, then the green slope is far steeper.',
    'Switch to Short script: the JIT never gets hot, so it costs exactly what the VM does, and the tree-walker finishes first.',
    'Flip AOT build to Built ahead: a shipped binary wins the short and long workloads, because its compile happened before the run.',
    'Play Deopt and watch the close-up: after the string call the JIT is back on the VM\'s slope and has to compile again.',
    'On Step through, run sumSquares("3") with Machine code (JIT): the jump on line 3 turns red, because the guard failed and the call deoptimises.',
  ],
  keyIdeas: [
    'A tree-walker revisits the AST every iteration; a bytecode VM compiles once and steps through a flat array.',
    'A JIT pays for warm-up and for compiling, so it only wins when code runs long enough to repay them.',
    'JIT machine code bets on the types it has seen; a different type fails the guard and deoptimises.',
    'AOT does its compiling before the run: fast from the start, but types must be known at build time.',
  ],
  quiz: [
    {
      q: 'A script runs one quick function once and exits. Which is most likely true?',
      options: [
        'Interpreting can finish before a compile would end',
        'The JIT makes this first run noticeably faster',
        'A compiled language finishes first, as it skips parsing',
        'A JIT compiles the whole script before it starts to run',
      ],
      answer: 0,
      why: 'For tiny amounts of work, fixed costs decide: an AOT build or a JIT compile can take longer than just interpreting. The JIT never gets hot on a run this short, so it runs at interpreter speed; it does not make the first run faster.',
    },
    {
      q: 'Why is a bytecode VM usually faster than walking the AST, even though both interpret?',
      options: [
        'It compiles the tree once into cheap, flat steps',
        'It turns every bytecode instruction into machine code',
        'It skips the loop condition after the first iteration',
        'It runs the loop body on several threads in parallel',
      ],
      answer: 0,
      why: 'The VM pays to compile the tree once, then each operation is a simple step through an array with a program counter. The tree-walker makes a recursive call per node, per iteration. Neither produces machine code; that is the JIT\'s job.',
    },
    {
      q: 'A Node.js service is slow for its first few minutes, then speeds up. What is the likeliest reason?',
      options: [
        'Hot functions get JIT-compiled once they have run enough',
        'The garbage collector frees the start-up code it no longer needs',
        'The operating system caches the source code it has parsed',
        'The event loop adds more threads as traffic keeps rising',
      ],
      answer: 0,
      why: 'V8 starts functions in its interpreter and compiles the hot ones to optimised machine code once their counters fill. That warm-up is why benchmarks discard the first runs. Caching and GC matter too, but they are not what makes the code itself faster.',
    },
    {
      q: 'A hot function has only ever been called with numbers. Then it is called with a string. What happens in a JIT?',
      options: [
        'The type guard fails, so the code is deoptimised',
        'The program throws a TypeError at the call site',
        'The machine code converts the string and carries on',
        'The JIT recompiles the whole program before going on',
      ],
      answer: 0,
      why: 'The machine code was compiled assuming numbers and starts with a guard. The guard fails, the engine throws that code away and the call continues in the interpreter, which handles any type. The answer is still correct, just slower; JavaScript does not throw here.',
    },
    {
      q: 'Why can an AOT compiler emit fast code from the very first run?',
      options: [
        'It did its compiling before the program was started',
        'It runs every function twice to warm up the caches',
        'It interprets the first call, then switches to native',
        'It waits for real types to arrive and then compiles',
      ],
      answer: 0,
      why: 'Ahead-of-time compilation happens at build time, so the shipped binary is already machine code. The price is paid earlier, and the types must be known when building: watching real types arrive is what a JIT does, not an AOT compiler.',
    },
  ],
};

export default lesson;
