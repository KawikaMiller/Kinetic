import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'HTTP/1.1, HTTP/2 and HTTP/3 carry the same requests and responses; what changed is how many of them can share one connection, and what a single lost packet holds up.',
    what: 'HTTP/1.1 keeps a TCP connection open between requests (keep-alive), but each connection carries one response at a time, so browsers open about six per origin and queue the rest. HTTP/2 splits every request and response into binary frames tagged with a stream ID and interleaves them on one TCP connection, with HPACK compressing the repeated headers. That removes queueing at the HTTP layer, but TCP still delivers bytes strictly in order, so one lost packet stalls every stream. HTTP/3 runs the same idea over QUIC on UDP: each stream recovers from loss on its own, and the transport and TLS 1.3 handshakes are combined into one round trip.',
    analogy: 'HTTP/1.1 is six single-file checkout lanes: a slow customer holds up everyone behind them in that lane. HTTP/2 is one lane where cashiers serve everyone a bit at a time, until the conveyor belt jams and stops for all. HTTP/3 gives each customer a belt of their own.',
    useCases: [
      'Reading a DevTools network waterfall: queueing, waiting for the first byte and download time',
      'Deciding whether domain sharding or sprite sheets still help (mostly not on HTTP/2), and what bundling still saves in compression and per-request overhead',
      'Explaining why HTTP/3 helps most on lossy mobile and Wi-Fi networks',
      'Choosing what a load balancer or CDN should speak to browsers and to the origin',
    ],
    why: 'Page speed is mostly round trips and waiting, not raw bandwidth, and the HTTP version decides how much of that waiting overlaps. Knowing where head-of-line blocking lives (per connection in 1.1, in TCP for 2, and for 3 no transport-level blocking across streams) lets you read a waterfall and pick the right fix. It builds on `http-basics`, `tcp-udp`, `tls-handshake` and `latency-bandwidth`.',
    watch: 'Three waterfalls, one per version (on a phone, pick one with Show), with one lane per resource; HTTP/1.1 lanes also say which connection (c1 to c6) carried it. In each lane, hatched grey is time queued or waiting for the first byte, blue is bytes arriving, and the bar turns green once the response is complete. After a lost packet, the time a response is held up is a red dashed bar, and a red "✕ lost" marker line shows when the gap was noticed. The yellow line is the current time. The highlighted stream (picked under the waterfalls) has a yellow outline. In the HTTP/2 frame strip, each chip is one frame: H for HEADERS, D for DATA, with its stream ID, coloured by resource type (HTML sky blue, CSS amber, JS violet, images grey; HEADERS chips are a stronger tint), the highlighted stream\'s frames are solid yellow, and the lost packet is a red ✕ chip. The load times at the top turn green when a version finishes. In the header readout, HTTP/1.1\'s text is red (the costly side) and HPACK green.',
  },
  tryThis: [
    'Press play with the defaults and watch the HTTP/2 frame strip: frames from different streams take turns on one connection.',
    'Set HTTP/1.1 connections to 1 and play: each request waits for the response before it.',
    'Switch Lose a packet to Drop one and play: on HTTP/2 every unfinished bar turns red at once, on HTTP/3 only hero.jpg does.',
    'Drag the RTT up to 300 ms: the handshakes and per-request round trips grow, and HTTP/1.1 falls further behind.',
    'Under the waterfalls, highlight config.js and find the request that waits behind it on HTTP/1.1.',
  ],
  keyIdeas: [
    'HTTP/1.1 reuses connections but carries one response at a time on each, so browsers open about six per origin and still queue.',
    'HTTP/2 interleaves every request as frames on one TCP connection, and HPACK turns repeated headers into tiny table indexes.',
    'HTTP/2 removed head-of-line blocking at the HTTP layer only: one lost TCP packet still stalls every stream.',
    'HTTP/3 runs over QUIC on UDP: streams recover from loss independently, and setup takes 1 round trip instead of 2.',
  ],
  quiz: [
    {
      q: 'A page loads over HTTP/2 and one TCP packet carrying image data is lost. What waits for the retransmission?',
      options: [
        'Every stream on that connection, since TCP delivers bytes in order',
        'Only the image stream that the lost packet belonged to',
        'Nothing at all, because HTTP/2 removed head-of-line blocking',
        'Only requests sent after the loss; earlier ones are unaffected',
      ],
      answer: 0,
      why: 'HTTP/2 removed head-of-line blocking at the HTTP layer, so a slow response no longer holds up the next request. But all its streams share one TCP byte stream, and TCP won\'t hand the browser any byte past a gap. "Only the image stream" is what HTTP/3 achieves, because QUIC tracks loss per stream.',
    },
    {
      q: 'Why did browsers open about six connections per origin for HTTP/1.1?',
      options: [
        'Each connection carries one response at a time, so they need several',
        'HTTP/1.1 closes the connection after every single response it sends',
        'Six connections let the server share compressed headers between them',
        'TLS needs a separate connection for each type of file on the page',
      ],
      answer: 0,
      why: 'HTTP/1.1 connections are kept alive and reused, so it isn\'t a close after every response (that was HTTP/1.0 without keep-alive). But a connection carries one request and response at a time, so the only way to fetch in parallel is more connections, each paying its own handshake.',
    },
    {
      q: 'On a first connection with no resumption, how many round trips pass before the first request can go out over HTTP/2 with TLS 1.3, and over HTTP/3 once the client knows the server speaks it?',
      options: [
        'Two for HTTP/2 (TCP, then TLS) and one for HTTP/3 (QUIC does both)',
        'One for HTTP/2 and zero for HTTP/3, on every first connection',
        'Three for HTTP/2 (TCP, TLS, HTTP) and two for HTTP/3',
        'Two for both, because HTTP/3 still runs QUIC on top of TCP',
      ],
      answer: 0,
      why: 'TCP\'s handshake takes one round trip and TLS 1.3 another. QUIC runs over UDP and carries the TLS 1.3 handshake inside its own, so both finish in one. Zero round trips only happens when resuming an earlier session (0-RTT), never on a first connection, and QUIC does not run on TCP.',
    },
    {
      q: 'A page makes 12 requests whose headers are almost identical. What does HTTP/2\'s HPACK do with them?',
      options: [
        'Sends repeats as short indexes into a table both ends keep',
        'Drops headers the server has seen before from that browser',
        'Gzips the response bodies so the headers fit in one packet',
        'Merges all 12 requests into a single request with 12 paths',
      ],
      answer: 0,
      why: 'Both ends keep the same table of recent headers, so a header sent once costs about a byte the next time. HPACK compresses headers, not bodies, and every request still carries its full set of header fields, just encoded as references; it never silently drops them.',
    },
    {
      q: 'Over HTTP/1.1 with six connections, config.js takes 150 ms on the server. What does that slow response hold up?',
      options: [
        'The request queued behind it on that same connection',
        'Every response on all six of the browser\'s connections',
        'Nothing, since the server sends other files meanwhile',
        'Only the TLS handshake of the connection it went on',
      ],
      answer: 0,
      why: 'Each HTTP/1.1 connection carries one response at a time, so the next request waiting for that connection can\'t go until config.js is done: head-of-line blocking at the HTTP layer. The other five connections are independent, and the server can\'t slip another response onto a connection that is busy.',
    },
  ],
};

export default lesson;
