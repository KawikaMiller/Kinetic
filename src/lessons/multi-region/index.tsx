import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "Running in several geographic regions buys lower latency for distant users and survival of a whole-region outage, paid for with cost, complexity, and hard choices about replicating data across the planet.",
    what: "Light in fibre covers roughly 200 km per millisecond, so a user 15,000 km away can never get a round trip much under ~150 ms from a single region. Active-passive keeps a standby region fed by replication and fails over when the primary dies; recovery time (RTO) is the failover, and data loss (RPO) is whatever hadn't replicated yet. Active-active serves users from every region at once, which is fast and resilient but means concurrent writes in different regions can conflict. Synchronous replication removes data loss but makes every write wait on a cross-region round trip.",
    analogy: "One head office vs. branch offices. A single office is cheap, but far-away customers wait and a fire closes the business. A backup office takes time to open after a fire; branches everywhere keep working, but they have to reconcile their ledgers.",
    useCases: [
      "Global products that need low latency for users on every continent",
      "Surviving a full cloud-region outage (they do happen)",
      "Data-residency rules that require some users' data to stay in their jurisdiction",
      "Choosing RPO/RTO targets for disaster recovery with the business",
    ],
    why: "Multi-region decisions are some of the most expensive and least reversible in a system's life. Staff engineers need to reason from physics (latency), failure modes (RPO/RTO), consistency (conflicts, sync vs async) and cost, and explain those trade-offs to leadership.",
    watch: "Blue dots are user requests travelling to the region serving them, with the round-trip time on each label. Violet dots are replication between regions. Region squares are green when serving, violet dashed when on standby, and red when dead. Click a region, or use Kill us-east, to take it down and watch the failover timeline and downtime counter. The stats row shows latency, users down, RPO/RTO and cost for the chosen topology.",
  },
  tryThis: [
    'In Single region, note Asia-Pacific\'s latency, then kill us-east: everyone goes down.',
    'Switch to Active-passive and kill us-east: watch detection, promotion and DNS each add downtime.',
    'In Active-active, kill a region: its users are rerouted to the next-nearest region within ~30 s.',
    'Try Concurrent edit with Async and then Sync replication, and compare the write latency.',
  ],
  keyIdeas: [
    'Latency is physics: ~1 ms of round trip per 100 km of fibre, before any processing.',
    'RPO = how much data you can lose; RTO = how long you can be down. Async replication means RPO > 0.',
    'Active-passive is simpler but has a failover gap; active-active is always on but must resolve write conflicts.',
    'Sync replication gives RPO = 0 but every write pays a cross-region round trip.',
  ],
  quiz: [
    {
      q: 'The primary region dies with async replication to a standby. Which data is lost?',
      options: [
        'Nothing, replicas are always identical',
        'Writes committed on the primary that had not yet reached the standby',
        'All data since the last backup',
        'Only reads',
      ],
      answer: 1,
      why: 'Async replication lags slightly; that lag window of committed-but-unreplicated writes is the RPO.',
    },
    {
      q: 'Why can\'t a single US region give Singapore users a 20 ms round trip, however fast the servers are?',
      options: ['Bandwidth limits', 'The speed of light in fibre over ~15,000 km', 'DNS caching', 'TLS encryption overhead'],
      answer: 1,
      why: 'At ~200,000 km/s in fibre, 15,000 km each way is already ~150 ms round trip before any processing.',
    },
    {
      q: 'What new problem does active-active introduce compared with active-passive?',
      options: ['Higher latency for everyone', 'No way to survive region failure', 'Conflicting concurrent writes to the same data in different regions', 'It cannot use DNS'],
      answer: 2,
      why: 'Every region accepts writes, so two regions can change the same record before they hear about each other.',
    },
  ],
};

export default lesson;
