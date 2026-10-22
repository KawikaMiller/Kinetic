import type { LessonModule } from '../../core/types';
import { decimal, integer } from '../../core/format';
import { AND_TABLE, INPUT_VECTORS, SCENARIOS, patternRows, scenarioCounts, symmetric, tryPerProcessRules, trySymmetricRules } from './onePhase';
import { COIN_ROUNDS, COIN_SEEDS, DELIVERIES_PER_ROUND, START_INPUTS, undecidedCounts, undecidedProbabilities, CYCLE_WITNESS } from './rounds';
import { DEFAULT_SETUP, settle, startSession } from './session';
import { Stage } from './Stage';

const rules = symmetric(AND_TABLE);
const ordersBroken = patternRows(DEFAULT_SETUP.inputs, rules).filter((r) => !r.verdict.agree).length;
const across = scenarioCounts(rules).disagree;
const symmetricSearch = trySymmetricRules();
const perProcessSearch = tryPerProcessRules();
const crashedStuck = settle(startSession({ inputs: DEFAULT_SETUP.inputs, mode: 'all', rules }, 2));
const exact = undecidedProbabilities(START_INPUTS, CYCLE_WITNESS, COIN_ROUNDS);
const measured = undecidedCounts(START_INPUTS, CYCLE_WITNESS, COIN_ROUNDS, COIN_SEEDS);
const TEN_ROUNDS = 10;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In the asynchronous model, a deterministic protocol cannot guarantee both agreement and termination once one process may crash, because a process that is slow and one that is dead look the same from outside.',
    what: `Three processes each hold a bit and need to settle on one value. If a process decides on the first news it hears, the network can show two of them different first messages and they disagree. If it waits to hear from the others, one crash leaves it waiting. Here you are the network: the lesson tries ${symmetricSearch.rules} decision rules and ${integer(perProcessSearch.rules)} per-process rules for one round of news, lets you replay a safe protocol round that returns to where it started, and shows a coin and a timeout as two ways out. The theorem itself is argued, not run.`,
    analogy: 'Three people vote by post and each wants to agree on one answer. A person who waits for the third letter hangs if it is lost in the mail; a person who answers after the first letter can end up with a different answer from a neighbour who read a different first letter.',
    useCases: [
      'Why consensus systems add timeouts and leader election instead of waiting for a quorum of replies',
      'Reading an availability claim from a replicated database with the assumption it hides',
      'Explaining why Raft and Paxos stay safe under delay but may stall',
      'Designing a protocol that has to tolerate a crashed peer, and naming what it gives up',
    ],
    why: 'Consensus keeps coming up in real outages: a cluster that stops making progress, or a failover that picks two leaders. Knowing which assumption a protocol buys its progress with tells you what to watch when that assumption fails.',
    watch:
      'The three processes are plain categories (amber, pink, sky). A decided value is green and its 0 or 1 is told apart by its label, not by colour; an undecided process is grey. A bivalent configuration (both 0 and 1 can still be decided) is violet and a univalent one blue. A disagreement is red, the delivery you pick next is yellow, and the round that returns to its start is orange. The chips say what is a toy, from memory, simulated or argued, not run.',
  },
  tryThis: [
    `Deliver P0 to P1, then P0 to P2: P1 decides 1 and P2 decides 0, so two processes disagree after 2 deliveries, and the stage reports it. Before that, press Make P2 decide now to read why it cannot.`,
    `Press Try every delivery order: ${ordersBroken} of 8 orders break agreement for inputs 1 1 0, and ${across} of ${SCENARIOS} scenarios do across all ${INPUT_VECTORS.length} input vectors. Then press Try every rule: ${symmetricSearch.safe} of ${symmetricSearch.rules} symmetric rules and ${perProcessSearch.safe} of ${integer(perProcessSearch.rules)} per-process rules agree and keep validity.`,
    `Switch the protocol to Wait for all three: every order agrees. Press Crash P2 and deliver what is left: P0 and P1 do not decide within ${crashedStuck.deliveries} deliveries.`,
    `Open the second scene, press Assist, then Play round: the stage reads "same configuration as the start of round 1: yes". Set Repeat to ${TEN_ROUNDS} and press Repeat: ${TEN_ROUNDS * DELIVERIES_PER_ROUND} deliveries and no decision.`,
    `In the third scene turn the coin on: the table shows that the probability nobody has decided after round 4 is ${decimal(exact[3], 3)}, with ${measured[3]} of ${integer(COIN_SEEDS)} seeds undecided beside it.`,
  ],
  keyIdeas: [
    'FLP is a theorem about deterministic protocols in the asynchronous model: with one possible crash, none guarantees both agreement and termination. This page argues the theorem and does not run it.',
    `A rule that decides on the first message heard cannot wait for a dead process, and in this model the network can show two processes different first messages: ${symmetricSearch.safe} of ${symmetricSearch.rules} symmetric rules and ${perProcessSearch.safe} of ${integer(perProcessSearch.rules)} per-process rules survive.`,
    `A safe protocol can fail to terminate: in this protocol a ${DELIVERIES_PER_ROUND}-delivery round returns to its start configuration, so repeating it is a legal run with no decision. That is a cycle for this protocol and this schedule, not a proof about others.`,
    `The escapes remove an assumption: a timeout gives up agreement, a coin gives up determinism (a fixed schedule then leaves nobody decided after round r with probability 2^-(r-1)), and a failure detector adds timing. Raft and Paxos use timing for progress and stay safe without it.`,
  ],
  quiz: [
    {
      q: 'What does FLP say about an asynchronous system where one process may crash?',
      options: [
        'No consensus protocol can ever be safe on a real, lossy network of nodes',
        'No deterministic protocol guarantees both agreement and termination',
        'Consensus is impossible whenever more than one node fails at a time',
        'Any protocol needs a leader, so leaderless designs cannot decide',
      ],
      answer: 1,
      why: 'The result is about guaranteeing agreement and termination together, for deterministic protocols, under unbounded delay and a possible crash. It does not say consensus protocols are unsafe, and it is not about how many nodes fail.',
    },
    {
      q: 'Why can a process not simply wait until it has heard from all three?',
      options: [
        'It would use too much memory to keep every message it receives',
        'The slow process might be crashed, and then it waits for ever',
        'Three messages always disagree, so there is nothing to compare',
        'The network drops the third message in this model every time',
      ],
      answer: 1,
      why: 'In this model links are reliable, so the only risk is a process that never sends. Waiting for the third then means waiting for a crashed process, and nobody can tell a crashed process from a slow one.',
    },
    {
      q: 'The repeating round leaves everyone undecided. What does it show?',
      options: [
        'A bug in the toy protocol, which a better decision rule would remove',
        'That a process crashed during the round and stalled everyone else',
        'That every protocol stalls under whatever schedule the network happens to pick',
        'One legal schedule on which this protocol stays undecided in each round replayed',
      ],
      answer: 3,
      why: 'Nobody crashed and no rule is wrong: the toy is safe, and one admissible schedule keeps it from deciding. A finite replay shows that for this protocol; that every deterministic protocol has such a schedule is the theorem.',
    },
    {
      q: 'Why does the same fixed schedule stop working once processes flip a coin?',
      options: [
        'The coin makes message delivery faster, so each round finishes sooner',
        'A schedule fixed in advance cannot adapt to coins it cannot predict',
        'Coins let a crashed process vote again after it has already failed',
        'Randomness removes the need for agreement, so the schedule is moot',
      ],
      answer: 1,
      why: 'The adversary picked its schedule before the coins were flipped, so each round gives the processes a fresh one-half chance to line up. A scheduler that sees the coins first is a stronger model, and this one does not cover it.',
    },
    {
      q: 'With fair coins and that fixed schedule, how likely is it that nobody has decided after round 4?',
      options: [
        '0.5, because the chance is one half in each round alike',
        '0.0625, which is one chance in sixteen after four rounds',
        '0.125: round 1 is certain to be undecided, then it halves',
        '1, because the schedule stays the same whatever the coins say',
      ],
      answer: 2,
      why: 'Round 1 uses the schedule where each process proposes bottom, so nobody decides in it. From round 2 a decision needs the coins of P0 and P2 to match, which has probability one half, so after round 4 the chance is one half cubed: 0.125.',
    },
  ],
};

export default lesson;
