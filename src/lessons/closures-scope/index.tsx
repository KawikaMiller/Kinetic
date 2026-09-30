import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A function remembers the environment it was created in. It can read and change those variables later, even after the outer function has returned.',
    what: "Every function call, and every block with let or const, gets an environment: a record of its variables with a link to the environment around it. To look up a name, JavaScript checks the current environment, then follows the outer links until it finds it. A function object keeps a reference to the environment it was created in, so those variables stay alive as long as the function does. That's a closure. It captures the variable itself (the binding), not a copy of its value at the time.",
    analogy: "A function is like a letter carrying its return address: wherever it's delivered, it can still write back to the house it came from, and whatever that house looks like now is what it sees.",
    useCases: [
      'Counters, caches and private state without classes (module pattern)',
      'Callbacks and event handlers that remember their context',
      'The classic var-in-a-loop bug with setTimeout',
      'Stale values in React hooks: a handler reading an old render\'s state',
    ],
    why: "Closures are everywhere in JavaScript: callbacks, event handlers, React hooks, module patterns. The var-in-a-loop bug and stale React state both come straight from how scope and closures work, and so does knowing when memory can't be freed because a function still holds it.",
    watch: "Violet boxes are environments: global, each function call, or each loop iteration with let. A dashed grey arrow links each one to its outer (parent) environment, and the tag \"captured\" means a function still holds it. Blue boxes are function objects, and their violet [[Environment]] arrow points at the environment they captured. A blue arrow goes from a variable to the function it holds. During a lookup, the box being checked is ringed in yellow, and the one where the name is found is ringed in green. The orange timer queue holds callbacks waiting to run. A faded, dashed box tagged \"released\" has just become unreachable and is swept away on the next step. The highlighted code line is running, and the console prints output in green.",
  },
  tryThis: [
    'Play "Counter factory": the two counters keep separate environments, #1 and #2.',
    'Play "Loop with var", then "Loop with let": one shared i versus one per iteration.',
    'In "Shadowing", watch the lookup stop at the first x it finds.',
    'Run "Stale closure" to the end: snapshot is old, count is live.',
  ],
  keyIdeas: [
    'Lookup walks outward: this environment first, then each outer one.',
    'A function keeps its creation environment alive: that is a closure.',
    'Closures capture bindings, not values: later changes are visible.',
    'let in a loop makes a new binding per iteration; var shares one.',
  ],
  quiz: [
    {
      q: "let x = 1; const f = () => x; x = 2; What does f() return?",
      options: ['1: the closure copied x when f was created', '2: the closure reads the x binding when it runs', 'undefined', 'It throws'],
      answer: 1,
      why: 'A closure captures the binding, not its value at creation time, so it sees the latest assignment.',
    },
    {
      q: 'for (var i = 0; i < 3; i++) setTimeout(() => console.log(i)); What is printed?',
      options: ['0 1 2', '3 3 3', '0 0 0', 'Nothing'],
      answer: 1,
      why: 'var gives one i for the whole loop. By the time the timers run, the loop has finished and that single i is 3. With let, each iteration gets its own i and it prints 0 1 2.',
    },
    {
      q: 'makeCounter() returns () => ++count. Why does count survive after makeCounter returns?',
      options: ['count is a global', 'The returned function keeps a reference to makeCounter\'s environment', 'JavaScript never frees function variables', 'count is copied into the returned function'],
      answer: 1,
      why: "The function object holds its creation environment, so that environment stays reachable, and count with it, as long as the function exists.",
    },
    {
      q: "let x = 'outer'; function f() { let x = 'inner'; return x; } What does f() return?",
      options: ["'outer'", "'inner'", "'outer inner'", 'It throws: x is declared twice'],
      answer: 1,
      why: "Lookup stops at the nearest binding. f's own x shadows the global one, which is never reached.",
    },
  ],
};

export default lesson;
