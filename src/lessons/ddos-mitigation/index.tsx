import type { LessonModule } from '../../core/types';
import { integer, pct, sig } from '../../core/format';
import { initialPops, initialSyn } from './init';
import { LEGIT_RATE, NO_DEFENCE, PER_SOURCE_LIMIT, PRESETS, defaultInput, origin } from './origin';
import { LEGIT_TOTAL, TOTAL_CAPACITY, pops, scoreSet, scrubAt } from './pops';
import { runSyn } from './syn';
import { Stage } from './Stage';

const FLOOD = origin(defaultInput('volumetric'));
const BIGGER = origin({ ...defaultInput('volumetric'), defences: { ...NO_DEFENCE, bandwidth: true } });
const DISTRIBUTED = PRESETS[3].input();
const SPREAD = origin(DISTRIBUTED);
const FEW_SOURCES = origin({ ...DISTRIBUTED, sources: 1 });
const P0 = initialPops();
const SKEWED = pops(P0.attack, LEGIT_TOTAL, P0.skewPct, P0.extra);
const BALANCED = pops(P0.attack, LEGIT_TOTAL, 0, P0.extra);
const SCRUB = scrubAt(scoreSet(P0.seed), P0.threshold);
const SCRUB_ALL = scrubAt(scoreSet(P0.seed), 0);
const S0 = initialSyn();
const PLAIN = runSyn({ seed: S0.seed, flood: S0.flood, mode: 'plain' }).final;
const COOKIES = runSyn({ seed: S0.seed, flood: S0.flood, mode: 'cookies' }).final;
const SHORT = pct(1 - SPREAD.goodputShare, 0);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A flood works by exhausting one resource (bandwidth, a connection table or CPU) and the resource drops legitimate users in proportion; what helps depends on which resource it is, and some defences see sources while the flood is the total.',
    what: `A denial-of-service flood is a rate of unwanted load aimed at one thing the origin has too little of. A volumetric flood fills the links, a state-exhaustion flood fills a table of half-finished connections, and an application-layer flood sends expensive requests at a modest rate. Whichever resource saturates drops everything in proportion, so real users lose the same share as the unwanted load. More bandwidth, a per-source limit, a cache, a challenge and scrubbing each help some kinds and not others, and a flood spread over many sources stays under a per-source limit. Spreading load over many sites helps only if the load lands in proportion to capacity, and SYN cookies keep the handshake from using a table at all.`,
    analogy: 'A shop door that only lets so many people through: a crowd that is not buying slows everyone equally. More door width helps against a crowd, a guard who stops anyone who walks in twice does nothing against a thousand people who each walk in once, and a ticket check at the street stops them before the door.',
    useCases: [
      'Choosing between more capacity, rate limits, caching and an upstream scrubbing service for a public service',
      'Working out why a total of spare capacity did not protect users at one location',
      'Explaining SYN cookies, and what a half-open connection table is for',
      'Reading a defence plan for the kind of load it does not cover',
    ],
    why: 'Defences are matched to the resource under attack, and a mismatch looks like protection until the day it matters. Knowing which resource each kind of flood exhausts, and what each defence sees, lets you check a plan before you need it.',
    watch: 'The abstract unwanted stream is orange, a labelled actor and never red; legitimate traffic is blue. A saturated resource is red, a legitimate request served is green, dropped legitimate traffic is red and the dropped unwanted share is grey with a cross in the legend. A defence layer is violet, and in the SYN scene an entry from the flood is an orange slot, a legitimate handshake a blue slot, a free slot grey and a stateless cookie handshake green. The grey tick on a bar is capacity.',
  },
  tryThis: [
    `In What runs out at the defaults, a ${integer(3000)} Mbit/s volumetric stream saturates the 1,000 Mbit/s of bandwidth and only ${sig(FLOOD.goodput)} of ${LEGIT_RATE} legitimate requests a second are served (${pct(FLOOD.goodputShare, 0)}). Turn on "more bandwidth": ${sig(BIGGER.goodput)}.`,
    `Press "distributed low-rate": 1,000 sources each send under the ${PER_SOURCE_LIMIT}/s limit, so the limit passes all of it and ${pct(SPREAD.goodputShare, 0)} of legitimate requests are served. Set Sources to 1: the limit admits ${PER_SOURCE_LIMIT} and ${pct(FEW_SOURCES.goodputShare, 0)} are served.`,
    `In Absorb or filter at the defaults, ${TOTAL_CAPACITY.toLocaleString('en-US')} Mbit/s of total capacity covers a ${integer(P0.attack)} Mbit/s stream, yet the skewed catchment overloads site 1 and drops ${sig(SKEWED.legitDropped)} Mbit/s of legitimate traffic. Press "Rebalance the catchment": ${sig(BALANCED.legitDropped)}.`,
    `In Absorb or filter, the scrubbing threshold of ${P0.threshold} removes ${pct(SCRUB.attackRemoved, 0)} of unwanted flows and drops ${pct(SCRUB.legitDropped, 0)} of legitimate ones. Set it to 0: ${pct(SCRUB_ALL.attackRemoved, 0)} and ${pct(SCRUB_ALL.legitDropped, 0)}.`,
    `In SYN cookies, play to the end with no cookies: ${PLAIN.dropped} of ${PLAIN.started} legitimate handshakes are refused because the table of 8 is full. Choose "SYN cookies": ${COOKIES.dropped} are refused and the table stays empty.`,
  ],
  keyIdeas: [
    `A flood exhausts one resource, and that resource drops in proportion: in this model a ${integer(3000)} Mbit/s stream leaves ${pct(FLOOD.goodputShare, 0)} of legitimate users served, and extra bandwidth helps that class but not a flood of connection attempts or of expensive requests.`,
    `A per-source limit sees sources, not the total: in this model it stops one source sending ${integer(400)} requests a second and passes 1,000 sources sending 0.4 each, which leaves the origin ${SHORT} short.`,
    `Spare capacity in total is not spare capacity where the traffic lands: in this model ${TOTAL_CAPACITY.toLocaleString('en-US')} Mbit/s covers a ${integer(P0.attack)} Mbit/s stream, yet a catchment skewed ${P0.skewPct}% to one site drops ${sig(SKEWED.legitDropped)} Mbit/s of legitimate traffic.`,
    `SYN cookies move the handshake state into the reply: in this model ${PLAIN.dropped} of ${PLAIN.started} legitimate handshakes are refused without them and ${COOKIES.dropped} with them, and the half-open table stays empty.`,
  ],
  quiz: [
    {
      q: 'A site limits each source address to 10 requests a second. Why can a flood still overwhelm it?',
      options: [
        'Many sources can each stay under the limit while the total is huge',
        'The limit is applied after the traffic has used up the origin\'s CPU, so it saves nothing',
        'Rate limits count only TCP connections, so request floods pass',
        'A limit makes the origin send each blocked source a large reply',
      ],
      answer: 0,
      why: `A per-source limit measures each source, and a flood can be spread so that none exceeds it. In this model 1,000 sources sending 0.4 requests a second each pass a ${PER_SOURCE_LIMIT}/s limit untouched, and ${SHORT} of legitimate requests are still lost.`,
    },
    {
      q: 'A volumetric flood fills the origin\'s links. Why is buying a bigger origin server a poor fix?',
      options: [
        'The links fill before the traffic reaches the server, so it cannot help',
        'A bigger server accepts the flood faster, which makes the saturation worse',
        'Larger servers are slower under load, so they fail sooner than small ones',
        'Volumetric floods target small servers, so a big one is exempt from them',
      ],
      answer: 0,
      why: 'The saturated resource is bandwidth in front of the server, so server power does not change what arrives. Absorbing or filtering the flood upstream, where there is more bandwidth, is what helps.',
    },
    {
      q: 'Five sites have 1,400 Mbit/s between them and the unwanted load is 1,000. Why can legitimate users still lose traffic?',
      options: [
        'The catchment can put more on one site than it can carry, and that site drops in proportion',
        'Capacity at different sites adds up when they sit in one data centre and not otherwise',
        'Anycast sends each request to every site, which multiplies the load past the total',
        'Each site stops serving legitimate users as soon as its load passes half its capacity',
      ],
      answer: 0,
      why: `Traffic lands by catchment, not by capacity. In this model a catchment skewed ${P0.skewPct}% to site 1 overloads it and drops ${sig(SKEWED.legitDropped)} Mbit/s of legitimate traffic, while a catchment in proportion to capacity drops none.`,
    },
    {
      q: 'A scrubbing service raises its threshold, so a flow is dropped only if its score is higher. What does that do?',
      options: [
        'It drops fewer legitimate flows and lets more unwanted ones through',
        'It drops fewer unwanted flows and more legitimate flows',
        'It removes more unwanted flows with no extra legitimate loss',
        'It changes neither count, only the speed at which each flow is scored',
      ],
      answer: 0,
      why: `One threshold trades the two errors against each other. In this model a threshold of ${P0.threshold} removes ${pct(SCRUB.attackRemoved, 0)} of unwanted flows at a cost of ${pct(SCRUB.legitDropped, 0)} of legitimate ones, and a threshold of 0 drops everything in both classes.`,
    },
    {
      q: 'How do SYN cookies stop a flood of half-open connections from filling the table?',
      options: [
        'The server keeps no entry, and rebuilds one from the value the ACK returns',
        'It sets the timeout of each entry so low that the slots free again at once',
        'It blocks any source that sends more than one SYN within a second',
        'It makes clients solve a puzzle before the table accepts a SYN',
      ],
      answer: 0,
      why: `With cookies the SYN-ACK carries a keyed value and the server stores nothing; a source that does not answer leaves no state. In this model the table of 8 stays empty and ${COOKIES.dropped} legitimate handshakes are refused, against ${PLAIN.dropped} of ${PLAIN.started} without them.`,
    },
  ],
};

export default lesson;
