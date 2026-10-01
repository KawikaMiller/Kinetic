import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Loading a web page is a chain of round trips: find the server's address (DNS), open a connection (TCP), secure it (TLS), and only then ask for the page (HTTP).",
    what: "The browser first turns a name like example.com into an IP address, asking a chain of DNS servers if the answer isn't cached. It then opens a TCP connection with a three-message handshake and agrees on encryption keys with TLS. Only then does the HTTP request go out and the response come back to be rendered.",
    analogy: "Look up the restaurant's address, walk there, agree on a secret code at the door, and only then order your food.",
    useCases: [
      "Debugging a slow site: is it DNS, connection setup, or the server itself?",
      "Reading the browser's Network tab and its waterfall chart",
      "Understanding why CDNs, keep-alive, HTTP/2 and TLS 1.3 exist",
      "The classic interview question: \"what happens when you type a URL and hit Enter?\"",
    ],
    why: "Every web and backend engineer builds on top of this chain. Knowing it tells you that latency usually comes from round trips rather than bandwidth, and which fix actually helps: caching, reusing connections, or moving servers closer.",
    watch: "The top half is finding the address (DNS); the bottom half is talking to the server. Each pill is one message, coloured by phase: violet DNS, blue TCP, yellow TLS, green HTTP, orange render. The browser-to-server link turns solid blue once TCP connects, then yellow with a 🔒 once TLS is up. The waterfall at the bottom shows where the time went (the timings are illustrative).",
  },
  tryThis: [
    'Press play and follow the packets. Top half is finding the address, bottom half is talking to it.',
    'Flip DNS to "Cached" and watch the whole top half of the trip disappear.',
    'Set Connection to "Reused": no DNS lookup, no TCP or TLS handshake at all.',
    'Compare TLS 1.2 vs 1.3 and watch the yellow slice of the waterfall.',
  ],
  keyIdeas: [
    'DNS turns a name into an IP: resolver → root → TLD → authoritative.',
    'TCP needs a round trip (SYN, SYN-ACK, ACK) before any data flows.',
    'TLS agrees on encryption keys: 1 round trip in TLS 1.3, 2 in TLS 1.2.',
    'Most page-load latency is round trips, not bandwidth. Caching and reuse kill round trips.',
  ],
  quiz: [
    {
      q: 'What does DNS actually give the browser?',
      options: [
        'An IP address for the domain',
        'The HTML of the requested page',
        'A session key for HTTPS',
        'An open connection to the server',
      ],
      answer: 0,
      why: 'DNS maps a human name (example.com) to a machine address (an IP like 203.0.113.10). The connection and the page both come after.',
    },
    {
      q: 'Which happens first on a brand-new HTTPS connection?',
      options: ['TLS handshake', 'HTTP GET', 'TCP handshake', 'Rendering'],
      answer: 2,
      why: 'TLS runs on top of TCP, so the TCP SYN / SYN-ACK / ACK has to finish before the TLS ClientHello can go out.',
    },
    {
      q: 'Why does keep-alive (connection reuse) make later requests faster?',
      options: [
        'It compresses the HTML',
        'It skips the TCP and TLS handshakes',
        'It skips the server’s work',
        'It makes packets travel faster',
      ],
      answer: 1,
      why: 'An open, already-encrypted connection means zero setup round trips. Straight to GET.',
    },
  ],
};

export default lesson;
