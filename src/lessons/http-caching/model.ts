/**
 * Simulated HTTP caches for one URL: each user's browser cache (private), one shared cache
 * (a CDN or proxy) and the origin. The storage, freshness and validation rules follow
 * RFC 9111 for the directives the lesson models, plus stale-while-revalidate (RFC 5861),
 * immutable (RFC 8246) and ETag comparison (RFC 9110 §8.8.3). Expires, Age-header parsing
 * details, Authorization and request Cache-Control are not modelled. Pure: replay(events)
 * rebuilds every cache from scratch, so the timeline is reproducible.
 */

export type CacheKind = 'private' | 'shared';
export type VaryHeader = 'accept-encoding' | 'cookie';
export type EtagMode = 'none' | 'strong' | 'weak';

/** The origin's response headers, as the learner composed them. Seconds throughout. */
export interface Policy {
  maxAge: number | null;
  sMaxAge: number | null;
  noCache: boolean;
  noStore: boolean;
  private: boolean;
  public: boolean;
  mustRevalidate: boolean;
  /** stale-while-revalidate=N */
  swr: number | null;
  immutable: boolean;
  etag: EtagMode;
  lastModified: boolean;
  vary: VaryHeader[];
}

export interface Resource {
  path: string;
  /** Body size, bytes. */
  body: number;
  /** A different page for every user (a dashboard). */
  perUser: boolean;
}

export type UserId = 'A' | 'B';
export interface User {
  id: UserId;
  name: string;
  encoding: string;
  cookie: string;
}
export const USERS: Record<UserId, User> = {
  A: { id: 'A', name: 'Ada', encoding: 'br', cookie: 'session=ada' },
  B: { id: 'B', name: 'Ben', encoding: 'gzip', cookie: 'session=ben' },
};

/** Illustrative size of a response's status line and headers. */
export const HEAD_BYTES = 320;
/** The resource was last changed this long before the timeline starts (for Last-Modified). */
export const INITIAL_AGE_OF_CONTENT = 30 * 86_400;
/** RFC 9111 §4.2.2: a typical heuristic is 10% of the time since Last-Modified. */
export const HEURISTIC_FRACTION = 0.1;

export const DAY = 86_400;
export const YEAR = 365 * DAY;

// ── Header text ─────────────────────────────────────────────────────────

export function cacheControl(p: Policy): string {
  const parts: string[] = [];
  if (p.public) parts.push('public');
  if (p.private) parts.push('private');
  if (p.noStore) parts.push('no-store');
  if (p.noCache) parts.push('no-cache');
  if (p.maxAge !== null) parts.push(`max-age=${p.maxAge}`);
  if (p.sMaxAge !== null) parts.push(`s-maxage=${p.sMaxAge}`);
  if (p.mustRevalidate) parts.push('must-revalidate');
  if (p.swr !== null) parts.push(`stale-while-revalidate=${p.swr}`);
  if (p.immutable) parts.push('immutable');
  return parts.join(', ');
}

// ── ETags (RFC 9110 §8.8.3.2) ───────────────────────────────────────────

const opaque = (tag: string) => tag.replace(/^W\//, '');
const isWeak = (tag: string) => tag.startsWith('W/');
/** Strong comparison: neither is weak and the opaque tags match character for character. */
export const strongMatch = (a: string, b: string) => !isWeak(a) && !isWeak(b) && a === b;
/** Weak comparison: the opaque tags match, weak or not. If-None-Match uses this one. */
export const weakMatch = (a: string, b: string) => opaque(a) === opaque(b);

// ── Storage and freshness ───────────────────────────────────────────────

export interface Rule {
  check: string;
  value: string;
  ok: boolean | null;
}

/** RFC 9111 §3 for the modelled directives: may this cache store the response at all? */
export function storable(p: Policy, kind: CacheKind): { ok: boolean; why: string } {
  if (p.noStore) return { ok: false, why: 'no-store: no cache may keep it' };
  if (kind === 'shared' && p.private) return { ok: false, why: 'private: a shared cache must not keep it' };
  if (p.noCache) return { ok: true, why: 'no-cache: may be stored, but must be revalidated before every use' };
  return { ok: true, why: kind === 'shared' && p.public ? 'public: shared caches may keep it' : 'storable' };
}

/** Freshness lifetime (RFC 9111 §4.2.1): s-maxage for shared caches, else max-age, else the Last-Modified heuristic, else 0. */
export function freshnessLifetime(p: Policy, kind: CacheKind, ageOfContentAtResponse: number | null): { seconds: number; source: string } {
  if (kind === 'shared' && p.sMaxAge !== null) return { seconds: p.sMaxAge, source: 's-maxage (shared caches use it first)' };
  if (p.maxAge !== null) return { seconds: p.maxAge, source: kind === 'shared' ? 'max-age (no s-maxage)' : 'max-age (browsers ignore s-maxage)' };
  if (ageOfContentAtResponse !== null) {
    return { seconds: Math.floor(ageOfContentAtResponse * HEURISTIC_FRACTION), source: 'heuristic: 10% of the time since Last-Modified' };
  }
  return { seconds: 0, source: 'no max-age and no Last-Modified: stale at once' };
}

/**
 * May a stale copy be served? Only inside a stale-while-revalidate window, and never under must-revalidate.
 * Strictly per RFC 9111 §5.2.2.10, s-maxage also implies proxy-revalidate for shared caches, so none is served stale
 * there; many CDNs apply stale-while-revalidate alongside s-maxage anyway, and the reason string says so.
 */
export function staleAllowed(p: Policy, kind: CacheKind, age: number, lifetime: number): { ok: boolean; why: string } {
  const noStale = p.mustRevalidate || (kind === 'shared' && p.sMaxAge !== null);
  if (p.swr === null) return { ok: false, why: 'no stale-while-revalidate: stale means revalidate first' };
  if (noStale) {
    return { ok: false, why: p.mustRevalidate ? 'must-revalidate: never served stale' : 's-maxage implies proxy-revalidate (RFC 9111 §5.2.2.10): not served stale here. Many CDNs serve stale under s-maxage + stale-while-revalidate anyway' };
  }
  const left = lifetime + p.swr - age;
  return left > 0
    ? { ok: true, why: `inside the ${p.swr} s stale-while-revalidate window` }
    : { ok: false, why: `past the ${p.swr} s stale-while-revalidate window` };
}

// ── The simulation ──────────────────────────────────────────────────────

export interface Entry {
  storedAt: number;
  /** Age the response already had when stored (an Age header from the cache it came through). */
  ageAtStore: number;
  etag: string | null;
  lastModifiedAt: number | null;
  /** How old the content was when the origin produced it (for the heuristic). */
  contentAge: number | null;
  version: number;
  /** Whose page this is, for per-user resources. */
  owner: UserId | null;
}

export type Event =
  | { kind: 'request'; t: number; user: UserId; reload: boolean }
  | { kind: 'deploy'; t: number };

export type OutcomeKind = 'fresh' | 'revalidated-304' | 'revalidated-200' | 'miss' | 'stale' | 'not-stored';
export type Layer = 'browser' | 'shared' | 'origin';

export interface Message {
  from: Layer;
  to: Layer;
  label: string;
  note?: string;
  tone: 'info' | 'ok' | 'violet' | 'hi' | 'orange' | 'bad';
  background?: boolean;
}

export interface TrailRow extends Rule {
  layer: string;
}

export interface Outcome {
  t: number;
  user: UserId;
  reload: boolean;
  kind: OutcomeKind;
  /** Who produced the response the user got. */
  answeredBy: Layer;
  /** The user got someone else's page from the shared cache. */
  leak: boolean;
  /** The shared cache kept one user's page under a key every user shares (no Vary: Cookie). */
  sharedStoredPersonal: boolean;
  messages: Message[];
  trail: TrailRow[];
  /** Response bytes on each link during this request (background refreshes included). */
  originBytes: number;
  clientBytes: number;
  originStatuses: (200 | 304)[];
  version: number;
  owner: UserId | null;
}

interface Request {
  user: UserId;
  reload: boolean;
  ifNoneMatch: string | null;
  ifModifiedSince: number | null;
}

interface Response {
  status: 200 | 304;
  entry: Entry;
  age: number;
}

export interface Origin {
  version: number;
  lastModifiedAt: number;
}

export const etagFor = (mode: EtagMode, version: number, owner: UserId | null): string | null => {
  if (mode === 'none') return null;
  const tag = `"v${version}${owner ? `-${owner.toLowerCase()}` : ''}"`;
  return mode === 'weak' ? `W/${tag}` : tag;
};

/** The shared cache's key: the URL plus the request's value of every header the response Varies on. */
export function sharedKey(path: string, vary: readonly VaryHeader[], user: UserId): string {
  const u = USERS[user];
  const parts = [...vary].sort().map((h) => `${h}=${h === 'cookie' ? u.cookie : u.encoding}`);
  return [path, ...parts].join(' | ');
}

const LAYER_NAME: Record<Layer, string> = { browser: 'Browser', shared: 'Shared cache', origin: 'Origin' };
const fmtAge = (s: number) => `${Math.round(s)} s`;

export interface World {
  browsers: Record<UserId, Entry | null>;
  shared: Map<string, Entry>;
  origin: Origin;
}

export const emptyWorld = (): World => ({
  browsers: { A: null, B: null },
  shared: new Map(),
  origin: { version: 1, lastModifiedAt: -INITIAL_AGE_OF_CONTENT },
});

/** One request through browser → shared cache → origin. Mutates `w`. */
export function handle(w: World, p: Policy, res: Resource, user: UserId, reload: boolean, now: number): Outcome {
  const messages: Message[] = [];
  const trail: TrailRow[] = [];
  const statuses: (200 | 304)[] = [];
  let originBytes = 0;
  let clientBytes = 0;
  let sharedStoredPersonal = false;
  /** True while a stale-while-revalidate background refresh is running. */
  let background = false;
  const say = (m: Omit<Message, 'background'>) => messages.push({ ...m, background });

  const ageOf = (e: Entry) => e.ageAtStore + (now - e.storedAt);
  /** Answer a request that may be conditional from entry `e`, whose current age is `age`. */
  const answer = (e: Entry, req: Request, age: number): Response => ({
    status: req.ifNoneMatch !== null && e.etag !== null && weakMatch(req.ifNoneMatch, e.etag) ? 304 : 200,
    entry: e,
    age,
  });
  /** The request a cache sends upstream: its own stored copy's validators if it has one, else the client's conditional request as it came (RFC 9111 §4.3.1). */
  const conditional = (e: Entry | null, base: Request): Request =>
    e ? { ...base, ifNoneMatch: e.etag, ifModifiedSince: e.etag === null ? e.lastModifiedAt : null } : base;
  const reqText = (req: Request) => {
    const cond = req.ifNoneMatch !== null ? `If-None-Match: ${req.ifNoneMatch}` : req.ifModifiedSince !== null ? 'If-Modified-Since' : undefined;
    const label = `GET ${res.path}${cond ? ' (conditional)' : ''}`;
    return { label, note: background ? `background refresh${cond ? `, ${cond}` : ''}` : cond };
  };

  const fromOrigin = (req: Request): Response => {
    const o = w.origin;
    const owner = res.perUser ? req.user : null;
    const etag = etagFor(p.etag, o.version, owner);
    const lastModifiedAt = p.lastModified ? o.lastModifiedAt : null;
    const notModified =
      req.ifNoneMatch !== null
        ? etag !== null && weakMatch(req.ifNoneMatch, etag)
        : req.ifModifiedSince !== null && lastModifiedAt !== null && lastModifiedAt <= req.ifModifiedSince;
    const entry: Entry = {
      storedAt: now, ageAtStore: 0, etag, lastModifiedAt,
      contentAge: lastModifiedAt === null ? null : now - lastModifiedAt, version: o.version, owner,
    };
    const r: Response = { status: notModified ? 304 : 200, entry, age: 0 };
    statuses.push(r.status);
    originBytes += HEAD_BYTES + (r.status === 200 ? res.body : 0);
    return r;
  };

  type How = 'fresh' | 'stale' | 'forwarded';
  /** One cache layer: answer `req` from the stored copy, or ask `upstream` (and store what comes back, if allowed). */
  const layer = (
    kind: CacheKind, name: string, me: Layer, next: Layer, get: () => Entry | null, put: (e: Entry | null) => void,
    req: Request, upstream: (r: Request) => Response,
  ): { resp: Response; how: How } => {
    const e = get();
    const row = (check: string, value: string, ok: boolean | null) => trail.push({ layer: name, check, value, ok });
    /** Ask upstream; returns the entry now held (or the uncached one) and its age. */
    const refresh = (r: Request): { entry: Entry; age: number } => {
      say({ from: me, to: next, tone: 'info', ...reqText(r) });
      const up = upstream(r);
      if (up.status === 304 && e) {
        const kept = { ...e, storedAt: now, ageAtStore: up.age, contentAge: e.lastModifiedAt === null ? null : now - e.lastModifiedAt };
        put(kept);
        row('Upstream said', '304 Not Modified: the stored copy is still good', true);
        return { entry: kept, age: up.age };
      }
      if (up.status === 304) {
        // The client's own validator matched at the origin and this cache holds no copy to refresh: pass it on, store nothing.
        row('Upstream said', '304 Not Modified: passed on to the client; there is no body to store here', true);
        return { entry: up.entry, age: up.age };
      }
      const keep = storable(p, kind);
      row('Upstream said', `200 with the body (version ${up.entry.version})`, null);
      row('Store it?', keep.why, keep.ok);
      if (keep.ok) {
        put({ ...up.entry, storedAt: now, ageAtStore: up.age });
        // A per-user page in a shared cache is only safe when the key separates users (Vary: Cookie).
        if (kind === 'shared' && up.entry.owner !== null && !p.vary.includes('cookie')) sharedStoredPersonal = true;
      } else put(null);
      return { entry: up.entry, age: up.age };
    };
    const forward = (): { resp: Response; how: How } => {
      const got = refresh(conditional(e, req));
      return { resp: answer(got.entry, req, got.age), how: 'forwarded' };
    };

    if (!e) {
      row('Stored copy?', 'none', false);
      return forward();
    }
    const age = ageOf(e);
    const life = freshnessLifetime(p, kind, e.contentAge);
    const fresh = age < life.seconds;
    row('Stored copy?', `yes, version ${e.version}${e.owner ? ` (${USERS[e.owner].name}'s page)` : ''}`, true);
    row('Age', fmtAge(age), null);
    row('Freshness lifetime', `${life.seconds} s: ${life.source}`, null);
    row('Fresh?', fresh ? `yes (${fmtAge(age)} < ${life.seconds} s)` : `no (${fmtAge(age)} ≥ ${life.seconds} s)`, fresh);
    if (p.noCache) {
      row('no-cache', 'stored, but must be revalidated before every use', false);
      return forward();
    }
    if (req.reload) {
      if (kind === 'private' && fresh && p.immutable) {
        row('Reload', 'immutable: a fresh copy is used without asking', true);
        return { resp: answer(e, req, age), how: 'fresh' };
      }
      row(
        'Reload',
        kind === 'shared'
          ? 'the reload sent max-age=0, which a shared cache honours by revalidating (RFC 9111 §5.2.1.1)'
          : fresh ? 'revalidate even though it is fresh (immutable would skip this)' : 'revalidate',
        false,
      );
      return forward();
    }
    if (fresh) return { resp: answer(e, req, age), how: 'fresh' };
    const stale = staleAllowed(p, kind, age, life.seconds);
    row('Serve it stale?', stale.why, stale.ok);
    if (!stale.ok) return forward();
    const resp = answer(e, req, age);
    const outer = background;
    background = true;
    refresh(conditional(e, req));
    background = outer;
    return { resp, how: 'stale' };
  };

  const key = sharedKey(res.path, p.vary, user);
  let sharedHow: How | null = null;
  let sharedStatus: 200 | 304 | null = null;
  let originStatus: 200 | 304 | null = null;
  let originConditional = false;

  const toOrigin = (r: Request): Response => {
    const resp = fromOrigin(r);
    if (!background) {
      originConditional = r.ifNoneMatch !== null || r.ifModifiedSince !== null;
      originStatus = resp.status;
    }
    say({
      from: 'origin', to: 'shared',
      label: resp.status === 304 ? '304 Not Modified' : `200 OK, version ${resp.entry.version}`,
      note: resp.status === 304 ? 'no body' : `${res.body.toLocaleString('en-US')} B body`,
      tone: resp.status === 304 ? 'violet' : 'hi',
    });
    return resp;
  };

  const toShared = (r: Request): Response => {
    trail.push({ layer: 'Shared cache', check: 'Cache key', value: key, ok: null });
    const out = layer('shared', 'Shared cache', 'shared', 'origin', () => w.shared.get(key) ?? null, (e) => {
      if (e) w.shared.set(key, e);
      else w.shared.delete(key);
    }, r, toOrigin);
    const resp = out.resp;
    if (!background) {
      sharedHow = out.how;
      sharedStatus = resp.status;
    }
    clientBytes += HEAD_BYTES + (resp.status === 200 ? res.body : 0);
    const leak = resp.entry.owner !== null && resp.entry.owner !== r.user;
    say({
      from: 'shared', to: 'browser',
      label: resp.status === 304 ? '304 Not Modified' : out.how === 'forwarded' ? `200 OK, version ${resp.entry.version}` : `200 from cache, version ${resp.entry.version}`,
      note: leak ? `${USERS[resp.entry.owner!].name}'s page!` : resp.age > 0 ? `Age: ${Math.round(resp.age)}` : undefined,
      tone: leak ? 'bad' : out.how === 'stale' ? 'orange' : resp.status === 304 ? 'violet' : out.how === 'fresh' ? 'ok' : 'hi',
    });
    return resp;
  };

  const b = layer('private', `${USERS[user].name}'s browser`, 'browser', 'shared', () => w.browsers[user], (e) => {
    w.browsers[user] = e;
  }, { user, reload, ifNoneMatch: null, ifModifiedSince: null }, toShared);
  if (b.how === 'fresh') messages.unshift({ from: 'browser', to: 'browser', label: 'fresh copy: no request sent', tone: 'ok' });
  if (b.how === 'stale') messages.unshift({ from: 'browser', to: 'browser', label: 'stale copy served now', tone: 'orange' });

  const got = b.resp.entry;
  let kind: OutcomeKind;
  let answeredBy: Layer;
  if (b.how !== 'forwarded') {
    kind = b.how;
    answeredBy = 'browser';
  } else if (sharedHow === 'fresh' || sharedHow === 'stale') {
    answeredBy = 'shared';
    kind = sharedHow === 'stale' ? 'stale' : sharedStatus === 304 ? 'revalidated-304' : 'fresh';
  } else {
    answeredBy = 'origin';
    kind = originStatus === 304 ? 'revalidated-304' : originConditional ? 'revalidated-200' : 'miss';
  }
  if (kind === 'miss' && !storable(p, 'private').ok && !storable(p, 'shared').ok) kind = 'not-stored';

  return {
    t: now, user, reload, kind, answeredBy, leak: got.owner !== null && got.owner !== user, sharedStoredPersonal, messages, trail,
    originBytes, clientBytes, originStatuses: statuses, version: got.version, owner: got.owner,
  };
}

/** Replay a whole timeline from empty caches. */
export function replay(p: Policy, res: Resource, events: readonly Event[]): { outcomes: Outcome[]; world: World } {
  const w = emptyWorld();
  const outcomes: Outcome[] = [];
  for (const e of events) {
    if (e.kind === 'deploy') {
      w.origin = { version: w.origin.version + 1, lastModifiedAt: e.t };
    } else outcomes.push(handle(w, p, res, e.user, e.reload, e.t));
  }
  return { outcomes, world: w };
}

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  fresh: 'fresh hit',
  'revalidated-304': 'revalidated: 304',
  'revalidated-200': 'revalidated: new 200',
  miss: 'miss: full trip',
  stale: 'stale served',
  'not-stored': 'not cacheable: full trip',
};

export const OUTCOME_TONE: Record<OutcomeKind, 'ok' | 'violet' | 'hi' | 'orange'> = {
  fresh: 'ok',
  'revalidated-304': 'violet',
  'revalidated-200': 'hi',
  miss: 'hi',
  stale: 'orange',
  'not-stored': 'hi',
};

export const layerName = (l: Layer) => LAYER_NAME[l];

// ── Presets ─────────────────────────────────────────────────────────────

export const BLANK: Policy = {
  maxAge: null, sMaxAge: null, noCache: false, noStore: false, private: false, public: false,
  mustRevalidate: false, swr: null, immutable: false, etag: 'none', lastModified: false, vary: [],
};

export type PresetId = 'asset' | 'html' | 'dashboard' | 'api';
export interface Preset {
  id: PresetId;
  label: string;
  resource: Resource;
  policy: Policy;
}

export const PRESETS: Record<PresetId, Preset> = {
  asset: {
    id: 'asset', label: 'Hashed static asset',
    resource: { path: '/app.3f9a.js', body: 180_000, perUser: false },
    policy: { ...BLANK, maxAge: YEAR, immutable: true, etag: 'strong', lastModified: true },
  },
  html: {
    id: 'html', label: 'HTML page',
    resource: { path: '/index.html', body: 24_000, perUser: false },
    policy: { ...BLANK, noCache: true, etag: 'strong' },
  },
  dashboard: {
    id: 'dashboard', label: 'Per-user dashboard',
    resource: { path: '/dashboard', body: 12_000, perUser: true },
    policy: { ...BLANK, private: true, maxAge: 60, etag: 'strong' },
  },
  api: {
    id: 'api', label: 'API with Vary',
    resource: { path: '/api/products', body: 6_000, perUser: false },
    policy: { ...BLANK, public: true, maxAge: 60, swr: 600, etag: 'weak', vary: ['accept-encoding'] },
  },
};
