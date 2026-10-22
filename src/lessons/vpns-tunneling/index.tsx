import { ipv4 } from '../../core/ipv4';
import type { LessonModule } from '../../core/types';
import { initialRoutes, initialReplay, sendAhead, sendNext, sendNumber, sendReplayOfLast, WRAP_PAYLOAD } from './init';
import { DEFAULT_MTU_INPUT, decide, transferSteps } from './mtu';
import { WINDOW } from './replay';
import { lookup, presetRows, split } from './routing';
import { Stage } from './Stage';
import { DEFAULT_OPTIONS, innerPacket, overheadOf, wrap, fixedOverheadOf } from './tunnels';

const innerLen = innerPacket(WRAP_PAYLOAD.initial).length;
const wgOverhead = overheadOf('wireguard', innerLen, DEFAULT_OPTIONS);
const wgWire = wrap('wireguard', DEFAULT_OPTIONS, innerPacket(WRAP_PAYLOAD.initial)).bytes.length;
const wgV6 = overheadOf('wireguard', innerLen, { ...DEFAULT_OPTIONS, outer: 6 });
const espGcm = overheadOf('esp', innerLen, DEFAULT_OPTIONS);
const espCbc = overheadOf('esp', innerLen, { ...DEFAULT_OPTIONS, suite: 'cbc' });
const espNat = overheadOf('esp', innerLen, { ...DEFAULT_OPTIONS, suite: 'cbc', natT: true });

const mtu0 = decide(DEFAULT_MTU_INPUT);
const clamped = decide({ ...DEFAULT_MTU_INPUT, clamp: true });
const icmp = decide({ ...DEFAULT_MTU_INPUT, icmp: true });
const stalls = transferSteps(DEFAULT_MTU_INPUT).stalls;

const r0 = initialRoutes();
const fullDest = lookup(presetRows('full'), r0.dest, r0.policy).winner?.goes;
const splitDest = lookup(presetRows('split'), r0.dest, r0.policy).winner?.goes;
const splitCount = split(presetRows('split'), 'direct');
const overlapAddr = ipv4('192.168.1.20');
const tie = lookup(presetRows('overlap'), overlapAddr, 'direct');
const tieTunnel = lookup(presetRows('overlap'), overlapAddr, 'tunnel');

let replay = initialReplay();
for (let k = 0; k < 3; k++) replay = sendNext(replay);
const afterThree = replay;
const replayed = sendReplayOfLast(afterThree);
const jumped = sendAhead(replayed, WINDOW);
const stale = sendNumber(jumped, 3);
const staleVerdict = stale.log[stale.log.length - 1].verdict;
const replayVerdict = replayed.log[replayed.log.length - 1].verdict;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A VPN puts every packet inside a new one. The wrapper costs bytes, so tunnels shrink the usable packet size, large packets can vanish while pings work, and a route list decides what enters.',
    what: 'A tunnel takes the whole inner packet and carries it as the payload of an outer packet addressed between the two tunnel ends. GRE, IPsec ESP, WireGuard and VXLAN each add their own headers (and, for the two encrypting ones, padding and an authentication tag), and the sum is the overhead that is taken out of the link MTU. If a packet is too big for the tunnel and the "fragmentation needed" message never reaches the sender, it disappears silently. A route list (WireGuard\'s allowed IPs, IPsec routes) picks which destinations enter the tunnel, and a receiver keeps a sliding window of sequence numbers so a recorded packet cannot be replayed.',
    analogy: 'Posting a sealed envelope inside a larger courier envelope. The courier only reads the outer address and charges for the extra weight; a parcel that is too heavy for the courier\'s bag is quietly left behind unless someone sends the sender a note.',
    useCases: [
      'Debugging a site-to-site VPN where small requests work and big uploads hang',
      'Choosing an MTU and an MSS clamp for a WireGuard or IPsec interface',
      'Deciding which ranges to send through a remote-access VPN, and fixing two networks that both use 192.168.1.0/24',
      'Reading a packet capture of a tunnel and knowing which bytes are the wrapper',
    ],
    why: 'Tunnel bugs rarely say "tunnel" in the error. They show up as one site that loads and a download that stalls, or an address that reaches the wrong network. Knowing the overhead arithmetic, the black-hole symptom and the route lookup tells you which of three places to look.',
    watch:
      'The inner packet is blue. Outer headers are plain categories: amber is the outer IP header, pink the UDP or ESP header, sky the tunnel\'s own header, orange the tag; the overhead in bytes is yellow. In the MTU scene green is the tunnel MTU (room for the inner packet), yellow the overhead, blue a packet that fits and red the part that does not, and a lost packet in the ladder is marked with a cross. In the route table violet is the tunnel path, blue is the direct path, the yellow row is the route that carries the destination and red marks two routes that tie. In the replay window a violet cell is a number already seen. The chips say what is built for real, a toy, simulated, not run, or from memory.',
  },
  tryThis: [
    `In "Wrap a packet" (WireGuard, a ${WRAP_PAYLOAD.initial}-byte payload, so a ${innerLen}-byte inner packet) press play: the tunnel adds ${wgOverhead} bytes, ${wgWire} on the wire. Switch Outer header to IPv6: ${wgV6} bytes.`,
    `Still in "Wrap a packet", pick IPsec ESP: the overhead is ${espGcm} bytes with AES-GCM. Switch the cipher suite to AES-CBC + HMAC: ${espCbc} bytes (the padding row grows). Turn NAT traversal on: ${espNat}.`,
    `In "MTU and the black hole" (WireGuard over a ${DEFAULT_MTU_INPUT.linkMtu}-byte link, ${DEFAULT_MTU_INPUT.packet}-byte packets, don't fragment set, ICMP blocked) the ping, SYN and request pass and the data segment is ${mtu0.outcome === 'dropped-silent' ? 'dropped silently' : 'not dropped'}, so the transfer ${stalls ? 'stalls' : 'completes'}. Turn MSS clamping on: it is cut to ${clamped.sent} bytes and delivered. Turn it off and allow ICMP instead: the sender is told ${icmp.tunnelMtu}.`,
    `In "What enters the tunnel" (full tunnel, ${r0.text}) the destination goes ${fullDest === 'tunnel' ? 'through the tunnel' : 'direct'}. Press "split tunnel": it goes ${splitDest === 'tunnel' ? 'through the tunnel' : 'direct'} and ${splitCount.tunnel} of 6 sample destinations enter. Press "overlapping private ranges" and then the 192.168.1.20 chip: ${tie.ties.length} routes tie and "On a tie, prefer" the direct route picks ${tie.winner?.goes}; prefer the tunnel route and it picks ${tieTunnel.winner?.goes}.`,
    `In "Keys and replay" press "next in order" three times, then "replay the last accepted": ${replayVerdict.kind === 'replay' ? 'it is dropped as already seen' : 'it is not dropped'}. Press "${WINDOW} above the top" and type 3 as the packet number: ${staleVerdict.kind === 'too-old' ? 'it is dropped as below the window' : 'it is not dropped'}.`,
  ],
  keyIdeas: [
    `A tunnel carries the whole inner packet inside a new one, so it adds bytes: in this model WireGuard adds ${fixedOverheadOf('wireguard')} over an IPv4 outer header and ${fixedOverheadOf('wireguard', { ...DEFAULT_OPTIONS, outer: 6 })} over IPv6, and the tunnel MTU is the link MTU minus that.`,
    'When don\'t-fragment is set and ICMP "fragmentation needed" is blocked, an oversized packet vanishes without a word: pings and small requests work while large transfers stall. Allowing ICMP, or clamping the MSS to the tunnel MTU minus 40, fixes it.',
    'The route list, longest prefix first, decides what enters the tunnel. Full and split tunnels are routing choices with trade-offs, and two networks using the same private range leave a tie that the lookup alone cannot settle.',
    'A receiver keeps a sliding window of sequence numbers: a number it has seen, or one below the window, is dropped, so a recorded packet replayed later does not get through.',
  ],
  quiz: [
    {
      q: 'Why does a tunnel lower the usable packet size on the same link?',
      options: [
        'The whole inner packet travels inside a new one, so the outer headers and tag take bytes',
        'The cipher compresses the payload, and compressed data needs a longer header to describe it',
        'The link slows down while it encrypts, so the router shrinks its MTU to match the speed',
        'The payload is encrypted in place, and encrypted data cannot use the last bytes of a packet',
      ],
      answer: 0,
      why: 'A tunnel does not just scramble the payload: it wraps the entire inner packet, headers included, in a new packet with its own headers and tag. That wrapper is the overhead, and it comes out of the link MTU.',
    },
    {
      q: 'Pings through a tunnel work, but a large download stalls. Don\'t-fragment is set and ICMP is blocked. What is the likeliest cause?',
      options: [
        'Packets over the tunnel MTU are dropped silently, since no ICMP message reaches the sender',
        'The server limits large downloads and answers small packets first, so only pings are fast',
        'The ping uses UDP, which the tunnel forwards faster than the TCP packets of the download',
        'The tunnel encrypts small packets and passes large ones through without encrypting them',
      ],
      answer: 0,
      why: 'Small packets fit and large ones do not. With ICMP blocked the sender does not learn the limit and keeps resending the same size, so a working ping says nothing about big packets.',
    },
    {
      q: 'A colleague says split tunnelling makes a VPN weaker. What is the accurate answer?',
      options: [
        'It is a routing choice: only the listed ranges enter the tunnel and the rest leaves directly',
        'Yes, because the encryption of the listed ranges is weaker than in a full tunnel',
        'Yes, because split tunnelling switches the replay check off for the direct traffic',
        'No, because it sends the same packets through the tunnel in a different order',
      ],
      answer: 0,
      why: 'The encryption of what enters the tunnel is the same. What changes is which destinations enter: a full tunnel sends more traffic through the far network, a split tunnel less, and each has costs.',
    },
    {
      q: `A receiver with a window of ${WINDOW} has accepted up to 200. A recorded copy of packet 100 arrives. What happens?`,
      options: [
        'It is dropped: 100 is below the window, and numbers up to 136 are too old to check',
        'It is accepted, because this receiver has not seen 100 inside the current window',
        'It is accepted, because numbers below the highest one may arrive late and are allowed',
        'It is dropped only if 100 is still marked as seen in the window\'s bitmap',
      ],
      answer: 0,
      why: 'The window covers the newest 64 numbers. Anything at or below 200 - 64 = 136 is refused without a look at a bitmap, because the receiver no longer remembers whether it saw it.',
    },
    {
      q: 'A WireGuard tunnel with an IPv4 outer header runs over a 1,500-byte link. What is the tunnel MTU?',
      options: ['1440', '1460', '1420', '1472'],
      answer: 0,
      why: 'The overhead is 20 (outer IP) + 8 (UDP) + 16 (data header) + 16 (tag) = 60, so 1500 - 60 = 1440. 1420 is the IPv6 figure.',
    },
  ],
};

export default lesson;
