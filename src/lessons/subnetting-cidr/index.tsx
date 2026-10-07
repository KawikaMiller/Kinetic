import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The /24 in 192.168.1.0/24 says how many leading bits name the network; the bits left over number the hosts inside it.',
    what: 'An IPv4 address is 32 bits (see `binary-hex`). CIDR notation splits them with a prefix length: in 192.168.1.10/24 the first 24 bits are the network and the last 8 pick a host, so the block holds 2⁸ = 256 addresses. The first is the network address and the last is the broadcast address, which leaves 254 for hosts. A machine decides whether another address is on its own network by ANDing it with the netmask (24 ones then 8 zeros) and comparing the result with its network address, exactly the masking from `bit-manipulation`.',
    analogy: 'A street address: the prefix is the street name, the host bits are the house number. A longer prefix is a more specific street, so it has fewer houses on it.',
    useCases: [
      'Reading `ip addr` or `ipconfig` output: 192.168.1.23/24 tells you which neighbours you reach directly',
      'Firewall rules and allow-lists written as ranges, like "allow 10.0.0.0/8"',
      'Routing tables: the most specific matching prefix wins, and 0.0.0.0/0 is the default route',
      'Splitting an address range between teams or office floors without overlaps',
    ],
    why: 'Every network config, firewall rule and route is written in CIDR. Misread a mask and a host thinks a neighbour is remote (or the reverse), and traffic silently goes the wrong way. It is also a staple interview question, and the arithmetic is quick once you see it as bits rather than dotted numbers. It builds on `ip-ports`, and `ethernet-arp` uses the same AND to decide whether to send to a neighbour or the gateway.',
    watch: 'In "One block" the address is a strip of 32 bits in four octets, with each octet\'s decimal value above it. Network bits are blue and host bits violet; a set bit is filled and a clear bit is outlined. The yellow line with a /n tag is the prefix divider. "Does it belong?" stacks four strips: the address, the mask (grey), their AND, and the block\'s network. The AND row\'s network bits are green when the address is inside and red when it isn\'t; its host bits are dim, because the mask zeroed them; and the first network bit that differs is ringed in red on the AND and network rows. In "Split a block" the bar is the parent range drawn to scale: carved-out blocks take amber, sky, pink and orange in turn (plain categories, not status), and free space is dashed grey.',
  },
  tryThis: [
    'Drag the yellow divider (or focus it and use the arrow keys) from /24 to /25: the block halves, and each half still loses two addresses.',
    'Load the "/31 point-to-point" preset: why does it have 2 usable hosts and no broadcast?',
    'Type 192.168.1.200 into "Does it belong?" and press Check, then slide the prefix down to /16 and watch the verdict change.',
    'In "Split a block", choose By hand and add 192.168.1.32/26. Read why it is refused, then add 192.168.1.64/26.',
    'In Teams (VLSM), allocate 50, 10, 2, then try 100, 100, 100.',
  ],
  keyIdeas: [
    'The prefix length counts network bits; the remaining 32 − n bits number hosts, so a block holds 2³²⁻ⁿ addresses.',
    'Usually two addresses are reserved (network and broadcast): a /24 has 254 usable hosts. /31 links (RFC 3021) and /32 host routes are the exceptions.',
    'A bigger prefix number is a smaller network: each extra bit halves the block.',
    'Same subnet means (a AND mask) equals (network AND mask); blocks start on a multiple of their own size, which is what lets them aggregate back.',
  ],
  quiz: [
    {
      q: 'How many usable host addresses does 192.168.1.0/24 have?',
      options: ['254', '256', '255', '24'],
      answer: 0,
      why: 'Eight host bits give 256 addresses, but the first (192.168.1.0) names the network and the last (192.168.1.255) is the broadcast. 256 is the most tempting wrong answer: it counts addresses, not usable hosts.',
    },
    {
      q: 'Which of these blocks holds the most addresses?',
      options: ['10.0.0.0/16', '10.0.0.0/24', '10.0.0.0/30', '10.0.0.0/31'],
      answer: 0,
      why: 'A /16 leaves 16 host bits: 65,536 addresses. Every extra prefix bit halves the block, so /24 has 256, /30 has 4 and /31 has 2. A bigger prefix number means a smaller network.',
    },
    {
      q: 'Is 192.168.1.130 inside 192.168.1.0/25?',
      options: [
        "No: its 25th bit is 1; the network's is 0",
        'Yes: the first three octets all match exactly',
        'Yes: 130 is below 255, so it fits inside',
        "No: .130 is this block's broadcast address",
      ],
      answer: 0,
      why: 'A /25 compares 25 bits, not three whole octets. 130 is 1000 0010, so bit 25 is 1, while 192.168.1.0/25 has 0 there: it belongs to 192.168.1.128/25. The broadcast of 192.168.1.0/25 is .127, not .130.',
    },
    {
      q: 'Why is 192.168.1.32/26 refused as a block?',
      options: [
        'A /26 must start on a multiple of 64 addresses',
        'A /26 is bigger than the /24 it sits inside',
        '.32 is reserved for the network address only',
        'Blocks must be placed in order, starting at .0',
      ],
      answer: 0,
      why: 'A /26 is 64 addresses, so it can only start at .0, .64, .128 or .192. It is a quarter of a /24, not bigger. Blocks can go in any order as long as each is aligned and none overlap.',
    },
    {
      q: 'A /31 links two routers. How many usable addresses does it have?',
      options: ['2', '0', '1', '4'],
      answer: 0,
      why: 'RFC 3021 lets a point-to-point /31 use both of its addresses as hosts, since a two-ended link needs no network or broadcast address. 0 is what the usual "minus two" rule would wrongly give.',
    },
  ],
};

export default lesson;
