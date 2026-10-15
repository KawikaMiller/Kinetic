import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { call, engineAdd, engineSum, importInstance } from './engine';
import { OPERATORS, SUM_ARRAY_BYTES, ADD_BYTES, SUM_BYTES, IMPORT_BYTES } from './modules';
import { importsFor } from './imports';
import { makeWorld, PAGE_BYTES, sumArray } from './memory';

const adds = OPERATORS.map((o) => {
  const r = engineAdd(o.id, 7, 3);
  return r.ok ? r.value : NaN;
});
const sum = (n: number) => {
  const r = engineSum(n);
  return r.ok ? r.value : NaN;
};
const world = makeWorld();
const fine = sumArray(world, 0, 8).engine;
const trap = sumArray(world, 65530, 4).engine;
const sizes = [ADD_BYTES, SUM_BYTES, SUM_ARRAY_BYTES, IMPORT_BYTES].map((b) => b.length);
const grown = (() => {
  const w = makeWorld();
  const before = w.memory.buffer.byteLength;
  w.memory.grow(1);
  return { before, detached: w.firstBuffer.byteLength, after: w.memory.buffer.byteLength };
})();
const noEnv = importInstance(importsFor(false, 'env', () => {}));
const noLog = importInstance(importsFor(false, 'log', () => {}));
const withLog = importInstance(importsFor(true, 'env', () => {}));
const divTrap = withLog.ok ? call(withLog.instance, 'div', 1, 0) : null;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'WebAssembly is a compact binary format for a small stack machine: here a few hand-assembled modules run in your browser’s own engine, which is the judge.',
    what: `You change one operator byte in a ${sizes[0]}-byte add module and the real engine's answer changes, step a ${sizes[1]}-byte sum function through a small interpreter and compare it with the engine, move a pointer and a length over linear memory until the engine traps, and hand a module an import or withhold it. The modules were assembled by hand, and the compile step from C or Rust is shown, not run.`,
    analogy: 'Like a sealed shipping container with a manifest: the engine checks the manifest, the container can only use the doors the port opens for it, and it cannot wander off through the rest of the port.',
    useCases: [
      'Understanding what a .wasm file is when a build tool or a library hands you one',
      'Reasoning about the cost and the limits of calling between JavaScript and WebAssembly',
      'Knowing why a module needs its imports, and what that means for sandboxing plugins',
      'Reading an out-of-bounds or divide-by-zero trap from a module without guessing',
    ],
    why: 'WebAssembly turns up in browsers, build tools and plugin systems. Knowing that it is a validated stack machine with its own memory and only the imports it is given explains both what it can do and why it is not a way around the sandbox.',
    watch: 'In the byte grid each section of the module has its own hue, named in the key under the grid (the colours are only labels), and the ringed yellow byte is the operator you can change. The instruction about to run is yellow, the top of the stack blue, and the engine’s real answer green. A trap is red and a missing import orange: it is refused when linking, which is not a crash. The memory the call reads is tinted blue, and a detached buffer is grey.',
  },
  tryThis: [
    `On From source to bytes, the add module is ${sizes[0]} bytes and the real engine says add(7, 3) = ${adds[0]}. Press i32.sub: the ringed byte changes from 0x6a to 0x6b and the engine says ${adds[1]}; i32.mul gives ${adds[2]}.`,
    `On A stack machine, stepped, press play on sum(5): the stack and the locals move one instruction at a time and the function returns ${sum(5)}, the same as the real engine. Drag n to 10: ${sum(10)}.`,
    `On The boundary, ptr 0 and len 8 sum to ${fine.ok ? fine.value : '?'}. Press ptr 65530, len 4: the engine traps with a ${trap.ok ? 'value' : trap.errorClass}, because the read runs past the ${PAGE_BYTES.toLocaleString('en-US')} bytes of memory.`,
    `Press Grow memory by one page: the first view’s byteLength reads ${grown.detached}, because it is detached, and memory is now ${grown.after.toLocaleString('en-US')} bytes.`,
    `On What the module may touch, it cannot be created while env.log is withheld: ${noEnv.ok ? 'it works' : noEnv.errorClass} when the whole env object is missing and ${noLog.ok ? 'it works' : noLog.errorClass} when only log is. Hand it over, press run(42), then div(1, 0): the engine traps with a ${divTrap && !divTrap.ok ? divTrap.errorClass : '?'}.`,
  ],
  keyIdeas: [
    'WebAssembly is a compact binary format for a stack machine: a compiler emits it, and the engine validates it before running a single instruction.',
    'Linear memory is a resizable array of bytes shared with JavaScript: just numbers cross a call, and growing memory detaches the old ArrayBuffer view.',
    'A module reaches the page, the network or files through the imports the host hands it and by no other route, and a missing import is refused when linking.',
    'WebAssembly is not automatically faster than JavaScript: that depends on the workload, and this lesson measures nothing.',
  ],
  quiz: [
    {
      q: 'A module has no imports at all. What can it do to the page?',
      options: [
        'It can read the DOM and change the page, because it runs in the same tab as the page',
        'It can compute on its own memory and arguments, but it has no way to reach the DOM',
        'It can send requests, because the engine runs it with the same permissions as the page',
        'It can read local files, since the engine gives every module a file system to use',
      ],
      answer: 1,
      why: 'A module reaches the outside through the imports it declares, and the host chooses what they are. With none, it can compute and trap, and that is the extent of it.',
    },
    {
      q: 'Is WebAssembly just faster JavaScript?',
      options: [
        'Yes: it is JavaScript that has been compiled ahead of time, so it always wins',
        'It is faster for small functions and slower for large ones, whatever the code does',
        'Not automatically: it depends on the workload and the engine, and this lesson measures no speeds',
        'No: it is slower, because every call has to be translated back into JavaScript',
      ],
      answer: 2,
      why: 'Speed depends on what the code does and how it is run. The lesson makes no timing claim: the numbers on the page are counts, sizes and values, and none is a speed.',
    },
    {
      q: 'JavaScript holds an Int32Array over a module’s memory and then the module grows its memory. What happens to that view?',
      options: [
        'It follows the memory and now sees the extra page as well',
        'It stays valid and keeps showing the old size until it is garbage collected',
        'It is detached: its byteLength reads 0 and a fresh view is needed',
        'It throws a RuntimeError the next time JavaScript writes through it',
      ],
      answer: 2,
      why: `After memory.grow(1) in this lesson the first view's byteLength reads ${grown.detached} while the memory is ${grown.after.toLocaleString('en-US')} bytes (it was ${grown.before.toLocaleString('en-US')}).`,
    },
    {
      q: 'sum_array(65530, 4) reads four 32-bit integers in one page of memory. What does the engine do?',
      options: [
        'It sums the four numbers, wrapping around to the start of memory at the end',
        'It reads zeros for the bytes past the end and returns the sum of what it read',
        'It returns -1 to say that the read did not fit in the memory it has',
        'It traps with a RuntimeError, because the second read ends past the last byte',
      ],
      answer: 3,
      why: `The second integer would sit at bytes 65534 to 65537 and memory ends at byte ${PAGE_BYTES - 1}, so the engine traps (${trap.ok ? 'no trap?' : trap.errorClass}) instead of reading past the end.`,
    },
    {
      q: 'The module imports env.log. What happens if it is instantiated with an env object that has no log?',
      options: [
        'A LinkError: the engine refuses to link it, before any code runs',
        'A TypeError, the same as when there is no env object at all',
        'It instantiates, and the first call to log traps with a RuntimeError',
        'It instantiates with a default log that does nothing at all',
      ],
      answer: 0,
      why: `The engine checks imports when it links. With no env object whatsoever it is a ${noEnv.ok ? '?' : noEnv.errorClass}; with an env that lacks log it is a ${noLog.ok ? '?' : noLog.errorClass}. Either way nothing ran.`,
    },
  ],
};

export default lesson;
