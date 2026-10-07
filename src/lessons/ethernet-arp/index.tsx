import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'On a local network, frames are delivered by MAC address, and ARP is how a machine finds the MAC that goes with an IP address it wants to reach.',
    what: 'Every network card has a 48-bit MAC address, and an Ethernet frame carries a destination and a source MAC. To send an IP packet, a host first checks whether the destination is on its own subnet (the AND from `subnetting-cidr`). If it is, it needs that host\'s MAC; if not, it needs the default gateway\'s. If its ARP cache has no entry, it broadcasts "Who has 192.168.1.20? Tell 192.168.1.10", and only the owner replies. Meanwhile the switch learns which MAC sits on which port, so it can stop flooding frames to everyone.',
    analogy: 'Shouting across an open-plan office, "Who\'s Sam? I\'m at desk 10." Sam waves back, and you both remember each other\'s desk for a while. A letter for someone in another building goes to the mailroom (the gateway), not to their desk.',
    useCases: [
      'Every IPv4 packet on Ethernet or Wi-Fi: no MAC for the next hop, no frame',
      'Debugging with `arp -a` or `ip neigh` when one host can\'t reach a neighbour',
      'Switch MAC tables and the flooding you see in captures after a switch reboots',
      'ARP spoofing defences: dynamic ARP inspection and static gateway entries',
    ],
    why: 'When "the server is up but I can\'t reach it from this box", the answer is often one layer down: a wrong subnet mask that sends traffic to the gateway, a stale ARP entry after a machine was swapped, or a switch flooding everything. Reading a packet capture means reading these frames. It builds on `osi-tcpip-layers` (frames inside packets) and pairs with `dhcp`, which hands out the mask and gateway this lesson uses.',
    watch: 'The LAN shows four hosts and a router (violet: the default gateway) cabled to one switch, with port numbers on the switch. The sender is highlighted in yellow. Moving pills are frames: blue for the ARP broadcast as the switch floods it to every other port, green for the unicast ARP reply, and sky blue for the IPv4 frame; the switch box turns blue while it floods. The ladder below has lifelines for the sender, the next hop and everyone else. Its current message is yellow, the gateway decision is violet, an aged-out cache entry is dim, and the rest use the same colours as the pills. The frame inspector colours the bytes by field: destination MAC amber, source MAC sky, EtherType pink, the ARP header grey, the sender\'s MAC and IP orange, and the target\'s violet. In the tables, a row learned in the current step is yellow, and an aged-out cache entry is struck through on a dim background.',
  },
  tryThis: [
    'Send from Host A to Host B, then press Send again: the second time there is no ARP and the switch forwards to one port.',
    'Send to the "Web server 203.0.113.10" chip: whose MAC does Host A ask for, and why?',
    'Press "Clear switch table", then Send again: the cache still hits, but watch the switch flood the IPv4 frame.',
    'Set the ARP cache timeout to 30 s, press "Wait 30 s", and Send again.',
    'Step to the ARP request and read the frame inspector: the target MAC is all zeros. Why?',
  ],
  keyIdeas: [
    'Same subnet: frame to the target\'s MAC. Different subnet: frame to the default gateway\'s MAC, with the far IP still in the IP header.',
    'ARP asks by broadcast (ff:ff:ff:ff:ff:ff, EtherType 0x0806) and is answered by unicast; both sides cache the mapping for a while.',
    'A switch learns source MACs per port: broadcasts and unknown destinations are flooded, known ones go out of one port.',
    'MAC addresses only matter on one link: every router hop builds a new frame, while the IP addresses stay the same.',
  ],
  quiz: [
    {
      q: 'Host A (192.168.1.10/24) sends to 203.0.113.10. Whose MAC address does the frame carry as its destination?',
      options: [
        'The default gateway\'s, since the server is off-subnet',
        'The web server\'s, looked up by ARP across the internet',
        'ff:ff:ff:ff:ff:ff, so that every router will forward it',
        'Host A\'s own, since the router rewrites it on the way',
      ],
      answer: 0,
      why: 'ARP only works on the local link. 203.0.113.10 ANDed with the /24 mask isn\'t 192.168.1.0, so A ARPs for its gateway and sends the frame to the router\'s MAC. The tempting answer, the server\'s MAC, would need ARP to cross routers, which it never does.',
    },
    {
      q: 'Does a packet keep the same destination MAC address all the way across the internet?',
      options: [
        'No: each hop builds a new frame for its own link',
        'Yes: MACs are globally unique, so routers use them',
        'Yes, but only for traffic that stays IPv4 the whole way',
        'No: the MAC is encrypted differently at every router',
      ],
      answer: 0,
      why: 'A MAC address is only meaningful on one link. Each router strips the incoming frame and builds a new one with its own source MAC and the next hop\'s destination MAC; the IP addresses are what stay the same end to end. Being globally unique doesn\'t make MACs routable.',
    },
    {
      q: 'A switch has an empty MAC table and receives a frame for 02:00:00:00:00:14. What does it do?',
      options: [
        'Floods it out of every port except the one it came in on',
        'Drops it, because it has never seen that MAC address',
        'Sends an ARP request to find which port the MAC is on',
        'Sends it back out of the port it arrived on, to retry',
      ],
      answer: 0,
      why: 'An unknown destination is flooded (unknown unicast), and the switch learns the source MAC\'s port as it goes. Switches don\'t use ARP: ARP maps IPs to MACs for hosts, while the switch only learns MAC-to-port from the frames it sees.',
    },
    {
      q: 'Host A sent to Host B a minute ago and now sends again, within the ARP timeout. What goes on the wire first?',
      options: ['The IPv4 frame to B\'s MAC', 'An ARP request broadcast', 'An ARP reply from Host B', 'A DHCP request for B\'s MAC'],
      answer: 0,
      why: 'B\'s mapping is still in A\'s ARP cache, so A builds the frame straight away. ARP only runs again after the entry ages out. DHCP hands out addresses; it doesn\'t resolve MACs.',
    },
  ],
};

export default lesson;
