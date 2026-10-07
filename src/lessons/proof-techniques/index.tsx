import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A proof is a chain of steps that each follow for a stated reason, and the technique decides where the chain starts: from the hypothesis (direct), from the negated conclusion (contrapositive), from the negated claim (contradiction), or with one failing case (counterexample).',
    what: "Direct: assume p, derive q. Contrapositive: assume not-q, derive not-p, which is logically the same as p → q (`propositional-logic` shows the identical truth tables). Contradiction: assume the claim is false and derive something impossible, so the assumption must go. Counterexample: one case where a 'for every' claim fails is enough to refute it, the negation rule from `predicate-logic`. Every step needs a reason: a definition, algebra, an earlier result, or the assumption itself.",
    analogy: 'A direct proof walks from the front door to the kitchen. A contrapositive proof shows that anyone not in the kitchen never came through the front door. A contradiction proof says: suppose the kitchen were empty; then the cake ate itself, which is absurd.',
    useCases: [
      'Arguing that an algorithm is correct, or that an optimisation keeps behaviour the same',
      'Code review: "this branch can never run" is a contrapositive or contradiction argument',
      'Refuting a claim about a system with one concrete failing input',
      'Reading papers, RFCs and specs, which state results and justify each step',
    ],
    why: "Engineers reason about code all the time (this loop terminates, this case can't happen, this refactor is safe) and the same few shapes of argument cover almost all of it. Knowing them stops the classic mistakes: assuming what you want to prove, proving the converse, and trusting a claim because it held for every case you happened to try.",
    watch: 'The proof column fills line by line: the line being filled is yellow, an accepted step gets a green left bar with its justification on the right, an assumption in a contradiction proof is violet, and the contradiction line itself is red. Candidate steps are blue chips; a rejected one turns red with ✗, shakes, and its reason appears below. When you scrub back to review a line, the chosen step is solid green and the steps not chosen are grey. A route that stalls ends in a red "stuck" line and a red-edged note. In the counterexample hunt, values of n that give a prime are green, a value that gives a composite is solid red, untested values are grey outlines, and the current n has a yellow ring. The truth table marks true values green, with the current row yellow.',
  },
  tryThis: [
    'On Odd + odd with Technique Direct, pick "Let m = 3 and n = 5." first and read why one example is not a proof. Then finish the proof.',
    'Switch the claim to n² even ⇒ n even and keep Direct: the builder shows where the direct route stalls. Switch Technique to Contrapositive and finish it.',
    'On √2 is irrational, choose Contradiction: the violet first line is the assumption, and the red line near the end is what breaks it.',
    'On n² + n + 41 always prime?, drag the n slider from 0: every value is prime until n = 40, which gives 1681 = 41 × 41.',
    'After finishing a proof, step the timeline back to any line to see the step that was chosen and why each other chip fails.',
  ],
  keyIdeas: [
    'Direct proves p → q from p; contrapositive proves ¬q → ¬p, which is the same statement.',
    'Contradiction assumes the claim is false and derives something impossible, so the assumption must go.',
    'One counterexample refutes a "for every" claim; no number of passing examples proves one.',
    'Each step needs a reason: a definition, algebra, an earlier result, or the assumption.',
  ],
  quiz: [
    {
      q: 'n² + n + 41 is prime for n = 0, 1, 2, … 39. What does that tell you about "it is prime for every n"?',
      options: [
        'Nothing conclusive: n = 40 gives 1681 = 41², so the claim is false',
        'It is proved: forty cases in a row cannot be a coincidence at all',
        'It is almost certainly true, so it is safe to use as a theorem',
        'It is proved for every n up to one thousand, but not above that',
      ],
      answer: 0,
      why: 'Examples can only refute a "for every" claim, never prove it. Forty passing cases feel overwhelming, but at n = 40 the value is 40·41 + 41 = 41·41, so the claim is false. A proof has to cover every n at once.',
    },
    {
      q: 'To prove "if n² is even, then n is even" by contrapositive, what do you assume first?',
      options: ['n is odd', 'n² is odd', 'n is even', 'n² is even'],
      answer: 0,
      why: 'The contrapositive of p → q is ¬q → ¬p: assume the conclusion is false (n is odd) and show the hypothesis is false (n² is odd). Assuming n² is odd starts from ¬p, which is the wrong end.',
    },
    {
      q: 'Why does the √2 proof assume p/q is in lowest terms?',
      options: [
        'So that "p and q are both even" contradicts something',
        'Because √2 is only defined for fractions in lowest terms',
        'So that p and q are guaranteed to be prime numbers',
        'Because it makes the algebra in the next step shorter',
      ],
      answer: 0,
      why: 'The proof ends by showing p and q are both even. That is only a contradiction if we assumed they share no factor. Any fraction can be reduced, so the assumption costs nothing; it does not make p or q prime, and it does not shorten the algebra.',
    },
    {
      q: 'Which of these, if proved, proves "if p then q"?',
      options: ['A proof of ¬q → ¬p', 'A proof of q → p', 'A proof of ¬p → ¬q', 'Ten examples where p and q both hold'],
      answer: 0,
      why: '¬q → ¬p has the same truth table as p → q. q → p is the converse and ¬p → ¬q the inverse; both can be true while p → q is false. Examples where p and q hold never rule out a case where p holds and q fails.',
    },
  ],
};

export default lesson;
