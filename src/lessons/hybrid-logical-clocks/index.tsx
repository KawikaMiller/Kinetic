import type { LessonModule } from '../../core/types';
import { decimal } from '../../core/format';
import { BURST, CHAIN, burstRows, happenedBefore, hlcText, inversions, stampExecution, type Execution } from './hlc';
import { BROKEN_SEED, DEFAULT_OPTIONS, runHlcSeed, sweepSeeds } from './seeded';
import { Stage } from './Stage';

const withB = (b: number): Execution => ({ ...CHAIN, offsets: [CHAIN.offsets[0], b, CHAIN.offsets[2]] });
const countPhysical = (e: Execution) => inversions(stampExecution(e), happenedBefore(e), 'physical').length;
const countOf = (e: Execution, s: 'lamport' | 'hlc') => inversions(stampExecution(e), happenedBefore(e), s).length;

const chain = stampExecution(CHAIN);
const receiveAtB = chain.find((s) => s.event.node === 1 && s.event.kind === 'receive')!;
const sendAtA = chain.find((s) => s.event.node === 0 && s.event.kind === 'send')!;
const burstTied = burstRows(50, BURST.default);
const near = runHlcSeed(DEFAULT_OPTIONS, 1);
const far = runHlcSeed({ ...DEFAULT_OPTIONS, farAheadMs: 5000 }, 1);
const physical = sweepSeeds({ ...DEFAULT_OPTIONS, mode: 'physical' });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A hybrid logical clock stamps each event with a wall reading and a small counter, so timestamps respect causality like a Lamport clock and still stay within the clock-skew bound of physical time.',
    what: 'Wall clocks from different machines can stamp an effect earlier than its cause, and a Lamport counter fixes the order but says nothing about the time. A hybrid stamp (l, c) keeps the largest wall reading it has seen in l and a counter c for events that share it, and is compared by l first and then c. You edit an execution and watch the three stamps, see the counter break ties inside one clock reading, and push a clock out of its bound.',
    analogy: 'Two people write the time on notes. When you read a note from a friend whose watch is ahead, your next note carries that time plus a tick, so a reply is not dated before the question, and your notes stay close to your own watch.',
    useCases: [
      'Timestamps in distributed databases that want causal order and readable times (named only, from memory)',
      'Last-write-wins stores that need a tie-break without a central clock',
      'Merging logs from machines whose clocks disagree by a few milliseconds',
      'Choosing a snapshot time for a read without a special hardware clock',
    ],
    why: 'Timestamps on writes decide who wins and what a snapshot sees. A stamp that is wrong about causality loses a write silently, and one that ignores real time is useless for debugging. The hybrid stamp keeps both properties for a little extra state.',
    watch:
      'Nodes are plain categories (amber, pink, sky). A physical stamp is grey, a Lamport stamp and a message are blue, and a hybrid (l, c) stamp is yellow with its counter in violet. A causal inversion, where a cause carries the larger stamp, is red, and the line for the largest gap between clocks is dashed grey. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `Read the table: the physical stamp at B's first receive is ${receiveAtB.pt}, below A's send at ${sendAtA.pt}, and its hybrid stamp is ${hlcText(receiveAtB.hlc)}. Physical stamps carry ${countPhysical(CHAIN)} causal inversions, Lamport ${countOf(CHAIN, 'lamport')} and hybrid ${countOf(CHAIN, 'hlc')}.`,
    `Drag B's offset from -20 to 0: the physical inversions fall from ${countPhysical(CHAIN)} to ${countPhysical(withB(0))}, because C's +15 ms still inverts the last message. Drag B to -50 and they climb to ${countPhysical(withB(-50))}. The hybrid count stays ${countOf(withB(-50), 'hlc')}.`,
    `Open Why the counter and set the resolution to 50 ms with the burst at ${BURST.default}: the physical stamps give ${new Set(burstTied.map((r) => r.pt)).size} distinct value for ${BURST.default} events, and the hybrid stamps run from ${hlcText(burstTied[0].hlc)} to ${hlcText(burstTied[burstTied.length - 1].hlc)}.`,
    `Open How close to real time with the hybrid rule: the largest l - pt is ${decimal(near.maxLead, 1)} ms against the line at ${decimal(near.bound, 1)} ms. Raise One clock far ahead to +5.0 s: l - pt reaches ${decimal(far.maxLead, 0)} ms, past the line, while the ordering rules stay green.`,
    `Choose Plain physical timestamps (seed ${BROKEN_SEED} is the pinned failing seed): the rule "receive stamped after its send" is broken, and the rule fails on ${physical.failing.length} of 200 seeds.`,
  ],
  keyIdeas: [
    'Physical stamps from skewed clocks can date a receive before its send, and a Lamport stamp fixes the order but counts events instead of telling the time. A hybrid stamp is a wall reading plus a counter, compared wall first and then counter.',
    'On a send or a local event l becomes the larger of l and the physical clock, and c counts the events that share one wall reading; a receive also takes the l of the message. In this model each stamp on a node is larger than the one before it.',
    'Assuming each clock is within a bound of true time, l stays within the largest gap between two clocks of the node\'s own clock, so a stamp still reads like a time. The check ran on seeded runs and on a grid of rule inputs, and it is not a proof.',
    'Break the clock assumption and causality survives while closeness to real time does not: one clock 5 s ahead pulls l forward on each node it talks to. The guarantee is as good as the bound and no better.',
  ],
  quiz: [
    {
      q: 'Why can a receive be stamped earlier than its send even after clock sync?',
      options: [
        'Sync leaves some error, which can exceed the message delay',
        'Messages get delivered out of order by the network in between',
        'Wall clocks count whole seconds only, so ties are very common',
        'Synchronised clocks run backwards at night to correct their drift',
      ],
      answer: 0,
      why: 'A sync narrows the gap between two clocks without removing it. If the gap is larger than the message delay, the receiver\'s clock still reads below the sender\'s stamp, however well the network behaves.',
    },
    {
      q: 'What does the counter c do in an HLC timestamp?',
      options: [
        'It counts how many messages the node has sent so far',
        'It breaks ties between events that share one wall reading',
        'It stores how far the clock has drifted from true time',
        'It records how many nodes are in the cluster at this time',
      ],
      answer: 1,
      why: 'Events inside one clock reading would tie on l, so c counts them. It resets to 0 when l takes a newer wall reading, which is why it stays small.',
    },
    {
      q: 'All clocks are within 20 ms of true time. How far can l be from a node\'s own physical clock?',
      options: [
        'Without limit, because l keeps growing with every message received',
        'Exactly zero, because l simply is the physical clock reading',
        'Up to the largest gap between two clocks, here at most 40 ms',
        'Up to 20 ms for sends and without limit for receives',
      ],
      answer: 2,
      why: 'l is at most the largest physical reading any node had at an earlier true time, so it can lead a node by the largest gap between two clocks, at most 2 x 20 ms in this model. A Lamport stamp has no such limit.',
    },
    {
      q: 'One clock is 5 s ahead and breaks the assumption. What still holds in the lesson\'s model?',
      options: [
        'Both causality and closeness to real time still hold',
        'Neither, because the whole scheme depends on every clock',
        'Closeness to real time, but causality fails at the fast node',
        'Causality holds; closeness to real time is lost',
      ],
      answer: 3,
      why: 'The update rules still make each stamp larger than the stamps it depends on, so the ordering checks stay green. The fast clock pulls l forward on the nodes that hear from it, so l - pt leaves the bound.',
    },
    {
      q: 'A sends (100, 0); B\'s clock reads 85 and its HLC is (0, 0). B\'s timestamp for the receive is:',
      options: [
        '(85, 0), taken straight from B\'s own physical clock reading',
        '(100, 0), because the message already carries 100 in its stamp',
        '(100, 1): the sender\'s wall value, counter one higher',
        '(101, 0), which is one more than the sender\'s wall value',
      ],
      answer: 2,
      why: 'l becomes max(0, 100, 85) = 100, which matches the message\'s wall value alone, so the counter is the message counter plus 1: (100, 1). The physical stamp 85 would be below the send.',
    },
  ],
};

export default lesson;
