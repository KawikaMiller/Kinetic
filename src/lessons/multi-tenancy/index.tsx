import type { LessonModule } from '../../core/types';
import { integer, pct, sig } from '../../core/format';
import { msText } from './captions';
import { assignments, enumerateOverlap, exactIdentical, exactShare } from './combos';
import { ORDERS, SHOPS, listOrders } from './data';
import { SHARED_PLACEMENT, SILO_PLACEMENT, initialIsolation, initialNoisy, initialShuffle, isolationTenants, tenantsOf } from './init';
import { CONC_LIMIT, NOISY_CHEAP, NOISY_EXPENSIVE, NO_POLICY, RATE_LIMIT, SHARD_CAPACITY, SLOTS, runShards, type Policy } from './shardSim';
import { Stage } from './Stage';

const N0 = initialNoisy();
const NOISY = runShards({ seed: N0.seed, tenants: tenantsOf(N0.rates.map((r, i) => (i === 0 ? NOISY_CHEAP.rate : r))), shardOf: N0.shardOf, policy: NO_POLICY });

const I0 = initialIsolation();
const isolation = (mode: 'cheap' | 'expensive', policy: Partial<Policy> = {}, silo = false) =>
  runShards({ seed: I0.seed, tenants: isolationTenants(mode), shardOf: silo ? SILO_PLACEMENT : SHARED_PLACEMENT, policy: { ...NO_POLICY, ...policy } });
const CHEAP_OPEN = isolation('cheap');
const CHEAP_LIMITED = isolation('cheap', { rateLimit: true });
const EXPENSIVE_LIMITED = isolation('expensive', { rateLimit: true });
const EXPENSIVE_BULKHEAD = isolation('expensive', { bulkhead: true });
const EXPENSIVE_FAIR = isolation('expensive', { fair: true });
const CHEAP_SILO = isolation('cheap', {}, true);

const S0 = initialShuffle();
const K3 = S0.k + 1;
const SHARING = enumerateOverlap(S0.n, S0.k);
const ME = SHOPS[0];
const LEAKED = listOrders('pooled', ME, { filtered: false, rowLevelSecurity: false }).leaked;
const lossText = (r: ReturnType<typeof isolation>, i: number) => pct(r.tenants[i].errorRate, 0);
const wantedPct = (r: ReturnType<typeof isolation>, shard: number) => sig((r.shards[shard].demandWork / SHARD_CAPACITY) * 100);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In a multi-tenant system one customer\'s load shares queues, workers and databases with the others, so a noisy tenant can hurt its neighbours; isolation limits the damage, and each kind of isolation has a kind of load it cannot see.',
    what: `Several customers share one system to keep it cheap, and anything they share (a shard's queue, a pool of workers, a table) is a place where one can slow the rest. A rate limit counts requests, a bulkhead keeps workers free for everyone else, and fair queueing hands out work evenly, and each misses something: a rate limit cannot see a few very expensive requests, and fair queueing cannot interrupt one that is running. Shuffle sharding gives each tenant its own random handful of workers, so two tenants rarely share all of them. Data isolation is the same trade: one pooled table is cheap and relies on every query carrying the tenant filter, while a schema or a database per tenant removes the mistake and costs more.`,
    analogy: 'An apartment block with one lift and one water supply: a neighbour moving house ties up the lift for everyone. A limit on trips per hour does nothing about one huge sofa, a lift reserved for each floor does, and a house of your own avoids the problem at a price.',
    useCases: [
      'Choosing between pooled, schema-per-tenant and database-per-tenant storage for a SaaS product',
      'Deciding which per-tenant limits protect a shared service: requests per second, concurrency or fair scheduling',
      'Explaining why a single big customer made everyone else\'s pages slow',
      'Placing tenants on shards, and giving a big one a shard of its own',
    ],
    why: 'A multi-tenant system is only as good as its worst neighbour unless something stops it. Knowing what each isolation mechanism measures tells you which ones to stack, and where the guarantee ends.',
    watch: 'Scenes 1 and 2: each shard is a box holding its tenants as cells. An orange cell is the noisy tenant (a labelled actor), a red cell a neighbour that got hurt (a p99 over the line or 1% of requests lost) and a green cell a tenant that kept its latency; a throttled request is yellow in the stats. Scene 3: the ring shows the workers; a solid red worker is one the noisy tenant took down, a violet ring marks a worker the other tenant uses, and a green outline is a worker that is up. Scene 4: rows of the calling tenant are green and rows of another tenant that came back are red.',
  },
  tryThis: [
    `In The noisy neighbour, Tenant 1 is selected. Press "make Tenant 1 noisy (${NOISY_CHEAP.rate}/s)": shard 1 asks for ${wantedPct(NOISY, 0)}% of its capacity, Tenant 2 on it loses ${lossText(NOISY, 1)} of its requests and sees a ${msText(NOISY.tenants[1].p99Ms)} p99, and the six tenants on other shards are unaffected.`,
    `In Isolation, from its opening state, Tenant 1 sends many cheap requests and Tenant 2 loses ${lossText(CHEAP_OPEN, 1)}. Switch the rate limit on: it loses ${lossText(CHEAP_LIMITED, 1)}. Now pick "a few expensive requests" with the rate limit still on: Tenant 2 loses ${lossText(EXPENSIVE_LIMITED, 1)} (the expensive stream is under the limit), because ${NOISY_EXPENSIVE.rate}/s is under the ${RATE_LIMIT.rate}/s limit. Switch the bulkhead on: it loses ${lossText(EXPENSIVE_BULKHEAD, 1)}. With fair queueing instead: ${lossText(EXPENSIVE_FAIR, 1)} lost and a ${msText(EXPENSIVE_FAIR.tenants[1].p99Ms)} p99, still over the 100 ms line.`,
    `In Isolation, press Reset first (many cheap requests, no protection), then set Tenant 1's shard to "its own (siloed)": Tenant 2 no longer shares a shard with it and recovers, while Tenant 1 still loses ${lossText(CHEAP_SILO, 0)} of its own requests.`,
    `In Shuffle sharding at N = ${S0.n} and k = ${S0.k}: another tenant shares a worker with the noisy one in ${SHARING.sharing} of ${SHARING.total} assignments (${pct(exactShare(S0.n, S0.k), 1)}) and loses every worker in ${SHARING.identical}. Raise k to ${K3}: sharing rises to ${pct(exactShare(S0.n, K3), 1)} and losing every worker falls to ${pct(exactIdentical(S0.n, K3), 1)}.`,
    `In Data isolation, press "Run the query that forgets the tenant filter": ${LEAKED} of the ${ORDERS.length} rows that come back belong to other tenants. Turn row-level security on and run it again: 0 (when the policy is defined, the role is not exempt and the tenant is set on the connection).`,
  ],
  keyIdeas: [
    `A shared shard is shared fate: in this model one tenant asking for ${wantedPct(NOISY, 0)}% of a shard's capacity makes its neighbour lose ${lossText(NOISY, 1)} of its requests, while tenants on other shards keep their latency.`,
    `A rate limit counts requests, not work. In this model a limit of ${RATE_LIMIT.rate}/s stops ${NOISY_CHEAP.rate} cheap requests a second and does nothing to ${NOISY_EXPENSIVE.rate} expensive ones, which ask for the same work; a bulkhead of ${CONC_LIMIT} of ${SLOTS} workers does stop them.`,
    `Shuffle sharding gives each tenant its own k of N workers: with ${S0.n} and ${S0.k}, a neighbour shares a worker in ${pct(exactShare(S0.n, S0.k), 0)} of assignments but loses its whole set in ${pct(exactIdentical(S0.n, S0.k), 1)}, from ${integer(assignments(S0.n, S0.k))} possible pairs.`,
    `A pooled table relies on each query carrying the tenant filter. In this model a query that forgets it returns ${LEAKED} rows of other tenants, and row-level security, where a policy covers the application's role and the tenant is set on the connection, returns 0.`,
  ],
  quiz: [
    {
      q: `A tenant sends ${NOISY_EXPENSIVE.rate} requests a second that each need ${NOISY_EXPENSIVE.costMs} ms of work, under a ${RATE_LIMIT.rate}/s rate limit. What does the limit do?`,
      options: [
        'Nothing, because the tenant stays under the limit',
        'It throttles the tenant, since each 200 ms request counts as several requests',
        'It throttles the neighbours instead, since they share the shard',
        'It queues the tenant until the neighbours have finished',
      ],
      answer: 0,
      why: `A rate limit counts requests, and ${NOISY_EXPENSIVE.rate}/s is under ${RATE_LIMIT.rate}/s, so nothing is throttled even though the work is the same as ${NOISY_CHEAP.rate} cheap requests a second. In this model the neighbour still loses ${lossText(EXPENSIVE_LIMITED, 1)}.`,
    },
    {
      q: 'A platform doubles its shards from four to eight. Why can one tenant still hurt others?',
      options: [
        'Tenants still share each shard, so its neighbours on that shard are hurt',
        'Each shard now has fewer workers, so one tenant can use all of them',
        'More shards add routing hops, so every tenant is slower',
        'The noisy tenant\'s requests are copied to each of the shards, doubling its load',
      ],
      answer: 0,
      why: 'More shards make each one a smaller shared pool, but a pool shared by two or more tenants is still shared. Isolation comes from limits, scheduling, a shard of its own or shuffle sharding, not from the shard count.',
    },
    {
      q: 'Why can fair queueing still leave a neighbour waiting behind a noisy tenant\'s expensive requests?',
      options: [
        'It picks who goes next, but a request already running cannot be interrupted',
        'It favours the tenant with the most requests queued, so that tenant runs first and longest',
        'It only ever serves the tenant with the fewest requests, whatever they cost',
        'It drops the neighbour\'s requests first to protect the big tenant',
      ],
      answer: 0,
      why: `Fair queueing decides which request starts when a worker frees up. A ${NOISY_EXPENSIVE.costMs} ms request that has started still takes ${NOISY_EXPENSIVE.costMs} ms, so in this model the neighbour's p99 is ${msText(isolation('expensive', { fair: true }).tenants[1].p99Ms)} against ${msText(isolation('expensive').tenants[1].p99Ms)} without it, and a bulkhead brings it to ${msText(EXPENSIVE_BULKHEAD.tenants[1].p99Ms)}.`,
    },
    {
      q: `With ${S0.n} workers and ${S0.k} per tenant, how often does another tenant lose both its workers when the noisy tenant takes down its own?`,
      options: [
        `1 in ${assignments(S0.n, S0.k)}, only when it has exactly the same pair`,
        `${SHARING.sharing} in ${SHARING.total}, whenever it shares any worker with the noisy tenant`,
        `1 in ${S0.n}, the same chance as plain sharding gives`,
        `1 in ${S0.n / 2}, since each shard holds two workers`,
      ],
      answer: 0,
      why: `A tenant loses everything when its pair equals the noisy tenant's: ${SHARING.identical} of ${SHARING.total} pairs. Sharing exactly one worker, ${SHARING.sharing - SHARING.identical} of ${SHARING.total}, costs it half its capacity, not the whole of it.`,
    },
    {
      q: 'Which of these makes a forgotten tenant filter safe in a pooled table?',
      options: [
        'Row-level security that applies the tenant filter inside the database',
        'An index on the tenant column, since an index limits what a query can see',
        'A longer password for the application\'s database user',
        'Running each query twice and comparing the row counts',
      ],
      answer: 0,
      why: 'An index speeds a filter up and does not impose one, and a stronger password protects the account, not the rows it can read. Row-level security puts the filter in the database, so where a policy covers the application\'s role and the tenant is set on the connection, a query that forgets the filter still sees just the caller\'s rows. The table owner and superusers can bypass a policy unless it is forced.',
    },
  ],
};

export default lesson;
