import type { LessonModule } from '../../core/types';
import { DEFAULT_DRIFT, NODE_NAMES, driftView } from './drift';
import { signedMs, timeText } from './format';
import { Stage } from './Stage';

const start = driftView(DEFAULT_DRIFT);
const node = NODE_NAMES[DEFAULT_DRIFT.node];
const endSkew = start.series[DEFAULT_DRIFT.node].at(-1)!.skew;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Every machine\'s clock is wrong in its own way. NTP narrows the error without removing it, so timestamps from different machines cannot order events that are close together.',
    what: "A hardware clock drifts: 50 ppm gains 4.32 s a day. NTP estimates a clock's offset by exchanging four timestamps with a server and assuming the path takes as long one way as the other; a step can move the clock backwards, a slew only changes its rate. After a sync a node is still off by about its drift times the poll interval, plus half any asymmetry in the path. Code that orders writes or grants leases by comparing timestamps from different machines inherits that error. Reading a time as an interval, and waiting out the uncertainty, is one way to pay for it.",
    analogy: 'Five watches that each gain or lose a few seconds a day, set now and then from a phone call whose line is faster one way than the other. Each is about right and none is exactly right, so the watches alone cannot say which of two events a few seconds apart came first.',
    useCases: [
      'Last-write-wins stores that stamp each write with the writer\'s own clock',
      'Leases and locks that expire at a wall-clock time',
      'Merging logs from many machines by timestamp while debugging an incident',
      'Timing how long something took with a monotonic clock instead of the wall clock',
    ],
    why: 'Clock bugs are quiet: a write silently loses, a lock is briefly held twice, a log shows a reply before its request. Knowing how big the error is, and which clock to use for what, is what lets you design around it.',
    watch:
      "The five nodes are plain categories (amber, pink, sky, orange and grey); the node you select is drawn in blue, true time is the faint line at zero, and yellow dots mark a sync step. In the bug scenes the sequence diagram shows the messages; in the lease timeline the two holders are amber and sky and the overlap where both believe is red; in the log, a line that sorts before its cause is red. In the interval scene green is an order that can be decided and violet one that cannot. Stats go green for what works and red for what fails. The chips say what is simulated, illustrative or from memory.",
  },
  tryThis: [
    `With sync off, ${node} (${DEFAULT_DRIFT.clocks[DEFAULT_DRIFT.node].driftPpm.toString().replace('-', '−')} ppm) drifts ${signedMs(start.perDayMs)} a day. It starts ${signedMs(DEFAULT_DRIFT.clocks[DEFAULT_DRIFT.node].offsetMs)} off, so after six hours the plot shows it at ${timeText(endSkew)}: the start offset plus a quarter of a day of drift.`,
    `Set Sync to Step and Poll every to 1,024 s: ${node}'s error grows to about its drift × poll = ${timeText(driftTimesPoll())} between syncs and snaps back. The first step moves the wall clock backwards; Slew gives a sawtooth without a jump.`,
    'Drag Forward delay to 10 ms and Return delay to 50 ms: the estimate error reads about −20 ms, which is (10 − 50) / 2, although the clocks are not the cause.',
    'Open "Bugs that time causes": A is 5 s fast, so write 2 loses and both replicas keep x = 1. Set A\'s offset to 0 and x = 2 wins. Then pick "A lease two hold": H believes until 13 s and overlaps N; switch on "H stops early" and the overlap goes.',
    'Open "Intervals instead of instants": with ε = 10 ms and A\'s clock 8 ms off, write 2 wins. Raise A\'s error to 60 ms, past ε, and write 2 loses again.',
  ],
  keyIdeas: [
    'A clock reads offset + t × (1 + drift): 1 ppm is 86.4 ms a day, so 50 ppm is 4.32 s a day.',
    'NTP assumes the path takes as long each way; an asymmetric path leaves an error of (forward − return) / 2 even when both clocks are perfect.',
    'Between syncs the error grows at the drift rate, so it peaks near drift × poll interval, and a step can move the wall clock backwards: time a duration with a monotonic clock.',
    'Last-write-wins, leases and merged logs break when they compare timestamps from different machines; waiting out an interval of 2ε restores the order while no clock is off by more than ε.',
  ],
  quiz: [
    {
      q: 'Which clock should a program use to time how long a request took?',
      options: [
        'The monotonic clock, because a sync can step the wall clock backwards',
        'The wall clock, because a synced clock reads exactly the same as true time',
        'The wall clock of the server, because every server agrees once NTP has run',
        'Either, because the two differ only in what they are called',
      ],
      answer: 0,
      why: 'A step by NTP can make the wall clock jump, even backwards, so a duration measured across it can come out negative. A monotonic clock is never stepped (NTP may still slew its rate by a small amount), which is why durations use it.',
    },
    {
      q: 'Replica A\'s clock is 5 s fast. A client writes x = 1 through A and, once that is acknowledged, a second client writes x = 2 through B. What does last-write-wins keep?',
      options: [
        'x = 1, because its stamp is larger even though it is the earlier write',
        'x = 2, because it was written later in real time than the first one was',
        'Both values, kept side by side because their stamps differ from each other',
        'Neither, because the two stamps disagree with the real order of the writes',
      ],
      answer: 0,
      why: 'Last-write-wins compares stamps, not real time. A stamped its write with its own fast clock, so the earlier write carries the larger stamp and silently replaces the later one.',
    },
    {
      q: 'Both clocks are perfect, the forward delay is 10 ms and the return delay is 50 ms. What offset does NTP estimate?',
      options: [
        'About −20 ms, half the difference of the two delays',
        'Zero, because two perfect clocks have no offset to find',
        'About +20 ms, half the difference taken the other way',
        'About 30 ms, the average of the two delays on the path',
      ],
      answer: 0,
      why: 'NTP assumes both directions take equally long, so any difference shows up as offset: (10 − 50) / 2. Perfect clocks do not rescue the estimate.',
    },
    {
      q: 'A node has just synced with NTP. How far can its clock still be from true time?',
      options: [
        'By about its drift times the poll interval, plus half any asymmetry in the path',
        'By nothing at all, because a sync sets the clock to exactly the true time',
        'By one network round trip, since the drift of its clock does not matter',
        'By the poll interval itself, whatever the drift of its hardware happens to be',
      ],
      answer: 0,
      why: 'A sync removes the error it measured, but the clock starts drifting again at once and the measurement has its own asymmetry error. NTP makes the clocks close, not equal.',
    },
    {
      q: 'A holder\'s clock is 3 s slow and its lease ends at server time 10 s. When does it stop believing it holds the lease?',
      options: [
        'At true time 13 s, three seconds after the server counted the lease as expired',
        'At true time 7 s, three seconds before the server counts the lease as expired',
        'At true time 10 s, since an absolute time means the same everywhere',
        'At true time 10 s plus the message delay, with the skew making no difference',
      ],
      answer: 0,
      why: 'The holder reads its own slow clock, so it sees three more seconds remaining than the server does. If the server hands the lease on at 10.5 s, two nodes believe they hold it until 13 s.',
    },
  ],
};

function driftTimesPoll(): number {
  return driftView({ ...DEFAULT_DRIFT, mode: 'step', pollExp: 10 }).driftTimesPollMs;
}

export default lesson;
