import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A flaky test passes and fails on the same code; the fix is to find what it depends on that you don\'t control (timing, order, the clock, randomness) and control it, not to re-run until it goes green.',
    what: 'Most flakiness comes from a handful of sources: sleeping instead of waiting for async work, tests sharing mutable state while the runner shuffles their order, reading the real clock, and unseeded randomness. Some intermittent failures are real bugs, like a race in the code under test. Retries can turn the build green but hide both kinds (and cannot rescue state that tests share), so the honest tools are fixing the dependency, recording a seed so a failure can be replayed, and quarantining a known-flaky test with an owner while it gets fixed.',
    analogy: 'A smoke alarm that goes off at random: pressing snooze every time quiets it, but the one time there is real smoke, you snooze that too.',
    useCases: [
      'Jest, pytest and RSpec printing a seed for random test order so a failing order can be rerun',
      'CI dashboards that track each test\'s failure rate and auto-quarantine the worst offenders',
      'Replacing setTimeout-based waits with awaited promises or polling helpers like waitFor',
      'Injecting a fake clock (Jest\'s fake timers, Sinon) instead of reading Date.now() in tests',
    ],
    why: 'Large suites run thousands of tests, so even rare flakes can make most builds red (the arithmetic is in `probability-basics`). Once a team learns to re-run red builds, real failures get re-run too. Knowing the usual sources lets you fix a flaky test in minutes instead of adding a retry, and the real race here builds on `race-conditions`.',
    watch: 'Each square in the 10×10 grid is one run of the suite: green passed first time, orange went green only after a retry, red failed, grey outline not run yet. A yellow ring marks the run you clicked, and a ! marks a run where the real race tripped but nothing reported it. In the suite list a fix chip turns green when it\'s on, and a quarantined test\'s card goes dashed and dim with a grey owner tag. The console prints that run\'s tests: green ✓ passed, orange ↻ passed on a retry, red ✗ failed, grey ◌ quarantined. The green bar under Green runs is the share of runs shown that went green.',
  },
  tryThis: [
    'Press Run ×100 with nothing fixed, then click a red run and read why it failed.',
    'Turn Retry failed tests on: some red runs turn orange (green after a retry) and Real bugs hidden starts counting, but many stay red: emptyCartTotal shares a dirty cart that no retry can clean.',
    'Fix one source at a time with its chip and watch the same 100 seeds flip from red to green.',
    'Click a red run, then press Replay seed: the same order and the same failure come back.',
    'Fix the other four sources, then quarantine reserveStockTwice: all 100 runs go green, and the ! marks show the real race still tripping.',
  ],
  keyIdeas: [
    'A flaky test depends on something it doesn\'t control: timing, order, shared state, the clock or randomness.',
    'Retries hide failures; they don\'t fix them, and they hide real bugs as well as flakes.',
    'A recorded seed turns "failed once on CI" into a failure you can replay.',
    'Quarantine is a holding pen with an owner and a deadline, not a place to bury tests.',
  ],
  quiz: [
    {
      q: 'CI now retries failed tests up to twice, and the flaky checkout test always ends green. What did the retry do?',
      options: [
        'Hid the failures; whatever causes them, maybe a real bug, is still there',
        'Fixed the flakiness, since the checkout test now ends green every time',
        'Made the test deterministic by giving it three chances to give one answer',
        'Proved the failures were noise, because a real bug would fail every try',
      ],
      answer: 0,
      why: "A retry only re-rolls the dice. The cause is untouched, and a real bug that fails intermittently, like the race in this lesson, passes on a retry too. \"A real bug fails every time\" is the tempting one, and it's false for races and timing bugs.",
    },
    {
      q: 'A suite has 5 independent flaky tests that each fail 2% of runs. About how often is a run red?',
      options: ['About 9.6%', 'About 2%', 'Exactly 10%', 'Under 0.01%'],
      answer: 0,
      why: 'A run is green only if all five pass: 0.98⁵ ≈ 90.4%, so it\'s red 1 − 0.98⁵ ≈ 9.6% of the time. 5 × 2% = 10% double-counts runs where two tests fail at once; 0.02⁵ is the chance all five fail together.',
    },
    {
      q: 'A test passes on its own but fails about half the time in the full suite, which runs in random order. Most likely cause?',
      options: [
        'It depends on state another test leaves behind',
        "The random order feature has a bug of its own",
        'The machine runs slower when the whole suite runs',
        'Random order makes every assertion less strict',
      ],
      answer: 0,
      why: "Passing alone and failing with others points at shared state: here applyCoupon leaves an item in a shared cart, and emptyCartTotal fails whenever it runs after it, which is half of all orders. A slow machine would give timing failures, not ones tied to which tests ran first.",
    },
    {
      q: 'A test failed once on CI at 23:41 and passes every time at your desk. What is the best first move?',
      options: [
        "Replay that run's seed with a fake clock pinned to 23:41",
        'Add a retry so the rare failure stops blocking any merges',
        'Delete the test, because it passes every time on your desk',
        'Raise its timeout until it passes on the CI runner as well',
      ],
      answer: 0,
      why: "The time of day is a strong clue, so reproduce it: the seed gives back the test order and seeded data, and a fake clock gives back 23:41. A retry or a bigger timeout hides the failure without explaining it, and a clock bug isn't a slowness problem.",
    },
  ],
};

export default lesson;
