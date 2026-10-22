import type { LessonModule } from '../../core/types';
import { integer } from '../../core/format';
import { singleDecreeMessages, stableProposerMessages } from './counting';
import { replayDuel, DUEL_BALLOTS } from './duel';
import { RETRY_BALLOTS, TWO_BALLOTS, configFor } from './protocol';
import { exhaustiveSearch } from './search';
import { CLEAN, LATE, runSteps, verdictOf } from './session';
import { Stage } from './Stage';

const correct = exhaustiveSearch(TWO_BALLOTS, 'none');
const belowPromise = exhaustiveSearch(TWO_BALLOTS, 'acceptBelowPromise');
const config = configFor(RETRY_BALLOTS);
const clean = runSteps(config, CLEAN);
const late = runSteps(config, LATE);
const duel = replayDuel(DUEL_BALLOTS.default);
const FIVE = 5;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Paxos lets several proposers compete for one value: in this model any two majorities of acceptors share a member, so once a value is chosen a later proposer finds it and re-proposes it, on every schedule this lesson checks. Progress, not safety, needs a stable proposer.',
    what: 'Acceptors promise a ballot number and vote. A proposer runs two phases: it collects promises from a majority, adopts the value of the highest vote they report, then asks the acceptors to vote for it. You play the network on a pool of messages, search each schedule of a small model, sample 200 more, and replay a scripted duel in which two proposers keep pre-empting each other.',
    analogy: 'Several people try to book one meeting room by shouting numbered proposals at a committee. A member backs a number just when it is higher than any it has promised, and a proposer who collects backing from a majority has to repeat whatever earlier decision a member reports.',
    useCases: [
      'Replicated state machines behind coordination services and databases',
      'Reading a design document that says single-decree Paxos or Multi-Paxos',
      'Explaining why a cluster can be safe and still stuck',
      'Comparing Paxos-family protocols with the leader-first design of Raft',
    ],
    why: 'Consensus failures show up as split brain or as a cluster that cannot make progress. Knowing which half is safety and which is liveness tells you what a bad network is able to break.',
    watch:
      'Proposers are plain categories (amber for P1 and its value A, pink for P2 and B) and acceptors are sky. A promise is blue, an accept that became a vote is violet, and a chosen value is green. Two chosen values are red, a dropped message is red with its label, the message being delivered is yellow and an Accept that was refused is grey with its reason. The chips say what is simulated, a toy, scripted or from memory.',
  },
  tryThis: [
    `Click the preset "A is chosen cleanly": after ${clean.ops.length} steps the verdict reads "${verdictOf(clean.session)}".`,
    `Click the preset "P2 arrives later and must adopt A": P2 collects promises, one of which reports the vote for A, so it sends Accept(2, A) and not B, and the verdict stays "${verdictOf(late.session)}".`,
    `Press Try to break it: the exhaustive line reads "holds in all ${integer(correct.states)} reachable states of this model", with A chosen in ${integer(correct.chosenA)} of them and B in ${integer(correct.chosenB)}.`,
    `Switch the protocol to "Acceptor accepts below its promise" and press Try to break it: a counterexample of ${belowPromise.violation?.path.length} steps loads in the trace player. Step to the end and read the two chosen values.`,
    `Open Duelling proposers: the replayed duel runs ${duel.steps} steps over ${DUEL_BALLOTS.default} ballots and casts ${duel.votesCast} votes. Press Stop duelling: the last Accept lands and a value is chosen.`,
  ],
  keyIdeas: [
    'Paxos separates safety from who is proposing: any number of proposers may run ballots at once and, in this model, at most one value is chosen on each schedule checked. Progress is what needs a stable proposer.',
    'A proposer that gathers promises from a majority proposes the value of the highest-numbered vote it hears about. Any two majorities share an acceptor, so a later proposer learns of a value that a majority already voted for.',
    `Safety is checked twice and the screen says which ran: an exhaustive search of ${integer(correct.states)} states for 3 acceptors, 2 proposers and 2 ballots, and 200 seeded schedules. Neither replaces the intersection argument that holds for any number of ballots.`,
    `Duelling proposers can pre-empt each other: a scripted schedule of ${DUEL_BALLOTS.default} ballots casts no vote in ${duel.steps} steps, which illustrates that termination is not promised (FLP is the reason; a scripted schedule is not a proof). A stable proposer skips phase 1: ${stableProposerMessages(FIVE, null)} messages against ${singleDecreeMessages(FIVE)} for ${FIVE} values in the counting model.`,
  ],
  quiz: [
    {
      q: 'P2 wants B but its promise set reports a vote for A at ballot 1. What does it propose?',
      options: [
        'B, since a proposer is free to propose any value it likes',
        'A, the value of the highest-numbered vote among its promises',
        'Whichever value carries the larger ballot number in its own local queue',
        'Nothing, because it must wait for P1 to finish before it can go',
      ],
      answer: 1,
      why: 'A proposer adopts the value of the highest-numbered vote reported in its promises and uses its own value when no vote is reported. That adoption rule is what keeps a chosen value from changing.',
    },
    {
      q: 'Why can two different values not both be chosen in this model?',
      options: [
        'Acceptors vote in a fixed order, so only one proposer can succeed',
        'Any two majorities share an acceptor that reports its vote',
        'Ballot numbers are unique, so only the highest ballot is accepted',
        'A leader is elected first, so one proposer is active at a time',
      ],
      answer: 1,
      why: 'The acceptor in the overlap reports its vote in its promise, so a later proposer learns of the earlier choice and repeats it. Several proposers can be active at once. Raft routes writes through one leader, but its safety also rests on overlapping majorities.',
    },
    {
      q: 'In the duel schedule no Accept reaches a1 or a2 before a higher Prepare does. What does that show?',
      options: [
        'Safety is broken, because no value gets chosen in the whole run',
        'The acceptors have crashed and need to restart before they vote',
        'Progress needs more than safety: pre-emption can stall it',
        'The proposers should each pick a larger value so that they win',
      ],
      answer: 2,
      why: 'No value is chosen in the scripted run, so no two values are chosen: safety holds. The schedule illustrates that pre-emption can keep the protocol from deciding, which is why liveness needs a stable proposer. Values do not decide pre-emption; ballot numbers do.',
    },
    {
      q: `The search says "holds in all ${integer(correct.states)} reachable states". What does that cover?`,
      options: [
        'This model\'s bounds: 3 acceptors, 2 proposers and 2 ballots',
        'Every Paxos deployment, whatever its size or number of ballots',
        'Every number of ballots, since the state space is closed under them',
        'Only the seeds that were run, as in an ordinary random test',
      ],
      answer: 0,
      why: 'An exhaustive run over a bounded model says nothing beyond its bounds, but it covers each schedule inside them. It is a different thing from a sampled run over seeds, and neither is the proof for any number of ballots.',
    },
    {
      q: `Five values by single-decree Paxos use ${singleDecreeMessages(FIVE)} messages in the counting model. How many with one stable proposer?`,
      options: [
        '30, half as many, since only Accepts are needed afterwards',
        '12, which is the cost of deciding a single value only',
        '36: one phase 1 of 6 messages, then 6 per value',
        '48, because each value still needs its own Prepare round',
      ],
      answer: 2,
      why: 'The stable proposer runs phase 1 once, 3 Prepares and 3 Promises, and then each value costs 3 Accepts and 3 Accepted replies: 6 + 5 x 6 = 36. Skipping phase 1 for later values is the saving.',
    },
  ],
};

export default lesson;
