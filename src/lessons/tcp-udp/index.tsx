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
    watch: "The top lane is TCP, the bottom is UDP, sending the same 12 packets; the grey text beside each name says what the protocol promises. In the sender grid, grey squares are unsent, blue-outlined ones sent and green ones acknowledged; the yellow number under TCP's grid is its current window. On the wire, blue squares are packets in flight, violet ones are TCP retransmits, and a red ✕ is a packet the network dropped. Green ACK pills flow back in the TCP lane. At the receiver, orange squares are held back waiting for a gap (or, for UDP, arrived out of order), green ones were handed to the app, and dashed red ones never arrived. Badges under each receiver go green when the app got everything, red for a freeze or a corrupt file, and orange for glitches. The blue line at the bottom is TCP's congestion window. Whenever loss is above 0%, the first send of TCP #4 and UDP #5 is always dropped (the stage says so); every other loss is seeded random.",
  },
  tryThis: [
    'Press play and watch TCP freeze behind the one lost packet, then release a burst.',
    'Drag loss to 0%: TCP never resends and its window just ramps up (slow start). Any holding back now comes from reordering.',
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
      options: [
        'The later packets straight away, with a gap',
        'Nothing new until the lost one is resent',
        'The later packets, flagged as out of order',
        'An error, and the connection closes',
      ],
      answer: 1,
      why: 'TCP only hands the app an in-order stream, so later data waits in the buffer until the gap is filled: head-of-line blocking. The tempting answer, getting the later packets with a gap, is what UDP does; TCP never shows the app a gap.',
    },
    {
      q: 'Why do video calls and online games usually prefer UDP?',
      options: [
        'UDP encrypts each packet by default',
        'UDP never loses packets on a good link',
        'A resent frame would arrive too late to use',
        "TCP can't carry binary data like video frames",
      ],
      answer: 2,
      why: 'A frame that arrives half a second late is worthless. Skipping it and moving on beats freezing while TCP retransmits. UDP has no built-in encryption (that comes from DTLS or QUIC on top), and it loses packets whenever the network does.',
    },
    {
      q: 'After a timeout, what does TCP congestion control do to its sending window?',
      options: [
        'Doubles it to catch up faster',
        'Leaves it at its current size',
        'Cuts it right back, then ramps up again',
        'Closes the connection and opens a new one',
      ],
      answer: 2,
      why: 'Loss is treated as a sign of congestion, so TCP cuts its window (back to 1 after a timeout, as in the chart) and ramps up again carefully. The connection stays open: a timeout means resend, not reconnect.',
    },
    {
      q: 'In this lesson, the TCP receiver has #1 to #3 and #5. What ACK does it send back?',
      options: [
        'ACK 3, the last packet it got in order',
        'ACK 4, the next one it expects',
        'ACK 5, the newest packet that arrived',
        'ACK 6, one past the newest arrival',
      ],
      answer: 1,
      why: "An ACK says \"the next one I expect\". #5 sits in the buffer, unacknowledged, until #4 fills the gap; acking 6 would tell the sender #4 arrived when it didn't. (Real TCP counts bytes rather than packets, and can add selective ACKs for the held data.)",
    },
  ],
};

export default lesson;
