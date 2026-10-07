import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A device joining a network gets its IP address, mask, router and DNS server from a DHCP server in four messages, and only borrows them for a lease.',
    what: 'A new device has no address, so it broadcasts DHCPDISCOVER from 0.0.0.0 to 255.255.255.255 (UDP port 68 to 67). Servers reply with DHCPOFFER: an address and the settings that go with it. The client broadcasts DHCPREQUEST naming the offer it accepts, so every server knows, and the chosen server confirms with DHCPACK. Only then does the client configure itself. The address is a lease: the client renews it at half time (T1) and, failing that, asks any server at 7/8 (T2). If nobody answers by the end, it must stop using it.',
    analogy: 'Checking into a hotel: you ask at the desk (discover), they offer a room (offer), you say "I\'ll take that one" (request), they hand over the key (ack). The key works until checkout unless you extend your stay.',
    useCases: [
      'Every laptop, phone and smart plug joining home or office Wi-Fi',
      'Cloud VMs getting their private IP and DNS settings when they boot',
      'Diagnosing "connected, no internet" when a device shows a 169.254.x.x address',
      'Routers running DHCP relay so one server can cover many subnets or VLANs',
    ],
    why: 'When a device can\'t get online, DHCP is one of the first things to check: no lease means no IP address, no router and no DNS. Knowing the four steps, the broadcasts and the lease timers lets you read a packet capture or a router log and see where it stopped. It builds on `ip-ports` and `osi-tcpip-layers`, and the mask it hands out is the one from `subnetting-cidr`.',
    watch: 'The ladder has one lifeline per machine (grey header boxes), with time running downwards. Broadcasts are blue, unicasts violet, and the message being explained now is yellow; ACKs are green. A self-loop is something a machine does on its own: a withdrawn offer is dim, "no offer" and the end of a lease are red, and the link-local fallback is orange. A message that never arrives stops partway with a ✕. Each arrow\'s grey note gives its source and destination address and port. In the interface table, empty fields are faint, offered values are grey italic with an "offered" tag, configured values are green, and a link-local address is orange. Pool chips are grey when free, dashed blue when out on offer, and violet when leased. In Lease clock, the green bar is the lease (a second green bar when it is renewed), and it turns red when it runs out. Markers show T1 (violet), T2 (blue) and expiry (red), and the cursor is the current time.',
  },
  tryThis: [
    'Press play in DORA and watch the interface table: nothing turns green until the ACK.',
    'In Two servers, step to the DHCPREQUEST: why is it a broadcast when the laptop already knows which server it wants?',
    'Pick Pool empty and play to the end: where does the 169.254 address come from?',
    'In Lease clock, set the server to Down and play: what happens at T1, at T2 and at expiry?',
    'Slide the Lease down to 1 hour and watch T1 and T2 move with it.',
  ],
  keyIdeas: [
    'DORA: discover (broadcast), offer, request (broadcast), acknowledge. Nothing is configured before the ACK.',
    'The client side runs from 0.0.0.0:68 to 255.255.255.255:67, because it has no address yet; broadcasts stop at routers, so remote servers need a relay agent.',
    'A lease is borrowed time: renew by unicast at T1 (50%), rebind by broadcast at T2 (87.5%), and stop using the address at expiry.',
    'A 169.254.x.x address means no DHCP server answered: the device can reach its own link but has no router or DNS.',
  ],
  quiz: [
    {
      q: 'How does a laptop get its IP address from a DHCP server?',
      options: [
        'Four messages: discover, offer, request, acknowledge',
        'One message: the server pushes an address on connect',
        'Two messages: the laptop asks and the server replies',
        'The router derives it directly from the MAC address',
      ],
      answer: 0,
      why: 'Offer and acceptance are separate steps, so a client can choose between servers and every server learns which offer was taken. The "two messages" answer is the tempting one, but it would leave a second server holding an offer it never hears about.',
    },
    {
      q: 'A laptop got a 24-hour lease 12 hours ago. What does it do now?',
      options: [
        'Unicasts a renewal request to its DHCP server',
        'Nothing: once leased, the address is its to keep',
        'Broadcasts a new DHCPDISCOVER to start over',
        'Drops the address and waits for a new offer',
      ],
      answer: 0,
      why: '12 hours is T1, half the lease, when the client asks its own server to extend it. A lease is never permanent. Broadcasting only happens at T2 (21 hours) if the server hasn\'t answered, and the address is dropped only at expiry.',
    },
    {
      q: 'The laptop already knows which server made the offer. Why is its DHCPREQUEST still broadcast?',
      options: [
        'So every server learns which offer was taken',
        'The laptop must reach the server by MAC only',
        'Broadcasts arrive faster than unicast frames',
        'To ask every server for a spare second address',
      ],
      answer: 0,
      why: 'The REQUEST names the chosen server, and the other servers withdraw their offers when they see it. The laptop has no usable address yet, but that is about its own source, not about reaching the server. Broadcasts are not faster.',
    },
    {
      q: 'A laptop on the office Wi-Fi shows 169.254.37.12. What does that tell you?',
      options: [
        'No DHCP server answered, so it chose a link-local address',
        'The DHCP server gave it an address from its private pool',
        'Its router is translating this address to a public one',
        'It has a valid lease, but the DNS server is unreachable',
      ],
      answer: 0,
      why: '169.254.1.0-169.254.254.255 is the RFC 3927 link-local range a device assigns itself when DHCP fails. No DHCP server hands those out, and a device with a lease would have a real address from the pool.',
    },
    {
      q: 'The DHCP server is at 10.0.0.5 and the laptops are on 192.168.2.0/24. How do they reach it?',
      options: [
        'A relay agent on the router forwards requests as unicast',
        'The laptops\' broadcasts pass through every router hop',
        'Each laptop is set up with the server\'s address by hand',
        'The server broadcasts its offers to every known subnet',
      ],
      answer: 0,
      why: 'Routers don\'t forward broadcasts, so the router runs a relay agent: it picks up the DISCOVER, unicasts it to the server with its own address as giaddr, and the server uses giaddr to choose the right pool.',
    },
  ],
};

export default lesson;
