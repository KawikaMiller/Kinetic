import type { LessonModule } from '../../core/types';
import { integer } from '../../core/format';
import { msText } from './captions';
import { VIRAL_LAMBDA, initialExpiry } from './init';
import {
  BROKEN_SEED, CLIENT_TIMEOUT_MS, DB_CAPACITY, KEYS, KEY_TTL_S, LOCK_TIMEOUT_MS, NO_MITIGATION, SCAN_TICKS, SIM_MS, busiestSecond, expiryCounts, gapView, runStampede, violatingSeeds,
} from './model';
import { Stage } from './Stage';

const OPEN = initialExpiry();
const run = (over: Partial<typeof NO_MITIGATION> = {}, lambda = OPEN.lambda, recomputeMs = OPEN.recomputeMs) =>
  runStampede({ seed: OPEN.seed, lambda, recomputeMs, mitigations: { ...NO_MITIGATION, ...over } }).summary;

const NONE = run();
const VIRAL = run({}, VIRAL_LAMBDA);
const COALESCED = run({ coalesce: true });
const STALE = run({ stale: true });
const LOCKED = run({ lock: true });
const FIRST_WRITE = NONE.firstWriteMs === null ? '?' : msText(NONE.firstWriteMs);
const JITTER_PCT = 20;
const JITTER_BEFORE = busiestSecond(expiryCounts(OPEN.seed, 0));
const JITTER_AFTER = busiestSecond(expiryCounts(OPEN.seed, JITTER_PCT));
const BROKEN_CONFIG = { lambda: OPEN.lambda, recomputeMs: OPEN.recomputeMs, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: true } };
const BROKEN_RUN = runStampede({ ...BROKEN_CONFIG, seed: BROKEN_SEED });
const BROKEN_GAP = gapView(BROKEN_RUN);
const BROKEN_COUNT = violatingSeeds(BROKEN_CONFIG, 200, SCAN_TICKS).length;
const JITTER_SPREAD_S = (2 * JITTER_PCT * KEY_TTL_S) / 100;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'When a hot cache key expires, every request that misses recomputes it at once, and the database that was protected by the cache is hit by the whole herd: coalesce the misses, serve stale, spread the expiries or refresh early.',
    what: `A cache protects a database only while the key is fresh. At the moment a popular key expires, each request that arrives before the new value is cached misses and runs the same expensive query. About requests per second times the recompute time of them pile up (Little's law), and once the database has more queries running than it can serve at full speed, each one slows down, clients time out and retry, and the retries add queries. Mitigations keep one recompute in flight (coalescing, a lock), keep serving the old value, spread many keys' expiries, or refresh a little before the expiry.`,
    analogy: 'A shop that restocks a popular item only when the shelf is empty: everyone who arrives in the gap goes to the warehouse themselves, and the warehouse jams. One person fetching for everyone, or topping up before the shelf empties, avoids the jam.',
    useCases: [
      'Choosing a TTL, a lock or request coalescing for a hot key behind a cache',
      'Explaining why a database falls over a few seconds after a cache flush or deploy',
      'Spreading the expiry of many keys that were all written at once',
      'Reviewing a singleflight or locking helper for an ordering mistake',
    ],
    why: 'A stampede is how a healthy cache turns into a database outage, and it appears right when traffic is highest. Knowing the loop, and which fix moves the wait to whom, lets you protect a hot key before it goes viral.',
    watch: 'A red bar is a recompute that reaches the database (the costly side), a violet bar a background early refresh, and the hatched part of a bar is the run so far. In the queries-per-second plot the red line is queries started and the dashed grey line is what the database serves at full speed; in the latency plot the blue line is the 99th-percentile latency and the orange dashed line the client timeout, where a timeout is orange. The yellow line is the moment shown. In the third scene a red bar is a recompute, a yellow bar a value being written to the cache, and a blue bar the in-flight marker being held. The blue histogram counts keys expiring in each second.',
  },
  tryThis: [
    `In The expiry at the defaults (${OPEN.lambda}/s, ${msText(OPEN.recomputeMs)} recompute, seed ${OPEN.seed}): ${integer(NONE.queries)} queries reach the database, ${integer(NONE.outcomes.timeout)} requests time out, and the first value reaches the cache at ${FIRST_WRITE}, after every client has given up.`,
    `Press "viral post (λ ${integer(VIRAL_LAMBDA)})": ${integer(VIRAL.queries)} queries pile up and no value reaches the cache within the ${SIM_MS / 1000} s run.`,
    `In The mitigations, switch on Request coalescing: ${integer(NONE.queries)} queries become ${COALESCED.queries} and the 99th-percentile latency falls from ${msText(NONE.p99Ms)} to ${msText(COALESCED.p99Ms)}. Switch it off and Serve stale on instead: ${STALE.waited} requests wait. With the lock instead, ${integer(LOCKED.outcomes.default)} get a default after ${msText(LOCK_TIMEOUT_MS)}.`,
    `In The mitigations, slide TTL jitter from ±0% to ±${JITTER_PCT}%: the busiest second falls from ${integer(JITTER_BEFORE)} keys expiring to ${JITTER_AFTER}.`,
    `In A broken singleflight, choose "released before it is written": seed ${BROKEN_SEED} starts a second recompute in the ${BROKEN_GAP === null ? '?' : msText(BROKEN_GAP.writeMs - BROKEN_GAP.doneMs)} write gap, and ${BROKEN_COUNT} of 200 seeds break the one-in-flight rule.`,
  ],
  keyIdeas: [
    `A stampede feeds itself: in this model, ${OPEN.lambda}/s and a ${msText(OPEN.recomputeMs)} recompute send ${integer(NONE.queries)} queries to a database that serves ${DB_CAPACITY} at full speed, and clients time out (after ${msText(CLIENT_TIMEOUT_MS)}) before a value is cached.`,
    `Coalescing, serving stale and a lock each keep one recompute in flight, and they differ in who waits. In this model coalescing makes the waiters wait (99th percentile ${msText(COALESCED.p99Ms)}), serving stale makes none wait, and the lock returns a default after ${msText(LOCK_TIMEOUT_MS)}.`,
    `A longer TTL spaces the expiries out but each expiry is still a herd. Jitter spreads many keys' expiries (in this model the busiest second falls from ${integer(JITTER_BEFORE)} of ${integer(KEYS)} keys to ${JITTER_AFTER}), and early refresh lets one request refresh before the expiry.`,
    `Ordering is part of correctness: releasing the in-flight marker before the value is written lets a request in the gap start a second recompute. In this model that breaks the one-in-flight rule on ${BROKEN_COUNT} of 200 seeds at ${OPEN.lambda}/s.`,
  ],
  quiz: [
    {
      q: 'A team doubles a hot key\'s TTL to prevent stampedes. What does that change?',
      options: [
        'Expiries are rarer, but each expiry is still a herd of misses',
        'It removes the herd, since a longer-lived value never expires under load',
        'It shrinks the herd, since fewer requests arrive during a longer TTL',
        'It speeds up the recompute, since the value is cached for longer',
      ],
      answer: 0,
      why: 'The herd forms when a key expires with traffic arriving, and its size depends on the arrival rate and the recompute time, not on the TTL. A longer TTL makes the herd rarer, not smaller.',
    },
    {
      q: 'A site adds more cache servers to survive stampedes. Why can the database still be hit by a herd?',
      options: [
        'A server that misses recomputes for itself, so each one can form a herd',
        'The extra servers share one lock by default, so a herd cannot form',
        'Cache servers cannot hold hot keys, so requests go to the database',
        'Extra servers slow the database writes, so reads queue behind them',
      ],
      answer: 0,
      why: 'Each cache server keeps its own copy and its own expiry, so more servers mean more places to miss, not fewer recomputes. Coalescing or a shared lock has to span the servers to help.',
    },
    {
      q: 'With request coalescing on, many requests miss the same key at once. What happens to them?',
      options: [
        'One recompute runs and the others wait for its value',
        'Each one recomputes, but the database queues them politely',
        'The others get an error so that the first one can finish',
        'The others are served the old value without waiting',
      ],
      answer: 0,
      why: 'Coalescing means one recompute in flight per key, with the other requests waiting on it. Serving the old value without waiting is a different protection, stale-while-revalidate.',
    },
    {
      q: 'The in-flight marker is released when the query finishes, before the value is written to the cache. What can go wrong?',
      options: [
        'A request in the gap starts a second recompute, since nothing says one is running',
        'The value is written twice, which only wastes a little storage',
        'The waiting requests are never woken, so they sit until they time out',
        'The marker stays set after the write, so the key never refreshes again',
      ],
      answer: 0,
      why: `Between the query finishing and the value landing, there is neither a marker nor a value. A request that arrives then starts its own recompute, so two are in flight: in this model that happens on ${BROKEN_COUNT} of 200 seeds at ${OPEN.lambda}/s.`,
    },
    {
      q: `A thousand keys were cached at deploy time with the same 60 s TTL. What does ±${JITTER_PCT}% jitter on the TTL change?`,
      options: [
        `It spreads the expiries over about ${JITTER_SPREAD_S} seconds, so fewer keys miss at once`,
        'It makes each key live longer on average, so fewer keys expire',
        'It makes the recompute faster, since the keys are written at different times',
        'It lets one request refresh before the expiry, so nobody waits',
      ],
      answer: 0,
      why: `Keys that share one TTL expire in one wave a TTL later. Jitter spreads that wave across a window, so in this model the busiest second falls from ${integer(JITTER_BEFORE)} keys to ${JITTER_AFTER}. Refreshing before the expiry is a different technique.`,
    },
  ],
};

export default lesson;
