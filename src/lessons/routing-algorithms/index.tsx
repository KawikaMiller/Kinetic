import type { LessonModule } from '../../core/types';
import { msText } from './captions';
import { sceneRun } from './dv';
import { FORWARDING_TABLES, FORWARDING_TOPO, lookup, walk } from './forwarding';
import { FORWARD_DESTINATION, dvBaseline, dvTopo, initialDv, initialLs } from './init';
import { LS_BROKEN_SEED, LS_DEAD_ROUTE_SEED, dvRoundsFor, lsRun, messageCounts, settling } from './ls';
import { Stage } from './Stage';
import { presetById, intactTopo, presetTopo } from './topology';

const path = walk(FORWARDING_TABLES, FORWARDING_TOPO, 'A', 'F');
const winner = lookup(FORWARD_DESTINATION).winner;
const hostRoute = lookup('198.51.100.200').winner;

const dv0 = initialDv();
const chainRun = sceneRun(dvBaseline(dv0.presetId), dvTopo(dv0.presetId, dv0.links), dv0.start, 'plain');
const climbA = chainRun.tables.slice(1, 7).map((t) => t.A.C.cost).join(', ');
const climbB = chainRun.tables.slice(1, 7).map((t) => t.B.C.cost).join(', ');
const triangle = presetById('triangle');
const triangleRounds = sceneRun(intactTopo(presetTopo(triangle)), presetTopo(triangle), 'change', 'split').rounds;

const ls0 = initialLs().setup;
const lsDefault = lsRun(ls0);
const lsSettle = settling(lsDefault);
const lsMessages = messageCounts(lsDefault, Infinity).sent;
const lsBroken = lsRun({ ...ls0, mode: 'ignore' });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Forwarding is a lookup in a table; routing is how the tables get filled. Distance vector shares costs with neighbours and can count to infinity, link state floods the map and lets each router run Dijkstra.',
    what: 'Every router holds a table of destination, next hop and cost, and a packet is carried one lookup at a time: no router holds the whole path. Distance-vector routers build the tables by telling neighbours their costs, the Bellman-Ford idea. After a link fails, plain distance vector can keep two routers re-advertising a stale route to each other while the cost climbs; split horizon and poisoned reverse stop that for two routers and not for a longer loop. Link-state routers flood a small advertisement of their own links, tagged with a sequence number, so every router gets the same map and runs Dijkstra on it. The flood takes time, and the sequence number is what keeps an old advertisement from overwriting a newer one.',
    analogy: 'Distance vector is asking each neighbour "how far is the station?" and trusting the answer plus the distance to them. Link state is everyone posting a note about which roads they connect to, until each person has the same road map and draws their own shortest route on it.',
    useCases: [
      'Reading why a network keeps dropping packets for seconds after a link flaps',
      'Choosing between a simple vector protocol and a link-state one for a campus or data-centre network',
      'Understanding what a routing table row means before debugging "no route to host"',
      'Seeing the idea behind OSPF and IS-IS (link state) and RIP (distance vector)',
    ],
    why: 'When a link fails, the difference between a protocol that converges in a round or two and one that counts to infinity is the difference between a blip and an outage. Knowing that each router only holds a next hop and a cost, and that its database can be briefly stale, is what makes "why is traffic going the wrong way" a question you can answer.',
    watch:
      'Forwarding: yellow marks the router holding the packet and the links it has crossed, a green outline is the destination, and the dashed blue link is the next hop named by the table on screen. Distance vector: a yellow table cell, and its router in the drawing, changed in this round; red cells read ∞ (16), which is unreachable, a dashed red link is cut, and the blue link is the one you selected. Link state: green links are the shortest-path tree of the chosen router, dashed red links are down (a thick one is a tree running over a dead link), orange cells and routers hold a stale copy of an advertisement, and the yellow router is the one whose tree is drawn. A red "broken" in the stats is the sequence rule failing at that moment. The chips say what is simulated, illustrative, a toy or from memory.',
  },
  tryThis: [
    `In "Forwarding" press play with the default A to F: the packet goes ${path.hops.join(', ')} at a path cost of ${path.cost}, and each stop uses only its own table. Below it, "Packet for" ${FORWARD_DESTINATION} matches ${lookup(FORWARD_DESTINATION).matches.length} rows and ${winner?.text} wins; pick ${hostRoute?.text.split('/')[0]} and the ${hostRoute?.text} row wins instead.`,
    `In "Distance vector" (chain, link B-C cut, plain) press play: A's cost to C goes ${climbA} over the first six rounds and B's goes ${climbB}, until both reach 16 after ${chainRun.rounds} rounds. Pick "split horizon" and the stat reads 2 rounds.`,
    `From the distance-vector defaults load "triangle + stub, cut A-X" and pick "split horizon": it still counts upward, ${triangleRounds} rounds, because the loop runs through three routers. The "Same change, by mode" stat shows all three modes.`,
    `In "Link state" (ring, link A-B cut at 60 ms, seed ${ls0.seed}) press play: ${lsMessages} advertisements are sent in all, and the databases agree ${msText(lsSettle.ms ?? 0)} after the cut, against ${dvRoundsFor(ls0)} synchronous rounds for distance vector on the same cut. Watch the orange cells: routers briefly hold an old copy.`,
    `From the link-state defaults set "Rule" to "broken: ignore sequence numbers" (seed ${LS_BROKEN_SEED}): at ${msText(lsBroken.violation?.time ?? 0)} a router replaces a newer advertisement with an older one and the "Sequence rule" stat reads "broken". Press "Seed ${LS_DEAD_ROUTE_SEED}: a router keeps a dead route" to see a router that still routes over the cut link at the end.`,
  ],
  keyIdeas: [
    'A routing table holds a next hop and a cost for each destination, not the path: the path is the result of one lookup at each router, and the longest matching prefix wins the lookup.',
    'In this model plain distance vector counts to infinity after a cut because two routers keep advertising each other a stale route; split horizon breaks a loop of two routers and not a loop of three.',
    'Link state gives each router the same map by flooding advertisements, then each runs Dijkstra on its own copy; flooding takes time, so a router can briefly hold a stale database.',
    'A sequence number lets a router discard an advertisement older than the one it already holds; without that check, a late old copy overwrites a newer one and a router can keep a route over a link that is down.',
  ],
  quiz: [
    {
      q: 'A packet crosses four routers from A to F. What does router A know about the path?',
      options: [
        'The full list of routers the packet will cross, kept in its table',
        'The next two hops, which its neighbour B tells it about',
        'Only the next hop for F and the cost it was told',
        'The route with the fewest hops, found by tracing it',
      ],
      answer: 2,
      why: 'A table row holds a destination, a next hop and a cost. Each router looks up the destination again, so the path exists as the sum of the lookups along the way and nowhere else.',
    },
    {
      q: 'In the chain A-B-C with link B-C cut, why does plain distance vector keep raising A\'s cost to C?',
      options: [
        'The cut link keeps resending its old advertisements, which no router can delete',
        'Each router adds a penalty to any cost it has not heard about recently',
        'C advertises a higher cost every round so that traffic avoids the failed link',
        'A and B each advertise a route to C through the other, adding 1 each time',
      ],
      answer: 3,
      why: 'B no longer has a link to C, so it takes A\'s route to C, which goes through B. Each round the two reinforce each other\'s stale cost by one, until the cost reaches the 16 that stands for unreachable.',
    },
    {
      q: 'In the triangle with a stub, split horizon still counts upward. What does that show?',
      options: [
        'It only breaks a loop of two routers; a loop through three gets past it',
        'Split horizon needs more rounds than plain advertising before it takes effect',
        'The stub router ignores the rule because it has just one neighbour',
        'Poisoned reverse is the only version that works on a triangle topology',
      ],
      answer: 0,
      why: 'Split horizon stops a router advertising a route back to the neighbour it learned it from. A loop through B, C and A hides the stale route behind a third router, so in this model the rule does not fire.',
    },
    {
      q: 'A link fails in a link-state network. Which statement about the routers\' databases is true?',
      options: [
        'All routers switch to the new map in the same instant, because the link is shared',
        'It spreads hop by hop, so some routers keep the old map for a while',
        'Only the two routers at the ends of the link ever learn that it failed',
        'Each router waits for every other router to confirm before using the new map',
      ],
      answer: 1,
      why: 'The two end routers flood a new advertisement and it travels over the remaining links with real delay. Until it arrives, a router can still run Dijkstra on a map that includes the dead link.',
    },
    {
      q: 'What does the sequence number in a link-state advertisement protect against?',
      options: [
        'A router flooding an advertisement back to the very neighbour it arrived from',
        'Two links with the same cost leaving Dijkstra unable to pick one path',
        'A router advertising a cost higher than the one it measured on its link',
        'A late old advertisement overwriting a newer one a router already stored',
      ],
      answer: 3,
      why: 'Delivery can reorder, so an old advertisement can arrive after a newer one. Storing a copy when its number is higher keeps the database moving forward; ignoring the number lets the old copy win.',
    },
  ],
};

export default lesson;
