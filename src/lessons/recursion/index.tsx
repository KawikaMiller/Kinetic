import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Recursion is a function solving a problem by calling itself on a smaller version of it, until it reaches a case small enough to answer directly.",
    what: "Every recursive function has two parts: a base case that returns an answer outright, and a recursive case that shrinks the problem and calls itself. Each call gets its own frame on the call stack holding its arguments and local variables. Calls pile up until one hits the base case, then the stack unwinds and each frame combines the answer it gets back.",
    analogy: "Russian nesting dolls: to find the smallest doll, open the doll in front of you and repeat on the one inside, until a doll doesn't open. That solid doll is your base case.",
    useCases: [
      "Walking trees and nested data: file systems, the DOM, JSON, org charts",
      "Divide-and-conquer algorithms like merge sort, quicksort and binary search",
      "Parsers and compilers, where grammars are naturally recursive",
      "Backtracking searches: sudoku solvers, permutations, maze solving",
    ],
    why: "Recursion is how you think about anything shaped like a tree, and the call stack is how every function call in every language actually works. Knowing it explains stack traces, stack overflows and why deep recursion can crash a program, and it's the doorway to dynamic programming.",
    watch: "On the left, the highlighted line of code is what's running. On the right is the call stack, newest frame on top: yellow is running now, violet frames are waiting on the call above them, green is the base case, and the blue ↓ chip is a return value flowing down to its caller. In the fib tree, yellow is the call running now, violet is the rest of the call stack, green calls have returned, and red calls are repeated work.",
  },
  tryThis: [
    'Play factorial(4) and watch four frames stack up, then collapse as the answers flow back down.',
    'Pick "Remove it 💣" and press play: with no base case the stack grows until it overflows.',
    'Set sum(list) to length 0. The very first call is already the base case.',
    'Switch to the fib(n) tree at n = 6 and count the red calls: the same subproblems, solved over and over.',
  ],
  keyIdeas: [
    'Base case + recursive case. Every recursive call must move toward the base case.',
    'Each call gets its own stack frame; depth n means n frames of memory.',
    'No base case (or one you never reach) means a stack overflow.',
    'Naive fib recomputes the same subproblems: exponential calls. Caching them is dynamic programming.',
  ],
  quiz: [
    {
      q: 'What stops a recursive function from calling itself forever?',
      options: ['The call stack', 'The base case', 'The return statement', 'The compiler'],
      answer: 1,
      why: 'The base case answers directly without recursing, so the calls stop there and the stack can unwind.',
    },
    {
      q: 'factorial(5) implemented recursively will have at most how many of its frames on the stack at once?',
      options: ['1', '2', '5', '120'],
      answer: 2,
      why: 'factorial(5) → (4) → (3) → (2) → (1): five frames are waiting at the deepest point.',
    },
    {
      q: 'Why is naive recursive fib(40) so slow?',
      options: [
        'Recursion is always slow',
        'The call stack is too small',
        'It recomputes the same fib(k) values an exponential number of times',
        'Addition is expensive',
      ],
      answer: 2,
      why: 'fib(n-1) and fib(n-2) overlap heavily, so the same subproblems are solved again and again. Memoizing each result makes it linear.',
    },
  ],
};

export default lesson;
