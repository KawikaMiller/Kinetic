// A tiny fake REST API, simulated in the browser. Pure: (request, state) → (response, new state).
// To keep the demo short it lets any caller PUT, PATCH or DELETE users; only /admin checks
// the token. The stage says so.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Auth = 'none' | 'user' | 'admin';
export type Mode = 'healthy' | 'ratelimited' | 'overloaded';
export type Family = '2xx' | '3xx' | '4xx' | '5xx';

export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Per RFC 9110: safe = read-only; idempotent = repeating it leaves the server in the
 * same state as doing it once. PATCH is idempotent only if the patch itself is.
 */
export const METHOD_PROPERTIES: Record<Method, { safe: boolean; idempotent: boolean | 'maybe' }> = {
  GET: { safe: true, idempotent: true },
  POST: { safe: false, idempotent: false },
  PUT: { safe: false, idempotent: true },
  PATCH: { safe: false, idempotent: 'maybe' },
  DELETE: { safe: false, idempotent: true },
};

export interface Req {
  method: Method;
  path: string;
  auth: Auth;
  etag: string | null;
  body: string;
}

/** What happened, for the caption; explain.tsx turns it into words. */
export type Outcome =
  | { kind: 'rateLimited' }
  | { kind: 'overloaded' }
  | { kind: 'crash' }
  | { kind: 'adminUnauthenticated' }
  | { kind: 'adminForbidden' }
  | { kind: 'adminOk' }
  | { kind: 'listed' }
  | { kind: 'createBadBody' }
  | { kind: 'created'; id: number }
  | { kind: 'collectionMethod'; method: Method }
  | { kind: 'itemMethod'; method: Method }
  | { kind: 'noRoute'; path: string }
  | { kind: 'noUser'; id: number }
  | { kind: 'notModified'; etag: string }
  | { kind: 'refreshed'; id: number; etag: string }
  | { kind: 'found'; id: number }
  | { kind: 'putBadBody' }
  | { kind: 'replaced'; id: number }
  | { kind: 'putCreated'; id: number }
  | { kind: 'patchMissing'; id: number }
  | { kind: 'patchBadBody' }
  | { kind: 'patched'; id: number }
  | { kind: 'deleteMissing' }
  | { kind: 'deleted'; id: number };

export interface Res {
  status: number;
  headers: [string, string][];
  body: string | null;
  outcome: Outcome;
  /** User id whose row changed, for highlighting. */
  touched: number | null;
}

export interface User {
  name: string;
  v: number;
}

export interface ServerState {
  users: Record<number, User>;
  nextId: number;
  mode: Mode;
}

export const INITIAL_SERVER: ServerState = {
  users: { 1: { name: 'Ada', v: 1 }, 2: { name: 'Linus', v: 1 } },
  nextId: 3,
  mode: 'healthy',
};

export const REASON: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized',
  403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests',
  500: 'Internal Server Error', 503: 'Service Unavailable',
};

export const family = (status: number): Family => `${Math.floor(status / 100)}xx` as Family;

/** Status family → token. 4xx (your request's fault) and 5xx (the server's) stay distinct on purpose. */
export const FAMILY_COLOR: Record<Family, string> = {
  '2xx': 'var(--ok)',
  '3xx': 'var(--violet)',
  '4xx': 'var(--orange)',
  '5xx': 'var(--bad)',
};

export const REQUEST_COLOR = 'var(--info)';

export const hasBody = (m: Method) => m === 'POST' || m === 'PUT' || m === 'PATCH';

/** An ETag that never matches: what a client with an out-of-date cached copy sends. */
export const STALE_ETAG = '"v0"';

const json = (v: unknown) => JSON.stringify(v);
export const etagOf = (u: User) => `"v${u.v}"`;
const JSON_TYPE: [string, string] = ['Content-Type', 'application/json'];

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const res = (status: number, outcome: Outcome, extra: Partial<Res> = {}): Res => ({
  status, outcome, headers: [], body: null, touched: null, ...extra,
});

export function handle(req: Req, s: ServerState): { res: Res; after: ServerState } {
  const same = (r: Res) => ({ res: r, after: s });

  if (s.mode === 'ratelimited') return same(res(429, { kind: 'rateLimited' }, { headers: [['Retry-After', '30']] }));
  if (s.mode === 'overloaded') return same(res(503, { kind: 'overloaded' }, { headers: [['Retry-After', '120']] }));

  const path = req.path.trim().replace(/\/+$/, '') || '/';

  if (path === '/crash') {
    return same(res(500, { kind: 'crash' }, { headers: [JSON_TYPE], body: json({ error: 'Internal Server Error' }) }));
  }

  if (path === '/admin') {
    if (req.auth === 'none') return same(res(401, { kind: 'adminUnauthenticated' }, { headers: [['WWW-Authenticate', 'Bearer']] }));
    if (req.auth === 'user') return same(res(403, { kind: 'adminForbidden' }));
    return same(res(200, { kind: 'adminOk' }, { headers: [JSON_TYPE], body: json({ users: Object.keys(s.users).length, secret: '🔑' }) }));
  }

  if (path === '/users') {
    if (req.method === 'GET') {
      const list = Object.entries(s.users).map(([id, u]) => ({ id: Number(id), name: u.name }));
      return same(res(200, { kind: 'listed' }, { headers: [JSON_TYPE], body: json(list) }));
    }
    if (req.method === 'POST') {
      const b = parseBody(req.body);
      if (!b || typeof b.name !== 'string') return same(res(400, { kind: 'createBadBody' }));
      const id = s.nextId;
      const user = { name: b.name, v: 1 };
      return {
        res: res(201, { kind: 'created', id }, {
          headers: [['Location', `/users/${id}`], JSON_TYPE],
          body: json({ id, name: user.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: user }, nextId: id + 1 },
      };
    }
    return same(res(405, { kind: 'collectionMethod', method: req.method }, { headers: [['Allow', 'GET, POST']] }));
  }

  const m = /^\/users\/(\d+)$/.exec(path);
  if (!m) return same(res(404, { kind: 'noRoute', path }));
  const id = Number(m[1]);
  const user = s.users[id];

  switch (req.method) {
    case 'POST':
      return same(res(405, { kind: 'itemMethod', method: req.method }, { headers: [['Allow', 'GET, PUT, PATCH, DELETE']] }));
    case 'GET': {
      if (!user) return same(res(404, { kind: 'noUser', id }));
      const etag = etagOf(user);
      if (req.etag && req.etag === etag) {
        return same(res(304, { kind: 'notModified', etag }, { headers: [['ETag', etag]], touched: id }));
      }
      const outcome: Outcome = req.etag ? { kind: 'refreshed', id, etag: req.etag } : { kind: 'found', id };
      return same(res(200, outcome, { headers: [['ETag', etag], JSON_TYPE], body: json({ id, name: user.name }), touched: id }));
    }
    case 'PUT': {
      const b = parseBody(req.body);
      if (!b || typeof b.name !== 'string') return same(res(400, { kind: 'putBadBody' }));
      const changed = !user || user.name !== b.name;
      const next = { name: b.name, v: user ? (changed ? user.v + 1 : user.v) : 1 };
      return {
        res: res(user ? 200 : 201, user ? { kind: 'replaced', id } : { kind: 'putCreated', id }, {
          headers: [['ETag', etagOf(next)], JSON_TYPE],
          body: json({ id, name: next.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: next }, nextId: Math.max(s.nextId, id + 1) },
      };
    }
    case 'PATCH': {
      if (!user) return same(res(404, { kind: 'patchMissing', id }));
      const b = parseBody(req.body);
      if (!b) return same(res(400, { kind: 'patchBadBody' }));
      const name = typeof b.name === 'string' ? b.name : user.name;
      const next = { name, v: name === user.name ? user.v : user.v + 1 };
      return {
        res: res(200, { kind: 'patched', id }, {
          headers: [['ETag', etagOf(next)], JSON_TYPE],
          body: json({ id, name: next.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: next } },
      };
    }
    case 'DELETE': {
      if (!user) return same(res(404, { kind: 'deleteMissing' }));
      const users = { ...s.users };
      delete users[id];
      return { res: res(204, { kind: 'deleted', id }), after: { ...s, users } };
    }
  }
}

export function rawRequest(req: Req): string {
  const lines = [`${req.method} ${req.path || '/'} HTTP/1.1`, 'Host: api.example.com'];
  if (req.auth !== 'none') lines.push(`Authorization: Bearer ${req.auth}-token`);
  if (req.etag) lines.push(`If-None-Match: ${req.etag}`);
  if (hasBody(req.method)) lines.push('Content-Type: application/json', '', req.body);
  return lines.join('\n');
}

export function rawResponse(r: Res): string {
  const lines = [`HTTP/1.1 ${r.status} ${REASON[r.status] ?? ''}`, ...r.headers.map(([k, v]) => `${k}: ${v}`)];
  if (r.body) lines.push('', r.body);
  return lines.join('\n');
}

/** The ETag of user `id` right now (what a fresh cached copy would hold). */
export const currentEtag = (s: ServerState, id: number) => (s.users[id] ? etagOf(s.users[id]) : '"v1"');
