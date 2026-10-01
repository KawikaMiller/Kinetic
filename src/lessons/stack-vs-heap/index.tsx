import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Each function call gets a stack frame for its locals, freed the moment it returns. Objects live on the heap, where they stay until nothing can reach them (garbage collection) or until you free them yourself (C).',
    what: "The stack is a tidy pile of frames, one per active call. A frame holds the call's parameters and local variables, and it's thrown away automatically when the function returns, which makes the stack very fast. The heap is a big pool for things that must outlive a single call, like objects, arrays and buffers. In JavaScript, Java or Python, a garbage collector frees heap objects once nothing can reach them. In C you call malloc and free yourself, and getting that wrong gives you leaks, dangling pointers and use-after-free bugs.",
    analogy: 'The stack is a stack of sticky notes on your desk: each task writes on a new note and tears it off when done. The heap is the storage room: things you put there stay until someone clears them out.',
    useCases: [
      'Understanding stack overflow errors from runaway recursion',
      'Memory leaks in long-running servers and apps',
      'Why returning a pointer to a local variable in C or C++ is a bug',
      'Reading heap snapshots and memory profiles in browser dev tools',
    ],
    why: "Juniors meet this as mysterious crashes (\"Maximum call stack size exceeded\"), slowly growing memory, or in C, values that change by themselves. Knowing which memory lives where, and for how long, is what lets you reason about all of them.",
    watch: "The call stack is on the left and grows upward: each box is one call's frame with its locals, and the yellow-outlined frame is the one running. The heap is on the right, with blue blocks placed in no particular order. Violet arrows are pointers or references from a local to a block. Red marks memory bugs: a dashed red arrow is a dangling pointer, a dashed red block is freed, a dashed red frame has returned but something still points into it, and a red block tagged \"leaked\" was never freed and can no longer be reached. In JavaScript mode, a faded dashed block tagged \"collectable\" is unreachable and waiting for the garbage collector. The stack-overflow program draws a red dashed stack limit; when it crashes, every frame is outlined red and the stack shakes.",
  },
  tryThis: [
    'Play "Objects outlive the call": the point survives makePoint returning, then becomes collectable.',
    'Run "Stack overflow" and watch the frames climb to the stack limit.',
    'Switch Memory to C and play "Pointer to a local": the arrow turns red the moment bad() returns.',
    'Play "Memory leak" and watch the Leaked counter reach 3.',
  ],
  keyIdeas: [
    'Locals live in the stack frame and vanish when the function returns.',
    'Objects live on the heap, independent of the function that created them.',
    'Managed languages free heap objects once they are unreachable; C frees them only when you call free.',
    'Leaks, dangling pointers and use-after-free are all heap-lifetime mistakes.',
  ],
  quiz: [
    {
      q: 'function make() { const o = { a: 1 }; return o; } After make() returns, where is the object?',
      options: ["Gone: it was on make's stack frame", 'Still on the heap, because the caller holds a reference to it', "Copied onto the caller's frame", 'In a CPU register'],
      answer: 1,
      why: 'Objects are allocated on the heap, not in the frame. The frame (and the local o) disappear, but the object lives on as long as something can reach it.',
    },
    {
      q: 'Why does infinite recursion crash with a stack overflow?',
      options: ['The heap runs out of objects', 'Each call pushes a frame, and the stack has a fixed size', 'The garbage collector stops it', 'Recursion is not allowed in JavaScript'],
      answer: 1,
      why: 'Every call needs a new frame. Nothing returns, so frames pile up until the fixed-size stack region is full.',
    },
    {
      q: 'In C, what is wrong with returning &x where x is a local variable?',
      options: ['Nothing, it is a common pattern', 'x is copied to the heap automatically', "x lives in the function's frame, which is gone once it returns, so the pointer dangles", 'It leaks memory'],
      answer: 2,
      why: 'The frame is released on return, so the address points at memory that the next call can overwrite: undefined behaviour.',
    },
    {
      q: 'A C function mallocs a buffer, never frees it, and loses the only pointer. What is that called?',
      options: ['A dangling pointer', 'A use-after-free', 'A memory leak', 'A stack overflow'],
      answer: 2,
      why: 'The block is still allocated but nothing can reach it to free it, so the memory is lost for the life of the program: a leak.',
    },
  ],
};

export default lesson;
