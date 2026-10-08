import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Engineers make ethical decisions all the time, usually inside ordinary tasks, and the ACM Code of Ethics puts responsibility on the professional, not only on whoever wrote the spec. There is no score here: you practise reasoning.',
    what: "You play the engineer in four cases: one from history (the Therac-25 radiation-therapy accidents, summarised from Leveson and Turner, 1993) and three fictional ones patterned on common requests (a cancellation flow, collecting data you do not need, shipping with a known accessibility blocker). At each decision point you choose what a responsible engineer would push for and see authored, labelled consequences for users, the team and yourself (written for the lesson, even on the Therac-25 choice that matches history). A second scene is a reasoning exercise: list the stakeholders, look at an option, then look through four lenses (consequences, duties and rights, character, a professional code). The lenses are questions, not formulas, and nothing adds up to a verdict.",
    analogy: 'Like reviewing a design for failure modes before building it: the point is to see more of what the decision touches, not to get a mark.',
    useCases: [
      'Pushing back on a spec with a concrete alternative instead of a flat refusal',
      'Deciding what personal data a feature really needs before you collect it',
      'Raising a known risk, an accessibility blocker, or a reported safety problem and getting it recorded',
      'Using a shared vocabulary (stakeholders, harms, trade-offs, a professional code) in design and incident reviews',
    ],
    why: 'Software now sits inside medicine, money, hiring and daily life, and the people it affects are rarely in the room. Engineers who can name stakeholders and trade-offs, cite a professional code and propose alternatives are the ones who make the risky decisions visible while there is still time to change them.',
    watch: 'The branch map shows every route through a case. The point you are at is a solid yellow box, points you have seen are blue, and routes not yet explored are faded and dashed; seen routes are drawn thick and blue. Outcome cards say in words whether something is harm to users (red), a risk raised and handled (green, only where a risk was actually dealt with), a benefit or a cost saved (grey, including doing nothing) or a trade-off still open (orange). Principle chips are violet and open the ACM Code heading with a one-line paraphrase. In the reasoning exercise, stakeholders are sky-blue chips and options are blue chips: plain categories, not verdicts. Cases 2 to 4 are fictional and their consequences are illustrative, not predictions; case 1 is history.',
  },
  tryThis: [
    "In Therac-25, choose A at all three decision points to reach the end card that summarises what happened, then Start over and choose B at the first decision to compare a what-if.",
    'On the Therac-25 safety-design decision, press the violet principle chip 2.5 Evaluate risks to read the Code heading and a one-line paraphrase. Other decisions cite other principles.',
    "In Dark pattern request, choose A and continue: the branches you looked at turn blue and the rest stay faded. Use Back one step to compare another choice.",
    "In Reason it through, add 'Anyone who could gain access later' to the stakeholders, then switch between the three options and read how the table changes.",
    'In Reason it through, keep one option and click through all four lenses: note where they agree and where they pull apart.',
  ],
  keyIdeas: [
    'Responsibility stays with the professional: following a spec does not remove the duty to think about harm and speak up.',
    'Reason in a structure: stakeholders, possible harms, options, trade-offs. People who are not in the room are still stakeholders.',
    'Consequences, duties and rights, character and a professional code are lenses: questions to reason with, not formulas that output the answer.',
    'Serious failures usually have many causes: design, testing, communication and response to warnings, not one bug or one person.',
  ],
  quiz: [
    {
      q: "A reviewer asks, 'Who is affected, how badly, how likely, and could it be undone?' Which lens is that?",
      options: [
        'The consequentialist lens, which judges options by their effects',
        'The deontological lens, which asks what is owed whatever happens',
        'The virtue lens, which asks what habit an option builds',
        'The professional-code lens, which looks up numbered principles',
      ],
      answer: 0,
      why: "Weighing who is affected, how much, how likely and how reversible is the consequentialist question. The other lenses ask about duties and rights, about character, or about what a professional code requires.",
    },
    {
      q: 'Your team lead says, "The spec is signed off; ethics is not our job." What does the ACM Code of Ethics (2018) say about that?',
      options: [
        'The responsibility rests on the professional, so you still evaluate risks and speak up',
        'Responsibility moves to whoever signed off the spec, so you simply build what is written',
        'Responsibility rests on the company, because individuals cannot change decisions',
        'Responsibility applies only to members who work on safety-critical systems',
      ],
      answer: 0,
      why: 'The Code addresses computing professionals themselves: for example 1.2 asks them to avoid harm and 2.5 to evaluate systems and their risks thoroughly. A signed-off spec does not remove that.',
    },
    {
      q: 'Why does the reasoning exercise show a table of effects with no total row?',
      options: [
        'A count would hide how severe, likely and reversible each effect is',
        'Totals are only meaningful when every effect is measured in money',
        'A total would make the lenses disagree with each other every time',
        'The authored effects are too few for a total to be statistically valid',
      ],
      answer: 0,
      why: 'Three small harms are not equal to one grave one, and the likelihood and reversibility matter. A lens is a way to ask better questions, so the exercise leaves the weighing to the person.',
    },
    {
      q: 'Which statement best matches the published investigation of the Therac-25 accidents (Leveson and Turner, 1993)?',
      options: [
        'The accidents had many contributing causes, including software faults and the lack of independent safeguards',
        'The accidents came from a single operator error that no design could have prevented',
        'The accidents came from one typing mistake in one line of the control software',
        'The accidents came from a mechanical failure of the beam hardware and had nothing to do with the software',
      ],
      answer: 0,
      why: "The investigation described a combination of factors, among them software faults such as a race condition, a design without an independent safeguard, limited testing, unclear errors and a slow response to reports.",
    },
    {
      q: 'In ethical reasoning about a feature, who counts as a stakeholder?',
      options: [
        'Anyone the decision affects, including people who are not in the room',
        'Only the customers who pay for the product and the team building it',
        'Only the people who asked for the feature in the first place',
        'Only the people who could take legal action over the decision',
      ],
      answer: 0,
      why: 'ACM principle 1.1 acknowledges that all people are stakeholders in computing. Counting only the visible parties is how future users and people whose data is held get missed.',
    },
  ],
};

export default lesson;
