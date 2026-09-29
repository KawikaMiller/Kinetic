import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A stack hands back the most recent item first (LIFO); a queue hands back the oldest item first (FIFO). Both add and remove in O(1).",
    what: "A stack only lets you touch the top: push adds, pop removes the newest item. A queue has two ends: enqueue adds at the back, dequeue removes from the front. They're less about storing data and more about the order you process it in.",
    analogy: "Stack: a pile of plates, you always take from the top. Queue: the line at a coffee shop, first come, first served.",
    useCases: [
      "Stack: the call stack, undo/redo, the browser Back button, matching brackets",
      "Queue: job and message queues, print spoolers, requests handled in arrival order",
      "Graph search: breadth-first uses a queue, depth-first uses a stack",
      "Buffers between a fast producer and a slow consumer",
    ],
    why: "They're the building blocks behind recursion, task scheduling and messaging systems. Picking the wrong one changes what your program does, not just how fast it runs. You'll meet both again in almost every later lesson.",
    watch: "The vertical tube is the stack: things enter and leave at the top. The horizontal pipe is the queue: in at the back, out at the front. Follow the guided story first, then switch to Sandbox and push things yourself, including popping an empty one.",
  },
  tryThis: [
    'Play the story. Watch pages leave the stack in reverse order.',
    'Step backwards with ← and watch popped items fly back in.',
    'Switch to Sandbox, push 3 things and pop them. What order do they come out?',
    'Pop an empty stack on purpose to see an underflow.',
  ],
  keyIdeas: [
    'Stack = LIFO: add and remove at the same end (the top).',
    'Queue = FIFO: add at the back, remove from the front.',
    'push, pop, enqueue, dequeue and peek are all O(1).',
    'Stacks: undo, back button, the call stack. Queues: job queues, BFS, buffers.',
  ],
  quiz: [
    {
      q: 'You push A, then B, then C onto a stack and pop once. What comes out?',
      options: ['A', 'B', 'C', 'Nothing, stacks need a peek first'],
      answer: 2,
      why: 'Last in, first out: C went in last, so it comes out first.',
    },
    {
      q: 'Which structure fits "customers served in the order they arrived"?',
      options: ['Stack', 'Queue', 'Either one', 'Neither'],
      answer: 1,
      why: 'Arrival order = first in, first out = queue.',
    },
    {
      q: 'Ctrl+Z (undo) in a text editor is most naturally modelled as…',
      options: ['A queue of edits', 'A stack of edits', 'A sorted array', 'A hash table'],
      answer: 1,
      why: 'Undo reverses the most recent edit first. That is LIFO, so a stack.',
    },
  ],
};

export default lesson;
