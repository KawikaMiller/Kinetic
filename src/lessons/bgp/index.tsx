import type { LessonModule } from '../../core/types';
import { GRAPH, LEAKER, ORIGIN, asName, capacityOf, edgeId } from './asgraph';
import { finalRound, linkLoads, propagate } from './bgp';
import { reachCounts } from './captions';
import { hijackResult, VALIDATOR_MAX, type HijackSetup } from './hijack';
import { announcedOf, baseConfig, changedFromDefault, initialAnnounce, initialHijack, initialPolicy, policyRun, preferProvider } from './init';
import { Stage } from './Stage';

const announce = propagate(baseConfig());
const holding = GRAPH.ases.filter((a) => finalRound(announce).best[a]).length;
const loopsAt = finalRound(announce).candidates[initialAnnounce().selected].filter((c) => c.status === 'loop').length;

const p0 = initialPolicy();
const chosen0 = finalRound(policyRun(p0)).candidates[p0.as].find((c) => c.status === 'chosen');
const p1 = preferProvider();
const chosen1 = finalRound(policyRun(p1)).candidates[p1.as].find((c) => c.status === 'chosen');
const changed1 = changedFromDefault(p1);

const leakBest = finalRound(propagate(baseConfig({ policy: 'leak' }))).best;
const leakLoads = linkLoads({ graph: GRAPH }, leakBest);
const overLinks = GRAPH.edges.filter((e) => (e.a === LEAKER || e.b === LEAKER) && (leakLoads.get(edgeId(e.a, e.b)) ?? 0) > capacityOf(e.a, e.b)).length;

const hs = initialHijack().setup;
const run = (over: Partial<HijackSetup>, text = hs.prefixText) => {
  const s = { ...hs, ...over, prefixText: text };
  return reachCounts(hijackResult(s, announcedOf(s)));
};
const slash25 = run({});
const slash24 = run({}, '203.0.113.0/24');
const slash24All = run({ validators: VALIDATOR_MAX }, '203.0.113.0/24');
const slash24Forged = run({ validators: VALIDATOR_MAX, forged: true }, '203.0.113.0/24');
const slash25All = run({ validators: VALIDATOR_MAX });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'BGP is how independent networks tell each other which address blocks they can reach. It picks routes by business policy first and shortest AS path second, and it trusts what neighbours announce.',
    what: 'The internet is thousands of autonomous systems, each run by one operator. They announce address prefixes to their neighbours in UPDATE messages carrying an AS_PATH, the list of networks the route passed through. A receiver discards a path that already contains its own number, then chooses among what it was sent: first by local preference, which encodes who pays whom (customer routes over peer routes over provider routes), then by shortest AS_PATH. There is no latency in the decision. Export rules decide who hears what, and a router that breaks them can leak a route. Because announcements are trusted, an AS that announces someone else\'s prefix, or a more specific piece of it, can attract traffic; origin validation with signed records is one defence.',
    analogy: 'Neighbouring countries agreeing which borders their trucks may cross. Each country decides first whom it is willing to carry freight for, and only then prefers the shorter route. Someone who falsely claims a road leads somewhere can pull trucks onto it until the other countries check the claim against a signed register.',
    useCases: [
      'Reading why traffic to a service suddenly takes a longer, slower path after a peering or policy change',
      'Understanding what anycast does: the same prefix announced from several sites, each client following the shortest path',
      'Following a route leak or hijack post-mortem without the jargon blocking the story',
      'Deciding whether to publish signed route records for your own prefixes and validate other networks\'',
    ],
    why: 'Almost every outage story about "the internet is down for them" runs through an announcement that was wrong, withdrawn or leaked. Knowing that BGP applies policy before path length, that a more specific prefix beats a shorter path, and that BGP by itself does not check who owns a prefix (route-origin validation is a separate add-on) tells you where to look.',
    watch:
      'The map has three tinted regions (core, regional, edge): they are plain categories, not good or bad. Solid violet links run customer to provider with an arrow at the provider; dashed violet links are peers. Announcements: green is the origin, blue links carry an UPDATE in this round, yellow links are the chosen path of the AS whose table is shown, and a grey table row is a path discarded because it already contains the receiver. Choosing a path: yellow links are every AS\'s chosen next hop. Who may tell whom: yellow links as before, red links are thin ones that carry more flows than they fit. Hijack and anycast: a green AS sends to the real origin, a red one to the hijacker (blue when the second site is legitimate), grey ones lose the packet. The chips say what is simulated, shown but not run, or from memory.',
  },
  tryThis: [
    `In "Announcements" press play: the route spreads from ${asName(ORIGIN)} and settles after ${announce.roundsToConverge} rounds with ${holding} of ${GRAPH.ases.length} ASes holding a route. The table of ${asName(initialAnnounce().selected)} lists ${loopsAt} path discarded as a loop: its provider passed its own route back.`,
    `In "Choosing a path" ${asName(p0.as)} sends through ${asName(chosen0?.from ?? 0)} (local preference ${chosen0?.pref}, path length ${chosen0?.path.length}). Drag its "Pref for 64497" slider to 350: it switches to ${asName(chosen1?.from ?? 0)} although that path is ${chosen1?.path.length} long, and "Paths changed by your edits" reads ${changed1.length}.`,
    `In "Who may tell whom" switch "Export policy" to the leak: ${asName(64499)} now sends through ${asName(LEAKER)} because a customer route beats a peer route, and ${overLinks} of the 2 thin access links overflow.`,
    `In "Hijack and anycast" (a hijacker, /25 inside the /24, no validators) ${slash25.second} of 8 ASes end at the hijacker and ${slash25.origin} at the real origin, whatever the path lengths. Press "/24, the same prefix": the map splits, ${slash24.origin} to the origin and ${slash24.second} to the hijacker, each AS applying its normal decision (local preference, then path length) to the two origins.`,
    `Set "ASes that validate origins" to ${VALIDATOR_MAX} of ${VALIDATOR_MAX} on the /24: the hijack is dropped (${slash24All.second} end at the second AS, itself). Switch "Forge the origin" on: the announcement reads valid and ${slash24Forged.second} end at it again. With the /25 and everyone validating, ${slash25All.second} end at it.`,
  ],
  keyIdeas: [
    'In this model BGP applies local preference, which encodes business relationships, before AS_PATH length, and nothing in the decision measures latency: the chosen path is policy first, not fastest.',
    'A router discards a received path that already contains its own AS number: that is how announcements avoid loops without any router seeing the whole map.',
    'Export rules decide who hears a route; under the common valley-free convention (a business practice, not part of the protocol), customer routes go to everyone and peer and provider routes go to customers. A route leak is an AS breaking that rule, and the traffic it pulls lands on links that were not sized for it.',
    'A more specific prefix wins the longest-prefix match wherever it is heard, whatever the AS_PATH length, so announcing a /25 inside someone else\'s /24 attracts the traffic. Origin validation drops announcements the signed records do not allow; a forged origin passes the origin check but not the length limit.',
  ],
  quiz: [
    {
      q: 'AS A hears two routes to a prefix: one from a customer with a long AS_PATH and one from a peer with a short one. Which does it prefer, and why?',
      options: [
        'The peer route, because the shorter AS_PATH is checked first',
        'The customer route, because local preference is compared before path length',
        'The peer route, because peers are always trusted more than customers',
        'The customer route, because it was announced first in the round',
      ],
      answer: 1,
      why: 'Local preference is set by business relationship and comes first: routes from customers earn money, so they beat peer routes. Path length decides when local preference is tied, and there is no latency in the decision.',
    },
    {
      q: 'Why does BGP choose a path that is slower than another one that was available?',
      options: [
        'It measures the bandwidth of every link and picks the cheapest one',
        'It picks at random among the routes it was sent, to share the load',
        'It applies policy and AS_PATH length, and measures no latency',
        'It prefers the route with the most ASes in its path, to be safe',
      ],
      answer: 2,
      why: 'The decision process compares preference, path length and tie-breaks. Nothing in it senses delay or loss, which is why traffic engineering is done by editing preferences and announcements.',
    },
    {
      q: 'A hijacker announces a /25 inside the origin\'s /24 with a longer AS_PATH than the origin\'s route. Where does traffic go?',
      options: [
        'To the origin, because its AS_PATH is shorter than the hijacker\'s',
        'To the origin and the hijacker alternately, balancing the load between them',
        'To the origin until the hijacker also announces the whole /24 prefix',
        'To the hijacker, because the more specific prefix wins the lookup',
      ],
      answer: 3,
      why: 'A router forwards by the longest matching prefix before it compares anything about the paths. Wherever the /25 is heard, packets inside it follow that route, however long its path is.',
    },
    {
      q: 'The hijacker announces the same /24 as the origin, with an equal-length route. What does each AS do?',
      options: [
        'It applies its normal decision to both origins, so the map splits between them',
        'It sends to the origin, because the signed record names it',
        'It sends to the hijacker, because the newest announcement replaces the old',
        'It drops both and has no route until someone withdraws one',
      ],
      answer: 0,
      why: 'With equal prefixes there is nothing to prefer a hijacker over an origin except the decision process, so the usual decision (local preference, then path length) picks one origin at each AS, and a longer path can win when its relationship ranks higher. This is also how anycast spreads clients over sites when the second origin is legitimate.',
    },
    {
      q: 'A hijacker puts the true origin\'s number at the end of its AS_PATH. What does origin validation make of an equal-length /24?',
      options: [
        'It drops the route, because the path is longer than the real one',
        'It drops the route, because the hijacker is not the first AS in the path',
        'It accepts the route, because validation reads the last AS in the path',
        'It accepts the route, because the prefix has no covering record',
      ],
      answer: 2,
      why: 'Origin validation compares the prefix, its length and the last AS of the path with the signed records. A forged last AS looks like the real origin, so signing the path itself, as BGPsec and ASPA do, would catch it.',
    },
  ],
};

export default lesson;
