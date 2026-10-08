import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: '`await` pauses only the async function it is in: the function\'s state is parked, the thread goes back to other work, and the function resumes as a microtask once the promise settles. Start independent work before awaiting it, and pick the combinator whose failure rule you want.',
    what: 'An async function is a coroutine compiled into a state machine: its locals live in a frame object on the heap, each await saves which state to resume in, and the continuation is registered on the promise. Awaiting three requests one after another adds their times; starting all three first and then awaiting (or using Promise.all) takes as long as the slowest. Promise.all rejects on the first rejection, allSettled always fulfils with every status, race settles with whichever settles first, and any fulfils with the first success or rejects with an AggregateError. None of them cancels the other work; an AbortController does that.',
    analogy: 'A chef who puts three pots on at once and checks each when its timer rings, instead of standing over the first pot until it boils before even filling the second. Writing a bookmark into the recipe at every "wait for the timer" is the state machine.',
    useCases: [
      'Cutting page or API latency by running independent requests in parallel instead of in sequence',
      'Choosing between Promise.all and allSettled when one of several requests can fail',
      'Tracking down "unhandled promise rejection" warnings and errors that try/catch didn\'t catch',
      'Understanding what a profiler shows for code that is suspended at an await',
    ],
    why: 'Async code is everywhere in JavaScript, Python, C# and Kotlin, and its classic bugs are quiet: needless sequential awaits that double latency, a forEach that doesn\'t wait, errors that escape try/catch. Knowing that await suspends the function, not the thread, explains all of them. It builds on `event-loop` (continuations run as microtasks), `error-handling-models` and `closures-scope`.',
    watch: 'Request bars are blue on the timelines; when load() is suspended at an await its lane shows a grey dashed bar, and the yellow line is now (with the await it is waiting at highlighted in the code). The Total stat is green when it equals the slowest request and red when it is the sum. In Combinators, a request\'s bar gets a green outline when it fulfils and a red one when it rejects; after the chosen combinator settles, requests still running are dim with that outline, and the marker is green or red for how the combinator settled, as in the table. In State machine, the yellow lines are what runs (or where checkout() is parked), the call stack shows the running frame in yellow, the parked frame object is a violet box, and printed lines are green. In Pitfalls, the buggy line is tinted red, the fix\'s lines green, and an unhandled rejection is a red console line.',
  },
  tryThis: [
    'On Sequential vs parallel, play await one by one (1000 ms), then Promise.all (500 ms): the bars move from end to end to side by side.',
    'Pick start all, then await: still 500 ms, because the requests started before the first await.',
    'In Combinators, make b reject at 100 ms: Promise.all rejects at 100 while a and c keep running, dim; switch to allSettled.',
    'Set all three to reject and pick Promise.any: it rejects only at the last one, with an AggregateError.',
    'Step through State machine: after the first await, checkout() leaves the call stack and only its violet frame object remains.',
  ],
  keyIdeas: [
    'await suspends the async function and lets the thread run other code; it resumes as a microtask.',
    'Start independent work first, then await: sequential awaits add up, parallel ones take the slowest.',
    'Promise.all fails fast but cancels nothing; use AbortController to actually stop the other work.',
    'An async function is a state machine: locals saved in a heap object, one state per await.',
  ],
  quiz: [
    {
      q: 'While an async function is waiting at `await fetch(url)`, what happens to the JavaScript thread?',
      options: [
        'It runs other code until the promise settles',
        'It blocks until the fetch response comes back',
        'It starts a new thread to run the async function',
        'It spins in a loop checking whether fetch is done',
      ],
      answer: 0,
      why: 'await suspends only that function: its state is saved and it leaves the call stack, so the event loop keeps running other code. When the promise settles, the rest of the function runs as a microtask. Nothing blocks and no thread is created.',
    },
    {
      q: 'Three independent requests take 300, 500 and 200 ms. `await a(); await b(); await c();` takes how long?',
      options: ['About 1,000 ms', 'About 500 ms', 'About 300 ms', 'Between 200 and 500 ms'],
      answer: 0,
      why: 'Each await waits for its request before the next one even starts, so the times add up: 300 + 500 + 200. Starting all three first (or Promise.all) takes about 500 ms, the slowest.',
    },
    {
      q: 'Promise.all([a, b, c]) rejects because b failed after 100 ms. What happens to a and c?',
      options: [
        'They keep running; their results are just ignored',
        'They are cancelled the moment b rejects',
        'They are restarted so that all three can retry',
        'They pause until the rejection is caught',
      ],
      answer: 0,
      why: 'Promises are not cancellable: Promise.all just settles early and stops listening. The other requests carry on and use resources. To stop them, give them an AbortController\'s signal and call abort() when one fails.',
    },
    {
      q: 'Which Promise combinator always fulfils, telling you the outcome of every promise?',
      options: ['allSettled', 'all', 'race', 'any'],
      answer: 0,
      why: 'allSettled waits for every promise and fulfils with an array of { status, value | reason }. all rejects on the first failure, race takes the first to settle either way, and any takes the first success (rejecting only if all fail).',
    },
    {
      q: '`try { return load(); } catch (e) { … }` inside an async function, and load() rejects. Why isn\'t the error caught?',
      options: [
        'The promise is returned before it rejects',
        'catch blocks never run in async functions',
        'load() rejects on another thread entirely',
        'try/catch only catches errors from await calls',
      ],
      answer: 0,
      why: 'Without await, return hands back the pending promise and the try block ends at once; the rejection happens later, outside it. `return await load()` keeps the function inside the try until load() settles, so the catch runs.',
    },
  ],
};

export default lesson;
