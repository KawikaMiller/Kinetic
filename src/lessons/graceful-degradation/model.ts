/**
 * Graceful degradation, as a model: an invented shop page of nine widgets fed by eight services,
 * a brownout queue, and a cache that serves stale on error. Every capacity, cost and time is a
 * named constant and illustrative. Nothing here reads the clock or `Math.random`.
 */
import { createTickSim, type TickSim } from '../../core/simTick';

// ── Scene 1: widgets, services and the core journey ────────────────────────────

export const SERVICES = ['catalog', 'pricing', 'inventory', 'reviews', 'recs', 'profile', 'payments', 'search'] as const;
export type ServiceId = (typeof SERVICES)[number];
export type Health = 'up' | 'slow' | 'down';
export type Tag = 'hard' | 'soft';

export const SERVICE_NAME: Record<ServiceId, string> = {
  catalog: 'Catalog',
  pricing: 'Pricing',
  inventory: 'Inventory',
  reviews: 'Reviews',
  recs: 'Recs',
  profile: 'Profile',
  payments: 'Payments',
  search: 'Search',
};

/** A dependency the page cannot sensibly render without is hard; the rest are soft. The learner can reclassify. */
export const DEFAULT_TAG: Record<ServiceId, Tag> = {
  catalog: 'hard', pricing: 'hard', inventory: 'soft', reviews: 'soft', recs: 'soft', profile: 'soft', payments: 'hard', search: 'soft',
};

export const WIDGETS = ['header', 'product', 'price', 'stock', 'reviews', 'recs', 'banner', 'chat', 'buy'] as const;
export type WidgetId = (typeof WIDGETS)[number];

export const WIDGET_NAME: Record<WidgetId, string> = {
  header: 'Header and search box',
  product: 'Product details',
  price: 'Price',
  stock: 'Stock level',
  reviews: 'Reviews',
  recs: 'Recommendations',
  banner: 'Personalised banner',
  chat: 'Chat widget',
  buy: 'Buy button',
};

/** The one service each widget reads. Profile feeds two widgets (who you are drives the banner and the chat greeting). */
export const WIDGET_SERVICE: Record<WidgetId, ServiceId> = {
  header: 'search', product: 'catalog', price: 'pricing', stock: 'inventory', reviews: 'reviews', recs: 'recs', banner: 'profile', chat: 'profile', buy: 'payments',
};

/** What a widget does when its service fails: wait for the live call, serve the cache, show a static default, hide, or show an error. */
export const RUNGS = ['live', 'stale', 'static', 'hide', 'error'] as const;
export type Rung = (typeof RUNGS)[number];
export const RUNG_NAME: Record<Rung, string> = { live: 'live only', stale: 'stale cache', static: 'static default', hide: 'hide', error: 'error' };
export type Policies = Record<WidgetId, Rung>;

export const DEFAULT_POLICY: Policies = {
  header: 'static', product: 'live', price: 'live', stock: 'stale', reviews: 'hide', recs: 'hide', banner: 'static', chat: 'hide', buy: 'live',
};

export const widgetsOf = (s: ServiceId): WidgetId[] => WIDGETS.filter((w) => WIDGET_SERVICE[w] === s);

export type WidgetState = 'live' | 'live-slow' | 'stale' | 'static' | 'hidden' | 'error';

/** What the widget shows, from its rung and the health of what it reads. */
export function widgetState(rung: Rung, health: Health): WidgetState {
  if (health === 'up') return 'live';
  if (rung === 'live') return health === 'slow' ? 'live-slow' : 'error';
  if (rung === 'stale') return 'stale';
  if (rung === 'static') return 'static';
  if (rung === 'hide') return 'hidden';
  return 'error';
}

const SEVERITY: Record<Health, number> = { up: 0, slow: 1, down: 2 };
const worse = (a: Health, b: Health): Health => (SEVERITY[a] >= SEVERITY[b] ? a : b);

/** The bug that makes the broken mode: the buy button also waits on the recommendations service. */
export interface Options {
  buyWaitsForRecs: boolean;
}
export const NO_BUGS: Options = { buyWaitsForRecs: false };

export type HealthMap = Record<ServiceId, Health>;
export const allUp = (): HealthMap => Object.fromEntries(SERVICES.map((s) => [s, 'up'])) as HealthMap;
export const withHealth = (base: HealthMap, patch: Partial<HealthMap>): HealthMap => ({ ...base, ...patch });

/** The health a widget actually waits on: its service, and for the buggy buy button also recommendations. */
export function effectiveHealth(w: WidgetId, health: HealthMap, o: Options = NO_BUGS): Health {
  const own = health[WIDGET_SERVICE[w]];
  return w === 'buy' && o.buyWaitsForRecs ? worse(own, health.recs) : own;
}

export function widgetStates(health: HealthMap, policies: Policies, o: Options = NO_BUGS): Record<WidgetId, WidgetState> {
  return Object.fromEntries(WIDGETS.map((w) => [w, widgetState(policies[w], effectiveHealth(w, health, o))])) as Record<WidgetId, WidgetState>;
}

export type StepId = 'view' | 'cart' | 'pay';
export interface JourneyStep {
  id: StepId;
  label: string;
  ok: boolean;
  /** Why the step is blocked, or null. */
  reason: string | null;
}

const SERVES: readonly WidgetState[] = ['live', 'live-slow', 'stale'];
const WAITS: readonly WidgetState[] = ['live', 'live-slow'];

/**
 * The core journey: view the product, add it to the cart, pay. Viewing needs real product details
 * (a stale copy will do, a generic placeholder will not); adding to the cart needs a stock level
 * that is live or stale; paying needs a working buy button and a **live** price, because what moves
 * money fails closed: a stale price may be shown but is never charged.
 */
export function journey(health: HealthMap, policies: Policies, o: Options = NO_BUGS): JourneyStep[] {
  const states = widgetStates(health, policies, o);
  const view = SERVES.includes(states.product);
  const cart = SERVES.includes(states.stock);
  const buyOk = WAITS.includes(states.buy);
  const priceLive = health.pricing !== 'down';
  return [
    { id: 'view', label: 'View the product', ok: view, reason: view ? null : `product details are ${stateWord(states.product)}` },
    { id: 'cart', label: 'Add to cart', ok: cart, reason: cart ? null : `the stock level is ${stateWord(states.stock)}` },
    {
      id: 'pay', label: 'Pay', ok: buyOk && priceLive,
      reason: !buyOk ? `the buy button is ${stateWord(states.buy)}` : priceLive ? null : 'pricing is down, and a charge needs the live price (fail closed)',
    },
  ];
}

export const journeyWorks = (health: HealthMap, policies: Policies, o: Options = NO_BUGS): boolean => journey(health, policies, o).every((s) => s.ok);

const STATE_WORD: Record<WidgetState, string> = {
  live: 'live', 'live-slow': 'live but slow', stale: 'stale', static: 'a static default', hidden: 'hidden', error: 'an error',
};
export const stateWord = (s: WidgetState): string => STATE_WORD[s];

/** The services whose failure alone (down) breaks the journey under these policies: the truly hard dependencies. */
export function trulyHard(policies: Policies, o: Options = NO_BUGS): ServiceId[] {
  return SERVICES.filter((s) => !journeyWorks(withHealth(allUp(), { [s]: 'down' }), policies, o));
}

export interface TagVerdict {
  service: ServiceId;
  tag: Tag;
  /** True when the journey really cannot do without the service under these policies. */
  hard: boolean;
  /** Null when the tag is right; otherwise what is wrong, in words. */
  problem: string | null;
}

export function tagVerdicts(tags: Record<ServiceId, Tag>, policies: Policies, o: Options = NO_BUGS): TagVerdict[] {
  const hard = new Set(trulyHard(policies, o));
  return SERVICES.map((service) => {
    const isHard = hard.has(service);
    const tag = tags[service];
    const problem =
      tag === 'soft' && isHard ? 'tagged soft, but the journey breaks without it: it has no fallback that works'
      : tag === 'hard' && !isHard ? 'tagged hard, but the journey survives without it: it can degrade instead of failing the request'
      : null;
    return { service, tag, hard: isHard, problem };
  });
}

export interface SoftSweep {
  /** Subsets of the soft-tagged services checked (2 to the power of how many are soft). */
  checked: number;
  /** The smallest subset (then the lowest in service order) whose failure breaks the journey, or null. */
  failing: ServiceId[] | null;
}

/** Fails every subset of the soft-tagged services (down) and looks for one that breaks the journey. */
export function softSweep(tags: Record<ServiceId, Tag>, policies: Policies, o: Options = NO_BUGS): SoftSweep {
  const soft = SERVICES.filter((s) => tags[s] === 'soft');
  const masks = Array.from({ length: 2 ** soft.length }, (_, m) => m).sort((a, b) => popcount(a) - popcount(b) || a - b);
  for (const mask of masks) {
    const down = soft.filter((_, i) => mask & (1 << i));
    const health = withHealth(allUp(), Object.fromEntries(down.map((s) => [s, 'down' as const])));
    if (!journeyWorks(health, policies, o)) return { checked: masks.length, failing: down };
  }
  return { checked: masks.length, failing: null };
}

const popcount = (n: number): number => {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
};

// ── Page time ─────────────────────────────────────────────────────────────────

/** Illustrative milliseconds: the healthy page, a slow service's reply, the timeout a fallback waits for, a fast failure. */
export const BASE_PAGE_MS = 120;
export const SLOW_REPLY_MS = 3000;
export const TIMEOUT_MS = 800;
export const FAIL_FAST_MS = 20;

/** The slowest widget decides when the page is done: it renders in parallel. */
export function pageMs(health: HealthMap, policies: Policies, o: Options = NO_BUGS): number {
  const waits = WIDGETS.map((w) => {
    const h = effectiveHealth(w, health, o);
    if (h === 'up') return 0;
    if (h === 'down') return FAIL_FAST_MS;
    return policies[w] === 'live' ? SLOW_REPLY_MS : TIMEOUT_MS;
  });
  return BASE_PAGE_MS + Math.max(0, ...waits);
}

/** The minutes a stale widget has been serving its cache: the age it was already when the outage began, plus the outage so far. */
export const STALE_AGE_AT_FAILURE_MIN = 4;
export const staleAgeMin = (outageMin: number): number => STALE_AGE_AT_FAILURE_MIN + outageMin;

// ── Scene 2: brownout ─────────────────────────────────────────────────────────

export interface Tier {
  id: 'T0' | 'T1' | 'T2' | 'T3';
  name: string;
  /** Illustrative milliseconds of one worker's time per request when this tier is on. */
  costMs: number;
}

export const TIERS: readonly Tier[] = [
  { id: 'T0', name: 'core page', costMs: 5 },
  { id: 'T1', name: 'recommendations', costMs: 3 },
  { id: 'T2', name: 'personalisation', costMs: 2 },
  { id: 'T3', name: 'chat', costMs: 2 },
];
/** One worker's budget: a thousand milliseconds of work every second. */
export const WORKER_MS_PER_S = 1000;
/** Each tier switches off this much utilisation after the one above it, top tier first. */
export const TIER_STEP = 0.1;
export const THRESHOLD_RANGE = { min: 0.4, max: 1.4, step: 0.05 } as const;
export const LOAD_RANGE = { min: 20, max: 180, step: 5 } as const;
export const DEFAULT_LOAD = 100;
export const DEFAULT_THRESHOLD = 0.7;

export const costMs = (on: readonly boolean[]): number => TIERS.reduce((sum, t, i) => sum + (on[i] ? t.costMs : 0), 0);
/** Requests per second one worker serves with these tiers on. */
export const serviceRate = (on: readonly boolean[]): number => WORKER_MS_PER_S / costMs(on);
export const FULL_RATE = serviceRate(TIERS.map(() => true));
export const CORE_RATE = serviceRate(TIERS.map((_, i) => i === 0));

/** Utilisation measured against the full-featured page, so the decision depends on load alone and cannot flap. */
export const fullUtilisation = (lambda: number): number => lambda / FULL_RATE;

/** Which tiers are on at this load: the top tier goes first, and the core page is never switched off. */
export function tiersOn(lambda: number, threshold: number, degrade: boolean): boolean[] {
  const u = fullUtilisation(lambda);
  return TIERS.map((_, i) => {
    if (!degrade || i === 0) return true;
    const offAt = threshold + (TIERS.length - 1 - i) * TIER_STEP;
    return u < offAt;
  });
}

/** M/M/1 mean time in system, seconds; infinite when the queue cannot drain. */
export const meanResponseS = (lambda: number, mu: number): number => (lambda < mu ? 1 / (mu - lambda) : Infinity);

export interface BrownoutPoint {
  on: boolean[];
  mu: number;
  rho: number;
  responseS: number;
}

export function brownoutPoint(lambda: number, threshold: number, degrade: boolean): BrownoutPoint {
  const on = tiersOn(lambda, threshold, degrade);
  const mu = serviceRate(on);
  return { on, mu, rho: lambda / mu, responseS: meanResponseS(lambda, mu) };
}

/** One tick is 0.2 ms, so a per-tick coin flip approximates a rate within a few percent. */
export const TICK_S = 0.0002;
export const SIM_SECONDS = 20;
export const SIM_TICKS = SIM_SECONDS / TICK_S;
/** A queue past this many requests counts as unbounded for the lesson's invariant. */
export const QUEUE_BOUND = 100;
/** The seed the broken mode is shown on: every seed breaks it, so the lowest is 0. */
export const BROKEN_SEED = 0;

export interface QueueState {
  queued: number;
  arrived: number;
  served: number;
  /** Sum over ticks of the requests in the system, for Little's law: mean time = area × tick ÷ served. */
  area: number;
  maxQueued: number;
}

export function createQueueSim(o: { seed: number; lambda: number; mu: number }): TickSim<QueueState> {
  const arrive = o.lambda * TICK_S;
  const serve = o.mu * TICK_S;
  return createTickSim<QueueState>({
    seed: o.seed,
    init: () => ({ queued: 0, arrived: 0, served: 0, area: 0, maxQueued: 0 }),
    step: (s, rnd) => {
      const done = s.queued > 0 && rnd() < serve ? 1 : 0;
      const came = rnd() < arrive ? 1 : 0;
      const queued = s.queued - done + came;
      return { queued, arrived: s.arrived + came, served: s.served + done, area: s.area + queued, maxQueued: Math.max(s.maxQueued, queued) };
    },
    check: (s) => (s.queued > QUEUE_BOUND ? `the queue passed ${QUEUE_BOUND} requests` : null),
  });
}

export interface QueueRun {
  /** Queue length sampled evenly, as [seconds, requests]. */
  series: [number, number][];
  maxQueued: number;
  /** Seconds at which the bound broke, or null. */
  brokeAtS: number | null;
  /** Mean time in system, seconds, from Little's law; null before any request was served. */
  meanS: number | null;
}

const SERIES_POINTS = 150;

export function runQueue(seed: number, lambda: number, mu: number, ticks = SIM_TICKS): QueueRun {
  const sim = createQueueSim({ seed, lambda, mu });
  sim.run(ticks);
  const history = sim.history;
  const last = sim.state;
  const stride = Math.max(1, Math.floor(history.length / SERIES_POINTS));
  const series: [number, number][] = [];
  for (let i = 0; i < history.length; i += stride) series.push([i * TICK_S, history[i].queued]);
  return {
    series,
    maxQueued: last.maxQueued,
    brokeAtS: sim.violation ? sim.violation.tick * TICK_S : null,
    meanS: last.served > 0 ? (last.area * TICK_S) / last.served : null,
  };
}

// ── Scene 3: stale on error ───────────────────────────────────────────────────

export interface CacheConfig {
  /** Minutes a cached copy is fresh. */
  ttl: number;
  /** Minutes after it goes stale that it may still be served when the origin errors (the stale-if-error window). */
  staleIfError: number;
  /** The origin is down over [outageStart, outageStart + outageLength). */
  outageStart: number;
  outageLength: number;
}

export const TIMELINE_END_MIN = 90;
export const CACHE_DEFAULT: CacheConfig = { ttl: 5, staleIfError: 30, outageStart: 8, outageLength: 40 };
export const CACHE_RANGES = {
  ttl: { min: 1, max: 15 },
  staleIfError: { min: 0, max: 60 },
  outageStart: { min: 0, max: 40 },
  outageLength: { min: 0, max: 60 },
} as const;

export type Served = 'fresh' | 'refreshed' | 'stale' | 'error';

export interface MinuteServed {
  t: number;
  originUp: boolean;
  served: Served;
  /** Minutes since the copy being served was fetched; null for an error. */
  age: number | null;
  /** The minute the cached copy was fetched (what a request that trusted the cache would read). */
  fetchedAt: number;
}

export const originUpAt = (c: CacheConfig, t: number): boolean => t < c.outageStart || t >= c.outageStart + c.outageLength;

/**
 * One request each minute against a cache entry fetched at minute 0. A fresh copy is served
 * without asking the origin; an expired one is refetched while the origin is up, and served stale
 * (with its age) while the origin is down and the copy is within the stale-if-error window.
 */
export function runTimeline(c: CacheConfig, end = TIMELINE_END_MIN): MinuteServed[] {
  const rows: MinuteServed[] = [];
  let fetchedAt = 0;
  for (let t = 0; t <= end; t++) {
    const age = t - fetchedAt;
    const originUp = originUpAt(c, t);
    if (age <= c.ttl) rows.push({ t, originUp, served: 'fresh', age, fetchedAt });
    else if (originUp) {
      fetchedAt = t;
      rows.push({ t, originUp, served: 'refreshed', age: 0, fetchedAt });
    } else if (age <= c.ttl + c.staleIfError) rows.push({ t, originUp, served: 'stale', age, fetchedAt });
    else rows.push({ t, originUp, served: 'error', age: null, fetchedAt });
  }
  return rows;
}

export interface Segment {
  served: Served;
  from: number;
  to: number;
}

/** Runs of the same outcome (fresh and refreshed read the same to the user), as bars for a timeline. */
export function segments(rows: readonly MinuteServed[]): Segment[] {
  const kind = (s: Served): Served => (s === 'refreshed' ? 'fresh' : s);
  const out: Segment[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.served === kind(r.served)) last.to = r.t + 1;
    else out.push({ served: kind(r.served), from: r.t, to: r.t + 1 });
  }
  return out;
}

/** The first minute at which the user sees `kind`, or null. */
export const firstMinute = (rows: readonly MinuteServed[], kind: Served): number | null => rows.find((r) => r.served === kind)?.t ?? null;

/**
 * The minute where the checkout bug is shown: the last minute a stale copy is still served (so the page
 * itself shows the old price with its age), or, with no stale minute, the last minute of the outage.
 */
export function bugProbeMinute(c: CacheConfig, rows: readonly MinuteServed[]): number {
  const stale = rows.filter((r) => r.served === 'stale');
  if (stale.length > 0) return stale[stale.length - 1].t;
  return Math.min(rows.length - 1, Math.max(0, c.outageStart + c.outageLength - 1));
}

export const PRICE = { before: 19.99, after: 24.99, changeAtMin: 10 } as const;

export type CheckoutRule = 'fail-closed' | 'stale-price';

export interface Checkout {
  /** What the card is charged, or null when checkout refuses. */
  charged: number | null;
  /** The price the cached copy holds. */
  cachedPrice: number;
  /** What the live price is at that minute. */
  livePrice: number;
  outcome: 'charged-live' | 'refused' | 'charged-stale';
}

/** The price the pricing service holds at minute `t`: the old one until the change, the new one after. */
export const livePriceAt = (t: number): number => (t >= PRICE.changeAtMin ? PRICE.after : PRICE.before);

/**
 * Checkout at minute `t`, with the cache entry fetched at `fetchedAt`. Failing closed refuses when
 * the live price cannot be read; the buggy rule charges whatever the cache holds, which is the old
 * price when it was fetched before the price changed.
 */
export function checkout(rule: CheckoutRule, t: number, originUp: boolean, fetchedAt: number): Checkout {
  const livePrice = livePriceAt(t);
  const cachedPrice = livePriceAt(fetchedAt);
  if (originUp) return { charged: livePrice, cachedPrice, livePrice, outcome: 'charged-live' };
  if (rule === 'fail-closed') return { charged: null, cachedPrice, livePrice, outcome: 'refused' };
  return { charged: cachedPrice, cachedPrice, livePrice, outcome: 'charged-stale' };
}
