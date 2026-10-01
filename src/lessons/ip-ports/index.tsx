import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An IP address gets a packet to the right machine; a port number gets it to the right program on that machine.',
    what: "Every device on a network has an IP address, like 203.0.113.10. Programs that talk over the network listen on numbered ports: web servers on 443, SSH on 22, Postgres on 5432. Every connection is identified by both ends' IP and port. At home, your router uses NAT to share one public IP between all your devices, and 127.0.0.1 (localhost) always means \"this same machine\".",
    analogy: 'The IP address is the street address of an apartment building; the port is the apartment number. The post office only cares about the building, and the doorman sorts mail to the right flat.',
    useCases: [
      '"Connection refused": the machine is reachable, but nothing is listening on that port',
      'Running a dev server on localhost:3000 and a database on :5432 side by side',
      'Firewall and security-group rules that open or close specific ports',
      'Why every device in your house shows the same IP to websites (NAT)',
    ],
    why: "It's the vocabulary behind almost every networking error you'll hit as a junior: wrong port, service bound to localhost only, port already in use, firewall blocking a port. Knowing what IP and port each mean turns these from mysteries into five-minute fixes.",
    watch: 'Pills are packets: blue for requests, green for replies, red for a refusal (RST), violet for loopback traffic that never leaves the machine. Watch the packet-header panel: the field the router rewrites flashes yellow, and the NAT table fills in. Green port slots on the server received a packet; red means nothing was listening.',
  },
  tryThis: [
    'Press play and watch the source address change when the packet passes through the router.',
    'Send from the Phone to the server on :443. Both devices use port 51000, so how does the router tell the replies apart?',
    'Send to :8080 on the server: right machine, wrong port.',
    'Send to localhost: the router never even sees it.',
  ],
  keyIdeas: [
    'IP address = which machine. Port = which program on it.',
    'A connection is identified by source IP:port plus destination IP:port.',
    'NAT lets many private devices share one public IP by rewriting addresses and remembering the mapping.',
    '127.0.0.1 (localhost) loops back to your own machine and never touches the network.',
  ],
  quiz: [
    {
      q: 'You get "connection refused" from a server you can ping. What is the most likely cause?',
      options: [
        'The server is switched off',
        'Nothing is listening on that port',
        'Your own IP address is wrong',
        'The domain name failed to resolve',
      ],
      answer: 1,
      why: 'Ping proves the machine is up and reachable, which rules out a dead server or a DNS failure. "Refused" means the OS got the packet but no program is listening on that port, so it sent back a reset.',
    },
    {
      q: 'Your laptop (192.168.1.20) talks to a website. What source address does the website see?',
      options: [
        "Your laptop's 192.168.1.20",
        'The loopback address 127.0.0.1',
        "Your router's public IP address",
        "The website's own IP address",
      ],
      answer: 2,
      why: '192.168.x.x is a private address that never crosses the internet. NAT on your router rewrites the source to its public IP before the packet goes out.',
    },
    {
      q: 'A dev server bound to 127.0.0.1:3000 is running on your laptop. Can your phone on the same Wi-Fi reach it?',
      options: [
        'No, 127.0.0.1 accepts only the laptop itself',
        'Yes, anything on the same Wi-Fi can reach it',
        'Yes, but only if it listens on port 443',
        'Yes, as long as the router does NAT for it',
      ],
      answer: 0,
      why: "127.0.0.1 is the loopback address, so being on the same Wi-Fi doesn't help. To share it you'd bind to the laptop's LAN IP (or 0.0.0.0).",
    },
  ],
};

export default lesson;
