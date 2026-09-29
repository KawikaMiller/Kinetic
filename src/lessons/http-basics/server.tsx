import type { ReactNode } from 'react';

// A tiny fake REST API. Pure functions: (request, state) → (response, new state).

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Auth = 'none' | 'user' | 'admin';
export type Mode = 'healthy' | 'ratelimited' | 'overloaded';
export type Family = '2xx' | '3xx' | '4xx' | '5xx';

export interface Req {
  method: Method;
  path: string;
  auth: Auth;
  etag: string | null;
  body: string;
}

export interface Res {
  status: number;
  headers: [string, string][];
  body: string | null;
  explain: ReactNode;
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

export const FAMILY_COLOR: Record<Family, string> = {
  '2xx': 'var(--ok)',
  '3xx': 'var(--info)',
  '4xx': 'var(--hi)',
  '5xx': 'var(--bad)',
};

export const hasBody = (m: Method) => m === 'POST' || m === 'PUT' || m === 'PATCH';

const json = (v: unknown) => JSON.stringify(v);
const etagOf = (u: User) => `"v${u.v}"`;

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const res = (status: number, explain: ReactNode, extra: Partial<Res> = {}): Res => ({
  status, explain, headers: [], body: null, touched: null, ...extra,
});

export function handle(req: Req, s: ServerState): { res: Res; after: ServerState } {
  const same = (r: Res) => ({ res: r, after: s });

  if (s.mode === 'ratelimited') {
    return same(res(429, <>You've sent too many requests. The server is <b>rate limiting</b> you; <code>Retry-After</code> says when to come back.</>, {
      headers: [['Retry-After', '30']],
    }));
  }
  if (s.mode === 'overloaded') {
    return same(res(503, <>The server is overloaded (or in maintenance). <b>503</b> means "temporarily unavailable": try again later.</>, {
      headers: [['Retry-After', '120']],
    }));
  }

  const path = req.path.trim().replace(/\/+$/, '') || '/';

  if (path === '/crash') {
    return same(res(500, <>The server hit a bug while handling this. <b>5xx = the server's fault</b>, not yours. Your request was fine.</>, {
      headers: [['Content-Type', 'application/json']],
      body: json({ error: 'Internal Server Error' }),
    }));
  }

  if (path === '/admin') {
    if (req.auth === 'none') {
      return same(res(401, <><b>401 Unauthorized</b> really means <i>unauthenticated</i>: "who are you?" No credentials were sent.</>, {
        headers: [['WWW-Authenticate', 'Bearer']],
      }));
    }
    if (req.auth === 'user') {
      return same(res(403, <><b>403 Forbidden</b>: the server knows who you are (a normal user) but you're <i>not allowed</i> here. Logging in again won't help.</>));
    }
    return same(res(200, <>Admin token accepted: <b>200 OK</b>. Same URL, different answer depending on who's asking.</>, {
      headers: [['Content-Type', 'application/json']],
      body: json({ users: Object.keys(s.users).length, secret: '🔑' }),
    }));
  }

  if (path === '/users') {
    if (req.method === 'GET') {
      return same(res(200, <><b>GET</b> the collection: <b>200 OK</b> with every user. GET only reads, so it's <b>safe</b>.</>, {
        headers: [['Content-Type', 'application/json']],
        body: json(Object.entries(s.users).map(([id, u]) => ({ id: Number(id), name: u.name }))),
      }));
    }
    if (req.method === 'POST') {
      const b = parseBody(req.body);
      if (!b || typeof b.name !== 'string') {
        return same(res(400, <><b>400 Bad Request</b>: the body must be JSON with a <code>name</code>. The client sent something the server can't use.</>));
      }
      const id = s.nextId;
      const user = { name: b.name, v: 1 };
      return {
        res: res(201, <><b>POST</b> created user #{id}: <b>201 Created</b>, with a <code>Location</code> header. POST again and you get <i>another</i> one: it isn't idempotent.</>, {
          headers: [['Location', `/users/${id}`], ['Content-Type', 'application/json']],
          body: json({ id, name: user.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: user }, nextId: id + 1 },
      };
    }
    return same(res(405, <><b>405 Method Not Allowed</b>: you can't {req.method} the whole collection. Try a single user like /users/1.</>, {
      headers: [['Allow', 'GET, POST']],
    }));
  }

  const m = /^\/users\/(\d+)$/.exec(path);
  if (!m) {
    return same(res(404, <><b>404 Not Found</b>: there's nothing at <code>{path}</code>. 4xx = the <i>client</i> asked for something wrong.</>));
  }
  const id = Number(m[1]);
  const user = s.users[id];

  switch (req.method) {
    case 'GET': {
      if (!user) return same(res(404, <>No user #{id}: <b>404 Not Found</b>. The server is fine; the thing you asked for doesn't exist.</>));
      if (req.etag && req.etag === etagOf(user)) {
        return same(res(304, <>Your cached copy (<code>{req.etag}</code>) is still current: <b>304 Not Modified</b>, no body. Saves re-sending data you already have.</>, {
          headers: [['ETag', etagOf(user)]],
          touched: id,
        }));
      }
      return same(res(200, <>Found user #{id}: <b>200 OK</b>. The <code>ETag</code> is a version tag your client can send back later to skip re-downloading.</>, {
        headers: [['ETag', etagOf(user)], ['Content-Type', 'application/json']],
        body: json({ id, name: user.name }),
        touched: id,
      }));
    }
    case 'PUT': {
      const b = parseBody(req.body);
      if (!b || typeof b.name !== 'string') {
        return same(res(400, <><b>400 Bad Request</b>: PUT needs the <i>whole</i> resource, e.g. <code>{'{"name":"…"}'}</code>.</>));
      }
      const changed = !user || user.name !== b.name;
      const next = { name: b.name, v: user ? (changed ? user.v + 1 : user.v) : 1 };
      return {
        res: res(user ? 200 : 201, user ? (
          <><b>PUT</b> replaces user #{id} with exactly what you sent. Send it again: same end state. That's <b>idempotent</b>.</>
        ) : (
          <><b>PUT</b> to an id that didn't exist creates it: <b>201 Created</b>. Repeat it and nothing new appears.</>
        ), {
          headers: [['ETag', etagOf(next)], ['Content-Type', 'application/json']],
          body: json({ id, name: next.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: next }, nextId: Math.max(s.nextId, id + 1) },
      };
    }
    case 'PATCH': {
      if (!user) return same(res(404, <>Can't PATCH user #{id}: it doesn't exist. <b>404</b>.</>));
      const b = parseBody(req.body);
      if (!b) return same(res(400, <><b>400 Bad Request</b>: that body isn't valid JSON.</>));
      const name = typeof b.name === 'string' ? b.name : user.name;
      const next = { name, v: name === user.name ? user.v : user.v + 1 };
      return {
        res: res(200, <><b>PATCH</b> changes only the fields you send. It <i>can</i> be idempotent, but isn't guaranteed to be (think <code>{'{"op":"increment"}'}</code>).</>, {
          headers: [['ETag', etagOf(next)], ['Content-Type', 'application/json']],
          body: json({ id, name: next.name }),
          touched: id,
        }),
        after: { ...s, users: { ...s.users, [id]: next } },
      };
    }
    case 'DELETE': {
      if (!user) {
        return same(res(404, <>Already gone: <b>404</b>. The reply differs, but the server ends in the same state, so DELETE still counts as <b>idempotent</b>.</>));
      }
      const users = { ...s.users };
      delete users[id];
      return {
        res: res(204, <>Deleted user #{id}: <b>204 No Content</b>, meaning success with nothing to send back.</>),
        after: { ...s, users },
      };
    }
    default:
      return same(res(405, <>Method not allowed here.</>, { headers: [['Allow', 'GET, PUT, PATCH, DELETE']] }));
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

export const currentEtag = (s: ServerState, id: number) => (s.users[id] ? etagOf(s.users[id]) : '"v1"');
