import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'TCP guarantees every byte arrives, in order, by acknowledging and resending. UDP just sends packets and hopes, which makes it faster and more predictable when late data is useless anyway.',
    what: "TCP numbers every packet, the receiver acknowledges what it has, and the sender retransmits anything that isn't acknowledged in time. The receiver only hands the application an unbroken, in-order stream, so one lost packet stalls everything behind it (head-of-line blocking). TCP also runs congestion control, backing off when losses suggest the network is overloaded. UDP has none of this: no connection, no ACKs, no retries, no ordering. Each packet is delivered the moment it arrives, or never.",
    analogy: "TCP is registered mail with a tracking number: slow, but nothing goes missing and it arrives in order. UDP is shouting across a noisy room: instant, and if a word gets lost you just carry on.",
    useCases: [
      'TCP: web pages and APIs (HTTP/1.1 and HTTP/2), databases, SSH, file transfers, email',
      'UDP: video calls, online games and live streams, where a late packet is worse than a missing one',
      'UDP: DNS lookups, where a single small request is cheaper to just retry',
      'QUIC and HTTP/3: reliable streams rebuilt on top of UDP to avoid TCP head-of-line blocking',
    ],
    why: "Mid-level engineers are expected to know why their protocol behaves the way it does under packet loss: why a slightly lossy link makes a TCP connection crawl, why a real-time feature needs UDP or WebRTC, and what problem HTTP/3 actually solves. It's also a standard interview comparison.",
    watch: "The top lane is TCP, the bottom is UDP, sending the same 12 packets. Blue squares are packets in flight, violet ones are TCP retransmits, and a red ✕ is a packet the network dropped. Green ACK pills flow back in the TCP lane. At the receiver, yellow squares are held back waiting for a gap (or, for UDP, arrived out of order), green ones were handed to the app, and dashed red ones never arrived. The chart at the bottom is TCP's congestion window. To guarantee the story shows up, whenever loss is above 0% the first send of TCP #4 and UDP #5 is always dropped; every other loss is random. Real networks drop packets unpredictably.",
  },
  tryThis: [
    'Press play and watch TCP freeze behind the one lost packet, then release a burst.',
    'Drag loss to 0%: now TCP is only slow at the start, while its window ramps up (slow start).',
    'Crank loss to 40% and compare how long TCP takes against what UDP loses.',
    'Switch the app to Video call: which lane would you rather be on?',
  ],
  keyIdeas: [
    'TCP: ACKs and retransmits make delivery reliable and ordered.',
    'Head-of-line blocking: one lost TCP packet holds up everything after it.',
    'UDP: no handshake, ACKs or retries; lowest latency, and loss is your problem.',
    "Congestion control: TCP shrinks its sending window when it sees loss, so it doesn't swamp the network.",
  ],
  quiz: [
    {
      q: 'A TCP packet is lost, but the ones after it arrive. What does the receiving app see?',
      options: ['The later packets immediately', 'Nothing new until the lost one is retransmitted', 'A corrupted stream', 'An error'],
      answer: 1,
      why: 'TCP only delivers an in-order stream, so later data waits in the buffer until the gap is filled. That is head-of-line blocking.',
    },
    {
      q: 'Why do video calls and online games usually prefer UDP?',
      options: ['UDP is encrypted', 'UDP never loses packets', 'Retransmitted data would arrive too late to be useful', 'TCP cannot carry video'],
      answer: 2,
      why: 'A frame that arrives half a second late is worthless. Skipping it and moving on beats freezing while TCP retransmits.',
    },
    {
      q: 'After a timeout, what does TCP congestion control do to its sending window?',
      options: ['Doubles it', 'Leaves it alone', 'Shrinks it sharply', 'Closes the connection'],
      answer: 2,
      why: 'Loss is treated as a sign of congestion, so TCP cuts its window (back to 1 in classic TCP Tahoe) and ramps up again carefully.',
    },
  ],
};

export default lesson;
