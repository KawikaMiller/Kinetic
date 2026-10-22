import type { LessonModule } from '../../core/types';
import { KIND_NAME, checksMade, nominatedOf, pairsOf, type Scenario } from './ice';
import { initialIce, initialPunch, initialRelay, initialStun, PRESETS } from './init';
import { NAT_NAME, NAT_TYPES, epText, matrix, punch, stunTable } from './nat';
import { CALLS, SHARE, latencies, relayLoad } from './relay';
import { Stage } from './Stage';

const stun = initialStun();
const reflexiveA = epText(stunTable('A', stun.a)[0].outside);
const reflexiveB = epText(stunTable('B', stun.b)[0].outside);

const p0 = initialPunch();
const home = punch(p0.a, p0.b, p0.offset);
const bothHard = punch(p0.a, 'symmetric', 0);
const softA = punch('restricted', 'symmetric', 0);
const punching = matrix().flat().filter(Boolean).length;

const r0 = initialRelay();
const lat = latencies();
const load = relayLoad(CALLS.initial, SHARE.initial);

const ice = (sc: Scenario) => {
  const pairs = pairsOf(sc);
  return { pairs, n: checksMade(pairs).length, win: nominatedOf(pairs) };
};
const iceHome = ice(initialIce());
const iceLan = ice(PRESETS.find((p) => p.id === 'lan')!.scenario);
const iceHard = ice(PRESETS.find((p) => p.id === 'symmetric')!.scenario);
const kinds = (w: ReturnType<typeof nominatedOf>) => (w ? `${KIND_NAME[w.local.kind]} to ${KIND_NAME[w.remote.kind]}` : 'none');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Two peers behind NATs cannot just connect. A STUN server tells each its public address, both send first so their NATs open, and when that fails a TURN relay carries the media. ICE tries the options in a fixed priority order.',
    what: 'A NAT rewrites the source of outgoing packets and drops incoming ones that no earlier outgoing packet explains. To connect two such peers, each asks a STUN server what address it was seen at, the two swap those addresses through a signalling server (which WebRTC leaves to the app), and both send UDP at each other at the same time: each outgoing packet opens a hole for the reply. Whether that works depends on how each NAT maps and filters; a NAT that makes a new mapping per destination breaks it against a strict partner. When it fails, a TURN relay in the middle carries the traffic. ICE gathers the candidates (host, server-reflexive, relayed), orders the pairs by a priority formula and nominates the first that answers.',
    analogy: 'Two people in different buildings, each with a front desk that only lets in visitors someone inside has already called. Neither can call the other first, so they both phone out at the same moment: each desk then recognises the other\'s call as an answer. If one desk uses a new extension for every call, the number they were given is the wrong one.',
    useCases: [
      'Understanding why a video call sometimes connects directly and sometimes goes through a server',
      'Sizing a TURN relay by thinking about what share of calls cannot punch a hole',
      'Reading a WebRTC connection log: candidate types, pair priorities and the nominated pair',
      'Explaining why peer-to-peer apps still need a signalling server, STUN and often TURN',
    ],
    why: 'Real-time apps, multiplayer games and file-transfer tools fail in the field on NAT behaviour that works on a developer laptop. Knowing what each server does, and which NAT pairs punch, lets you tell a missing relay from a bug.',
    watch:
      'Two boxes are the peers, each behind a NAT box; the box in the middle is a STUN server (blue: the reply it sends back names the address it saw) or a TURN relay (orange: a labelled fallback, not a failure). A yellow pill is an outgoing request and the mapping it makes, a green link or a green row is something that got through, and a red probe or row was dropped by a NAT or got no answer. Violet is the signalling path. In the matrix an orange cell is a pair that needs the relay and a green one punches a hole. In the ICE table the yellow row is the pair being checked, the ringed green row is the nominated pair, and grey rows were never tried. The chips say what is simulated, illustrative, from memory or shown without being run.',
  },
  tryThis: [
    `In "Who am I from outside?" press play (or restart): each peer sends one binding request and the server answers with the address it saw. A learns ${reflexiveA} and B learns ${reflexiveB}; each NAT ends with one mapping, and no packet goes from A to B.`,
    `In "Hole punching" (both home routers: ${NAT_NAME[p0.a]} NATs) press play (or restart): A's first probe is dropped by NAT B, B's first probe gets through, and the pair is connected with ${home.dropped} dropped probe of ${home.probes.length}. Set the NAT of peer B to symmetric: all ${bothHard.probes.length} probes are dropped. Then set the NAT of peer A to restricted cone: it connects again (${softA.probes.length} probes).`,
    `Below the ladder, press the symmetric-by-symmetric cell of the matrix: it reads relay. ${punching} of ${NAT_TYPES.length * NAT_TYPES.length} pairs punch a hole, and moving "Peer B starts" to 3 ticks late changes none of them.`,
    `In "The relay" (${NAT_NAME[r0.a]} against ${NAT_NAME[r0.b]}) the pair cannot punch, so the path in use is the relay: ${lat.relayed} ms one way instead of ${lat.direct}, ${lat.extra} ms more. At ${CALLS.initial.toLocaleString('en-US')} calls with ${SHARE.initial}% relayed the relay sends ${load.egressMbps} Mbit/s, ${load.gbPerHour} GB an hour. Move the share to 0: the relay sends nothing.`,
    `In "ICE" (both home routers) the nominated pair is ${kinds(iceHome.win)} after ${iceHome.n} checks, because the host pair fails first. Press "same LAN (host candidate wins)": ${kinds(iceLan.win)} after ${iceLan.n} check. Press "both symmetric (relay needed)": ${kinds(iceHard.win)} after ${iceHard.n} checks.`,
  ],
  keyIdeas: [
    'STUN just reports the public address a server saw; it relays nothing. A NAT that makes a new mapping per destination makes that address useless to the other peer.',
    'Hole punching works because each side sends first: an outgoing packet opens the sender\'s NAT for the reply. In this model it works for every pair of NATs except a symmetric one against a port-restricted or another symmetric one.',
    'A TURN relay carries the media when punching fails: it is a public address that answers, but the path is longer and the relay pays for the bandwidth. Peer to peer still needs signalling, STUN and often TURN.',
    'ICE gathers host, server-reflexive and relayed candidates, orders the pairs by a priority formula, checks them from the top and nominates the first that works.',
  ],
  quiz: [
    {
      q: 'What does a STUN server do for two peers behind NATs?',
      options: [
        'It reports the public address and port it saw each peer\'s packet come from',
        'It forwards the media between the peers when they cannot connect directly',
        'It carries the offer and the answer between the peers during the call setup',
        'It asks each peer\'s router to open a port that the other peer can use',
      ],
      answer: 0,
      why: 'A STUN server answers one question: which address did my packet arrive from. Relaying is the job of TURN, and carrying the offer and answer is signalling, which the application provides.',
    },
    {
      q: 'A video call is "peer to peer" and the media goes straight between the two users. Which servers were still involved?',
      options: [
        'A signalling server and a STUN server, and often a TURN relay for pairs that cannot connect',
        'None, because the peers find each other from their private addresses on their own',
        'Only a STUN server, which also carries the offer and the answer between the peers',
        'Only a TURN server, which has to relay the first packets before a direct path exists',
      ],
      answer: 0,
      why: 'The direct path carries just the media. Setting it up needs signalling to swap candidates and STUN to learn public addresses, and a relay stands by for pairs where no hole opens.',
    },
    {
      q: 'A stranger sends a packet to a host behind a restricted NAT. Why is it dropped?',
      options: [
        'The NAT has no table entry that lets that sender in, since the host never sent to it',
        'The NAT reads the payload and blocks any packet it does not recognise as a reply',
        'The NAT holds a deny rule for that sender, written by the administrator of the router',
        'The host\'s operating system refuses packets from ports it has not listened on',
      ],
      answer: 0,
      why: 'Blocking unsolicited packets is a side effect of the translation table, not a firewall rule: without a mapping and a filter entry made by an outgoing packet there is nothing to translate the packet to.',
    },
    {
      q: 'Which pair of NATs cannot punch a hole in this lesson\'s model?',
      options: [
        'A symmetric NAT against a port-restricted cone NAT',
        'A symmetric NAT against a restricted cone NAT',
        'A full cone NAT against a port-restricted cone NAT',
        'A restricted cone NAT against a port-restricted cone NAT',
      ],
      answer: 0,
      why: 'The symmetric NAT sends from a new port for the other peer, so the address STUN reported is wrong, and the port-restricted partner accepts just the exact port it sent to. A restricted cone partner accepts that port too, so that pair works.',
    },
    {
      q: 'A host candidate has local preference 65535 and component 1. What is its ICE priority?',
      options: ['2130706431', '1694498815', '2130706430', '16777215'],
      answer: 0,
      why: 'The formula is 2^24 x 126 + 2^8 x 65535 + (256 - 1) = 2130706431. 1694498815 is the server-reflexive value, 2130706430 uses component 2, and 16777215 is the relayed value.',
    },
  ],
};

export default lesson;
