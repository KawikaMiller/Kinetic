import type { LessonModule } from '../../core/types';
import { sig } from '../../core/format';
import { secText } from './captions';
import { STYLE_REFRESH, healthConfig, initialControl, initialHealth, initialMesh, initialRegistry, registryConfig } from './init';
import { APP_CALL_MS, actualEndpoints, attempts, callMs, certTimeline, extraHopMs, failingAt, knownEndpoints } from './mesh';
import { HEARTBEAT_MS, HORIZON_MS, UNREADY_AT_MS, staleBound, ttlMs } from './registry';
import { runRegistry } from './run';
import { Stage } from './Stage';

const R0 = initialRegistry();
const DEFAULT = runRegistry(registryConfig(R0));
const DNS = runRegistry({ ...registryConfig(R0), refreshMs: STYLE_REFRESH.dns });
const BOUND = staleBound(registryConfig(R0));
const HEALTH = runRegistry(healthConfig(initialHealth()));
const FRESH = runRegistry(healthConfig({ ...initialHealth(), freshLookups: true }));
const IGNORED = runRegistry(healthConfig({ ...initialHealth(), honourReadiness: false }));
const M0 = initialMesh();
const ATT_OFF = attempts(M0.failProb, M0.appRetries, 0);
const ATT_ON = attempts(M0.failProb, M0.appRetries, M0.meshRetries);
const C0 = initialControl();
const OUTAGE = { start: C0.startMin, length: C0.lengthMin };
const CERTS = certTimeline(C0.lifetimeMin, OUTAGE);
const FIRST_EXPIRY = Math.min(...CERTS.gaps.map((g) => g.from));
const FAILING_NOW = failingAt(CERTS, C0.nowMin);

const DNS_STUBBORN = runRegistry({ ...registryConfig(R0), refreshMs: STYLE_REFRESH.dns, stubbornFactor: 2 });
const learned = (r: ReturnType<typeof runRegistry>) => (r.stoppedAfterMs === null ? '?' : secText(r.stoppedAfterMs));
const lastHit = (r: ReturnType<typeof runRegistry>) => (r.lastHitAfterMs === null ? '?' : secText(r.lastHitAfterMs));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Services find each other through a registry that forgets instances which stop heartbeating, so a crash is noticed after about a TTL plus a cache refresh; a service mesh adds sidecars, a control plane, certificates and a hop, and each is a new thing that can fail.',
    what: `Instances register and send heartbeats; the registry evicts one that has been silent for its TTL, and clients keep a cached listing that they refresh every so often. So after a crash, requests keep going to the dead instance until the registry has dropped it and the cache has refreshed: about the TTL plus the refresh interval. A short TTL notices sooner and also evicts live instances when heartbeats are lost. A readiness check lets a running instance leave rotation without a restart. A service mesh puts a proxy beside each service, carrying traffic (the data plane) under a control plane that pushes configuration and certificates, and it gives mutual TLS, traffic splitting and retries at the price of an extra hop and a new failure mode.`,
    analogy: 'A staff rota pinned in a kitchen: a cook who walks out stays on it until someone notices they stopped checking in, and everyone copies the rota only now and then. A mesh is a runner beside each cook who relays every order; the runners follow the head chef\'s rules, and keep to the last ones if the head chef goes home.',
    useCases: [
      'Choosing a heartbeat interval, TTL and cache refresh for a registry or a DNS record',
      'Explaining why requests still reach an instance for seconds after it died',
      'Deciding whether a service mesh is worth its extra hop and control plane',
      'Planning for a control plane outage and short-lived certificates',
    ],
    why: 'Discovery turns the question "where is it" into a cache with a delay, and a mesh moves that logic into proxies you have to operate. Knowing the delays and the failure modes tells you what to tune, and what an outage of the control plane will and will not break.',
    watch: 'Scenes 1 and 2: green is a healthy, registered instance, a red bar a dead instance still in the registry, an orange bar a stale client cache that is still routing to it, and grey an instance that is stopped or not ready (not restarted). In the ladder, a cross is a message to a stopped node. Scene 3: violet bars are the short-lived certificates the sidecars hold (the sidecars themselves are not drawn; their hop and retries show in the stats), and an orange stat marks retries that multiply. Scene 4: an orange bar is the control plane being away, violet bars are valid certificates and a red bar is a certificate that has expired.',
  },
  tryThis: [
    `In A registry at the defaults, orders-1 crashes at 10 s: the registry evicts it ${DEFAULT.evictedAfterMs === null ? '?' : secText(DEFAULT.evictedAfterMs)} later, the clients' cache drops it ${learned(DEFAULT)} after the crash, the last request that hit it was ${lastHit(DEFAULT)} after, and ${DEFAULT.sentToDead} requests go to the dead instance, all inside the ${secText(BOUND)} bound (only heartbeats are lost in this model; lookups always arrive).`,
    `Pick "DNS records with a TTL": the refresh becomes ${secText(STYLE_REFRESH.dns)}, ${DNS.sentToDead} requests go to the dead instance, and the clients' cache drops it ${learned(DNS)} after the crash (the last hit was ${lastHit(DNS)} after). Turn on "caches twice as long": the cache has not refreshed when the run ends at ${secText(HORIZON_MS)}, so clients are still sending.`,
    `In Health feeds the registry, orders-1 fails readiness at ${secText(UNREADY_AT_MS)} and ${HEALTH.sentWhileUnready} requests reach it through the cached listing, which lags until its next refresh (with "looks up on every request": ${FRESH.sentWhileUnready}). Set the registry to "ignores readiness": ${IGNORED.sentWhileUnready} do, and ${IGNORED.errors} error answers come back.`,
    `In Add a mesh, turn on "Sidecar proxy beside every service": a call goes from ${callMs(false)} ms to ${callMs(true)} ms, and a failing backend sees up to ${ATT_ON.worst} calls per request instead of ${ATT_OFF.worst} (${sig(ATT_ON.expected)} on average instead of ${sig(ATT_OFF.expected)}), because the ${M0.appRetries} app retries and ${M0.meshRetries} mesh retries multiply.`,
    `In The control plane goes down at the defaults, at minute ${C0.nowMin} the proxies know ${knownEndpoints(OUTAGE, C0.nowMin)} of the ${actualEndpoints(C0.nowMin)} endpoints, and the certificates of ${FAILING_NOW.join(' and ')} have expired, the first at minute ${FIRST_EXPIRY}.`,
  ],
  keyIdeas: [
    `A registry notices a crash after about the TTL plus the cache refresh: in this model a TTL of ${secText(ttlMs(registryConfig(R0)))} and a ${secText(R0.refreshMs)} refresh stop requests ${learned(DEFAULT)} after the crash, inside a bound of ${secText(BOUND)}, when only heartbeats are lost and lookups always arrive.`,
    `A shorter TTL notices sooner and evicts live instances when heartbeats are lost: in this model it takes ${registryConfig(R0).ttlBeats} lost heartbeats in a row at a TTL of ${registryConfig(R0).ttlBeats} intervals of ${secText(HEARTBEAT_MS)}.`,
    `A mesh is not free: in this model it adds ${extraHopMs(true)} ms to a ${APP_CALL_MS} ms call, and its retries stack on the app's, so ${M0.appRetries} and ${M0.meshRetries} retries make ${ATT_ON.worst} backend calls when everything fails.`,
    `When the control plane is away, the data plane in this model keeps its last configuration: it does not learn of new instances, and calls fail once a certificate expires, which here is at minute ${FIRST_EXPIRY}.`,
  ],
  quiz: [
    {
      q: 'An instance crashes without deregistering. Why do requests keep reaching it for seconds?',
      options: [
        'The registry drops it after its TTL, and clients hold a cached listing',
        'The load balancer tests it once a minute, so it takes a minute to notice',
        'DNS has no way to remove a record, so the address stays forever',
        'The instance restarts itself and registers again, so it is never gone',
      ],
      answer: 0,
      why: `Nobody tells the registry the instance died; it learns by silence once the TTL has passed, and clients copy the listing at set intervals. In this model the clients' cache dropped it ${learned(DEFAULT)} after the crash, inside the ${secText(BOUND)} bound, with heartbeats the only messages lost; if listings could be lost too, the stale window would have no bound.`,
    },
    {
      q: 'What is the cost of setting the registry TTL to one heartbeat interval?',
      options: [
        'One lost heartbeat can evict a live instance, so it flaps in and out',
        'Crashes are noticed later, because the registry waits for many more heartbeats',
        'Clients cache the listing for longer, so they refresh less often',
        'Heartbeats get larger, since each one has to carry more state',
      ],
      answer: 0,
      why: 'The TTL is how long the registry waits in silence. With one interval of TTL a single missed heartbeat is enough to look dead, so a live instance is evicted and then registers again. A longer TTL needs more consecutive losses and notices a real crash later.',
    },
    {
      q: 'A team adds a service mesh to make their network more reliable. What do they also take on?',
      options: [
        'A control plane to run, a hop on each call and retries that stack',
        'A guarantee that no request fails, because the proxies retry for the whole app',
        'A single address for every service, which removes the need for discovery',
        'Fewer certificates to manage, since the proxies share one for everything',
      ],
      answer: 0,
      why: `A mesh moves discovery, encryption and retries into proxies, and each is something to operate. In this model a call takes ${callMs(true)} ms instead of ${callMs(false)} ms, and ${M0.appRetries} app retries over ${M0.meshRetries} mesh retries make ${ATT_ON.worst} backend calls at worst.`,
    },
    {
      q: 'The mesh control plane goes down for an hour. What happens to traffic that is already flowing?',
      options: [
        'It usually carries on over the last configuration until certificates expire',
        'It stops at once, because proxies cannot route without a live control plane to ask',
        'It falls back to plain unencrypted calls so that nothing breaks',
        'It is routed to a new control plane, which every proxy keeps ready',
      ],
      answer: 0,
      why: `Many meshes keep proxies running on their last configuration (check yours). What stalls is change: new instances are not discovered and certificates are not renewed, so in this model calls fail from minute ${FIRST_EXPIRY}, when the first certificate expires.`,
    },
    {
      q: 'An instance fails its readiness check but is still running. What should discovery do?',
      options: [
        'Leave it out of listings until it is ready again, without restarting it',
        'Evict it for good, since a failed check means the process is lost',
        'Keep sending it traffic, since its heartbeats show it is alive',
        'Restart it at once, because only a restart can make it ready',
      ],
      answer: 0,
      why: `Liveness asks whether to restart; readiness asks whether to send traffic. In this model with readiness honoured ${HEALTH.sentWhileUnready} requests reach the instance while it is not ready, against ${IGNORED.sentWhileUnready} when the registry ignores it.`,
    },
  ],
};

export default lesson;
