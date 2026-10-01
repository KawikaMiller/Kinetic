import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Systematic debugging means reproducing the bug, then halving the search space with each check until the cause is cornered, instead of staring at code and guessing.',
    what: "If a value is right going into a stretch of code and wrong coming out, the bug is in that stretch. Checking the middle (a log line, a breakpoint, a test) tells you which half it's in, so each check halves the suspects: 8 components need at most 3 checks, 1,000 need 10. git bisect does the same over history: give it a good and a bad commit and it halves the commits in between until it names the first bad one. Then fix it, and add a test so it never comes back.",
    analogy: 'Finding which bulb kills a string of fairy lights: test the middle of the string, then the middle of the bad half, instead of trying bulbs one by one.',
    useCases: [
      'A wrong total in a checkout flow: log the value between steps to find where it goes wrong',
      'git bisect run with a test script to find which of 200 commits broke the build',
      'Narrowing a production incident to one service, one deploy or one config change',
      'Writing a regression test once the bug is found, so CI catches it next time',
    ],
    why: 'Juniors lose hours re-reading code and changing things at random. A method that halves the problem each step finds bugs in minutes, and "I reproduced it, bisected it to this commit, and added a test" is exactly what a team wants to hear.',
    watch: "In Probe the pipeline, eight components sit in a row. Yellow-highlighted components are still suspects, dimmed ones are ruled out, and the culprit turns red once found (green after you fix it). The circles between components are probes: dashed with a + until you click one, then green with ✓ and the value if it's right there, or red with ✗ if it's already wrong. Probes outside the suspects are faded: they taught nothing. The rail above lights each step of the method: done in green, the current one in yellow. In git bisect, each cell is a commit: the yellow bracket is the suspect range, the yellow lifted cell is the commit being tested, the green and red markers are the known-good and known-bad commits, dimmed cells are ruled out, and the first bad commit turns red at the end. The pipeline's bug and each commit's test result are scripted.",
  },
  tryThis: [
    'Probe the middle gap first, then the middle of whatever is left. Can you always do it in 3?',
    'Probe randomly instead and compare the probe count.',
    'Press Bisect for me and watch the suspect range halve, then press Fix it and Add a regression test.',
    'Show Trap: change two things at once and read the 2.99 x 1 column.',
    'In git bisect, mark one commit the opposite of what the test said and see who gets blamed.',
  ],
  keyIdeas: [
    'Reproduce first: a bug you can trigger on demand is half solved.',
    'Right going in and wrong coming out pins the bug to that stretch; checking the middle halves it.',
    'Halving needs about log₂(N) checks: 8 → 3, 16 → 4, 1,000 → 10. git bisect does it over commits.',
    'Change one thing at a time, and finish with a regression test.',
  ],
  quiz: [
    {
      q: 'A total is wrong. What is the most reliable first move?',
      options: [
        'Reproduce it, then check a value midway through',
        'Read through every component until you spot the bug',
        'Rewrite the component you suspect the most',
        'Wrap every component in a try/catch block',
      ],
      answer: 0,
      why: 'Reading until you spot it is slow and unreliable, and rewriting on a hunch can add bugs. A reproducible case plus a check in the middle halves the suspects every time.',
    },
    {
      q: 'git bisect over 16 commits (first good, last bad). At most how many commits do you test?',
      options: ['16 tests', '8 tests', '4 tests', '1 test'],
      answer: 2,
      why: 'Each test halves the candidates, and in the worst case you keep the bigger half: 15 → 8 → 4 → 2 → 1. That is ceil(log₂ 15) = 4 tests.',
    },
    {
      q: 'You change two things, and the bug is gone. What is the problem?',
      options: [
        "You can't tell which fixed it, or what else broke",
        "Nothing: the bug is gone, so you're done",
        'You should have changed three things at once',
        'Bugs always come back after two changes',
      ],
      answer: 0,
      why: 'The trap table shows it: the real fix plus an unrelated change looks fine on the failing order but breaks another one. Change one thing, then test.',
    },
  ],
};

export default lesson;
