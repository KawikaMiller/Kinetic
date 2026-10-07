import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'IPv6 addresses are 128 bits written as eight hex groups, with shorthand rules for the zeros, and there are enough of them for every device to have its own.',
    what: 'An IPv6 address is 128 bits, written as eight groups of four hex digits. Two rules shorten it: drop the leading zeros in each group, and replace one run of zero groups with "::" (only once, or the length would be ambiguous). A typical global address is a /48 site prefix, a 16-bit subnet ID and a 64-bit interface ID. Hosts usually build their own address (SLAAC): a router advertises the /64 prefix and the host adds its interface ID. With 2¹²⁸ addresses there is no shortage, so no NAT: a firewall decides what may reach a device.',
    analogy: 'IPv4 is a city where every building shares one street number and a receptionist (NAT) routes visitors. IPv6 gives every room its own full address, so you need a door lock (a firewall) instead of a receptionist.',
    useCases: [
      'Reading `ip -6 addr` or a log full of 2001:db8:… and fe80::… addresses',
      'Mobile networks and big clouds, which run IPv6 to escape IPv4 shortage',
      'Writing firewall rules once NAT no longer hides internal hosts',
      'Debugging slow connections when a broken IPv6 path makes clients fall back',
    ],
    why: 'Most phones and many networks already use IPv6, and logs, configs and cloud consoles show it everywhere. You need to read the compressed forms, recognise link-local versus global addresses, and know that security now comes from firewalls rather than NAT. It extends `subnetting-cidr` to 128 bits, builds on `ip-ports`, and the AAAA record from `dns-resolution` is how a name gets an IPv6 address.',
    watch: 'Each address is coloured by field, in its hex text and in its bits: blue for the /48 site prefix, violet for the subnet ID up to /64, and orange for the 64-bit interface ID. A filled bit is 1 and an outlined bit is 0; on a phone the bits shrink to small colour-only cells, with each group\'s hex value underneath. When compressing, leading zeros sit on a dim background and fade away, the zero groups about to collapse turn dim, and a yellow "::" appears in their place. The rule being applied is yellow in the list, and the address type is a sky-blue badge. In SLAAC, the ladder\'s multicast messages are blue, the current message is yellow, and the finished global address is green. In Dual stack, the DNS bar is grey, connection attempts are blue while in progress and green for the one that connects first, a dashed dim bar is an IPv6 attempt that never gets an answer, the violet marker is the end of IPv6\'s 250 ms head start, and the cursor is the current time.',
  },
  tryThis: [
    'Switch "Show" to Compressed and watch the zeros go, one rule at a time; then switch back to Full.',
    'Type 2001:db8:0:0:1:0:0:1 and press Set: which run of zeros becomes "::", and why that one?',
    'Type 2001:db8::1::1 and press Set. Why is it refused?',
    'In SLAAC, switch the Interface ID to EUI-64 and find the ff:fe in the middle.',
    'In Dual stack, set the IPv6 path to Broken: how much time does the broken path cost?',
  ],
  keyIdeas: [
    '128 bits as 8 hex groups; drop leading zeros, and write one run of 2+ zero groups as "::" (once, the longest, the first if tied).',
    'Global addresses split into a site prefix, a subnet ID and a 64-bit interface ID; fe80:: addresses are link-local and never routed.',
    'SLAAC: the router advertises a /64 prefix and the host adds its own interface ID (random for privacy, or EUI-64 from the MAC).',
    'There are enough addresses for every device, so there is no NAT: a firewall, not address translation, decides what reaches you.',
  ],
  quiz: [
    {
      q: 'Why may "::" appear only once in an IPv6 address?',
      options: [
        'Two would leave it unclear how many zeros each one hides',
        'It can appear twice, but only in link-local addresses',
        'Because "::" also marks where the interface ID begins',
        'Routers would send the packet on to the wrong subnet',
      ],
      answer: 0,
      why: '"::" means "as many zero groups as it takes to make 8". With two of them, 2001:db8::1::1 could be split 1+3 or 2+2 or 3+1. That ambiguity applies to every kind of address, link-local included.',
    },
    {
      q: 'Leading zeros already dropped, 2001:db8:0:0:1:0:0:1 has two zero runs. What is its RFC 5952 canonical form?',
      options: ['2001:db8::1:0:0:1', '2001:db8:0:0:1::1', '2001:db8::1::1', '2001:db8:0:0:1:0:0:1'],
      answer: 0,
      why: 'Both zero runs are two groups long, so the first one becomes "::". 2001:db8::1::1 is invalid (two "::"), and the fully uncompressed form is valid but not canonical.',
    },
    {
      q: 'Your laptop has a global IPv6 address. What stops strangers on the internet from connecting to it?',
      options: [
        'A firewall that blocks unsolicited inbound traffic',
        'NAT on the router, just as with IPv4 at home',
        'Nothing can: IPv6 addresses are hidden from routing',
        'The address changes with every packet it sends',
      ],
      answer: 0,
      why: 'IPv6 has no shortage, so there is no NAT and the address is directly reachable. Protection comes from the firewall on the router or the host. Privacy addresses change every so often, not per packet.',
    },
    {
      q: 'With EUI-64, what interface ID does the MAC 00:1a:2b:3c:4d:5e give?',
      options: ['021a:2bff:fe3c:4d5e', '001a:2bff:fe3c:4d5e', '021a:2b3c:4d5e:fffe', '001a:2b3c:4d5e:0000'],
      answer: 0,
      why: 'Split the MAC in half, insert ff:fe in the middle, and flip the universal/local bit (0x02) of the first byte, so 00 becomes 02. Forgetting the flip gives 001a:2bff:fe3c:4d5e.',
    },
    {
      q: 'A site has A and AAAA records, but your IPv6 path silently drops packets. With Happy Eyeballs, what happens?',
      options: [
        'IPv4 starts after a short head start and connects',
        'The page hangs until the IPv6 attempt times out',
        'The browser refuses to load a dual-stack website',
        'DNS returns only the A record from then onwards',
      ],
      answer: 0,
      why: 'Happy Eyeballs (RFC 8305) gives IPv6 a head start of about 250 ms; if it hasn\'t connected by then, IPv4 starts too and the first to connect wins. Without it, a client could wait out a long IPv6 timeout, which is the hang in the tempting wrong answer.',
    },
  ],
};

export default lesson;
