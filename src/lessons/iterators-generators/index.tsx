import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An iterator hands out values one at a time through next(); a generator is a function that pauses at each yield, so a pipeline of them only does the work someone actually asks for.',
    what: 'The iterator protocol is small: an object with next() returning { value, done }, optionally return() (to stop early) and throw(). An iterable is anything with [Symbol.iterator]() that gives you a fresh iterator; for…of and spread call it for you. A generator function (function*) builds an iterator out of a pausable function: each next() runs the body until the next yield, and the paused frame waits off the call stack. Chained generators are lazy: take(3) pulls three values through map and filter, and the rest are never computed, which is why an infinite sequence is fine as long as something stops asking. A generator object is single pass: once it has run out, it stays empty.',
    analogy: 'A kitchen that cooks to order instead of preparing the whole menu at opening time. The waiter (take) asks for a dish, the request travels back to the stove, and one plate comes forward. When the last table is served, nothing more gets cooked.',
    useCases: [
      'Reading a big file or log line by line without loading it all into memory',
      'Paging through an API with a generator that fetches the next page only when needed',
      'Infinite or very long sequences: IDs, retries with backoff, simulation ticks',
      'Python, C# (yield return) and Kotlin sequences use the same lazy model',
    ],
    why: 'Lazy pipelines turn a million-row job into a few rows of work, and knowing the protocol explains for…of, spread, destructuring and why a stream can only be read once. Bugs like an empty second loop over a generator, or a frozen tab from spreading an endless one, come straight from it. It contrasts with the eager arrays of `functional-programming`, uses the closures from `closures-scope`, and the pause at yield is the same suspension `async-await-coroutines` builds on.',
    watch:
      'In Eager vs lazy, each lane has four stations, range (grey), map (blue), filter (violet) and take (green), joined by dashed links; the number under each is how many values it handled: orange in the eager lane (the costly side) and green in the lazy lane. In the lazy lane the value moving now is a yellow pill hopping between stations, and a value the filter drops falls away as a grey pill. In The protocol, the line running in the definition and in the caller has a yellow bar; the call stack shows the running frame in yellow and a waiting caller dimmed, and a suspended generator sits in the dashed box below as a dimmed, violet-edged frame, off the stack. Printed results are green (done: true included) and the refused spread prints red. In Single pass, values still to come are blue boxes and consumed ones turn grey and dashed; printed lines are green, an empty second pass red.',
  },
  tryThis: [
    'In Eager vs lazy, play the lazy lane: it stops at 6 pulled from range, while the eager lane did 1,000,000 at every stage.',
    'Set filter to > 50 and take to 5: the lazy lane now pulls 12 values, still nowhere near a million.',
    'In The protocol, step through function*: at each yield the frame leaves the call stack and waits in the dashed box.',
    'Pick naturals() + take and play it, then press Try [...naturals()] to see why the lesson refuses to run that.',
    'In Single pass, compare generator object with iterable class: only one comes back empty the second time.',
  ],
  keyIdeas: [
    'An iterator is just next() returning { value, done }; for…of and spread call [Symbol.iterator]() and then next().',
    'A generator pauses at yield and resumes on the next next(); while paused, its frame is off the stack.',
    'Lazy pipelines do only the work that is pulled: with take, most of it never happens at all.',
    'A generator object is single pass; an iterable that makes a fresh iterator each time can be reused.',
  ],
  quiz: [
    {
      q: '`take(filter(map(range(1, 1_000_000), square), isEven), 3)`, built from generators. How much work does it do?',
      options: [
        'Only the 6 values take needs; the rest are never produced',
        'All 1,000,000 values, just later, when take is finally called',
        'All 1,000,000 values, spread over several event-loop ticks',
        'Half of them, because the filter skips every odd square',
      ],
      answer: 0,
      why: 'take pulls, and each pull travels back to range for exactly one value: 1 to 6 give the squares 4, 16 and 36, and then take stops asking. "The same work, later" is the misconception: the other 999,994 numbers are never created. The filter only ever sees the 6 values that were pulled.',
    },
    {
      q: 'What does calling a `function*` do before the first `next()`?',
      options: [
        'Returns a generator object; none of the body has run yet',
        'Runs the body up to the first yield and stores that value',
        'Runs the whole body at once and buffers every yielded value',
        'Starts the body on a background thread to produce values',
      ],
      answer: 0,
      why: 'The call only creates the generator object with its frame parked before the first line. The first next() starts the body and runs it to the first yield. Nothing is buffered and there is no extra thread: the body runs on the caller\'s thread, a step at a time.',
    },
    {
      q: 'Why does spreading the same generator object a second time give `[]`?',
      options: [
        'It is its own iterator, already at the end, and cannot rewind',
        'Spread clears the generator\'s values after copying them out',
        'The garbage collector freed its values after the first pass',
        'Generators allow spread only once; for…of would still work',
      ],
      answer: 0,
      why: 'A generator object\'s [Symbol.iterator]() returns the object itself, so the second spread continues from where the first stopped: the end. for…of behaves the same. An array, or a class whose [Symbol.iterator] is a generator method, hands out a fresh iterator each time.',
    },
    {
      q: 'A `for…of` over a generator hits `break`. What happens to the generator?',
      options: [
        'for…of calls its return(), so its finally blocks still run',
        'It stays paused forever, and its finally blocks never run',
        'It keeps running in the background until it is exhausted',
        'It throws an error into the loop because it was interrupted',
      ],
      answer: 0,
      why: 'Leaving a for…of early calls the iterator\'s return() method. For a generator that resumes it as if a return were at the paused yield, so finally blocks run: the lesson\'s countdown prints "cleanup". Nothing runs in the background, and no error is thrown.',
    },
    {
      q: 'Where is a suspended generator\'s frame while it waits at `yield`?',
      options: [
        'Off the call stack, saved as an object until the next next()',
        'At the top of the call stack, blocking the code that called it',
        'On its own thread, sleeping until a value is requested',
        'Nowhere: its locals are lost and recomputed on each next()',
      ],
      answer: 0,
      why: 'At a yield the generator\'s frame is removed from the call stack and kept with the generator object, locals included, so the caller carries on. The next next() puts it back on the stack where it left off. That is the same suspension an awaiting async function uses.',
    },
  ],
};

export default lesson;
