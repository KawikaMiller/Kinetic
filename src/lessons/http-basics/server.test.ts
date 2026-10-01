import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { explain } from './explain';
import {
  currentEtag, family, handle, INITIAL_SERVER, METHOD_PROPERTIES, METHODS, rawRequest, rawResponse, REASON, STALE_ETAG,
  type Method, type Req, type ServerState,
} from './server';

const req = (p: Partial<Req>): Req => ({ method: 'GET', path: '/users/1', auth: 'none', etag: null, body: '', ...p });
const header = (r: { headers: [string, string][] }, name: string) => r.headers.find(([k]) => k === name)?.[1];
const run = (reqs: Req[], s: ServerState = INITIAL_SERVER) => {
  const statuses: number[] = [];
  for (const r of reqs) {
    const out = handle(r, s);
    statuses.push(out.res.status);
    s = out.after;
  }
  return { statuses, state: s };
};

describe('each scenario gets the status code the lesson teaches', () => {
  it.each([
    ['read a user', req({}), 200],
    ['create a user', req({ method: 'POST', path: '/users', body: '{"name":"Grace"}' }), 201],
    ['missing user', req({ path: '/users/99' }), 404],
    ['cached copy, still current', req({ etag: '"v1"' }), 304],
    ['cached copy, out of date', req({ etag: STALE_ETAG }), 200],
    ['not logged in', req({ path: '/admin' }), 401],
    ['wrong role', req({ path: '/admin', auth: 'user' }), 403],
    ['admin', req({ path: '/admin', auth: 'admin' }), 200],
    ['server bug', req({ path: '/crash' }), 500],
    ['bad JSON body', req({ method: 'POST', path: '/users', body: 'nope' }), 400],
    ['PUT without a name', req({ method: 'PUT', body: '{}' }), 400],
    ['POST to one user', req({ method: 'POST', body: '{"name":"X"}' }), 405],
    ['DELETE the collection', req({ method: 'DELETE', path: '/users' }), 405],
    ['unknown path', req({ path: '/nope' }), 404],
    ['trailing slash is the same resource', req({ path: '/users/1/' }), 200],
  ])('%s', (_name, r, status) => {
    expect(handle(r, INITIAL_SERVER).res.status).toBe(status);
  });

  it('rate limiting and overload answer every request, with Retry-After', () => {
    const limited = handle(req({}), { ...INITIAL_SERVER, mode: 'ratelimited' }).res;
    const down = handle(req({}), { ...INITIAL_SERVER, mode: 'overloaded' }).res;
    expect([limited.status, down.status]).toEqual([429, 503]);
    expect(header(limited, 'Retry-After')).toBeDefined();
    expect(header(down, 'Retry-After')).toBeDefined();
  });

  it('sends the headers the captions point at', () => {
    expect(header(handle(req({ method: 'POST', path: '/users', body: '{"name":"Grace"}' }), INITIAL_SERVER).res, 'Location')).toBe('/users/3');
    expect(header(handle(req({ path: '/admin' }), INITIAL_SERVER).res, 'WWW-Authenticate')).toBe('Bearer');
    expect(header(handle(req({}), INITIAL_SERVER).res, 'ETag')).toBe('"v1"');
    expect(handle(req({ etag: '"v1"' }), INITIAL_SERVER).res.body).toBeNull(); // 304 has no body
  });

  it('every status it can return has a reason phrase and a family colour bucket', () => {
    for (const s of [200, 201, 204, 304, 400, 401, 403, 404, 405, 429, 500, 503]) {
      expect(REASON[s]).toBeTruthy();
      expect(['2xx', '3xx', '4xx', '5xx']).toContain(family(s));
    }
  });
});

describe('the safe / idempotent table matches how the server behaves', () => {
  const sample: Record<Method, Req> = {
    GET: req({}),
    POST: req({ method: 'POST', path: '/users', body: '{"name":"Grace"}' }),
    PUT: req({ method: 'PUT', body: '{"name":"Ada Lovelace"}' }),
    PATCH: req({ method: 'PATCH', body: '{"name":"Ada L."}' }),
    DELETE: req({ method: 'DELETE' }),
  };

  it.each(METHODS)('%s', (m) => {
    const once = run([sample[m]]).state;
    const twice = run([sample[m], sample[m]]).state;
    const { safe, idempotent } = METHOD_PROPERTIES[m];
    if (safe) expect(once).toEqual(INITIAL_SERVER);
    if (idempotent === true) expect(twice).toEqual(once);
    if (idempotent === false) expect(twice).not.toEqual(once);
  });

  it('DELETE ×3 replies 204, 404, 404 but leaves the same end state', () => {
    const { statuses, state } = run([sample.DELETE, sample.DELETE, sample.DELETE]);
    expect(statuses).toEqual([204, 404, 404]);
    expect(state).toEqual(run([sample.DELETE]).state);
  });

  it('POST ×3 creates three users; PUT ×3 creates none', () => {
    expect(Object.keys(run([sample.POST, sample.POST, sample.POST]).state.users)).toHaveLength(5);
    expect(Object.keys(run([sample.PUT, sample.PUT, sample.PUT]).state.users)).toHaveLength(2);
  });

  it('a PUT bumps the version (ETag) only when the content changes', () => {
    const changed = run([sample.PUT]).state;
    expect(currentEtag(changed, 1)).toBe('"v2"');
    expect(currentEtag(run([sample.PUT, sample.PUT]).state, 1)).toBe('"v2"');
    // a cached copy taken before the change is now stale
    expect(handle(req({ etag: '"v1"' }), changed).res.status).toBe(200);
  });
});

describe('raw messages', () => {
  it('shows the request line, headers and body a client would send', () => {
    const text = rawRequest(req({ method: 'POST', path: '/users', auth: 'user', etag: '"v1"', body: '{"a":1}' }));
    expect(text.split('\n')).toEqual([
      'POST /users HTTP/1.1', 'Host: api.example.com', 'Authorization: Bearer user-token', 'If-None-Match: "v1"',
      'Content-Type: application/json', '', '{"a":1}',
    ]);
  });

  it('shows the status line and headers of the reply', () => {
    const text = rawResponse(handle(req({}), INITIAL_SERVER).res);
    expect(text.startsWith('HTTP/1.1 200 OK\nETag: "v1"')).toBe(true);
  });
});

describe('every outcome has an explanation', () => {
  it('renders a caption for each request the stage can send', () => {
    const reqs: Req[] = [
      req({}), req({ etag: '"v1"' }), req({ etag: STALE_ETAG }), req({ path: '/users/99' }), req({ path: '/nope' }),
      req({ path: '/admin' }), req({ path: '/admin', auth: 'user' }), req({ path: '/admin', auth: 'admin' }), req({ path: '/crash' }),
      req({ path: '/users' }), req({ method: 'POST', path: '/users', body: '{"name":"G"}' }), req({ method: 'POST', path: '/users', body: '' }),
      req({ method: 'DELETE', path: '/users' }), req({ method: 'POST' }), req({ method: 'PUT', body: '{"name":"A"}' }),
      req({ method: 'PUT', path: '/users/9', body: '{"name":"A"}' }), req({ method: 'PUT', body: '' }),
      req({ method: 'PATCH', body: '{}' }), req({ method: 'PATCH', body: 'x' }), req({ method: 'PATCH', path: '/users/9', body: '{}' }),
      req({ method: 'DELETE' }), req({ method: 'DELETE', path: '/users/9' }),
    ];
    const kinds = new Set<string>();
    for (const r of reqs) {
      const { outcome } = handle(r, INITIAL_SERVER).res;
      kinds.add(outcome.kind);
      expect(renderToStaticMarkup(explain(outcome)).length).toBeGreaterThan(20);
    }
    for (const mode of ['ratelimited', 'overloaded'] as const) {
      const { outcome } = handle(req({}), { ...INITIAL_SERVER, mode }).res;
      kinds.add(outcome.kind);
      expect(renderToStaticMarkup(explain(outcome)).length).toBeGreaterThan(20);
    }
    expect(kinds.size).toBe(24); // all 24 Outcome kinds are reachable from the stage
  });
});
