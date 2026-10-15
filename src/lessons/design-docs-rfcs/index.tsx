import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A design doc is a decision written down before the work: put the ask where a skimmer reaches it, compare the options including doing nothing, and record the decision so a later one can supersede it.',
    what: 'You arrange the nine sections of an invented design doc and watch three simulated readers with different word budgets read it in your order, so you see who never reaches the recommendation. Then you weigh an invented decision across four criteria, add must-have constraints that knock options out, find the weight at which the winner flips, and let the chosen option write a decision record that cannot be edited once accepted. Last, a branching review of your proposal shows every choice with its reason and its cost. The doc, numbers, readers and scenario are all invented, and every claim says whether it is common practice or one view.',
    analogy: 'Like leaving a note on the fridge for the family before a renovation: the note has to say what you want decided and by when at the top, because that is as far as some people read.',
    useCases: [
      'Asking for a decision on a change that touches several teams, in a doc people will actually read',
      'Comparing a cache, a replica and a schema change on stated criteria instead of on whoever argues loudest',
      'Recording why a choice was made so that someone can reverse it later with a new record',
      'Inviting the likely objectors early and writing their dissent into the doc',
    ],
    why: 'At senior level your influence runs through writing: a doc that gets read and decided is how a change moves through an organisation. Knowing what a reader reaches and what a record must keep is a skill you can practise on its own.',
    watch: 'Section chips are plain colours (amber, sky, pink, orange). In the reader table, words read in full are green, a section cut off partway is yellow, and sections not reached are grey; a recommendation no reader reaches is red. The bar above each reader uses the section colours. In the options table the chosen option has a yellow edge, a knocked-out option is faded grey and the constraint it violates is red. In the review, a meter is blue until it crosses its red line and then turns red. Solid-bordered labels say whether a claim is a standard, common practice or one view; dashed chips say what is invented.',
  },
  tryThis: [
    'On Build the doc, the opening order puts the recommendation last, so none of the three readers reaches it. Press top on Recommendation: all three do, and the skimmer still stops inside Context.',
    'On Build the doc, only two of five checks pass at first. Add Do nothing under Alternatives in the doc, type a cost for each alternative, and pick a decision wanted and a date: all five pass.',
    'On Alternatives and the decision, switch on effort ≤ 4 weeks: Denormalise is knocked out in grey, the cache ranks first, and accepting the ADR is refused because its option breaks the constraint.',
    'On Alternatives and the decision, press Accepted, then try to edit the title: it is refused. Press Supersede with a new record to write ADR 2 that links back to ADR 1.',
    'On Your proposal meets review, pick the one-page doc, invite the objectors before circulating, and record the dissent: it is a strong path, and days to a decision is still in the red.',
  ],
  keyIdeas: [
    'A design doc records a decision and its reasons before the work is built; it is not a specification of what was built.',
    'Readers stop early, so the order is part of the message: put the ask where a skimmer still reaches it.',
    'Compare options on stated criteria, include doing nothing, and show what the chosen option costs as well as what it gives.',
    'An accepted decision record is not edited: a later record supersedes it and links back, so the history of what was decided and why stays readable.',
  ],
  quiz: [
    {
      q: 'One reader of your design doc stops after about 150 words. Where does the recommendation belong?',
      options: [
        'Near the top, so even a reader who stops early reaches the decision you want',
        'At the end, so the conclusion follows from the reasoning that came before it',
        'In an appendix, so the main text stays neutral about what you prefer',
        'In the middle, between the problem and the proposal, where it feels natural',
      ],
      answer: 0,
      why: 'Readers spend a budget of words in order. Putting the ask where the shortest budget still reaches it is common advice, and the simulated readers show what a late ask costs.',
    },
    {
      q: 'An ADR was accepted last quarter and the decision has now been reversed. What do you do?',
      options: [
        'Edit the accepted ADR so that it shows the new decision from now on',
        'Delete the old ADR so that nobody follows the decision that was reversed',
        'Write a new ADR that supersedes it and links back to the old one',
        'Leave the ADR alone and mention the change in the team chat thread',
      ],
      answer: 2,
      why: 'The old record says what was decided and why at the time. A new record that supersedes it keeps that history readable and shows what replaced it.',
    },
    {
      q: 'A teammate says a thorough doc is a long doc. What does the reader simulation show?',
      options: [
        'Length is irrelevant, because every reader reads a doc to the end',
        'A long doc can leave the skimmer and approver short of the ask',
        'A short doc is always best, because then every reader gets everything',
        'Only implementers need the doc, so their budget is the one that counts',
      ],
      answer: 1,
      why: 'A doc is read until the reader’s budget runs out. With the ask last, the two readers with short budgets do not reach it, however thorough the sections after it are.',
    },
    {
      q: 'What separates a must-have constraint from a low weight in an options table?',
      options: [
        'A constraint removes an option however well it scores elsewhere, and a low weight only makes a criterion count for less',
        'A constraint changes the scores of the options that remain, while a low weight removes the options that score worst',
        'They are two names for the same thing, since a very low weight also removes an option',
        'A constraint applies to every option equally, while a weight applies to the chosen option only',
      ],
      answer: 0,
      why: 'A constraint is a pass or fail test: an option that breaks it is out. A weight just changes how much a criterion adds to the score of options that are still in.',
    },
  ],
};

export default lesson;
