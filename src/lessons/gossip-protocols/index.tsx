import { decimal } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { MEMBER_START_ROUND } from './init';
import { Stage } from './Stage';
import {
  BROKEN_MEMBER, BROKEN_SPREAD, BROKEN_SPREAD_SEED, SWEEP_SEEDS, defaultMember, defaultSpread, expectedUninformedNext, failingSeeds, leftOut,
  pushReference, sweepSpread, readMembership, roundsBelow, runMembership, runSpread,
} from './model';

const rounds = (over: Partial<ReturnType<typeof defaultSpread>>) => runSpread({ ...defaultSpread(), ...over }).completeAt;
const base = rounds({});
const meanOf = (mode: 'push' | 'pull' | 'push-pull') => sweepSpread({ ...defaultSpread(), mode }).meanRounds ?? 0;
const expectedRounds = (mode: 'push' | 'pull' | 'push-pull') => roundsBelow({ ...defaultSpread(), mode });
const mean16 = meanOf('push');
const mean256 = sweepSpread({ ...defaultSpread(), n: 256 }).meanRounds ?? 0;
const brokenRun = runSpread({ ...BROKEN_SPREAD, seed: BROKEN_SPREAD_SEED });
const brokenFails = failingSeeds(BROKEN_SPREAD).length;
const member = (over: Partial<ReturnType<typeof defaultMember>>) => readMembership(runMembership({ ...defaultMember(), ...BROKEN_MEMBER, ...over }));
const shortFalse = member({}).falsePairs;
const firstFalse = member({}).firstFalseRound;
const longFalse = member({ tFail: 20 }).falsePairs;
const shortDetect = member({ tFail: 12, crash: true }).detection;
const longDetect = member({ tFail: 20, crash: true }).detection;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In gossip, each node tells a few random others each round, and in this model a rumour reaches a whole cluster in a number of rounds that grows about like log n (a known result, quoted from memory), with no leader and no tree to maintain.',
    what: 'Gossip spreads a fact the way a rumour spreads: in each round a node that knows it tells f random peers (push), or an uninformed node asks f random peers (pull), or both. Early on the informed set about doubles each round; at the end push slows (few holders, many targets) while pull speeds up. A node that tells just once (infect and die) can leave others out. The same idea carries membership: nodes gossip heartbeat counters and suspect a peer whose counter has stopped growing for T_fail rounds.',
    analogy: 'Office news. One person tells two colleagues over coffee, each of them tells two more the next day, and within a handful of days the whole floor knows, with nobody in charge of the announcement. The last person to hear is usually someone nobody happened to talk to.',
    useCases: [
      'Cluster membership and failure detection in databases that run without a leader',
      'Spreading configuration, schema versions or health state across a fleet',
      'Anti-entropy: nodes occasionally compare notes so replicas converge after a partition',
      'Choosing fanout, round length and the suspicion threshold for a gossip-based service',
    ],
    why: 'Gossip trades a little redundant traffic for robustness: a lost message or a dead node barely matters, and the cost per node stays flat as the cluster grows. Knowing where it breaks (a node that stops gossiping too early, a suspicion threshold shorter than the spread time) is what lets you size it on purpose.',
    watch:
      'Each cell is a node. A yellow cell knows the rumour, a grey cell does not yet, and a red cell is a node left out when the horizon ends. In the plot the solid yellow line is the run and the dashed blue curve is the exact expectation (a model, not a run). In the push, pull and log n scene the three curves are plain categories. In the membership matrix a row is an observer and a column the node it suspects: red is a suspicion of a node that is up, orange a suspicion of the crashed node 0. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `At the defaults (16 nodes, push, fanout 1, seed 1) press Run to the end: everyone knows after round ${base}, and the dashed expectation curve sits close to the run (the exact recursion falls below half a node at round ${expectedRounds('push')}).`,
    `From the defaults pick pull, then push-pull, and read "Measured over ${SWEEP_SEEDS} seeds": the mean falls from ${decimal(meanOf('push'), 1)} rounds for push to ${decimal(meanOf('pull'), 1)} for pull and ${decimal(meanOf('push-pull'), 1)} for push-pull (the expectation table says ${expectedRounds('push')}, ${expectedRounds('pull')} and ${expectedRounds('push-pull')}). Single seeds scatter around these means; the means are what to compare.`,
    `From the defaults pick n = 256 and read "Measured over ${SWEEP_SEEDS} seeds": ${decimal(mean256, 1)} rounds against ${decimal(mean16, 1)} at n = 16, so sixteen times the nodes costs about ${decimal(mean256 / mean16, 1)} times the rounds. The scene "Push, pull and log n" shows the reference log2 n + ln n (${decimal(pushReference(256), 1)} at n = 256) next to measured dots.`,
    `Press "Load the lowest failing seed (${BROKEN_SPREAD_SEED})" (infect and die, n = 16, fanout 3) and Run to the end: ${leftOut(brokenRun).length} node${leftOut(brokenRun).length === 1 ? ' stays' : 's stay'} red, and the readout says the setting fails to cover everyone on ${brokenFails} of ${SWEEP_SEEDS} seeds.`,
    `In "Membership by rumour" at the defaults (n = 16, fanout 2, T_fail 12) no live node is suspected. Drop fanout to 1: ${shortFalse} observer-node pair${shortFalse === 1 ? '' : 's'} suspect${shortFalse === 1 ? 's' : ''} a live node (the first at round ${firstFalse}; the matrix opens at round ${MEMBER_START_ROUND}, so move Show round to ${firstFalse}, or press "Load the lowest failing seed"). Raise T_fail to 20: ${longFalse}. Then turn on "Node 0 crashes": detection takes ${longDetect} rounds at T_fail 20 against ${shortDetect} at 12.`,
  ],
  keyIdeas: [
    'In this model push gossip with fanout 1 informs 256 nodes in about 15 rounds, not 256: early on each informed node adds one more, so the informed set about doubles each round.',
    `Push slows at the end because few holders have to find the last uninformed nodes; pull speeds up because each uninformed node asks. At n = 16 the exact recursion falls below half a node after ${expectedRounds('push')}, ${expectedRounds('pull')} and ${expectedRounds('push-pull')} rounds for push, pull and push-pull.`,
    'A node that gossips just once (infect and die) can leave nodes out: in this model fanout 3 at n = 16 misses someone on a large share of seeds, while keeping every informed node gossiping covers everyone by the horizon on all 200 seeds tried.',
    'Membership by gossip suspects a node whose heartbeat counter has stopped growing for T_fail rounds, so T_fail has to exceed the time a counter takes to reach everyone; a shorter one suspects live nodes.',
  ],
  quiz: [
    {
      q: 'Push gossip with fanout 1 reaches 256 nodes in about 15 rounds, not hundreds. Why?',
      options: [
        'The rumour travels along a fixed tree that covers all nodes, so depth stays small',
        'Each informed node tells one more, so the informed set multiplies early on',
        'A central node forwards the rumour to every other node after a few rounds',
        'Nodes retry until every peer acknowledges, so the spread cannot take long',
      ],
      answer: 1,
      why: 'Each informed node adds roughly one new one per round while many nodes are still uninformed, so the informed set about doubles. There is no tree, no central node and no acknowledgement in this protocol.',
    },
    {
      q: 'In the end game, why is pull faster than push?',
      options: [
        'Pull sends fewer messages in total across the whole spread of the rumour',
        'An uninformed node asks, and is likely to hit an informed one',
        'Pull loses no message, so the last nodes are reached without fail',
        'Informed nodes pick peers that are still uninformed, so none are wasted',
      ],
      answer: 1,
      why: 'Near the end the large majority of nodes are informed, so a random ask almost surely lands on a holder; a random push almost surely lands on a node that already knows. Gossip chooses peers blindly in both directions.',
    },
    {
      q: 'With infect-and-die at n = 16 and fanout 3, some runs leave nodes out. Why?',
      options: [
        'A node that tells only once can pick peers that were already informed',
        'Fanout 3 is too small for any cluster larger than eight nodes, so some are missed',
        'The first round loses the rumour to the network before it spreads at all',
        'Pull would have the same hole, since nobody asks for it in this mode',
      ],
      answer: 0,
      why: 'Each informed node pushes once, to three random peers, and then stops. When those peers were already informed the rumour has nowhere left to go, so a node that nobody happened to pick does not hear it.',
    },
    {
      q: 'In membership gossip a live node is suspected. Which setting is the most likely cause?',
      options: [
        'T_fail set shorter than the time a counter takes to spread',
        'A fanout that is too large for the size of the cluster in question',
        'A heartbeat counter that grew faster than the counters of the others',
        'Many nodes holding the same table at the same moment in time',
      ],
      answer: 0,
      why: 'A node suspects a peer whose counter has not grown for T_fail rounds. If news of the counter takes longer than that to arrive, a live peer looks silent. A larger fanout shortens the spread time, and tables are meant to converge.',
    },
    {
      q: 'n = 16, one node informed, push with fanout 1. What is the expected number still uninformed after one round?',
      options: [
        '15, because a single push cannot inform anyone yet this round',
        `${decimal(expectedUninformedNext(16, 1, 'push', 1), 0)}: fifteen uninformed, each missed with chance 14 of 15`,
        '8, since the informed set exactly doubles in every round',
        '1, because the single sender reaches almost everyone at once',
      ],
      answer: 1,
      why: 'One push informs exactly one node, and the expectation agrees: 15 x 14/15 = 14 uninformed remain. Doubling is an early-rounds picture of the expectation, not an exact rule, and a single push cannot broadcast.',
    },
  ],
};

export default lesson;
