import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Debt is fine; unpriced debt isn't. A shortcut buys speed today and charges interest wherever people keep working, so the decision is about where the interest is and how long you will pay it.",
    what: "You run a toy team over 24 sprints and see debt tax its velocity, then compare paying it down with ignoring it. Next you price six invented debts by fix cost, how often the team touches them and the days lost each time, and see that the biggest pain and the best return are different orders. Last you sort six invented scenarios into a four-box quadrant that is one person's framework, and see where the lesson's own key is only opinion.",
    analogy: 'Like a loan: the principal is what it costs to fix, the interest is the extra effort every time you work there, and a loan on something you never use costs nothing.',
    useCases: [
      'Arguing for a refactoring week with weeks of lost engineering instead of "the code is ugly"',
      'Choosing which of ten known problems to fix first by payback rather than by annoyance',
      'Taking a shortcut on purpose before a launch, writing down what it costs and when to revisit it',
      'Deciding to leave an ugly module alone because nobody has to touch it',
    ],
    why: 'Senior engineers are asked which debt to pay and which to carry, usually by people who think in time and money. Pricing the debt, with its assumptions visible, is what turns a complaint into a decision.',
    watch: 'On the Interest scene, the blue line is velocity, the red area is the debt stock, the green line is cumulative features with your paydown and the dashed grey line is the same team with no paydown; a yellow vertical line marks the sprint where green overtakes grey. On Price your debt, plain coloured dots tell the six items apart, the selected row is outlined in yellow, items to leave alone fade to grey, and red marks days of interest lost. On Classify, the four boxes are plain colours (orange, amber, pink, sky), a card that matches the key is green, one that does not is red, and an arguable card also shows both of its accepted boxes in violet. Grey dashed chips say what is a toy, invented or from memory; the solid-bordered labels say how much weight a claim can bear.',
  },
  tryThis: [
    'On the Interest scene, drag Interest per sprint from its default of 10% down to 1%: the yellow break-even line vanishes and the caption says paying down has not paid for itself within the horizon.',
    'On the Interest scene, pick the 12 sprints Horizon: at the default plan the break-even line goes away, because the payoff comes after sprint 12. Pick 24 to bring it back.',
    'On the Interest scene, switch Team habit to Rush when behind: the paying team keeps taking extra shortcuts, finishes with more debt than a steady team and does not overtake the dashed line.',
    'On Price your debt, compare the two ranked lists: the Order module is the biggest pain but not the best return. Then select the report generator, which costs 12 days to fix and has zero touches: its payback reads never.',
    'On Classify the debt, place the library card in either inadvertent box and press Check: it matches the key either way, and both accepted boxes show in violet.',
  ],
  keyIdeas: [
    'Debt is a price tag, not a sin: a shortcut can be the right call when the horizon is short, and the trouble starts when nobody has priced it.',
    'Interest is paid where people work. In this model an item nobody touches has no interest and a payback of never, so a rough corner nobody visits can wait, though untouched code can still carry risks the model leaves out.',
    'The biggest pain and the best return are different rankings: divide the fix cost by the monthly interest to see which fix pays for itself first.',
    'Interest rates and quadrant boxes are estimates and views. Label which one you are giving, and say it in the units the decider uses, such as weeks of engineering a quarter.',
  ],
  quiz: [
    {
      q: 'An item takes 12 days to fix, and nobody has worked in its code for a year. What does the register say about it?',
      options: [
        'Its interest is zero and its payback is never, so leave it until someone has to work there',
        'Its interest is small but real, because untidy code costs something on its own account',
        'Its interest equals its fix cost, so it pays back as soon as the next month ends',
        'Its interest depends on the fix cost, so it pays back in twelve months',
      ],
      answer: 0,
      why: 'Interest is touches times extra days per touch. In this model zero touches means zero interest, and a fix that saves nothing has no payback, however ugly the code is.',
    },
    {
      q: 'In the toy model, interest is 1% and the horizon is short. What does a team that spends capacity on paydown get?',
      options: [
        'More features, because any paydown is an investment that repays itself',
        'The same features, because the interest saved cancels the capacity spent',
        'Fewer features: the interest it saves is smaller than the capacity it spends',
        'A break-even sprint that arrives sooner as the horizon gets shorter',
      ],
      answer: 2,
      why: 'At 1% each point of debt costs a hundredth of a point of velocity per sprint, so paying it off takes about a hundred sprints to return what it costs. That is why debt can be the right call.',
    },
    {
      q: 'Item A loses 9 days a month and takes 40 days to fix. Item B loses 4 days a month and takes 8 days to fix. Which pays back first?',
      options: [
        'Item A, because it hurts the most every month',
        'Item B, in 2 months against about 4.4 for A, even though A hurts more',
        'Neither, because payback only exists for items with a fix cost under a week',
        'Both at once, because they are in the same codebase and share interest',
      ],
      answer: 1,
      why: 'Payback is fix cost divided by monthly interest: 8 over 4 is 2 months and 40 over 9 is about 4.4. Pain and return are different rankings.',
    },
    {
      q: 'A team ships a simple version on purpose, writes down what it will cost and sets a date to decide again. Where does it sit in the quadrant?',
      options: [
        'Deliberate and reckless, because any shortcut ignores future cost',
        'Inadvertent and prudent, because careful teams plan for what they did not know',
        'Deliberate and prudent: chosen on purpose, with the cost written down',
        'Outside the quadrant, because a planned shortcut is not debt at all',
      ],
      answer: 2,
      why: 'Deliberate asks whether anyone chose it, and prudent asks whether the choice weighed its cost. The quadrant is one view, and this key is the lesson’s own opinion.',
    },
  ],
};

export default lesson;
