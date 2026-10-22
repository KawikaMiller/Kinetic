import { humanDuration } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { DETECT_S, DNS_S, latencyStats, PROMOTE_S, RECOVERED_AT_S, REROUTE_S, routesFor, RTT } from './model';
import { Stage } from './Stage';

/** The write latency the stats row prints for active-active with nobody down, under each replication setting. */
const activeWriteMs = (replication: 'async' | 'sync') =>
  Math.round(latencyStats(routesFor('active', [], false), 'active', replication, []).avgWrite ?? 0);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Running in several geographic regions buys lower latency for distant users and survival of a whole-region outage, paid for with cost, complexity, and hard choices about replicating data across the planet.',
    what: 'Light in fibre covers roughly 200 km per millisecond, so a user 15,000 km from a single region cannot get a round trip under about 150 ms from it, however fast the servers are. Active-passive keeps a standby region fed by replication and fails over when the primary dies; recovery time (RTO) is the failover, and data loss (RPO) is whatever had not replicated yet. Active-active serves users from each region at once, which is fast and resilient but means concurrent writes in different regions can conflict. Synchronous replication gives an RPO of 0 while a replica is alive, but each write waits on a cross-region round trip.',
    analogy: 'One head office vs. branch offices. A single office is cheap, but far-away customers wait and a fire closes the business. A backup office takes time to open after a fire; branches in several cities keep working, but they have to reconcile their ledgers.',
    useCases: [
      'Global products that need low latency for users on every continent',
      'Surviving a full cloud-region outage',
      "Data-residency rules that require some users' data to stay in their jurisdiction",
      'Choosing RPO/RTO targets for disaster recovery with the business',
    ],
    why: "Multi-region decisions are among the costliest and hardest to reverse in a system's life. Engineers need to reason from physics (latency), failure modes (RPO/RTO), consistency (conflicts, sync vs async) and cost, and explain those trade-offs to leadership.",
    watch:
      'Blue dots are user requests travelling to the region serving them, with the round-trip time on each label. Violet dots are replication between regions. Region squares are green when serving, violet dashed when on standby, grey when unused and red with a cross when dead. Click a region (or focus it and press Enter), or use Kill us-east, to take it down and watch the failover pill and the downtime counter. The stats row shows latency, users down, RPO and RTO, and cost for the chosen topology; the chips say what is simulated, invented or from memory.',
  },
  tryThis: [
    `In Single region, note Asia-Pacific's latency (${RTT.apu.us} ms to us-east), then kill us-east: Users down reads 100% and there is nowhere to fail over to.`,
    `Switch to Active-passive and kill us-east: detection (${DETECT_S} s), promotion (${PROMOTE_S} s) and DNS (${DNS_S} s) each add downtime, so users are down for ${humanDuration(RECOVERED_AT_S)} in this model.`,
    `In Active-active, kill us-east: its North American users are rerouted to the next-nearest region, eu-west, within ${REROUTE_S} s.`,
    `In Active-active, press Concurrent edit with Async replication, then switch Replication to Sync and press it again: the stats show average write latency going from ${activeWriteMs('async')} ms to ${activeWriteMs('sync')} ms.`,
  ],
  keyIdeas: [
    'Latency is physics: about 1 ms of round trip per 100 km of fibre, before any processing.',
    'RPO is how much data you can lose; RTO is how long you can be down. Async replication means RPO > 0.',
    `Active-passive is simpler but has a failover gap (${humanDuration(RECOVERED_AT_S)} in this model); active-active keeps serving from the surviving regions after a short reroute, but must resolve write conflicts.`,
    'Sync replication gives RPO = 0 while a replica is alive, but each write pays a cross-region round trip.',
  ],
  quiz: [
    {
      q: 'The primary region dies with async replication to a standby. Which data is lost?',
      options: [
        'Nothing, because replicas are always identical',
        'Writes the primary committed that had not reached the standby',
        'Every write since the last full backup was taken, however old',
        'Only the reads that were in flight at that moment',
      ],
      answer: 1,
      why: 'Async replication lags slightly; that lag window of committed-but-unreplicated writes is the RPO.',
    },
    {
      q: "Why can't a single US region give Singapore users a 20 ms round trip, however fast the servers are?",
      options: [
        'The bandwidth of the link between the two places',
        'The speed of light in fibre over about 15,000 km',
        'DNS caching at the resolvers that Singapore uses',
        'TLS encryption overhead on each single request',
      ],
      answer: 1,
      why: 'At about 200,000 km/s in fibre, 15,000 km each way is already about 150 ms round trip before any processing.',
    },
    {
      q: 'What new problem does active-active introduce compared with active-passive?',
      options: [
        'Higher read latency for users in the most distant region',
        'No way to survive the loss of one whole cloud region',
        'Concurrent writes to one record in two regions can conflict',
        'It can no longer use DNS to steer a user toward a nearby region',
      ],
      answer: 2,
      why: 'Each region accepts writes, so two regions can change the same record before they hear about each other.',
    },
    {
      q: 'Synchronous replication is on and the standby region goes down. What is the RPO now?',
      options: [
        'Still 0, because the setting says synchronous',
        'Not 0: writes have only one copy until a replica returns',
        'Zero, since the primary keeps a local backup of each write',
        'Equal to the DNS time-to-live of the failover',
      ],
      answer: 1,
      why: 'Sync replication gives RPO = 0 while a live replica can acknowledge each write. With none, the model\'s writes sit in one region and a second failure can lose them.',
    },
    {
      q: 'Which three delays make up the failover downtime of an active-passive pair?',
      options: [
        'Detecting the failure, promoting the standby and DNS propagation',
        'Restoring a backup, DNS propagation and the TLS handshake',
        'Detecting the failure, replication lag and a full copy of the data',
        'Detecting the failure, load balancer warm-up and certificate renewal',
      ],
      answer: 0,
      why: `In this model the phases are ${DETECT_S} s to detect, ${PROMOTE_S} s to promote and ${DNS_S} s of DNS, ${RECOVERED_AT_S} s in total. The numbers are invented; the three phases are the ones to ask about.`,
    },
  ],
};

export default lesson;
