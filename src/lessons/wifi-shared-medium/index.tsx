import type { LessonModule } from '../../core/types';
import { pct } from '../../core/format';
import { mulberry32 } from '../../core/random';
import { backoffStory } from './backoff';
import { goodputText } from './captions';
import { DCF_TICKS, DEFAULT_STATIONS, airtimeShare, analysisAirtime, collisionShare, initDcf, stepDcf } from './dcf';
import { exchange, hearing } from './hidden';
import { DEFAULT_BACKOFF_SEED, DEFAULT_CONTENTION_SEED, initialHidden, initialRates } from './init';
import { ratesFor, shares } from './rates';
import { Stage } from './Stage';

const story = backoffStory(DEFAULT_BACKOFF_SEED, false);
const lost = backoffStory(DEFAULT_BACKOFF_SEED, true);
const freeze = story.slots.find((s, i) => s.medium === 'busy-other' && story.slots[i - 1]?.medium === 'idle');
const sendSlot = story.slots.findIndex((s) => s.medium === 'a-sends');

const shown = (n: number) => {
  const rnd = mulberry32(DEFAULT_CONTENTION_SEED);
  let s = initDcf(n, rnd);
  for (let i = 0; i < DCF_TICKS; i++) s = stepDcf(s, rnd);
  return { collision: collisionShare(s) as number, airtime: airtimeShare(s) as number };
};
const five = shown(DEFAULT_STATIONS);
const twelve = shown(12);

const hs = initialHidden();
const hear = hearing({ a: hs.a, c: hs.c, range: hs.range });
const plain = exchange(hear, hs.frame, false);
const rts = exchange(hear, hs.frame, true);
const long = exchange(hear, 40, false);
const longRts = exchange(hear, 40, true);
const short = { plain: exchange(hear, 2, false), rts: exchange(hear, 2, true) };

const r0 = initialRates();
const slowShares = shares(ratesFor(r0.count, r0.slow));
const allFast = shares(ratesFor(r0.count, r0.slow.map(() => false)));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Wi-Fi stations share one channel by waiting a random time and counting it down only while the air is quiet. They cannot hear a collision, so they avoid it and infer loss from a missing ACK, and the more stations compete, the more airtime is wasted.',
    what: 'A radio cannot listen while it sends, and two stations can be out of each other\'s range, so Wi-Fi does not detect collisions as old shared Ethernet did. A station waits until the medium has been idle for a short gap, draws a random backoff, counts it down only through idle slots, sends, and waits for an ACK. A missing ACK means a loss: it doubles its window and tries again. With many saturated stations more attempts collide, so aggregate throughput falls instead of staying flat. A hidden station, out of range of another but not of the access point, cannot sense it at all; RTS and CTS let the access point silence the other station for the exchange. And a station at a low rate holds the air for longer per frame, so it drags down everyone else\'s throughput.',
    analogy: 'A meeting room where nobody can talk and listen at the same time. Everyone waits for a pause, then counts a random number of beats before speaking. A speaker who hears no "got it" back assumes they were talked over and waits longer next time. Two people on opposite ends of a long hall cannot hear each other, so the person in the middle has to call "quiet" for one of them.',
    useCases: [
      'Explaining why an office Wi-Fi gets slower for everyone as more laptops join, beyond just sharing bandwidth',
      'Understanding why one old device on a low rate slows a whole access point',
      'Reading why RTS/CTS is off by default for small frames and worth turning on for hidden nodes with big ones',
      'Seeing why a missing ACK, not a heard collision, drives Wi-Fi retransmissions',
    ],
    why: 'Wireless performance problems are usually about the shared air, not about the link speed on the label: collisions you cannot hear, nodes that cannot hear each other, and one slow station. Knowing how the backoff and the ACK work tells you which of these a symptom points to.',
    watch:
      'Avoid, not detect: a blue hatched bar is station A counting down in idle slots, a grey hatched bar is A waiting with its counter frozen or waiting for DIFS, a yellow bar is A sending, a pink bar is station B on the air, green is an ACK, and a dashed red bar is an ACK that never came. Many stations: green bars are frames that got through, red bars are collisions where two or more sent, blue hatched bars are stations counting down; the fairness bars use plain tones, one per station. Hidden node: amber and pink are stations A and C with their radio range dashed, a grey station is out of range of the access point, a red ring on the access point means overlapping frames collide there, and violet arrows are the CTS that silences a station once RTS/CTS is on. One slow station: each bar is a station\'s share of the air. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `In "Avoid, not detect" (seed ${DEFAULT_BACKOFF_SEED}) press play: A draws a backoff of ${story.draws[0]} while station B is on the air, counts down in idle slots, and its counter freezes at ${freeze?.counter} when B sends again; it sends at slot ${sendSlot}. Switch "The ACK" to "goes missing": A doubles its window to 31 and draws again (${lost.draws[1]} this time).`,
    `In "Many stations" (${DEFAULT_STATIONS} stations, seed ${DEFAULT_CONTENTION_SEED}) press play: after ${DCF_TICKS} slots ${pct(five.collision)} of attempts collided and ${pct(five.airtime)} of the airtime carried a frame. Drag "Stations" to 12: ${pct(twelve.collision)} collide and ${pct(twelve.airtime)} carries a frame, and the long-run analysis line falls from ${pct(analysisAirtime(DEFAULT_STATIONS))} to ${pct(analysisAirtime(12))}.`,
    `In "Hidden node" A and C are hidden from each other and frames are ${hs.frame} slots: ${pct(plain.pCollide, 0)} of attempts collide and ${goodputText(plain.goodput)} of the airtime delivers payload. Turn on RTS/CTS: data frames collide in 0% of attempts and ${goodputText(rts.goodput)} of the airtime delivers payload.`,
    `In "Hidden node" drag "Frame length" to 40: without RTS/CTS the airtime that delivers payload reads ${goodputText(long.goodput)}, with it ${goodputText(longRts.goodput)}. Drag it to 2: RTS/CTS now loses, ${goodputText(short.rts.goodput)} against ${goodputText(short.plain.goodput)}.`,
    `In "One slow station" (3 stations, S3 at 6 Mbit/s) each station gets ${slowShares.stations[0].mbps.toFixed(1)} Mbit/s. Press S3 to make it fast: each gets ${allFast.stations[0].mbps.toFixed(1)} Mbit/s.`,
  ],
  keyIdeas: [
    'A radio cannot listen while it sends, so Wi-Fi avoids collisions with a random backoff counted down through idle slots and not busy ones, and infers a loss from a missing ACK.',
    'In this model every extra saturated station raises the share of attempts that collide, so the airtime that carries frames falls even though the channel is never idle for long.',
    'A hidden node cannot sense the station it collides with; RTS/CTS lets the access point silence the other station, which costs fixed overhead and pays when frames are long or hidden nodes exist.',
    'Stations get about equal turns, so one station at a low rate holds the air longer per frame and lowers everyone\'s throughput to match.',
  ],
  quiz: [
    {
      q: 'Why does Wi-Fi avoid collisions instead of detecting them the way old shared Ethernet did?',
      options: [
        'Wi-Fi frames are too short for a collision to be noticed by any station',
        'A radio cannot listen while it sends, and stations may be out of each other\'s range',
        'The access point forbids two stations from ever transmitting in the same slot',
        'Collisions on radio links are corrected automatically by the receiver without any resend',
      ],
      answer: 1,
      why: 'A transmitting radio cannot hear the channel, and a hidden station cannot hear the sender. So the sender infers a loss from a missing ACK and backs off, rather than detecting the collision as it happens.',
    },
    {
      q: 'Twelve stations all want to send all the time, instead of two. What happens to the total throughput of the channel?',
      options: [
        'It stays the same, because the channel is shared in equal parts',
        'It rises, because more stations keep the channel busy at every single moment',
        'It doubles, because there are more stations sending at once',
        'It falls, because more attempts collide and that airtime carries nothing',
      ],
      answer: 3,
      why: 'Each station gets a smaller share, and the whole is also smaller: more attempts start in the same slot, collide, and waste the airtime. In this model the airtime carrying frames falls as stations are added.',
    },
    {
      q: 'Stations A and C both reach the access point but neither hears the other. What goes wrong?',
      options: [
        'Neither senses the other, so both may send together and collide at the access point',
        'The access point cannot decode either station, because the signals are too weak to read',
        'A and C each defer forever, because each assumes the other is always sending',
        'The access point sends an ACK for both frames, so neither station retransmits',
      ],
      answer: 0,
      why: 'Carrier sensing works between stations that hear each other. Hidden stations see an idle medium and send, and their frames overlap at the access point, where both are lost.',
    },
    {
      q: 'What does the CTS from the access point do once RTS/CTS is on?',
      options: [
        'It tells the sender to switch to a lower rate for its next frame to be safe',
        'It confirms that the data frame itself has arrived at the receiver without errors',
        'It tells every station that hears it to stay silent for the exchange, even a hidden one',
        'It doubles the contention window of every station that happens to hear it',
      ],
      answer: 2,
      why: 'Each station within range of the access point hears the CTS and sets its NAV, a timer during which it does not send. A station hidden from the sender is silenced this way, so the data frame does not collide.',
    },
    {
      q: 'One station on a 3-station network drops to 6 Mbit/s while the others stay at 54. What happens to the fast stations?',
      options: [
        'Their throughput drops, because the slow station holds the air for longer on each turn',
        'Nothing changes for them, because each station keeps sending at its own rate of 54 Mbit/s',
        'Their throughput rises, because the slow station sends less often than they do on the channel',
        'They also drop to 6 Mbit/s, because the access point sets one single rate for all of its stations',
      ],
      answer: 0,
      why: 'Stations get about equal numbers of turns, and a frame at 6 Mbit/s occupies the air much longer than one at 54. Each station sends one frame per round, so the round gets long and everyone\'s throughput falls with it.',
    },
  ],
};

export default lesson;
