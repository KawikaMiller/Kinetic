import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Readers skim, so put the conclusion and the ask first, say who did what, cut filler, and keep real uncertainty. For a decision, write a recommendation, what it costs and what would change it, not a list of features. Write for the reader in front of you: the same facts look different to an executive, a peer and an on-call engineer.',
    what: 'Three exercises, all on fictional examples. First, a wordy 180-word incident update: apply five edits (conclusion first, cut hedges, name who acted, state the ask, list as bullets) and watch a diff, the word, sentence and grade-level numbers, and where the ask first appears move. Second, a trade-off summary built slot by slot (context, options, recommendation, what we give up, when we would revisit) from sentence chips, set beside a weak version that lists features and never picks. Third, one change written three ways, which you match to an executive, a peer engineer and an on-call SRE, with a table of the details each version kept.',
    analogy: 'Like a function signature: the reader should know what it takes, what it returns and what it costs without reading the body.',
    useCases: [
      'Incident updates, status posts and handover notes that people read in a hurry',
      'Pull request descriptions and commit messages that a reviewer can act on',
      'Decision summaries that name a recommendation, its cost and its trigger to revisit',
      'Explaining one change to different audiences without rewriting the facts',
    ],
    why: 'Most engineering decisions are made by people who did not read every line, and most incidents are shortened or lengthened by how clearly the first message was written. A reader who stops after three sentences should still know what happened, what is needed from them, and by when.',
    watch: 'In the first scene removed words are red and struck through, inserted words are green, and the edit you just applied is the yellow chip. The ask is a blue tag on its line and a blue tick on the attention strip; an orange marker shows where a skimmer is assumed to stop. In the second scene a filled slot has a green outline, a missing slot a red one, and sentences you did not choose fade to grey. In the third, the three readers are amber, pink and sky blue (plain categories, not verdicts), a match that fits is green and one that does not is red. The attention strip is an illustrative model of skimming, not measured from real readers, and grade level uses an approximate syllable count.',
  },
  tryThis: [
    'In Tighten an update, press Conclusion first and read the Ask at word number: it jumps from past the orange skim marker to inside it.',
    'In Tighten an update, apply Cut the hedges: the word count falls (176 to 131 once Conclusion first is on) and the diff strikes through every filler word. Real uncertainty stays.',
    'In Tighten an update, apply List as bullets: sentences go up and words per sentence go down. A formula cannot tell you whether the bullets help the reader.',
    'In Write the trade-off, fill every slot with the first sentence in each, then press Check my summary and read what is missing from the weak ones.',
    'In Three readers, assign Version A to Executive and read why it does not fit, then find the version that does.',
  ],
  keyIdeas: [
    'Put the conclusion and the ask first: a skimming reader may stop after three sentences, and the ask should be inside them.',
    'Cut filler hedges but keep real uncertainty, and use the passive only where the actor does not matter: a hidden owner is a hidden action.',
    'A trade-off summary has a recommendation, a cost and a reason to revisit; a list of features is not one.',
    'The same facts are written differently for an executive, a peer and an on-call engineer: pick the details each needs to act.',
  ],
  quiz: [
    {
      q: 'Why does an incident update put the conclusion and the ask in the first lines?',
      options: [
        'Readers often stop early, so what they must know and do belongs where they will read it',
        'A long update is easier to read when its sections are sorted from most to least important',
        'Putting the conclusion first makes the update shorter by cutting the supporting details',
        'Readers trust a conclusion more when they have not yet seen the evidence behind it',
      ],
      answer: 0,
      why: 'Skimming readers read the start and may stop. Leading with the conclusion and the ask means they still get what they need. It does not remove the details, which follow for anyone who keeps reading.',
    },
    {
      q: 'Which of these hedges should an update usually keep?',
      options: [
        'I think maybe it was kind of the migration',
        'We are still looking into why the lock lasted so long',
        'Basically, it just locked the orders table',
        'Sorry if this is long, but I wanted to mention that',
      ],
      answer: 1,
      why: 'The second line states a real unknown and says what is being done about it. The others are filler: they soften a claim the writer is sure of or apologise for the message.',
    },
    {
      q: 'A trade-off summary lists what Postgres and a document store each offer and ends there. What is it missing?',
      options: [
        'A longer feature list for each option, so the reader can compare them fairly',
        'More hedging, so nobody can hold the author to a wrong prediction',
        'A recommendation, what it costs and what evidence would change the decision',
        'A summary written in the passive voice, so it sounds more neutral and objective',
      ],
      answer: 2,
      why: 'A feature list leaves the decision to the reader. A summary should pick an option, name its cost and say what would make you reconsider, so it can be checked and argued with.',
    },
    {
      q: 'The same rollout is described to an on-call engineer and to an executive. What should the on-call version keep that the executive version can drop?',
      options: [
        'The expected business value of the change over the next quarter',
        'A short, friendly summary of why the team chose this approach',
        'The flag name, the alert to watch and how to undo it quickly',
        'A list of the people who reviewed and approved the pull request',
      ],
      answer: 2,
      why: 'The person who may be paged needs the handles to act: what to watch, which switch to flip and how fast it takes effect. An executive needs the value and the risk, not the switch names.',
    },
    {
      q: 'The tool says an update has a grade level of 7. What can you conclude?',
      options: [
        'The update is clear, because a lower grade level always means clearer writing',
        'Its sentences and words are short by a rough formula, which says nothing about whether it is clear',
        'The update will be understood by readers of any background and any level of expertise',
        'The grade level is accurate to the decimal because it comes from a published formula',
      ],
      answer: 1,
      why: 'Flesch-Kincaid only sees word, sentence and syllable counts, and the syllable count is approximate. Short sentences can still be vague, and a technical term can be exactly right for the reader.',
    },
  ],
};

export default lesson;
