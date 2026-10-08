import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randInt } from '../../core/random';
import { fullBucket } from '../../core/tokenBucket';
import {
  API_HOST, BURST, CLIENT_IP, DEFAULT_CONFIG, DEFAULT_ROUTES, PRESETS, SERVICES, SPOOFED_XFF, STAGES, STATIC_HOST, appendXff,
  handle, isIdempotent, parsePath, retrySafe, parsePrefix, prefixMatches, presetRequests, route, runRequests, type GatewayConfig,
  type Route,
} from './model';

describe('longest-prefix routing', () => {
  /** Reference: compare path segments; a prefix matches when its segments lead the path's; most segments wins. */
  const segs = (p: string) => p.split('/').filter(Boolean);
  const refMatch = (prefix: string, path: string) => {
    const a = segs(prefix);
    const b = segs(path);
    return path.startsWith('/') && a.length <= b.length && a.every((s, i) => s === b[i]);
  };
  const refRoute = (routes: readonly Route[], host: string, path: string) =>
    routes.filter((r) => r.host === host && refMatch(r.prefix, path)).sort((x, y) => segs(y.prefix).length - segs(x.prefix).length)[0] ?? null;

  it('agrees with a segment-by-segment reference on 2,000 seeded tables and paths', () => {
    const rnd = mulberry32(9110);
    const words = ['orders', 'export', 'users', 'ordersx', '2024', 'a', 'static'];
    const randPath = () => `/${Array.from({ length: randInt(0, 4, rnd) }, () => pick(words, rnd)).join('/')}`;
    for (let t = 0; t < 2000; t++) {
      const routes: Route[] = Array.from({ length: randInt(1, 5, rnd) }, (_, i) => ({ id: `r${i}`, host: API_HOST, prefix: randPath(), service: pick(SERVICES, rnd), auth: true }));
      const unique = routes.filter((r, i) => routes.findIndex((x) => x.prefix === r.prefix) === i);
      const path = randPath();
      expect(route(unique, API_HOST, path)?.id ?? null, `${path} in ${unique.map((r) => r.prefix)}`).toBe(refRoute(unique, API_HOST, path)?.id ?? null);
    }
  });

  it('/orders/export beats /orders; /ordersX matches neither; host matters', () => {
    expect(route(DEFAULT_ROUTES, API_HOST, '/orders/export/2024')!.service).toBe('reports');
    expect(route(DEFAULT_ROUTES, API_HOST, '/orders/7')!.service).toBe('orders');
    expect(route(DEFAULT_ROUTES, API_HOST, '/orders')!.service).toBe('orders');
    expect(route(DEFAULT_ROUTES, API_HOST, '/ordersX')).toBeNull();
    expect(prefixMatches('/orders', '/ordersX')).toBe(false);
    expect(route(DEFAULT_ROUTES, STATIC_HOST, '/users/42')!.service).toBe('static');
    expect(route(DEFAULT_ROUTES, 'other.example.com', '/users/42')).toBeNull();
  });
});

describe('the pipeline, every preset in every setting (a decision table)', () => {
  // [preset, auth at the edge, status, the stage that answered, did a service answer]
  const TABLE: [string, boolean, number, string, boolean][] = [
    ['ok', true, 200, 'forward', true], ['ok', false, 200, 'forward', true],
    ['no-token', true, 401, 'auth', false], ['no-token', false, 401, 'forward', true],
    ['unknown', true, 404, 'route', false], ['unknown', false, 404, 'route', false],
    ['down', true, 502, 'forward', false], ['down', false, 502, 'forward', false],
    ['slow', true, 504, 'forward', false], ['slow', false, 504, 'forward', false],
    ['static', true, 200, 'forward', true], ['static', false, 200, 'forward', true],
  ];
  for (const [id, edge, status, stage, fromService] of TABLE)
    for (const spoof of [false, true])
      it(`${id}, auth ${edge ? 'at the edge' : 'in services'}, spoofed XFF ${spoof}`, () => {
        const p = PRESETS.find((x) => x.id === id)!;
        const cfg: GatewayConfig = { ...DEFAULT_CONFIG, authAtEdge: edge, health: { ...DEFAULT_CONFIG.health, ...p.health } };
        const [{ out }] = runRequests(presetRequests(p, spoof), cfg);
        expect([out.status, out.stoppedAt, out.fromService]).toEqual([status, stage, fromService]);
        // Stages always run in the fixed order, up to the one that answered.
        expect(out.ran).toEqual(STAGES.slice(0, STAGES.indexOf(out.stoppedAt) + 1));
      });

  it('the burst: the first five pass, the sixth gets 429 with Retry-After, exactly when the bucket is empty', () => {
    const p = PRESETS.find((x) => x.id === 'burst')!;
    const results = runRequests(presetRequests(p, false), DEFAULT_CONFIG);
    expect(results.map((r) => r.out.status)).toEqual([...Array(BURST - 1).fill(200), 429]);
    const last = results.at(-1)!.out;
    expect(last.stoppedAt).toBe('rate');
    expect(last.bucket.tokens).toBeLessThan(1);
    expect(last.responseHeaders).toContainEqual(['Retry-After', '1']);
  });
});

describe('headers, retries and timeouts', () => {
  it('X-Forwarded-For appends the address the gateway saw, after anything the client sent', () => {
    expect(appendXff(undefined, CLIENT_IP)).toBe(CLIENT_IP);
    expect(appendXff(SPOOFED_XFF, CLIENT_IP)).toBe(`${SPOOFED_XFF}, ${CLIENT_IP}`);
    const p = PRESETS.find((x) => x.id === 'ok')!;
    const [{ out }] = runRequests(presetRequests(p, true), DEFAULT_CONFIG);
    expect(out.forwarded).toContainEqual(['X-Forwarded-For', `${SPOOFED_XFF}, ${CLIENT_IP}`]);
    expect(out.forwarded!.at(-1)).toEqual(['X-User-Id', '42']);
  });

  it('a refused connection is retry-safe for any method; after the request was sent, only idempotent ones are', () => {
    expect(retrySafe('POST', 'refused')).toBe(true);
    expect(retrySafe('POST', 'dropped-after-send')).toBe(false);
    expect(retrySafe('GET', 'dropped-after-send')).toBe(true);
    expect(isIdempotent('GET')).toBe(true);
    expect(isIdempotent('PUT')).toBe(true);
    expect(isIdempotent('POST')).toBe(false);
    const cfg = { ...DEFAULT_CONFIG, health: { ...DEFAULT_CONFIG.health, orders: 'down' as const } };
    const req = { id: 1, t: 0, host: API_HOST, path: '/orders', token: 'valid' as const, peer: CLIENT_IP };
    expect(handle({ ...req, method: 'GET' }, cfg, fullBucket(cfg.bucket)).attempts).toBe(1 + cfg.retries);
    expect(handle({ ...req, method: 'POST' }, cfg, fullBucket(cfg.bucket)).attempts).toBe(1 + cfg.retries);
  });

  it('504 comes exactly when the upstream is slower than the timeout', () => {
    const cfg = { ...DEFAULT_CONFIG, health: { ...DEFAULT_CONFIG.health, reports: 'slow' as const } };
    const req = { id: 1, t: 0, method: 'GET' as const, host: API_HOST, path: '/orders/export', token: 'valid' as const, peer: CLIENT_IP };
    expect(handle(req, cfg, fullBucket(cfg.bucket)).status).toBe(504);
    expect(handle(req, { ...cfg, timeout: 6 }, fullBucket(cfg.bucket)).status).toBe(200);
  });
});

describe('learner-typed prefixes and paths', () => {
  it.each(['/', '/orders', '/orders/export', '/v2/users', '/a.b_c-d'])('prefix %j is accepted', (t) => expect(parsePrefix(t).ok).toBe(true));
  it.each(['', '  ', 'orders', '/orders/', '//x', '/a//b', '/<b>', '/🔥', '/a b', '/../etc', '/x?y=1', '/' + 'a'.repeat(60), '/a,/b', '-1', '1e400'])(
    'prefix %j is refused with a reason', (t) => {
      const r = parsePrefix(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    },
  );
  it('a prefix already in the table is refused', () => expect(parsePrefix('/users', ['/users']).ok).toBe(false));
  it.each(['/orders/export/2024', '/', '/static/logo.png', '/users/'])('path %j is accepted', (t) => expect(parsePath(t).ok).toBe(true));
  it.each(['', 'users', '/u?id=1', '/<script>', '/🔥', '/' + 'x'.repeat(100)])('path %j is refused', (t) => expect(parsePath(t).ok).toBe(false));
});
