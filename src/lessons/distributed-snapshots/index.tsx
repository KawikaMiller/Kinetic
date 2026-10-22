import type { LessonModule } from '../../core/types';
import { integer } from '../../core/format';
import { offenceText } from './captions';
import { BUG_MARKERS_SEED, BUG_NAIVE_SEED, NAIVE_SEED } from './demoSeeds';
import { BROKEN_SEED } from './pins';
import { DEFAULT_OPTIONS, runSeed } from './sim';
import { SENDS, SMALL, TOTAL_TOKENS, recordedTotals, searchSmall } from './snapshot';
import { Stage } from './Stage';

const markers = runSeed(DEFAULT_OPTIONS, 1).result;
const naiveOptions = { ...DEFAULT_OPTIONS, method: 'naive' as const };
const naive = runSeed(naiveOptions, NAIVE_SEED).result;
const bEarly = runSeed({ ...naiveOptions, recordMs: [100, 0, 120] }, NAIVE_SEED).result;
const bLate = runSeed({ ...naiveOptions, recordMs: [100, 200, 120] }, NAIVE_SEED).result;
const bugged = runSeed({ ...DEFAULT_OPTIONS, bug: true }, BUG_MARKERS_SEED).result;
const bugNaive = runSeed({ ...naiveOptions, bug: true }, BUG_NAIVE_SEED).result;
const loose = runSeed({ ...DEFAULT_OPTIONS, fifo: false }, BROKEN_SEED).result;
const SENDS_DEFAULT = SENDS.min + 1;
const fifoSmall = searchSmall(true, SENDS_DEFAULT);
const looseSmall = searchSmall(false, SENDS_DEFAULT);
const missing = loose.mismatched[0];
const lastStep = looseSmall.violation?.steps[looseSmall.violation.steps.length - 1];
export const SMALL_RECORDED = lastStep ? recordedTotals(lastStep.state.nodes).total : null;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A snapshot of a running system cannot be taken by everyone looking at the same moment, because tokens in flight belong to nobody\'s record. Markers sent along the channels split before from after, and on FIFO channels the record adds up.',
    what: `Three processes pass tokens around, ${TOTAL_TOKENS} in total, and the lesson takes a photograph of them. The naive way has each process record its balance at a chosen time. Chandy-Lamport sends a marker on each channel: a process records its state when the first marker arrives and records what arrives on each channel until that channel's marker comes. Two independent checks judge each run: the recorded tokens need to sum to ${TOTAL_TOKENS}, and the cut needs to be closed, computed from vector clocks over the trace.`,
    analogy: 'Counting the guests at a party from photos taken at slightly different moments: someone who walked from the kitchen to the garden between photos is counted twice or missed. A snapshot needs a rule for the people in the doorway.',
    useCases: [
      'Detecting a stable property such as termination or a deadlock in a running system',
      'Taking a consistent checkpoint of a stream processor and its channels',
      'Debugging a distributed run from a recorded global state',
      'Reasoning about why an offset commit is a snapshot of one process, not of the system',
    ],
    why: 'A global state assembled from local readings can contradict itself, and the contradiction looks like a bug in the system. On FIFO channels a consistent cut tells a real fault, such as lost tokens, from an artefact of when each process looked.',
    watch:
      'The three processes are plain categories (amber, pink, sky). A token in flight is blue, a marker is violet, and a recorded process state is yellow with a dashed outline. A recorded channel content is blue and outlined. A check that holds is green, a lost or double-counted amount and an offending message are red. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `Press play and let the run finish (or drag the player to the last frame): the recorded total reads ${markers.total} of ${TOTAL_TOKENS} and both checks hold.`,
    `Switch the method to Everyone records at a chosen time (the seed moves to ${NAIVE_SEED}, a seed where it fails) and play to the end: the total reads ${naive.total} of ${TOTAL_TOKENS} for this seed, and the closure check fails and names the message: ${offenceText(naive.closure.offence!)}. 
Then set B's record time to 0 ms and play: the total reads ${bEarly.total}. Set it to 200 ms: ${bLate.total}. The total moves with the moment each process looks, and none of the readings counts the tokens in flight.`,
    `Back on Markers, turn FIFO off (seed ${BROKEN_SEED} is the pinned failing seed) and play to the end: the total reads ${loose.total} of ${TOTAL_TOKENS}, and the page names the channel from ${missing.from} to ${missing.to}, which held ${missing.inFlight} tokens that nobody recorded.`,
    `Open the second scene at ${SENDS_DEFAULT} transfers each: with FIFO the total is conserved in ${integer(fifoSmall.states)} states, and without it a counterexample of ${looseSmall.violation?.steps.length} steps loads in the trace player. Step to the end: the record sums to ${SMALL_RECORDED} of ${SMALL.total}.`,
    `Open the third scene (the bug is on and the seed is ${BUG_MARKERS_SEED}): with markers C dropped ${bugged.lostInCut} tokens inside the cut and the record reads ${bugged.total} of ${TOTAL_TOKENS}, a shortfall that is real. Switch to the naive cut (the seed moves to ${BUG_NAIVE_SEED}): the total reads ${bugNaive.total} of ${TOTAL_TOKENS}, and the page can no longer say how much of the shortfall is the bug.`,
  ],
  keyIdeas: [
    'A snapshot is a consistent cut, not a moment: recording everywhere at one time misses the tokens in flight, or counts a token twice when a receive is inside the cut and its send is outside.',
    'A marker separates what was sent before the sender recorded from what was sent after, so each process records its state at the first marker and records a channel until that channel\'s marker arrives.',
    'The algorithm needs FIFO channels in this model: a marker that overtakes a token sent before it closes the channel before the token arrives, and the token appears in nobody\'s record.',
    `On FIFO channels, a snapshot that passes the closure check has a total that can be trusted: when it reads 297 the missing 3 tokens are really missing. Without FIFO that fails: seed ${BROKEN_SEED} passes the closure check, reads ${loose.total}, and the missing tokens are still in a channel. The checks ran on seeded runs and on ${integer(fifoSmall.states)} explored states of a small model, and neither covers other sizes.`,
  ],
  quiz: [
    {
      q: 'Why is "everyone records at 100 ms" not a consistent snapshot of the tokens?',
      options: [
        'Tokens in flight at that moment belong to nobody\'s record',
        'A process cannot read its own balance at an exact moment',
        'A snapshot has to be taken by one process holding every token',
        'Clocks cannot run for 100 ms without drifting apart enough',
      ],
      answer: 0,
      why: 'A token sent before the moment and received after it is in a channel, and a naive cut records the processes alone. It is counted nowhere, or twice if the receive falls inside the cut and the send outside it.',
    },
    {
      q: 'What do markers do in Chandy-Lamport?',
      options: [
        'They tell each process to stop sending until the snapshot ends',
        'They carry the running total, which the initiator then adds up',
        'They split what was sent before the cut from what was sent after',
        'They synchronise each process\'s clock with the initiator\'s own clock',
      ],
      answer: 2,
      why: 'The system keeps running, and markers carry no data and no clock reading. On a FIFO channel everything ahead of the marker was sent before the cut, and everything behind it after.',
    },
    {
      q: 'Why does the lesson need FIFO channels?',
      options: [
        'FIFO makes delivery faster, so the snapshot can finish sooner than before',
        'A marker must not overtake a message sent before it on the channel',
        'Only FIFO channels can carry tokens at all, in any version of the algorithm',
        'FIFO lets the initiator choose which process is the first one to record',
      ],
      answer: 1,
      why: 'If the marker arrives first, the receiver records its state and closes the channel without the earlier token, which then appears in nobody\'s record. The search finds this in 4 steps. Variants for non-FIFO channels exist but are not built here.',
    },
    {
      q: 'A snapshot of the token system on FIFO channels passes the closure check and totals 297. What can you conclude?',
      options: [
        'The recording was inconsistent, so you should simply take another',
        'Three tokens are still in flight and will arrive a little later',
        'Some processes recorded at the wrong time and missed three tokens',
        'Three tokens are really missing from the system in this run',
      ],
      answer: 3,
      why: 'On FIFO channels tokens in flight are in the recorded channel contents, so they are already inside the 297. A cut that passes the closure check leaves no recording artefact to blame, so the shortfall is a real loss, such as a process that drops what it receives. Without FIFO this inference fails, as the non-FIFO seed shows.',
    },
    {
      q: 'A sends 30 to B. A records after sending (70), B records before receiving (100), and C records 100. What is the naive total?',
      options: [
        '300, since the tokens always add up whenever you add them',
        '330, because the 30 tokens are counted twice in the record',
        '270, the 30 in flight counted nowhere in the record',
        '240, because 60 tokens are missing from the record entirely',
      ],
      answer: 2,
      why: 'A\'s record no longer holds the 30 and B\'s record does not yet hold them, so 70 + 100 + 100 = 270. The closure check passes here, and the conservation check is what catches the 30 that a naive cut does not record.',
    },
  ],
};

export default lesson;
