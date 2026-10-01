import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Networking is split into layers, and each one wraps the data from the layer above in its own header: a message inside a segment inside a packet inside a frame.',
    what: 'Your app writes a message (HTTP). TCP wraps it in a segment with port numbers so it reaches the right program. IP wraps that in a packet with source and destination addresses so routers can forward it across the internet. Ethernet wraps that in a frame with hardware (MAC) addresses for one hop on one link. Each router strips the frame, reads only the IP header, and builds a fresh frame for the next link; the receiver unwraps the layers in reverse.',
    analogy: 'A letter in an envelope, inside a courier\'s parcel, inside a lorry. Each depot only reads the label it needs and swaps the lorry; nobody on the way opens your letter.',
    useCases: [
      'Debugging "it doesn\'t work": is it DNS, the port, the route or the cable?',
      'Reading tools that speak in layers: "a layer 7 load balancer", "an L4 firewall"',
      'Understanding what Wireshark or tcpdump shows you, header by header',
      'Knowing why tiny messages are expensive: the headers can be bigger than the data',
    ],
    why: 'Almost every networking conversation at work uses layer vocabulary, and knowing which layer a failure lives on tells you which tool to reach for. It also kills the idea that routers read your data: they only look at IP.',
    watch: 'Across the top are four devices: the laptop and the server have all four layers, the two routers only Internet and Link (their dashed box says the rest is never opened). Each layer has its own colour everywhere: Application blue, Transport violet, Internet green, Link orange. The device the data is at has a yellow name, and the layer being added, removed or read has a yellow outline. The orange pill is the frame on the wire, which turns solid orange for the link being crossed. Below, the nested boxes are the envelopes actually sent, with Ethernet\'s FCS box on the right; a field a router just rewrote (TTL, MAC addresses) turns yellow. The OSI toggle splits the stacks into 7 numbered layers, and the bar shows how much of what\'s sent is your data. In "Which layer is broken?", the chips pick a layer; checked cards turn green (right) or red (wrong).',
  },
  tryThis: [
    'Press play and watch the envelopes grow on the laptop, then shrink on the server.',
    'Step to Router 1: which fields turn yellow, and which envelopes does it never open?',
    'Flip "Layer names" to OSI (7) and see where Presentation and Session went.',
    'Switch "Message size" from GET / to 1 MB image and compare how much of the traffic is your data.',
    'Open "Which layer is broken?" and place all six symptoms before pressing Check answers.',
  ],
  keyIdeas: [
    'Each layer adds its own header: HTTP message → TCP segment → IP packet → Ethernet frame.',
    'Routers only read up to IP; TCP and your HTTP stay sealed (NAT is the exception that rewrites IP).',
    'MAC addresses change on every link; IP addresses stay the same end to end, and TTL drops by 1 per router.',
    'OSI\'s 7 layers are a teaching model; the internet runs on TCP/IP\'s 4.',
  ],
  quiz: [
    {
      q: 'A packet crosses a router on its way to a web server. What does the router read?',
      options: [
        'The IP header (and the frame it arrived in)',
        'The HTTP request, to route by URL',
        'The TCP port, to pick the right app',
        'Nothing: it forwards every packet blindly',
      ],
      answer: 0,
      why: 'Routers strip the Ethernet frame, read the IP destination, decrement TTL and build a new frame. TCP and HTTP stay sealed.',
    },
    {
      q: 'Which statement about the OSI model is true?',
      options: [
        "It's a teaching model; the internet uses TCP/IP",
        "The internet is built on OSI's exact 7 layers",
        'OSI replaced TCP/IP during the 1990s',
        'OSI has 4 layers, the same as TCP/IP',
      ],
      answer: 0,
      why: 'TCP/IP\'s Application layer covers OSI 7-5 and its Link layer covers OSI 2-1. People still use OSI numbers as shorthand ("layer 7").',
    },
    {
      q: 'Your 37-byte request is sent in one Ethernet frame. Roughly how big is the frame?',
      options: ['37 bytes', '57 bytes', '95 bytes', '1500 bytes'],
      answer: 2,
      why: '37 + 20 (TCP) + 20 (IP) + 14 (Ethernet header) + 4 (FCS) = 95 bytes: most of it is headers.',
    },
    {
      q: '"Connection refused" on port 80. Which layer do you start with?',
      options: [
        'Transport: nothing is listening on that port',
        'Link: check the cable and the switch',
        'Application: the page itself is missing',
        "Internet: there's no route to the host",
      ],
      answer: 0,
      why: 'The host answered, so the link and IP worked; TCP reset the connection because no process listens on port 80. A missing page would be an HTTP 404, not a refusal.',
    },
  ],
};

export default lesson;
