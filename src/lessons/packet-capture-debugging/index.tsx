import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "A packet capture shows what actually crossed the wire, and each common failure leaves a recognisable pattern: an RST, a SYN repeated into silence, duplicate ACKs, NXDOMAIN, or a TLS alert.",
    what: 'Tools like tcpdump and Wireshark record every frame a network card sees and decode it layer by layer: Ethernet, IP, TCP or UDP, then DNS or TLS. Reading a capture means following one conversation: did DNS answer, did the three-way handshake complete, did data flow, and who stopped talking. Capture filters (tcpdump\'s "host 203.0.113.10") decide what gets recorded; display filters (Wireshark\'s "ip.addr == 203.0.113.10") only hide what was recorded. traceroute maps the path by sending probes with TTL 1, 2, 3… and listening for the routers that drop them.',
    analogy: 'A flight recorder for your network. Instead of guessing from "it didn\'t work", you replay exactly who said what, and when somebody stopped answering.',
    useCases: [
      '"Connection refused" versus "timed out": telling a closed port from a firewall drop',
      'Proving slowness is packet loss (retransmissions, duplicate ACKs) and not the application',
      'Spotting a DNS failure or a certificate problem before anyone touches the server',
      'traceroute and mtr to find where on the path latency jumps or packets stop',
    ],
    why: 'Most "the network is broken" tickets are settled in minutes by a capture: it turns arguments between teams into evidence. You\'ll be asked to run tcpdump on a server or read a .pcap someone sends you, and knowing the six patterns here covers most of what you\'ll see. It builds on `tcp-udp`, `tls-handshake`, `dns-resolution`, `osi-tcpip-layers` and `firewalls-packet-filtering`.',
    watch: 'Capture viewer: the packet list has one row per packet. The selected row has a yellow tint and bar; handshake packets (SYN, SYN-ACK and the ACK that completes it) are blue, DNS is violet, retransmissions and duplicate ACKs are orange, an RST or a TLS alert is red, and everything else is white. Under it, the selected packet\'s layers: Ethernet (sky blue bar), IPv4 (amber), TCP or UDP (pink), DNS or TLS (grey), one row per field, the selected field tinted yellow; "(not captured)" marks a field the snaplen cut off. The bytes are a hex dump with ASCII on the right, each layer\'s bytes tinted in its colour (named in the key below), and the selected field\'s bytes yellow. The ladder draws the same packets as arrows between the client, the resolver and the server, coloured as in the list, with the selected packet on a yellow band. The filter line turns red when a filter is refused. The tcpdump view prints lines in the same colours (others grey). Diagnosis chips are blue; the one you pick turns solid green if it\'s right and solid red if it isn\'t. Traceroute: blue probes, violet ICMP Time Exceeded replies, a green Port Unreachable from the destination, and a "* * *" note under a probe nobody answered; in the hop table that row is grey italic with a dim bar.',
  },
  tryThis: [
    'Open Capture 6 and select the packet after the SYN: what kind of answer is that? Then compare Capture 1.',
    'In Capture 4, type tcp.analysis.retransmission || tcp.analysis.duplicate_ack in the filter, and select each duplicate ACK.',
    'In any capture with a handshake, click the TCP Flags field and find its byte in the hex dump.',
    'Switch the view to tcpdump lines: where did the DNS packets go?',
    'In Traceroute, play to hop 3: is that router broken?',
  ],
  keyIdeas: [
    '"Connection refused" is an RST: something answered. "Timed out" is silence: SYNs retried into nothing, usually a drop.',
    'Duplicate ACKs then a retransmission mean packet loss; NXDOMAIN with no SYN means DNS; an alert after the certificate means TLS.',
    'Capture filters decide what gets recorded; display filters only hide what was recorded.',
    'traceroute lists the routers that drop each TTL; a * * * hop that forwards fine is just quiet, not broken.',
  ],
  quiz: [
    {
      q: 'One client gets "connection refused" at once; another waits and then says "timed out". What differs on the wire?',
      options: [
        'Refused: an RST came back. Timed out: the SYNs got no reply',
        'Nothing: the two apps just word the same failure differently',
        'Refused: the SYN was lost. Timed out: an RST came back late',
        'Refused: the DNS lookup failed. Timed out: TLS never finished',
      ],
      answer: 0,
      why: 'A refusal is an answer: the host (or a firewall set to REJECT) sent RST,ACK, so the client knows at once. A timeout is silence: the client retransmits its SYN with growing gaps and gives up. Treating them as the same failure is the tempting mistake, and it sends you to the wrong team.',
    },
    {
      q: 'In a capture, the client sends three duplicate ACKs for the same byte. What does that point to?',
      options: [
        'A segment before that byte was lost, while later data arrived',
        "The server's port is closed and it keeps sending resets back to it",
        "The client's DNS lookup came back without any address at all",
        'The connection has gone idle and is keeping itself alive',
      ],
      answer: 0,
      why: 'TCP acknowledges the next byte it is missing, so every segment that arrives after a gap repeats the same ACK. The sender takes three duplicates as a sign of loss and retransmits the gap, after which the ACK jumps ahead. A closed port shows an RST, not ACKs.',
    },
    {
      q: 'A capture shows a DNS response "No such name" and then nothing: no SYN at all. Where is the problem?',
      options: [
        'Name resolution: the client never had an address to connect to',
        "A firewall in front of the server is silently dropping the client's SYNs",
        "The server's TLS certificate failed the client's validity checks",
        "The network lost the client's first data segment on the way out",
      ],
      answer: 0,
      why: "NXDOMAIN means the name doesn't exist (a typo, a missing record, the wrong environment). Without an address there's no SYN to drop, no certificate to check and no data to lose, which is why the rest of the capture is empty.",
    },
    {
      q: 'Why does `tcpdump -n host 203.0.113.10` show no DNS packets, when the lookups clearly happened?',
      options: [
        'It is a capture filter: only packets to or from that host were kept',
        'DNS travels inside the TLS connection, so tcpdump cannot see any of it',
        'tcpdump only decodes TCP, so it leaves out every UDP packet',
        'The lookups were answered from a cache on the server instead',
      ],
      answer: 0,
      why: 'The lookups go to the resolver (198.51.100.53), not to 203.0.113.10, so a capture filter on that host never records them. A display filter in Wireshark would hide them in the same way, but there the packets are still in the file. tcpdump decodes UDP and DNS fine.',
    },
    {
      q: 'traceroute shows * * * at hop 3, but hops 4 and 5 answer normally. What does that tell you?',
      options: [
        "Hop 3 doesn't answer probes, yet it forwards traffic fine",
        'Hop 3 is down, and every packet beyond it is being lost',
        "The destination's firewall is blocking all ICMP traffic",
        'Your own network card dropped those three probes locally',
      ],
      answer: 0,
      why: "Probes with a bigger TTL went through hop 3 and got answers from hops 4 and 5, so hop 3 forwards packets; it just doesn't send ICMP Time Exceeded (many routers ignore or rate-limit them). It would only be a problem if every later hop went silent too.",
    },
  ],
};

export default lesson;
