/**
 * A scripted API gateway (a reverse proxy that acts for the servers behind it): TLS
 * termination, routing by host and longest path prefix, a JWT check, a token-bucket rate
 * limit, header rewriting, and forwarding with a timeout and retries for idempotent methods.
 * The stage order is fixed; a request stops at the first stage that rejects it. Services,
 * latencies and tokens are simulated; no request leaves the page.
 */

export const STAGES = ['tls', 'route', 'auth', 'rate', 'headers', 'forward'] as const;
export type StageId = (typeof STAGES)[number];
export const STAGE_LABEL: Record<StageId, string> = {
  tls: 'TLS termination', route: 'Routing', auth: 'Auth (JWT)', rate: 'Rate limit', headers: 'Header rewrite', forward: 'Forward',
};

export type ServiceId = 'users' | 'orders' | 'reports' | 'static';
export const SERVICES: readonly ServiceId[] = ['users', 'orders', 'reports', 'static'];

export interface Route {
  id: string;
  host: string;
  prefix: string;
  service: ServiceId;
  /** Does this route need a valid token? (Static files don't.) */
  auth: boolean;
}

export const API_HOST = 'api.example.com';
export const STATIC_HOST = 'static.example.com';

export const DEFAULT_ROUTES: readonly Route[] = [
  { id: 'r-users', host: API_HOST, prefix: '/users', service: 'users', auth: true },
  { id: 'r-orders', host: API_HOST, prefix: '/orders', service: 'orders', auth: true },
  { id: 'r-export', host: API_HOST, prefix: '/orders/export', service: 'reports', auth: true },
  { id: 'r-static', host: STATIC_HOST, prefix: '/', service: 'static', auth: false },
];

// ── Routing ─────────────────────────────────────────────────────────────

/** Segment-aware prefix match: "/orders" matches "/orders" and "/orders/7", never "/ordersX". "/" matches everything. */
export function prefixMatches(prefix: string, path: string): boolean {
  if (prefix === '/') return path.startsWith('/');
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Longest matching prefix on the request's host wins; null means 404. */
export function route(routes: readonly Route[], host: string, path: string): Route | null {
  let best: Route | null = null;
  for (const r of routes) if (r.host === host && prefixMatches(r.prefix, path) && (!best || r.prefix.length > best.prefix.length)) best = r;
  return best;
}

export const PREFIX_MAX = 40;
/** A route prefix the learner types: "/" then path segments of letters, digits, "-", "_" or "."; no empty segments, no trailing slash. */
export function parsePrefix(text: string, taken: readonly string[] = []): { ok: true; value: string } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Type a prefix that starts with "/", like /orders.' };
  if (t.length > PREFIX_MAX) return { ok: false, error: `Keep it under ${PREFIX_MAX} characters.` };
  if (!t.startsWith('/')) return { ok: false, error: 'A path prefix starts with "/".' };
  if (t !== '/' && t.endsWith('/')) return { ok: false, error: 'Leave off the trailing "/": /orders matches /orders/7 already.' };
  if (t.includes('//')) return { ok: false, error: 'No empty segments ("//").' };
  if (t !== '/' && !t.slice(1).split('/').every((s) => /^[A-Za-z0-9._-]+$/.test(s)))
    return { ok: false, error: 'Use letters, digits, "-", "_" or "." between the slashes.' };
  if (t.split('/').some((s) => s === '..' || s === '.')) return { ok: false, error: '"." and ".." aren\'t path segments a route can name.' };
  if (taken.includes(t)) return { ok: false, error: `${t} is already in the table.` };
  return { ok: true, value: t };
}

/** A path to test against the table: same character rules, may end in a slash or a file name. */
export function parsePath(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Type a path like /orders/export/2024.' };
  if (t.length > PREFIX_MAX * 2) return { ok: false, error: 'That path is too long for this demo.' };
  if (!t.startsWith('/')) return { ok: false, error: 'A request path starts with "/".' };
  if (!/^\/[A-Za-z0-9._\-/]*$/.test(t)) return { ok: false, error: 'Only letters, digits and - _ . / in this demo (no query strings).' };
  return { ok: true, value: t };
}

// ── Rate limiting: the token bucket from rate-limiting ───────────────────

export interface BucketParams {
  /** Tokens added per second. */
  rate: number;
  capacity: number;
}
export interface Bucket {
  tokens: number;
  last: number;
}
export const DEFAULT_BUCKET: BucketParams = { rate: 1, capacity: 5 };
export const fullBucket = (p: BucketParams, now = 0): Bucket => ({ tokens: p.capacity, last: now });

/** Refill for the time since `last` (never past capacity), then spend one token if there is a whole one. */
export function takeToken(b: Bucket, now: number, p: BucketParams): { allowed: boolean; bucket: Bucket; retryAfter: number } {
  const tokens = Math.min(p.capacity, b.tokens + (now - b.last) * p.rate);
  if (tokens >= 1) return { allowed: true, bucket: { tokens: tokens - 1, last: now }, retryAfter: 0 };
  return { allowed: false, bucket: { tokens, last: now }, retryAfter: Math.ceil((1 - tokens) / p.rate) };
}

// ── Requests and the pipeline ───────────────────────────────────────────

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
/** RFC 9110 §9.2.2: GET, HEAD, PUT, DELETE (and OPTIONS, TRACE) are idempotent; POST isn't. */
export const isIdempotent = (m: Method) => m !== 'POST';

/**
 * May the gateway retry after this failure? A refused connection sent nothing, so any method
 * is safe to retry. Once the request went out and the connection then dropped, the service may
 * already have acted on it, so only an idempotent method may be repeated.
 */
export const retrySafe = (m: Method, failure: 'refused' | 'dropped-after-send') => failure === 'refused' || isIdempotent(m);

export interface Request {
  id: number;
  t: number;
  method: Method;
  host: string;
  path: string;
  token: 'valid' | 'missing';
  /** The address the gateway sees the connection come from. */
  peer: string;
  /** An X-Forwarded-For header the client sent itself, if any. */
  clientXff?: string;
}

export type Health = 'up' | 'down' | 'slow';
export interface GatewayConfig {
  routes: readonly Route[];
  authAtEdge: boolean;
  bucket: BucketParams;
  /** How long the gateway waits for an upstream, s. */
  timeout: number;
  /** Extra attempts after a failed connection, for idempotent methods only. */
  retries: number;
  health: Record<ServiceId, Health>;
  /** Typical upstream latency, s (illustrative). */
  latency: Record<Health, number>;
}

export const DEFAULT_CONFIG: GatewayConfig = {
  routes: DEFAULT_ROUTES,
  authAtEdge: true,
  bucket: DEFAULT_BUCKET,
  timeout: 2,
  retries: 1,
  health: { users: 'up', orders: 'up', reports: 'up', static: 'up' },
  latency: { up: 0.03, down: 0, slow: 5 },
};

export interface Outcome {
  status: number;
  /** The stage that produced the response: the gateway rejected it there, or it came from upstream (forward). */
  stoppedAt: StageId;
  /** Which stages ran, in order. */
  ran: StageId[];
  route: Route | null;
  /** Did a service answer (2xx or a service's own 401)? */
  fromService: boolean;
  /** Headers the service received, when the request got that far. */
  forwarded?: [string, string][];
  responseHeaders: [string, string][];
  attempts: number;
  /** Seconds the client waited for the answer (illustrative). */
  waited: number;
  bucket: Bucket;
  note: string;
}

/** X-Forwarded-For: the proxy appends the address it saw the connection come from. */
export const appendXff = (existing: string | undefined, peer: string) => (existing ? `${existing}, ${peer}` : peer);

export const requestIdOf = (n: number) => `req-${(0x7f3a00 + n).toString(16)}`;

/** Run one request through the stages in their fixed order. */
export function handle(req: Request, cfg: GatewayConfig, bucket: Bucket): Outcome {
  const ran: StageId[] = [];
  const stop = (stage: StageId, status: number, note: string, extra: Partial<Outcome> = {}): Outcome => ({
    status, stoppedAt: stage, ran: [...ran, stage], route: null, fromService: false, responseHeaders: [], attempts: 0, waited: 0, bucket, note, ...extra,
  });

  ran.push('tls');
  const r = route(cfg.routes, req.host, req.path);
  if (!r) return stop('route', 404, `no route for ${req.host}${req.path}`);
  ran.push('route');

  const needsAuth = r.auth;
  if (cfg.authAtEdge && needsAuth && req.token !== 'valid')
    return stop('auth', 401, 'no valid token', { route: r, responseHeaders: [['WWW-Authenticate', 'Bearer']] });
  ran.push('auth');

  const take = takeToken(bucket, req.t, cfg.bucket);
  if (!take.allowed)
    return stop('rate', 429, 'bucket empty', { route: r, bucket: take.bucket, responseHeaders: [['Retry-After', `${take.retryAfter}`]] });
  bucket = take.bucket;
  ran.push('rate');

  const forwarded: [string, string][] = [
    ['Host', req.host],
    ['X-Forwarded-For', appendXff(req.clientXff, req.peer)],
    ['X-Forwarded-Proto', 'https'],
    ['X-Request-Id', requestIdOf(req.id)],
    ...(cfg.authAtEdge && needsAuth ? [['X-User-Id', '42'] as [string, string]] : req.token === 'valid' ? [['Authorization', 'Bearer …'] as [string, string]] : []),
  ];
  ran.push('headers');
  ran.push('forward');
  const base = { route: r, forwarded, bucket };
  const health = cfg.health[r.service];
  if (health === 'down') {
    const attempts = retrySafe(req.method, 'refused') ? 1 + cfg.retries : 1;
    return { ...base, status: 502, stoppedAt: 'forward', ran, fromService: false, responseHeaders: [], attempts, waited: 0.001 * attempts, note: 'upstream refused the connection' };
  }
  if (cfg.latency[health] > cfg.timeout)
    return { ...base, status: 504, stoppedAt: 'forward', ran, fromService: false, responseHeaders: [], attempts: 1, waited: cfg.timeout, note: `no answer within ${cfg.timeout} s` };
  if (!cfg.authAtEdge && needsAuth && req.token !== 'valid')
    return { ...base, status: 401, stoppedAt: 'forward', ran, fromService: true, responseHeaders: [['WWW-Authenticate', 'Bearer']], attempts: 1, waited: cfg.latency[health], note: `the ${r.service} service rejected it` };
  return { ...base, status: 200, stoppedAt: 'forward', ran, fromService: true, responseHeaders: [['X-Request-Id', requestIdOf(req.id)]], attempts: 1, waited: cfg.latency[health], note: `${r.service} answered` };
}

/** A sequence of requests through one gateway, sharing its rate-limit bucket. */
export function runRequests(reqs: readonly Request[], cfg: GatewayConfig): { req: Request; out: Outcome }[] {
  let bucket = fullBucket(cfg.bucket);
  return reqs.map((req) => {
    const out = handle(req, cfg, bucket);
    bucket = out.bucket;
    return { req, out };
  });
}

// ── Presets ─────────────────────────────────────────────────────────────

export const CLIENT_IP = '198.51.100.7';
export const SPOOFED_XFF = '192.0.2.200';

export interface Preset {
  id: string;
  label: string;
  requests: Omit<Request, 'id' | 'peer'>[];
  health?: Partial<Record<ServiceId, Health>>;
}

const get = (path: string, t = 0, extra: Partial<Request> = {}): Omit<Request, 'id' | 'peer'> => ({ t, method: 'GET', host: API_HOST, path, token: 'valid', ...extra });

/** How many requests the burst preset fires, 50 ms apart: one more than the bucket holds. */
export const BURST = DEFAULT_BUCKET.capacity + 1;
export const BURST_GAP_S = 0.05;

export const PRESETS: readonly Preset[] = [
  { id: 'ok', label: 'Valid call', requests: [get('/users/42')] },
  { id: 'no-token', label: 'No token', requests: [get('/orders/7', 0, { token: 'missing' })] },
  { id: 'burst', label: 'Over the limit', requests: Array.from({ length: BURST }, (_, i) => get('/users/42', i * BURST_GAP_S)) },
  { id: 'unknown', label: 'Unknown path', requests: [get('/payments/3')] },
  { id: 'down', label: 'Upstream down', requests: [get('/orders/7')], health: { orders: 'down' } },
  { id: 'slow', label: 'Upstream slow', requests: [get('/orders/export/2024')], health: { reports: 'slow' } },
  { id: 'static', label: 'Static file', requests: [{ t: 0, method: 'GET', host: STATIC_HOST, path: '/logo.png', token: 'missing' }] },
];

export const presetRequests = (p: Preset, spoof: boolean): Request[] =>
  p.requests.map((r, i) => ({ ...r, id: i + 1, peer: CLIENT_IP, clientXff: spoof ? SPOOFED_XFF : undefined }));
