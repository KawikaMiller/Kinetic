import type { LessonModule } from '../../core/types';
import { HORIZON_MS, scheduleConfig } from './check';
import { listText } from './captions';
import { airplaneWindows, initialFaults, initialLive, initialLoop, liveEdit, liveRename, liveWait, setDraft, toggleAirplane } from './init';
import { SYNC } from './nodes';
import type { Strategy } from './ops';
import { runConfig } from './runs';
import {
  FAULTS_UNTIL_MS, LOOP_OUTAGE_FROM_MS, PRESET_UNTIL_MS, SKEW_PRESET_S, faultConfig, liveConfig, loopConfig, loopScript, loopUntil, presetConfig,
} from './scenarios';
import { BROKEN_SEED_ARRIVAL } from './seeds';
import { Stage } from './Stage';
import { ackedAfter, itemMark, pushAttempts } from './status';

const strategyRun = (strategy: Strategy, skewSec = 0) => runConfig(presetConfig('rename', strategy, skewSec), PRESET_UNTIL_MS);
const lww = strategyRun('lww');
const merged = strategyRun('merge');
const manual = strategyRun('manual');
const arrival = runConfig(scheduleConfig(BROKEN_SEED_ARRIVAL, 'arrival', true, 0), HORIZON_MS);

// try-this 1: the offline walkthrough, step by step through the same functions the scene uses
let live = initialLive();
live = toggleAirplane(live, 'laptop');
live = setDraft(live, 'laptop', 'Oat milk');
live = liveRename(live, 'laptop', 0);
live = liveEdit(live, 'phone', { kind: 'tick', pick: 0 });
live = liveWait(live);
const offlineRun = runConfig(liveConfig(live.script, airplaneWindows(live)), live.clock);
live = toggleAirplane(live, 'laptop');
live = liveWait(live);
const backRun = runConfig(liveConfig(live.script, airplaneWindows(live)), live.clock);

const skewed = runConfig(presetConfig('skew', 'lww', SKEW_PRESET_S), PRESET_UNTIL_MS);
const unskewed = runConfig(presetConfig('skew', 'lww', 0), PRESET_UNTIL_MS);

const f0 = initialFaults();
const faultsOn = runConfig(faultConfig(f0, f0.seed), FAULTS_UNTIL_MS);
const faultsOff = runConfig(faultConfig({ ...f0, dedupe: false }, f0.seed), FAULTS_UNTIL_MS);
const faultsBlank = runConfig(faultConfig({ ...f0, blank: true }, f0.seed), FAULTS_UNTIL_MS);

const l0 = initialLoop();
const loopRun = runConfig(loopConfig(l0, l0.seed), loopUntil(l0));
const loopAttempts = pushAttempts(loopRun.trace, 'laptop', loopScript(l0.edits).map((t) => t.at));
const loopAcked = ackedAfter(loopRun.trace, 'laptop', LOOP_OUTAGE_FROM_MS + l0.outageSec * 1000);
const loopCap30 = { ...l0, capSec: 30 };
const loopRun30 = runConfig(loopConfig(loopCap30, l0.seed), loopUntil(loopCap30));
const loopAttempts30 = pushAttempts(loopRun30.trace, 'laptop', loopScript(l0.edits).map((t) => t.at));

const f1 = (ms: number) => (ms / 1000).toFixed(1);
const items = (r: typeof backRun) => listText(r.views.server);
const mark = (r: typeof offlineRun, d: 'phone' | 'laptop') => itemMark(r[d], 'phone:1');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An offline-first app edits its own copy at once and queues each edit as an operation with a unique id. On reconnect the queue replays, and a conflict rule decides what the shared list becomes: some rules lose edits, others keep and list them.',
    what: 'Each device keeps a local replica of the data and an outbox. An edit is applied locally (optimistic: marked pending, then in flight, then confirmed) and queued as an operation with an id, a logical timestamp and the clock of the device. A sync loop pushes the outbox to a server and pulls what is new, retrying with exponential backoff and jitter while the network is down. When two devices edited the same thing while apart, a strategy resolves it: last write wins by device clock, per-field last write wins, a merge that keeps every operation and lists real conflicts, or a manual choice. Operation ids make a copy that arrives twice harmless, and a server can refuse an operation, so the device rolls it back and says so.',
    analogy: 'Two people editing photocopies of the same shopping list on separate flights. Each crosses things out and adds items on paper, and when they land they compare the pages: you can keep whichever page was written last, or go line by line and flag the lines where you both changed something.',
    useCases: [
      'Designing a mobile or PWA client that must work in a tunnel and sync when the signal returns',
      'Choosing between last-write-wins and a merge for a field that two people may edit',
      'Explaining a lost update after a sync, and why a skewed device clock can pick the wrong winner',
      'Making a retrying sync endpoint safe with idempotency keys, so a duplicate does not double-count',
    ],
    why: 'Mobile and web clients spend real time offline, and the bugs are in the reconnect: edits that vanish, duplicates that double-count, a clock that picks the wrong winner. Seeing the same edits under each rule, on a network that delays, drops and repeats messages, shows which guarantee each rule gives.',
    watch:
      'Each device card lists its items. A yellow word is an edit pending (made, not sent), a blue one is in flight (sent, not acknowledged) and a green one is confirmed; an orange chip and orange lines are a conflict kept for the user; a red hatched box is an edit the server refused and the device rolled back, and red text is an acknowledged edit that disappeared. A deleted item is a dim struck-through tombstone, and a dashed outline marks a device in airplane mode. In the delivery scene a red counter is over-counted and a green one is right. Chips say what is simulated, a toy, from memory or shown without being run.',
  },
  tryThis: [
    `In "Two devices" (Milk is on both, confirmed) switch the laptop to airplane mode, type Oat milk in its Title field, press rename, then press tick on the phone and press Wait 3 s: the laptop shows its rename ${mark(offlineRun, 'laptop')} and the phone's tick is ${mark(offlineRun, 'phone')}, and the replicas ${offlineRun.converged ? 'agree' : 'differ'}. Switch the laptop back online and wait: all three show ${items(backRun)}, and the two edits were to different fields, so there is no conflict (${backRun.views.server.conflicts.length} listed).`,
    `In "Conflict strategies" (last write wins, both rename the same item) the replicas ${lww.converged ? 'agree' : 'differ'} on ${listText(lww.views.server)} and ${lww.lost.length} acknowledged edit is lost with ${lww.views.server.conflicts.length} conflicts listed. Press "merge": ${merged.views.server.conflicts.length} conflict listed in orange and ${merged.lost.length} lost. Press "manual": the title reads ${listText(manual.views.server)}. Press "arrival order (broken)": it switches to the seeded random schedule on seed ${BROKEN_SEED_ARRIVAL}, and the replicas end ${arrival.converged ? 'the same' : 'different'}.`,
    `In "Conflict strategies" pick last write wins and press "clock skew 5 minutes": the laptop renamed first, but its clock is ${SKEW_PRESET_S} s ahead, so ${listText(skewed.views.server)} wins. Drag "Laptop clock ahead by" to nothing: the later edit wins, ${listText(unskewed.views.server)}. Switch to merge: the same result either way.`,
    `In "Delivery faults" (20% loss, 40% duplication, deduplicate by id) the counter reads ${faultsOn.views.phone.counter}, ${faultsOn.views.laptop.counter}, ${faultsOn.views.server.counter} for ${new Set(faultsOn.accepted.filter((o) => o.kind === 'inc').map((o) => o.id)).size} increments. Turn deduplication off: ${faultsOff.views.phone.counter}, ${faultsOff.views.laptop.counter}, ${faultsOff.views.server.counter}. Turn it back on and set "Laptop also sends" to a blank rename: the server refuses it, the laptop shows ${faultsBlank.laptop.notices.length} rolled-back edit, and the counter stays ${faultsBlank.views.server.counter}.`,
    `In "The sync loop" (a ${l0.outageSec} s outage, ${l0.edits} edits, a ${l0.capSec} s cap) the laptop pushes ${loopAttempts.length} times and ${loopAttempts.filter((a) => a.lost).length} are lost; the first push after the outage is acknowledged at ${f1(loopAcked ?? 0)} s. Raise the retry cap to 30 s: ${loopAttempts30.length} pushes, ${loopAttempts30.filter((a) => a.lost).length} lost.`,
  ],
  keyIdeas: [
    'Offline-first is more than caching reads: the device keeps its own copy and an outbox of operations, applies edits at once and syncs later, so the list on screen is always the device\'s own.',
    'Last write wins by device clock keeps replicas equal but can drop an edit nothing lists, and with a skewed clock it keeps the device with the later clock, not the later edit.',
    'In this model, a merge that gives each operation a unique id, orders by causality and lists what it cannot resolve converged and lost no acknowledged edit on 200 seeded schedules; a text merge can still produce words that neither person wrote.',
    'Delivery is at least once, so retries and duplicates are normal: operation ids make a second copy harmless, and a refused operation is rolled back with a notice instead of being quietly reverted.',
  ],
  quiz: [
    {
      q: 'What does an offline-first app keep on the device besides cached reads?',
      options: [
        'A local copy it edits at once, and an outbox of operations to send later',
        'A read-only snapshot, with every edit blocked until the connection returns',
        'A small server that the other devices read their data from directly',
        'A clock that is reset to the server\'s time each time the app starts',
      ],
      answer: 0,
      why: 'The device applies edits to its own replica immediately and queues each as an operation, so it keeps working in a tunnel and syncs on reconnect. Caching reads alone would block writes.',
    },
    {
      q: 'Two offline devices edit the same field. The laptop edits first, but its clock runs 5 minutes ahead. Which edit does last-write-wins by device clock keep?',
      options: [
        'The laptop\'s edit, because its timestamp is the later one',
        'The phone\'s edit, because it happened later in real time',
        'Both edits, combined field by field into one record',
        'Neither edit, because the two clocks disagree with each other',
      ],
      answer: 0,
      why: 'The rule compares the timestamps the devices wrote, not real time. A skewed clock makes an earlier edit look later, so it wins and the phone\'s edit is lost.',
    },
    {
      q: 'A merge keeps every operation under a unique id and lists conflicts. Which problem can still be left?',
      options: [
        'Two edits to one text can both be kept and still read as something neither person wrote',
        'The replicas can end with different lists even after every operation has been delivered',
        'An acknowledged edit can vanish from the list without any conflict naming it',
        'A counter can be added up twice although every operation has a unique id',
      ],
      answer: 0,
      why: 'In this model the merge converges and loses nothing silently, but keeping both edits is not the same as the result making sense: interleaved or contradictory text is a semantic conflict that only a person can settle.',
    },
    {
      q: 'The acknowledgement of a counter increment is lost, so the device retries the push. Why does the retry not count twice?',
      options: [
        'The server recognises the operation id it already holds and ignores the second copy',
        'The network never delivers a second copy of a message whose reply was lost',
        'The device sends the whole list again, so the server overwrites its own copy',
        'The retry is sent with a smaller delay, which makes it arrive before the first',
      ],
      answer: 0,
      why: 'Delivery is at least once, so a copy is expected. An id lets the server tell a repeat from a new increment; without it the counter reads too high, as the delivery scene shows.',
    },
    {
      q: `A client retries after ${SYNC.baseMs / 1000} s, doubling the wait up to a cap of ${SYNC.capMs / 1000} s, with jitter that only shortens it. What is the longest a wait can be?`,
      options: [`${SYNC.capMs / 1000} s`, `${(SYNC.capMs * 2) / 1000} s`, `${SYNC.baseMs / 1000} s`, `${SYNC.capMs / 2000} s`],
      answer: 0,
      why: 'The wait doubles (1, 2, 4, 8 s) and stops at the cap. The jitter just takes some of it away, so it spreads the retries of many clients without making a wait longer than the cap.',
    },
  ],
};

export default lesson;
