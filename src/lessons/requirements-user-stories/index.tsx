import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A request isn\'t ready to build until everyone agrees what "done" means: a user story plus acceptance criteria that can be tested.',
    what: 'A user story says who wants what and why: "As a …, I want …, so that …". Acceptance criteria pin down the behaviour in Given / When / Then form, one concrete scenario each, so they turn straight into tests. Refinement is asking the questions that turn a vague sentence into those criteria, and writing down what is explicitly out of scope, before anyone writes code.',
    analogy: 'Ordering a cake by saying "make me a cake" versus agreeing the size, flavour, allergies and pickup time. The baker can only hit a target you\'ve described.',
    useCases: [
      'Backlog refinement and sprint planning: deciding if a ticket is ready',
      'Writing a ticket\'s description so a reviewer knows what to check',
      'Turning criteria into automated tests (Cucumber, Playwright, unit tests)',
      'Pushing back on scope creep: "that\'s out of scope for this story"',
    ],
    why: 'As a junior you\'ll often be the one asking "what happens if…?". Requirements aren\'t only the product manager\'s job: the engineer who asks the right question in a 10-minute refinement saves days of rework after the demo.',
    watch: 'In "Refine the story", the request sits in the middle with red bubbles orbiting it: each is an open question. The meter above shows how much ambiguity is left (red, then yellow, then green). Each clarifying question is a button; the one you just asked gets a yellow outline, asked material questions turn green ("→ criterion") or grey ("→ out of scope"), and irrelevant ones fade ("no effect"). On the right, criteria appear in Given / When / Then with green keywords (the newest one highlighted), out-of-scope lines are grey, and each criterion becomes a blue test chip. When nothing is left, the finished story and its definition of done appear. In "What if we skip this?", the blue bar is the build, each red block is rework from a question nobody asked, and the violet block on the lower bar is the half-day of refinement.',
  },
  tryThis: [
    'Ask "Which font should the email use?" and watch the meter: it doesn\'t move.',
    'Ask "What if the email isn\'t registered?" and read the criterion it creates. Why is the message the same for real and fake accounts?',
    'Get the meter to 0% and compare the number of criteria with the number of tests.',
    'Switch to "What if we skip this?" and play it: how many days does skipping refinement cost?',
  ],
  keyIdeas: [
    'A user story: As a [who], I want [what], so that [why].',
    'Acceptance criteria are concrete Given / When / Then scenarios, and each one becomes a test.',
    'Saying what\'s out of scope is as important as saying what\'s in.',
    'Asking questions before building is cheaper than finding the answers at the demo.',
  ],
  quiz: [
    {
      q: 'Who is responsible for spotting gaps in a requirement?',
      options: [
        'Only the product manager',
        'Everyone on the team, including the engineers who will build it',
        'Only QA, after it\'s built',
        'Nobody: you find out at the demo',
      ],
      answer: 1,
      why: 'Engineers know the edge cases (expired links, spam, other sessions). Asking during refinement is far cheaper than reworking after the demo.',
    },
    {
      q: 'Which acceptance criterion is testable?',
      options: [
        'The reset page should be fast and user-friendly',
        'Given I requested a reset 61 minutes ago, when I open the link, then I see "This link has expired"',
        'Password reset should work properly',
        'Users should be happy with the reset flow',
      ],
      answer: 1,
      why: 'It names the situation, the action and an observable result. "Fast", "user-friendly" and "properly" can\'t be checked.',
    },
    {
      q: 'A stakeholder asks for SMS reset in the same story. What\'s a good response?',
      options: [
        'Quietly add it to the current work',
        'Record it as out of scope for this story and raise it as its own story',
        'Ignore it',
        'Rewrite the whole login page',
      ],
      answer: 1,
      why: 'Writing scope down keeps the story small and makes the trade-off visible instead of silently growing the work.',
    },
  ],
};

export default lesson;
