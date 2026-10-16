import type { LessonModule } from '../../core/types';
import { firstBytes, msText } from './captions';
import { runEarly } from './earlyData';
import { STACKS, schedule } from './flights';
import { DEFAULT_LAYOUT, holRun, summariseHol } from './hol';
import { DEFAULT_RTT, DEFAULT_THINK, PRESETS } from './init';
import { recover } from './migration';
import { Stage } from './Stage';

const R = DEFAULT_RTT;
const T = DEFAULT_THINK;
const requestMs = STACKS.map((s) => schedule(s, R, T).requestAt);
const byte = firstBytes(R, T);
const city = PRESETS.find((p) => p.id === 'city')?.rttMs ?? 15;
const sat = PRESETS.find((p) => p.id === 'satellite')?.rttMs ?? 300;
const cityGap = firstBytes(city, T)[0] - firstBytes(city, T)[3];
const satBytes = firstBytes(sat, T);

const postAccept = runEarly('post', 'accept', 1, R, T);
const postSafe = runEarly('post', 'idempotent-only', 1, R, T);
const postKey = runEarly('post', 'idempotency-key', 1, R, T);

const holDefault = summariseHol(holRun(DEFAULT_LAYOUT, [5], R));
const holTwo = summariseHol(holRun(DEFAULT_LAYOUT, [1], R));

const tcp = recover('tcp', R, false);
const quic = recover('quic', R, false);
const blocked = recover('quic', R, true);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'QUIC is faster than TCP plus TLS because it needs fewer round trips and does not block one stream behind another, not because UDP is quicker. A resumed 0-RTT request goes in the first flight but can be replayed.',
    what: 'A TCP connection with TLS needs its own handshake and then TLS\'s, so the request cannot leave for two or three round trips. QUIC runs the cryptographic handshake inside its own, so a first request leaves after one, and a resumed connection can put the request in the very first flight (0-RTT). That early data can be copied and delivered again by someone on the path, so it is safe only for requests that do no harm twice, or with an idempotency key. QUIC also tracks each stream separately, so a lost packet delays only the streams whose data it held, where TCP delays every stream behind the hole. And a connection is named by a connection ID, not by addresses and ports, so it can survive a phone changing network after one round trip of path validation.',
    analogy: 'Posting a letter that needs a signature. TCP plus TLS is phoning to agree a courier, then agreeing a lock, then sending. QUIC does both in one call, and with a pre-agreed lock (0-RTT) the letter goes with the first call, which means a copied letter can be delivered twice.',
    useCases: [
      'Explaining why a first page load or an API call over a mobile network feels faster on HTTP/3',
      'Deciding which requests may be sent as 0-RTT early data and which must wait for the handshake',
      'Reading why a lost packet stalls every image on an HTTP/2 page but only one on HTTP/3',
      'Understanding why a video call or download survives walking from Wi-Fi to cellular on QUIC',
    ],
    why: 'Latency is round trips. Knowing where the handshake spends them, and what 0-RTT trades away, lets you read a waterfall, choose which requests may be early data, and explain a migration that did not drop the call.',
    watch:
      'Round trips: blue bars are the handshake flights before the request can leave, a yellow diamond is the first request, a green diamond is the first byte of the response, and the grey hatched bar is waiting for the answer. What 0-RTT costs: a red charge count or red table rows are work done more than once for a request that is not safe to repeat, green is the request handled once. Head-of-line blocking: amber, pink, blue and grey bars are streams A, B, C and D receiving data, an orange hatched bar is a stream waiting on an earlier hole, and a red marker is when a lost packet\'s resend arrives. Migration: blue bars are data flowing, a dashed red bar is a dead TCP connection, a blue-green bar is a new handshake, a green bar is QUIC\'s validated new path, and an amber hatched bar is QUIC waiting on a blocked UDP path. The chips say what is simulated, scripted, shown but not run, illustrative or from memory.',
  },
  tryThis: [
    `In "Round trips" (${R} ms round trip, ${T} ms think time) press play: the request leaves after ${requestMs.map((m) => msText(m)).join(', ')} for TCP + TLS 1.2, TCP + TLS 1.3, QUIC and QUIC 0-RTT, and the first byte arrives at ${byte.map((m) => msText(m)).join(', ')}. Press "same city (RTT ${city} ms)": the gap between the first and last shrinks to ${msText(cityGap)}.`,
    `In "What 0-RTT costs" (POST /charge, accept any early data) press "Replay the first flight" once: "Charges made" reads ${postAccept.applied}. Pick "early data only for safe requests": the charge happens once after a retry, and the first byte moves from ${msText(postAccept.firstByteMs)} to ${msText(postSafe.firstByteMs)}. Pick "an idempotency key": ${postKey.applied} charge and the first byte stays at ${msText(postKey.firstByteMs)}.`,
    `In "Head-of-line blocking" packet 6 (stream D only) is lost: TCP delays ${holDefault.tcpDelayed} of 4 streams and QUIC ${holDefault.quicDelayed}. Click packet 6 to put it back and packet 2 (stream C only) to lose it: TCP still delays ${holTwo.tcpDelayed} of 4 and QUIC ${holTwo.quicDelayed}.`,
    `In "Migration" (${R} ms round trip) the phone changes network: TCP stalls ${msText(tcp.stallMs)}, QUIC ${msText(quic.stallMs)}. Switch the new network to "blocks UDP": QUIC stalls ${msText(blocked.stallMs)}, because it waits and then pays the TCP handshake.`,
    `In "Round trips" press "satellite (RTT 600 ms; slider stops at 300)": the first byte arrives at ${msText(satBytes[0])} for TCP + TLS 1.2 and ${msText(satBytes[3])} for QUIC 0-RTT, ${msText(satBytes[0] - satBytes[3])} apart, all of it round trips.`,
  ],
  keyIdeas: [
    'In this model QUIC is faster because it combines the transport and cryptographic handshakes, so the request leaves after one round trip instead of two or three; it is not faster because UDP is.',
    '0-RTT puts the request in the first flight and saves a round trip, but early data can be delivered again, so it is safe only for requests that do no harm twice or that carry an idempotency key.',
    'Over TCP a lost packet holds back every stream behind it, because bytes are delivered in order; QUIC delivers each stream in order on its own, so only the streams whose data was lost wait.',
    'A TCP connection is named by its addresses and ports and a QUIC connection by a connection ID, so QUIC can continue after a network change once the new path is validated, which takes one round trip.',
  ],
  quiz: [
    {
      q: 'Why does a QUIC client get its first response byte sooner than a TCP plus TLS 1.3 client on the same path?',
      options: [
        'UDP datagrams travel faster across the network than TCP segments do over the very same links',
        'QUIC puts the crypto handshake inside its own, so the request leaves after one round trip',
        'QUIC skips encryption on the first request to save time on the handshake that follows',
        'QUIC sends the response before the request has finished arriving at the server it asked',
      ],
      answer: 1,
      why: 'TCP needs a round trip for its handshake and another for TLS 1.3, so the request leaves after two. QUIC folds both into one, so the request leaves after one; packets are not carried any faster.',
    },
    {
      q: 'What does a client risk by sending a POST that charges a card as 0-RTT early data?',
      options: [
        'The server may refuse every request on the connection afterwards',
        'The request may be encrypted with a weaker key than later requests',
        'The first flight can be delivered again, so the card may be charged twice',
        'The response may arrive before the request, confusing the client',
      ],
      answer: 2,
      why: 'Early data has no replay protection of its own: a copy of the first flight can be delivered again and the server may act on it twice. Allow only safe requests early, or give the request an idempotency key.',
    },
    {
      q: 'One packet that holds only stream 2\'s data is lost. What happens to streams 1, 3 and 4?',
      options: [
        'Over QUIC they carry on, while over TCP they wait for the resend',
        'They wait for the resend over both TCP and QUIC, since the connection is shared',
        'Over TCP they carry on, while over QUIC they wait for the resend',
        'They are lost too, because streams on one connection fail together',
      ],
      answer: 0,
      why: 'TCP hands bytes to the application in the order they were sent, so everything after the hole waits for the resend. QUIC delivers each stream in order on its own, so streams without data in the lost packet are untouched.',
    },
    {
      q: 'A phone moves from Wi-Fi to cellular. Why does an existing TCP connection stop working and a QUIC one does not?',
      options: [
        'TCP cannot send over cellular networks at all, while QUIC was designed to use them',
        'TCP is named by addresses and ports, QUIC by a connection ID that survives a new address',
        'TCP connections time out after one second without traffic, and QUIC ones do not',
        'QUIC keeps a second connection open over Wi-Fi in the background, ready to take over at once',
      ],
      answer: 1,
      why: 'A TCP connection is identified by the four-tuple, so a new source address is a different connection. QUIC identifies the connection by an ID, validates the new path with a challenge and response, and carries on.',
    },
    {
      q: 'Which request can be sent as 0-RTT early data with no extra protection?',
      options: [
        'A payment that the server would reject if it were repeated',
        'A request that deletes an order, because deleting twice does nothing more',
        'A request to GET a public catalogue, which changes nothing when repeated',
        'A request that creates a new account from a form the user filled in',
      ],
      answer: 2,
      why: 'Doing a GET of public data twice changes nothing, so a replay is harmless. A payment or an account creation is not safe to repeat without an idempotency key, and a delete may have other effects such as a later error.',
    },
  ],
};

export default lesson;
