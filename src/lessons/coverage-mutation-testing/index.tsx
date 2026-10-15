import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: '100% coverage can still catch 0% of bugs: coverage says which lines ran, mutation testing asks whether a test would notice the code changing.',
    what: 'A tiny shipping-cost function is stored as an expression tree and run by a hand-written evaluator, with no eval. You build a test suite and watch line coverage, branch coverage and a mutation score for the same suite. The tool changes the code one node at a time to make mutants, runs every test against each, and calls a mutant killed if a test fails and survived if none does. Some mutants turn out equivalent: no input tells them from the original, so they are left out of the score.',
    analogy: 'Like checking a smoke alarm by lighting a small fire: walking past it every day (coverage) says nothing about whether it would ring.',
    useCases: [
      'Judging whether a suite with high coverage actually checks anything',
      'Finding the missing assertion behind a surviving mutant, and adding the one test that kills it',
      'Deciding how to afford mutation testing: only covering tests, a sample of mutants, or only changed code',
      'Spotting an approved-snapshot suite that locks in a bug',
    ],
    why: 'Coverage numbers are easy to raise and easy to misread. Knowing what a test suite would catch, and what it would miss, is what makes a green build worth trusting, and it is the question reviewers ask when they see a coverage badge.',
    watch: 'In the printed code, lines that ran are blue and lines no test reached are grey; the token a mutation changed is orange. A killed mutant is green, a survivor is red, and an equivalent mutant is grey because it is ruled out of the score. A yellow box suggests a test that would kill a survivor. On the cost scene, red is the costly side (every mutant against every test) and green the cheaper counts. Dashed grey chips mark what is a toy, from memory, or real, as for the evaluator.',
  },
  tryThis: [
    'At the opening "Just call it" suite, two calls and no assertions give 100% line coverage, 100% branch coverage and a mutation score of 0%.',
    'Press "Small precise suite": it covers the same lines but its four checked cases score 100% once the equivalent mutants are left out.',
    'On Mutants, select M9, the change from weight > 10 to weight >= 10: it is equivalent over the domain, because at weight 10 the extra term is 0, so no test can kill it. M13 is the other equivalent one.',
    'On Mutants, select M12 (weight > 10 becomes weight > 11), which survives the opening suite, and press Add this test: a case at weight 11 is added with exact assertions and M12 dies.',
    'On Coverage lies, press "Approve current output": the suite passes on the off-by-one code and scores 100%, but the snapshot trap panel says three of its expected values are not what cost is meant to return.',
  ],
  keyIdeas: [
    'Coverage says what ran, not what was checked. A suite with no assertions can reach full line and branch coverage.',
    'A mutant is killed when some assertion fails on it and survives when none does. A survivor may be a missing test, or an equivalent mutant that behaves like the code on the whole domain, and those leave the score.',
    'Approving the code’s current output makes a suite that passes today and keeps whatever bugs the code has. A high mutation score on it measures sensitivity to change, not correctness.',
    'Mutants times tests is a lot of runs, so tools cut it: stop at the first failing test, run the tests that reach the mutated code, sample mutants, or run just the mutants in changed code.',
  ],
  quiz: [
    {
      q: 'A suite calls cost twice, asserts nothing, and reports 100% line and 100% branch coverage. What does that show?',
      options: [
        'That each line and branch ran, but not that any result was checked',
        'That the suite would catch a bug introduced in any line of the function',
        'That the function is correct for all of the inputs it was called with',
        'That no mutant of the function could survive when this suite is run',
      ],
      answer: 0,
      why: 'Coverage records execution. With no assertion nothing can fail, so mutants survive however much of the code ran.',
    },
    {
      q: 'The mutant that changes weight > 10 into weight >= 10 survives even the precise suite. What is the likely reason?',
      options: [
        'The suite lacks a test at weight 10, and one more test at the boundary would kill it',
        'It is equivalent: at weight 10 the extra term is 0, so no input tells them apart',
        'The evaluator ran the mutant wrongly, so none of its answers can be trusted',
        'Mutation testing cannot be applied to a comparison operator at all',
      ],
      answer: 1,
      why: 'Both versions return the same value at weight 10, and everywhere else they already agreed. A survivor that no input can kill is not a missing test.',
    },
    {
      q: 'A team approves the code’s current output as its expected values and sees a 100% mutation score. What has that shown?',
      options: [
        'That the code is correct, because every mutant that could die did',
        'That the expected values match the requirements the code was written for',
        'That the suite notices changes to the code as it is, bugs included',
        'That the code has no equivalent mutants left to exclude from the score',
      ],
      answer: 2,
      why: 'The expected values came from the code, so they agree with it by construction. The score measures sensitivity to change; it cannot say whether the original behaviour was right.',
    },
    {
      q: 'Why can a tool skip running a test against a mutant when the test never executes the mutated line?',
      options: [
        'That test is useless, so the tool removes it from the suite',
        'The mutant is probably equivalent, so running it would waste time',
        'The test cannot behave differently, so it cannot be the one that kills it',
        'Tests are meant to cover whole files, so it counts as a failure',
      ],
      answer: 2,
      why: 'A test that does not reach the changed code returns what it returned before. Skipping it saves runs without changing which mutants die.',
    },
  ],
};

export default lesson;
