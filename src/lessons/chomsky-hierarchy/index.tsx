import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Languages come in nested classes by the machine they need: a finite automaton, a pushdown automaton, then a Turing machine, and the pumping lemma and DFA minimisation are the two tools for showing a language does not fit a class.',
    what: `Regular languages need only states, context-free languages add one stack, and context-sensitive and beyond need a Turing machine; the classes nest like rings. You place ${F.cardCount} languages in their smallest ring, and a wrong placement is answered with a run: a DFA that counts, a PDA that loses count, or the pumping game. In the pumping game the lesson picks a pumping length p, you pick a string, and it lists every legal split and whether pumping it leaves the language: you win only if no split survives. The last scene minimises a DFA by partition refinement and shows why the prefixes of aⁿbⁿ force a DFA to grow without end. The machines are the lesson's own toys; the class facts are textbook results.`,
    analogy: 'It is a ladder of machines: each rung can do everything the one below can, plus one more kind of memory, and the pumping lemma is the test that says a language is too tall for the rung you are on.',
    useCases: [
      'Knowing which problems a regular expression can solve and which need a parser',
      'Recognising when "match the nested thing" has outgrown a finite state machine',
      'Reading a proof that a language is not regular or not context-free',
      'Seeing why a compiler front end uses a lexer (regular) and then a parser (context-free)',
    ],
    why: 'The hierarchy tells you what a tool can possibly do before you try: a regex cannot match balanced brackets, a context-free parser cannot check that three counts agree, and no program decides every question about programs.',
    watch: 'The rings are plain categories (amber, pink, sky, orange and grey), not verdicts. After Check a card in the right ring is green (--ok) and in a wrong one red (--bad). In the pumping table a split where pumping leaves the language is green (--ok), the learner\'s witness, and a split that survives is red (--bad); the pumped part is bracketed and yellow (--hi). In the minimisation graph a state you selected is yellow, the classes of partition refinement take the plain category colours, and states merged because they are equivalent are violet (--violet).',
  },
  tryThis: [
    `The rings, on the defaults (nothing placed): put aⁿbⁿ under Regular and press Check. The evidence below says: "${F.counterEvidence}"`,
    `The rings, on the defaults: the tester runs the PDA on ${F.testerInput} and says it was accepted (${F.testerDetail}). Pick the ww chip and type abab: the Turing machine accepts it (${F.wwDetail}).`,
    `Pumping game, on the defaults (aⁿbⁿ, regular split rule, p = ${F.p}, s = ${F.openString}): ${F.openSplits} legal splits, and the game is won. Pick the language (ab)*: ${F.abstarSurviving} of the ${F.abstarSplits} splits of ${F.abstarString} survive, so it cannot be won. Pick "equal numbers of a and b" with its (ab)ⁿ string: ${F.poorString} also survives, though that language is not regular.`,
    `Minimise a DFA, on the defaults (counts mod 3 with ${F.mod3States} states): press Refine ${F.mod3Rounds + 1} times (the second press shows the last round). The classes number ${F.mod3Classes}. Select s0 and s3 and press the claim button: they merge. Select s1 and s2 instead: "${F.mod3Separator}" tells them apart.`,
  ],
  keyIdeas: [
    `The rings nest: regular inside context-free inside context-sensitive inside decidable inside recursively enumerable, and a card goes in the smallest ring that holds it (aⁿbⁿ is context-free, aⁿbⁿcⁿ and ww are context-sensitive).`,
    `In the pumping game one failed string proves nothing: ${F.poorString} against equal numbers of a and b leaves a surviving split (y = ${F.poorSurvivingY.join(' or ')}) although the language is not regular, while aⁿbⁿ with p = ${F.p} is won with ${F.openSplits} of ${F.openSplits} splits leaving.`,
    `The pumping lemma is a necessary condition for regular languages: ${F.abstarString} in (ab)* has ${F.abstarSurviving} surviving splits, as the lemma promises, and a language that passes can still be non-regular.`,
    `Partition refinement turns the ${F.mod3States}-state counter into ${F.mod3Classes} classes, and for aⁿbⁿ the prefix classes grow by one with each a added, which is why no DFA recognises it.`,
  ],
  quiz: [
    {
      q: 'A learner picks s = (ab)^p for "equal numbers of a and b", and the pumping game survives. What follows?',
      options: [
        'Nothing: one badly chosen string proves neither regularity nor its absence',
        'The language is regular, because a pumpable string means a loop exists',
        'The language is context-free but not regular, since a survivor shows that',
        'The lemma is wrong for this language, because it promised a string to win',
      ],
      answer: 0,
      why: `A survivor just means this string was a poor choice: ${F.poorString} keeps a split with y = ${F.poorSurvivingY[0]}, while a^p b^p wins. The language is not regular, and choosing the string is the skill.`,
    },
    {
      q: 'Which ring is the smallest one that holds aⁿbⁿcⁿ?',
      options: [
        'Context-sensitive, since a pumping argument rules out context-free',
        'Context-free, since a single stack can match the b\'s and the c\'s',
        'Regular, since each of the three letters is read in a fixed order',
        'Decidable, since the three counts can be compared by a program that always stops',
      ],
      answer: 0,
      why: `A PDA that matches a's with b's has an empty stack before the c's arrive, and the context-free pumping game on a^p b^p c^p is won for the pumping lengths from ${F.csWonPs[0]} to ${F.csWonPs[F.csWonPs.length - 1]} that the game offers (for p = ${F.csP}, ${F.csCount} of ${F.csCount} decompositions leave). A Turing machine decides it, so it sits in the context-sensitive ring.`,
    },
    {
      q: 'A teammate says a language that is context-free is one a regular expression can handle. What is accurate?',
      options: [
        'Context-free is a bigger class: aⁿbⁿ is context-free and no regular expression matches it',
        'They are the same class, since a regular expression can nest to any depth it needs',
        'It is the other way round, since regular expressions are a superset of context-free ones',
        'A regular expression can handle it with enough groups, because each group adds a state',
      ],
      answer: 0,
      why: `A DFA that counts to ${F.counterK} has ${F.counterStates} states and fails at n = ${F.counterFails}, and a bigger counter just moves the failure out, while a PDA accepts each aⁿbⁿ. Regular is the inner ring.`,
    },
    {
      q: `Partition refinement runs on the counter that tracks the letters a modulo ${F.mod3Classes}, with ${F.mod3States} states. What does it end with?`,
      options: [
        'Three classes, one per remainder, which are the states of the smallest DFA',
        'Six classes, because every state of the original machine is reachable',
        'Two classes, accepting and rejecting, which is simply where the first round stops',
        'One class, because all six states read the same two symbols',
      ],
      answer: 0,
      why: `The classes are ${F.mod3Groups.join(', ')}: ${F.mod3Classes} of the ${F.mod3States} states after round ${F.mod3Rounds}, and the first round just separates accepting from rejecting states.`,
    },
  ],
};

export default lesson;
