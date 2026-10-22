import { decimal, pctText } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { DEFAULT_DECIDE_AT } from './init';
import { Stage } from './Stage';
import {
  BROKEN_SEED, BROKEN_TIMEOUT_MS, JITTER, PAUSE, SAFE_TIMEOUT_MS, SCENE_RUN_MS, defaultSetup, detectionMean, expectedFalseInRun, falseSuspicions,
  runDetector, swimFalseSuspicion, twinRuns,
} from './model';

const firstRunFalse = falseSuspicions(runDetector(defaultSetup(), SCENE_RUN_MS)).length;
const parts = Math.round(twinRuns(BROKEN_SEED, PAUSE.default).partsAt ?? 0);
const swim = (p: number, k: number) => pctText(swimFalseSuspicion(p, k, 'none'), 2);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A monitor that hears nothing cannot tell a crashed process from a paused or slow one. A detector trades false alarms against how long a real crash goes unnoticed.',
    what: 'A failure detector turns silence into a guess: no heartbeat for T milliseconds means "suspect". A short T catches a crash fast but cries wolf when delays jitter; a long T is calm but slow. Smarter detectors adapt, either by modelling the gaps they have seen (phi accrual) or by asking other nodes to probe the target before giving up on it (SWIM). In an asynchronous system no rule gets both completeness and accuracy.',
    analogy: 'A neighbour who has not replied to your texts for a day. They might be away, asleep, or in trouble, and the silence itself looks the same in each of the three. Asking a mutual friend to knock on the door is a better test than waiting longer.',
    useCases: [
      'Cluster membership in databases and service meshes that need to decide who is up',
      'Leader election, where a follower must guess that the leader is gone before it starts a vote',
      'Choosing timeouts and heartbeat intervals without flapping or slow failover',
      'Reading "the node was marked down" in a postmortem and asking which guess went wrong',
    ],
    why: 'Failover that is too eager takes down healthy nodes, and failover that is too patient leaves users waiting on a dead one. Knowing that the detector can just guess, and what it costs to tune the guess, is what lets you choose a timeout on purpose instead of copying a default.',
    watch:
      'Blue ticks are heartbeats arriving at the monitor. A red bar is the monitor suspecting a peer that is alive, a green bar is it suspecting a peer that is really down or paused (catching a crash is the good outcome), and a violet band is a paused peer. In the plots the red curve is false alarms per minute, the green curve is detection time, the yellow rule is the current timeout and blue dots are measured. In the phi scene the yellow curve is the monitor\'s suspicion and the violet rule is the timeout it implies. In the probe scene an arrow stopped by a cross is a lost message. The chips say what is simulated, a toy, illustrative or from memory.',
  },
  tryThis: [
    `At the defaults (fixed timeout ${BROKEN_TIMEOUT_MS} ms, jitter ${JITTER.default} ms, seed ${BROKEN_SEED}) press Run 10 s: the monitor raises ${firstRunFalse} false suspicion${firstRunFalse === 1 ? '' : 's'} of a live peer (a red bar), and the closed form expects ${decimal(expectedFalseInRun(BROKEN_TIMEOUT_MS, JITTER.default, SCENE_RUN_MS), 1)} per 10 s.`,
    `From the defaults move T to ${SAFE_TIMEOUT_MS} ms and press Run 10 s again on the same seed: no false suspicion. Then press Crash P at about 5 s: the closed-form detection time moves from ${decimal(detectionMean(BROKEN_TIMEOUT_MS, JITTER.default), 0)} ms to ${decimal(detectionMean(SAFE_TIMEOUT_MS, JITTER.default), 0)} ms.`,
    `In "Crash or pause?" (pause ${PAUSE.default} ms, seed ${BROKEN_SEED}) the two runs part at about ${parts} ms. Leave "Decide at" at ${DEFAULT_DECIDE_AT.toLocaleString('en-US')} ms and press Say paused: the page says the answer was a guess, because run A's peer is dead.`,
    `In "SWIM, ask a friend" at the defaults (10% of messages lost, k = 0) the exact chance of a wrong suspicion per period is ${swim(0.1, 0)}. Set k to 3: it falls to ${swim(0.1, 3)}.`,
    'In "SWIM, ask a friend" set "Messages lost" to 0% and pick "M and B cut both ways": with k = 0 the monitor suspects B in every period. Raise k to 1 and it stops, because the helper reaches B along a path the cut does not touch.',
  ],
  keyIdeas: [
    'A monitor that hears silence cannot tell a crashed peer from a paused or slow one: in this model the two runs give M the same heartbeat list until the first heartbeat after the pause.',
    'A fixed timeout trades false suspicions against detection time: raising it from 185 ms to 400 ms removes the false alarms in this model and makes a real crash take longer to notice.',
    'Phi accrual sets the timeout from the gaps it has seen, so the wait moves with the jitter; phi is the model\'s statement about a normal curve, not a promise, because these gaps are not normal.',
    'SWIM asks other nodes to probe the target through a different path, so one lossy or cut link no longer makes the monitor give up: the chance of a wrong suspicion falls geometrically with each helper added.',
  ],
  quiz: [
    {
      q: 'M has heard nothing from P for 300 ms. What has M learned?',
      options: [
        'That P has crashed, because a live process always answers in time',
        'Only that nothing arrived: P may be crashed, paused or just slow',
        'That the link is down, since a crashed node would have said so',
        'That P is slow, because a crashed node closes its connection first',
      ],
      answer: 1,
      why: 'Silence is the whole of what M observes. A crash, a pause and a slow link look the same from outside until something else arrives, so "suspect" is a guess and the scene shows two runs that are identical to M until the pause ends.',
    },
    {
      q: 'You raise the timeout from 185 ms to 400 ms. What changes in this model?',
      options: [
        'Both false suspicions and detection time fall together',
        'Almost no false suspicions, and detection takes longer',
        'False suspicions rise, because a longer wait lets more delay in',
        'Nothing, since the heartbeat interval alone sets detection time',
      ],
      answer: 1,
      why: `The per-gap chance of a false alarm falls from ${pctText(0.5 * Math.exp(-4.25), 2)} to a rounding error, and the mean detection time rises from ${decimal(detectionMean(185, 20), 0)} ms to ${decimal(detectionMean(400, 20), 0)} ms. Both curves move, in opposite directions.`,
    },
    {
      q: 'Why can a phi-accrual detector adapt where a fixed timeout cannot?',
      options: [
        'It sends heartbeats faster whenever the network looks busy',
        'It asks other nodes to confirm every suspicion before acting',
        'Its implied timeout moves with the jitter it has recently seen',
        'It measures the true crash time, so it can avoid a false alarm',
      ],
      answer: 2,
      why: 'Phi accrual keeps a window of recent gaps and turns the threshold into a wait using their mean and spread. When the jitter grows the spread grows and so does the wait; a fixed timeout stays where it was set. Asking other nodes is SWIM, a different design.',
    },
    {
      q: 'M cannot reach B, but a helper H can. What does a ping-req through H tell M?',
      options: [
        'Whether B is alive, over a path M\'s own cut does not touch',
        'Whether H is alive, because H forwards the probe to B',
        'Nothing useful, because H shares the same cut with M',
        'That B has crashed, because the direct ping already failed',
      ],
      answer: 0,
      why: 'H has its own link to B, so an ack coming back through H is evidence about B that the cut cannot block. One failed direct ping is not evidence of a crash; it is one failed path.',
    },
    {
      q: 'With 10% loss on every message and one helper (k = 1), the false-suspicion chance per period is about:',
      options: [
        '19%, exactly the same as with no helper at all',
        `${swim(0.1, 1)}: 0.19 times the chance the one helper path also fails`,
        '0.8%, which is what three helpers failing together would give',
        '34%, the chance the helper path fails by itself',
      ],
      answer: 1,
      why: 'The direct round trip fails with 1 - 0.9^2 = 0.19. A helper path has four messages, so it fails with 1 - 0.9^4 = 0.3439. Both paths have to fail: 0.19 x 0.3439 = 0.0653.',
    },
  ],
};

export default lesson;
