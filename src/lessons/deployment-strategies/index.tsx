import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A deploy strategy decides how many users meet the new version before you know it works, how fast you notice a bug and how fast you can undo it.',
    what: 'Recreate stops v1 and starts v2, with an outage in between. A rolling update replaces a few servers at a time, within maxSurge and maxUnavailable. Blue-green starts a whole second fleet and switches all traffic to it at once. A canary sends a small, growing share of traffic to v2 and compares its error rate with v1\'s before it goes on. Each one trades cost, speed, blast radius and the way back.',
    analogy: 'Repaving a bridge: close it (recreate), pave one lane at a time (rolling), build a second bridge and redirect everyone (blue-green), or let a few cars try the new lane first (canary).',
    useCases: [
      'Kubernetes Deployments, whose default RollingUpdate keeps 25% maxSurge and 25% maxUnavailable unless you change them',
      'Blue-green cutovers for risky releases, with the old fleet kept running as the way back',
      'Canary releases judged automatically on error rate and latency against the baseline',
      'Recreate for workers or single-instance apps that cannot run two versions side by side',
    ],
    why: 'Every release is a bet, and the strategy sets what a lost bet costs: how many users are exposed, for how many minutes, and what the undo takes. It builds on `kubernetes-basics` (Deployments and rollouts), `load-balancing` (where each request goes), `ci-pipelines` (what starts the deploy) and `health-checks` (when a new server counts as ready). `feature-flags` is the next lesson: it separates deploying code from releasing it.',
    watch: 'Servers: blue is v1 and violet is v2 (just categories), a yellow outlined "..." is a server starting, and grey is idle or switched off. Requests are tiny squares, green served and red failed. The load balancer\'s lines are blue to v1 and violet to v2, thicker for a bigger share and grey dashed when nothing is up. Orange means a rollback: a border round the fleet, the "Rolled back after" number and the "undo" bars in the comparison. In the comparison timeline, yellow bars are servers starting before anyone is on v2, violet bars are users on v2. The cost bar is blue, turning yellow when more than the 20 servers a fleet needs are running at once; its tick marks 20.',
  },
  tryThis: [
    'Press play on the default Rolling deploy with its 5% bug. Watch the traffic on v2 reach 100% before the alert fires, then note "Users hit". Pick Blue-green above and replay it.',
    'Click "Canary, 3% bug, 1 min bake": the canary passes every window and the bug reaches everyone before the alert fires. Drag Bake time up to 8 min and replay: it is caught at 10%.',
    'Pick Rolling and drag both sliders to 33%: the hint shows 33% of 20 rounds up to 7 for maxSurge and down to 6 for maxUnavailable. Then try maxSurge 0% with maxUnavailable 5%.',
    'Click "Breaking migration" and play: v1 servers fail against the new schema, the alert fires, and the rollback says "blocked". Try the Canary strategy with it.',
    'Pick Recreate, then switch "Drain old servers" to Kill at once and read the captions: every killed server drops its in-flight requests.',
  ],
  keyIdeas: [
    'Blast radius is the share of users exposed multiplied by how long it takes to notice and undo the bug; compare strategies on both.',
    'Rolling and canary run v1 and v2 together, so both must work with one database: expand the schema, deploy, then contract in a later release.',
    'Blue-green buys an instant way back for double the servers, but the switch itself exposes every user at once.',
    'A canary only protects you if it compares against a baseline, sees enough requests, bakes long enough and rolls back by rule.',
  ],
  quiz: [
    {
      q: 'A team says blue-green is the safest strategy because the old fleet stays up. What does its switch actually do?',
      options: [
        'It moves every user to v2 together, so a bug reaches all of them at once',
        'It shifts users to v2 gradually in steps, so a bug reaches only a few of them first',
        'It checks each green server before use, so no bug can reach any user',
        'It splits traffic evenly between both fleets until someone approves',
      ],
      answer: 0,
      why: 'Blue-green is an all-at-once switch: the benefit is how fast you can switch back, and the cost is double the servers. In this model, with the 5% bug, everyone is on v2 from the switch until the alert has fired and the undo has run.',
    },
    {
      q: 'A rolling update on 20 replicas has maxSurge 33% and maxUnavailable 33%. How many extra servers and missing servers does Kubernetes allow?',
      options: [
        '7 extra servers and 6 missing servers',
        '6 extra servers and 7 missing servers',
        '7 extra servers and 7 missing servers',
        '6 extra servers and 6 missing servers',
      ],
      answer: 0,
      why: '33% of 20 is 6.6. Kubernetes rounds maxSurge up (7, so up to 27 servers run) and maxUnavailable down (6, so at least 14 serve), so the rollout never goes below the availability you asked for.',
    },
    {
      q: 'A 1% canary bakes for 8 minutes and sees no errors. A bug fails 5% of the v2 requests. What does the clean window show?',
      options: [
        'Little: only about 16 requests reached it, so a miss was likely',
        'That the bug fails on fewer than one request in a hundred',
        'That v2 is safe to send to every user from here on, whatever the traffic',
        'That the baseline fleet must be failing instead of v2',
      ],
      answer: 0,
      why: 'At 200 requests a minute, 1% for 8 minutes is about 16 requests to v2. The chance that a 5% bug fails none of them is 0.95 to the power 16, about 44%, so a clean window is weak evidence: raise the bake time or the traffic.',
    },
    {
      q: 'v2 needs a database change that v1 cannot read. You deploy with a rolling update. What goes wrong?',
      options: [
        'v1 servers keep running against the new schema and fail, and v1 cannot be rolled back to',
        'Only the v2 servers fail, because the old servers cache the schema they started with',
        'Nothing, because a rolling update always waits for the database to be compatible',
        'The load balancer retries failed requests on v2 so users never notice anything',
      ],
      answer: 0,
      why: 'v1 and v2 share one database, so while both versions run, every request that reaches a v1 server fails (about 667 requests here, against 400 for Recreate\'s outage). Splitting the change into expand and contract releases keeps both versions working.',
    },
    {
      q: 'A server is stopped in the middle of a rolling update without connection draining. What happens to the requests it was handling?',
      options: [
        'They are cut off part-way, so those users see errors',
        'They are finished by the replacement server in the same pod',
        'They wait in the load balancer until the new server is up',
        'They complete normally because stopping waits for them',
      ],
      answer: 0,
      why: 'Without draining, a stop ends open connections. In this model each killed server drops 3 requests in flight, so replacing all 20 servers loses 60 requests even with no bug at all; draining finishes them first.',
    },
  ],
};

export default lesson;
