import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "JavaScript runs on one thread with one call stack. The event loop decides what runs next: all synchronous code first, then every queued microtask, then one macrotask, over and over.",
    what: "Slow things like timers, network requests and clicks are handled by the browser or Node, outside JavaScript. When they finish, their callbacks wait in a queue. Promise callbacks and code after await go into the microtask queue; timers and events go into the macrotask queue. Whenever the call stack is empty, the loop drains the whole microtask queue, then takes one macrotask, and repeats.",
    analogy: "A single chef with one pair of hands. Orders that need the oven go in and come back later with a ding. The chef always finishes the current dish, then clears all the quick garnish jobs (microtasks), then starts the next order ticket (macrotask).",
    useCases: [
      "Predicting the order of logs, timeouts and promise callbacks in JS and Node",
      "Why an unresolved await or a huge loop freezes the whole UI",
      "How Node.js serves thousands of connections on one thread",
      "Debugging \"why does my setTimeout(0) run late?\"",
    ],
    why: "Every JavaScript and Node engineer works on top of the event loop, and many real bugs come from misunderstanding it: frozen UIs, starved timers, surprising orderings in async code. The same single-threaded async model also powers Python's asyncio and many servers.",
    watch: "Yellow is whatever is running now: the highlighted line of code, the top of the call stack, and the outline on the box this step touches. Timers sit in Web APIs (dashed) until they expire. Violet chips are microtasks and blue chips are macrotasks, in queue order from left to right. Green chips in the console are the output, numbered in the order they were printed. In \"Block the loop\", the green dot and the clock are drawn by JavaScript, the blue bar is work done, and the longest pause turns red when it passes 200 ms.",
  },
  tryThis: [
    'Play "Promise vs timeout": the promise logs C before the 0 ms timeout logs B.',
    'In "async / await", notice brew() runs synchronously until the await.',
    'Try "Nested queues": a promise created inside a microtask still runs before the next timer.',
    'Switch to "Block the loop" and compare the frozen clock with the chunked version.',
  ],
  keyIdeas: [
    'One thread, one call stack: long synchronous code blocks everything.',
    'Promise callbacks and code after await run as microtasks.',
    'The whole microtask queue drains before the next macrotask (timer, click, I/O).',
    'setTimeout(fn, 0) means "as soon as the loop is free", not "now".',
  ],
  quiz: [
    {
      q: "What prints? console.log('A'); setTimeout(() => console.log('B'), 0); Promise.resolve().then(() => console.log('C')); console.log('D');",
      options: ['A B C D', 'A D B C', 'A D C B', 'A C D B'],
      answer: 2,
      why: 'Sync code first (A, D), then all microtasks (C), then the next macrotask, the timer (B).',
    },
    {
      q: 'Inside an async function, the code after an await runs…',
      options: [
        'Straight away, on the same tick',
        'As a microtask, after the current code',
        'As a macrotask, after any pending timers',
        'On a separate thread, in parallel',
      ],
      answer: 1,
      why: 'await suspends the function and queues its continuation as a microtask once the awaited value is ready, so it runs before any timer. Nothing in JavaScript runs on another thread unless you start a Worker.',
    },
    {
      q: 'A click handler runs a 2-second synchronous loop. What happens to a 100 ms setTimeout that was due meanwhile?',
      options: [
        'It interrupts the loop when it is due',
        'It runs on a separate timer thread',
        'It waits until the loop has finished',
        'It is cancelled for running late',
      ],
      answer: 2,
      why: 'Callbacks only run when the call stack is empty, so the timer is delayed until the long task ends. The browser keeps the time in the background, but the callback itself still has to run on the one JavaScript thread.',
    },
    {
      q: 'What does setTimeout(fn, 0) actually promise?',
      options: [
        'fn runs before any code that follows it',
        'fn runs after the stack and microtasks clear',
        'fn runs in exactly 0 milliseconds from now',
        'fn runs before any pending promise callbacks',
      ],
      answer: 1,
      why: "Zero is a minimum delay, not a schedule: fn waits for the current code and every queued microtask, then its turn among macrotasks. That is why the promise's C prints before the timeout's B.",
    },
  ],
};

export default lesson;
