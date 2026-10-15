import type { LessonModule } from '../../core/types';
import { pctText } from '../distributions/fmt';
import { DEFAULT_DEPTH, DEFAULT_LOSS, LOSS_MAX, pDisagree, pNobody } from './generals';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'No protocol makes delivery over a lossy link exactly-once. The honest recipe is at-least-once delivery plus a consumer that recognises a repeat, with the check and the effect saved in one atomic step.',
    what: "Two Generals shows why: whatever the last message of a protocol, it can be lost, so one side is always unsure. A broker can send a message at most once (and sometimes lose it) or at least once (and sometimes repeat it), and acks of acks only move the doubt one step. What does work is making a repeat harmless: the consumer records each message id and skips one it has seen, and it records the id in the same atomic step as the effect, because a crash between the two lets a retry apply the effect again. \"Exactly-once\" is a true claim for processing inside one system whose effect and input offset commit together, not for delivery over a link or for an effect on an outside system.",
    analogy: 'Posting a cheque by letter: if you never hear back you cannot tell whether the letter or the reply was lost. Sending it again risks paying twice, unless the bank notes each cheque number and refuses a repeat, and notes it in the same stroke as paying it.',
    useCases: [
      'Choosing a delivery guarantee for a queue or a stream consumer',
      'Designing a consumer that can be retried safely, with an id check',
      'Reading a product page that says "exactly-once" and asking what scope it covers',
      'Explaining why a payment or an email went out twice after a crash',
    ],
    why: 'Duplicates and losses after a crash or a slow ack are a normal cost of messaging, not a misconfiguration. Knowing where the doubt lives, and that the dedup check must commit with the effect, is what keeps a retry from charging a customer twice.',
    watch:
      "In the Generals scene the plot's green, red and grey curves are the three outcomes against depth and the yellow dot is your depth on the red one; a blue arrow is a messenger that arrived and a red cross a captured one; a general that attacks alone is the red outcome, agreement to attack is green and nobody attacking is grey. In the delivery scene a lost message has the red cross and a duplicate processing is orange. In the dedup scene the crash point you chose is violet, an effect applied twice is red and applied once is green. In the last scene a green scope is where exactly-once is honestly true and a red one where it is not. The chips say what is simulated, a toy, illustrative or from memory.",
  },
  tryThis: [
    `At the defaults (depth ${DEFAULT_DEPTH}, capture chance ${DEFAULT_LOSS}) the generals disagree with probability p(1 − p)^(k − 1) = ${pctText(pDisagree(DEFAULT_DEPTH, DEFAULT_LOSS), 2)}. Press "Remove the last message" three times: depth 1 raises it to ${pctText(pDisagree(1, DEFAULT_LOSS), 0)}, so a longer protocol lowers disagreement and never reaches zero. The note under the plot restates the argument with those numbers.`,
    `Drag the capture chance to the end of the slider, ${LOSS_MAX.toFixed(2)}: at depth ${DEFAULT_DEPTH} nobody attacks ${pctText(pNobody(DEFAULT_DEPTH, LOSS_MAX), 2)} of the time, and the caption says so. Set it to 0 and the caption says a perfect link needs no protocol.`,
    'In "Delivery on a lossy link" the default is at-least-once with 30% loss on seed 0: the counters show a duplicate and nothing lost. Switch to "At most once" and the duplicates go to zero while messages are lost.',
    'Pick "Exactly once (acks of acks)": the same duplicate appears as at-least-once, "On the link" counts more messages, and the hint says why the last confirm can be lost too.',
    'In "At least once plus dedup" the default crashes between the effect and recording the id with the id recorded separately: the effect is applied 2 times and the balance reads 20. Switch to "Record the id in the same step" and it reads 10.',
  ],
  keyIdeas: [
    'Two Generals: whatever the last message of a protocol, it can be lost, so one side is unsure, and more messages lower the chance of disagreement without making it zero.',
    'In this model at-most-once can lose a message and does not repeat one; at-least-once does not lose one that gets through in the end and can repeat it; acks of acks just move the doubt along.',
    'A consumer that records message ids turns repeats into no-ops, but in this model only when the id is recorded in the same atomic step as the effect.',
    "In practice (from memory; check each product's documentation), 'exactly-once' holds for processing inside a system that commits the effect and the input offset together, not for delivery or for an outside effect.",
  ],
  quiz: [
    {
      q: 'A team says their broker, configured correctly, guarantees exactly-once delivery. What is the honest reply?',
      options: [
        'No protocol can promise it over a lossy link; a repeat check makes the effect happen once',
        'It is true, because acks of acks make sure that the last message always arrives at its destination',
        'It is true as long as the retries are spaced far enough apart in time',
        'It is false, because the broker should never retry a message in the first place',
      ],
      answer: 0,
      why: 'The last message of a protocol can be lost, so one side stays unsure, and acks of acks just move that doubt along. What a design can get is an effect that happens once, by making the repeat harmless.',
    },
    {
      q: 'A consumer records each message id to skip repeats. It applies the effect, then records the id, then acks. When does a retry apply the effect again?',
      options: [
        'When a crash falls between the effect and recording the id',
        'When a crash falls after the id is recorded but before the ack is sent',
        'When the broker retries before the first ack has come back',
        'When the same id arrives twice from two different producers',
      ],
      answer: 0,
      why: 'After a crash between the effect and the record, the retry finds no recorded id and applies the effect a second time. A crash after the record leaves the id in place, so the retry is skipped.',
    },
    {
      q: 'In the Two Generals toy, what happens to the chance that the generals disagree as the protocol gets longer, at a capture chance above zero?',
      options: [
        'It falls with every extra message but stays above zero',
        'It reaches zero once the protocol has enough messages in it',
        'It stays the same, because the last message is lost just as often',
        'It rises, because each extra message is one more thing to capture',
      ],
      answer: 0,
      why: 'Disagreement needs everything but the last message to arrive, p(1 − p)^(k − 1), which shrinks as k grows but is positive for any k. The cost is a growing chance that nothing happens.',
    },
    {
      q: 'At-most-once and at-least-once delivery differ in what they can go wrong. Which pairing is right?',
      options: [
        'At-most-once can lose a message; at-least-once can deliver one twice',
        'At-most-once can deliver a message twice; at-least-once can lose one on the way',
        'Both can lose a message, and only at-most-once can repeat one',
        'Neither can fail, since each makes up for the other\'s weakness',
      ],
      answer: 0,
      why: 'Sending once and forgetting loses a message when the link drops it. Retrying until an ack arrives repeats a message when the ack is the thing that was dropped.',
    },
    {
      q: 'For which of these is "exactly-once" honestly true?',
      options: [
        'Processing inside one system that commits an effect and the input offset together',
        'Delivery of a message from one machine to another over an unreliable network link, each one acknowledged',
        'A call to an outside payment service made from a consumer that may be retried',
        'A queue whose broker deletes a message the moment its consumer begins to read it',
      ],
      answer: 0,
      why: 'Inside one system the effect and the input position can be saved in the same atomic step. Over a link or toward an outside system, a crash or a lost ack leaves one side unsure whether the last step happened.',
    },
  ],
};

export default lesson;
