import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Write many fast, precise unit tests, fewer integration tests, and only a handful of slow end-to-end tests: the pyramid keeps a suite quick and trustworthy.',
    what: 'Unit tests check one function or class on its own, in milliseconds. Integration tests check a few real pieces working together, like your API and a database. End-to-end (E2E) tests drive the whole app through a real browser, like a user would. Each step up catches bugs the layer below can\'t see, but costs more time, breaks more often for reasons unrelated to your change (flakiness), and says less about where the bug is.',
    analogy: 'Checking a car: you test each part on the bench (unit), then the engine running on a stand (integration), and only then take a few test drives (E2E). You don\'t find a loose bolt by driving laps.',
    useCases: [
      'Deciding what kind of test a new feature needs',
      'Speeding up a slow CI suite by pushing checks down to cheaper layers',
      'Fixing a flaky suite that people have learned to re-run until it\'s green',
      'Code review: asking whether a bug fix came with a test at the right level',
    ],
    why: 'You\'ll write tests from day one, and where you put them decides whether the suite takes two minutes or twenty and whether a red build means anything. Teams that rely mostly on E2E tests (the ice-cream cone) get slow feedback and red builds that nobody trusts.',
    watch: 'Top left: the suite\'s shape, with E2E on top and unit at the base, each bar sized by its number of tests. Top right: three planted bugs and whether this suite has tests in the layer that catches each one (green) or lets it slip through (red). In the run, every square is one test: an outlined square hasn\'t run yet, light blue (sky) is a passed unit test, cyan a passed integration test, violet a passed E2E test, yellow a flaky failure, and red a real failure. The thin bar under each lane fills as that layer\'s time elapses over a dark track, so slow E2E tests visibly take longest. At the bottom, a picked layer turns green when it\'s right and red when it isn\'t.',
  },
  tryThis: [
    'Press Run the suite on the Pyramid, then on the Ice-cream cone: compare the time and the P(green).',
    'Run the Ice-cream cone a few times without planting a bug: some runs go red anyway.',
    'Plant a Logic bug and drag Unit tests to 0: it now slips through the layer meant to catch it.',
    'Slide E2E tests up one at a time and watch P(green) fall.',
    'Sort the six scenarios in "What should this test be?".',
  ],
  keyIdeas: [
    'Unit tests are fast, deterministic and precise; E2E tests are slow, flaky and vague about where the bug is.',
    'P(green) = Π(1 − pᵢ): every flaky test multiplies in, so many E2E tests make red builds routine.',
    'Push each check down to the cheapest layer that can see the bug.',
    'Keep a few E2E tests for the critical user journeys; they catch what nothing else can.',
  ],
  quiz: [
    {
      q: 'Your team writes mostly E2E tests because "they test what users actually do". What\'s the likely result?',
      options: [
        'A slow suite with flaky failures people ignore',
        'The best coverage you can get from any suite',
        'Faster CI, because there are fewer tests',
        'No real change to speed or reliability',
      ],
      answer: 0,
      why: "That's the ice-cream cone. E2E tests are valuable, but each one is slow and a little flaky, and the flakiness multiplies across the suite: red builds become noise.",
    },
    {
      q: 'Each of 50 E2E tests independently flakes 1.5% of the time. Roughly how often is the suite green when nothing is broken?',
      options: ['About 98.5%', 'About 75%', 'About 47%', 'About 25%'],
      answer: 2,
      why: "P(green) = 0.985⁵⁰ ≈ 0.47. The chances multiply rather than staying at one test's 98.5%, so less than half of your runs are green on code that works.",
    },
    {
      q: 'A function that computes a discount returns the wrong value for a 0.5% rate. Which test should catch it?',
      options: [
        'A unit test of that function',
        'An end-to-end checkout test',
        'A load test of the checkout',
        'A manual QA pass before release',
      ],
      answer: 0,
      why: "It's pure logic in one function: a unit test runs in milliseconds and points straight at the culprit. An E2E test might notice, but slowly and without saying where.",
    },
  ],
};

export default lesson;
