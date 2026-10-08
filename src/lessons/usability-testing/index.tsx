import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Watch a handful of real people try real tasks: what they do shows you problems that opinions and surveys never will, and the first few participants find most of the common ones.',
    what: 'A usability test gives participants a task and watches where they hesitate, click the wrong thing, backtrack or give up, ideally while they think aloud. Each problem is found by only some of the participants, so every new participant finds fewer new problems than the last. Nielsen and Landauer modelled this as 1 − (1 − L)ⁿ, where L is the chance that a participant meets a given problem; with their average of 0.31, five participants find about 84% of the problems. Other methods answer other questions: a survey shows what people say, analytics shows what happened but not why, and a moderated test shows why. Leading questions and helping the participant make a test look better than the product is.',
    analogy: 'Watching someone try to open a door. Asking whether the door is easy to open gets a polite "yes". Watching shows them pushing a pull handle, looking round, then asking someone. The second tells you what to fix.',
    useCases: [
      'Finding the confusing button, label or step in a checkout, sign-up or settings flow before launch',
      'Deciding how many participants a round of testing needs, and when another round is worth it',
      'Choosing between a survey, analytics and a moderated test for a given question',
      'Spotting a biased session, such as a participant who was led or helped, before trusting its numbers',
    ],
    why: 'Teams that skip testing ship the confusing button and then read the damage in a funnel report, without knowing why people left. Knowing how few participants find most common problems makes testing cheap enough to do often, and knowing the model is an average keeps you from stopping too early on a rare but costly problem. Accessibility audits are covered in `accessibility`, the laws of how people use interfaces in `usability-laws`, and the statistics of comparing two designs at scale come later with A/B testing. Writing the task as a user story is in `requirements-user-stories`.',
    watch: 'The wireframe is the prototype and the cells behind it tint yellow where clicks landed. The replayed participant\'s path is a blue line, hesitations are yellow dots, and mistakes and backtracks are red. Problems found are green and unfound ones grey. Sessions that a leading question or help contaminated have an orange outline in the table and orange think-aloud lines. In the curve, blue is the model, violet is the same model for these three problems, and green dots are what this test found.',
  },
  tryThis: [
    'In Sessions, press play with Replay P1. Where does P1 hesitate, what do they say, and how much longer than the 19 s of a participant who meets no problem?',
    'With 5 participants, which of the three problems are found? Then open How many users: after how many participants is the third one found, and why so late?',
    'Back in Sessions, turn on Leading questions, then reset it and turn on Helping the participant. How does Bought the mug change, and which rows are flagged?',
    'In How many users, drag L from 0.31 down to 0.10. How many participants does the model now need to reach 85%?',
    'In Which method, step through Survey, Analytics and Moderated test. Which one tells you why people typed a card number into the coupon box?',
  ],
  keyIdeas: [
    'What people do beats what they say: watch them attempt a real task and listen to them think aloud.',
    'Each new participant finds fewer new problems: 1 − (1 − L)ⁿ, with L around 0.31 on average, so five participants find about 84%.',
    'That 31% is an average, not a law: a problem met by 1 user in 10 usually needs many more participants, or another round.',
    'Leading questions and helping the participant inflate success: flag those sessions and report the unbiased ones separately.',
  ],
  quiz: [
    {
      q: 'A famous result says five participants find about 85% of usability problems. What does that figure assume?',
      options: [
        'Each problem is met by about 31% of participants',
        'Five participants are enough for any product and any task',
        'Every participant finds exactly 85% of the problems',
        'All problems are found by the same five participants',
      ],
      answer: 0,
      why: 'The formula 1 − (1 − L)ⁿ with L = 0.31 gives about 84% at five. L is an average that varies a lot by product and task, so it is a rule of thumb, not a promise, and rare problems need more people.',
    },
    {
      q: 'A facilitator asks "Isn\'t this easy?" after every task. What does it do to the test?',
      options: [
        'It nudges answers positive, so success looks higher than it is',
        'It speeds sessions up without changing what you learn',
        'It makes participants think aloud more honestly than before',
        'It only matters in surveys, not in moderated sessions',
      ],
      answer: 0,
      why: 'People tend to agree with the person watching them. A leading question hides hesitation and gives politeness instead of observation, which is why such sessions are flagged and reported apart.',
    },
    {
      q: 'Analytics shows that 40% of visitors leave at the payment step. What does a moderated test add?',
      options: [
        'The reason people stop: what they were trying to do',
        'A more exact percentage than analytics could give',
        'A larger sample than the analytics tool could ever have',
        'Proof that the page layout alone caused it',
      ],
      answer: 0,
      why: 'Analytics counts what happened for many users but cannot say why. Watching a few people think aloud shows the reason, though not how common it is.',
    },
    {
      q: 'Only 1 user in 10 meets a particular problem. What does a five-person test do with it?',
      options: [
        'It will probably miss it, so you need more users or a second round',
        'It will find it, because five users find 85% of problems',
        'It finds it once any participant gives up on the task',
        'It finds it whenever a survey is run after the test',
      ],
      answer: 0,
      why: 'Five participants each have a 10% chance of meeting it, so the chance that nobody does is about 59%. Rare problems need many more participants, or another round after fixing the common ones.',
    },
  ],
};

export default lesson;
