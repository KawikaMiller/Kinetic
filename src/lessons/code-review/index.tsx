import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Code review is a second pair of eyes on behaviour, safety and clarity before a change merges; style is what linters are for.',
    what: 'Before a pull request merges, a teammate reads the diff and leaves comments. Good reviewers look first for things tools can\'t catch: bugs, missing error handling, security leaks, untested behaviour, confusing design. They label how much each comment matters (blocking, suggestion, nit) and write it so the author knows what\'s wrong, why, and what to try, about the code and never the person.',
    analogy: 'Proofreading a friend\'s important email: you point out the wrong date and the missing attachment, not the font.',
    useCases: [
      'Reviewing a teammate\'s pull request on GitHub or GitLab',
      'Getting your own PR through review faster: small, described, self-reviewed',
      'Catching secrets, null checks and off-by-one errors before they ship',
      'Onboarding: reading reviews is how teams pass on their conventions',
    ],
    why: 'You\'ll review and be reviewed from your first week. Reviewers who only flag formatting miss the bugs, and harsh comments make people stop asking for review. Doing it well is one of the fastest ways juniors earn trust.',
    watch: 'Review it yourself: the diff lists each added line with a green +. The line you clicked is yellow. Your comments tint their line and tag it: red for blocking, blue for suggestion, grey for nit (a "noise" tag means it wasn\'t really an issue). After you submit, issues you found turn green, issues you missed turn red, and a yellow tag means you found it but chose the wrong severity; the answer key explains each one. Rewrite a comment: the harsh original sits in red, your pick is yellow, and the four qualities turn green when the rewrite has them. PR size: the blue curve is review time and the green one is defects found per line, in relative units; the dashed yellow line is your PR.',
  },
  tryThis: [
    'In Review it yourself, find the three bugs (one is a security problem), then press Submit review.',
    'Tag only the missing semicolon and submit: see how much a style-only review misses.',
    'In Rewrite a comment, try each option and watch which qualities light up.',
    'In PR size, drag Lines changed past 400 and read what happens to the green curve.',
  ],
  keyIdeas: [
    'Review for behaviour, safety and clarity first: bugs, error handling, secrets, tests, naming.',
    'Leave style to linters and formatters; a human flagging semicolons is noise.',
    'Label severity (blocking, suggestion, nit) and say what, why and how, about the code, not the person.',
    'Small, well-described PRs get faster and better reviews.',
  ],
  quiz: [
    {
      q: 'What\'s the most valuable use of a human reviewer\'s time?',
      options: ['Enforcing brace and quote style', 'Finding bugs, missing error handling and security problems', 'Checking indentation', 'Counting lines of code'],
      answer: 1,
      why: 'Linters and formatters catch style for free and every time. Reviewers are there for what tools can\'t judge: does it work, is it safe, is it clear.',
    },
    {
      q: 'Which comment is most useful?',
      options: [
        '"This is wrong."',
        '"page starts at 1, so page 1 skips 20 orders. Could we use (page - 1) * PAGE_SIZE and add a test?"',
        '"I would never write it like this."',
        '"LGTM"',
      ],
      answer: 1,
      why: 'It says what\'s wrong, why it matters and what to try, and it\'s about the code. The author can act on it without guessing.',
    },
    {
      q: 'A PR changes 1,400 lines across 30 files. What\'s the best reviewer move?',
      options: ['Approve it: it\'s too big to read', 'Skim and approve', 'Ask for it to be split into smaller PRs', 'Only review the first file'],
      answer: 2,
      why: 'Past a few hundred lines, reviewers catch less per line. Smaller PRs get read properly, so asking to split is doing the review job, not dodging it.',
    },
  ],
};

export default lesson;
