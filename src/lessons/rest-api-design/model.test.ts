import { describe, expect, it } from 'vitest';
import {
  CODES, ENDPOINTS, IDEMPOTENT, MEANS, METHODS, METHOD_FOR, ORDERS, PROBLEM, SAFE, SCENARIOS, examplePath, judgeStatus, parsePath, problemResponse,
  queryString, roleOf, runQuery, shape, validate, verdict, type Code, type Method,
} from './model';

describe('method properties follow RFC 9110 §9.2', () => {
  // Hand-copied from the RFC's text: §9.2.1 lists GET, HEAD, OPTIONS and TRACE as safe;
  // §9.2.2 adds PUT and DELETE as idempotent. POST and PATCH are neither.
  const all: Method[] = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
  it.each(all)('%s', (m) => {
    expect(SAFE.has(m)).toBe(['GET', 'HEAD', 'OPTIONS'].includes(m));
    expect(IDEMPOTENT.has(m)).toBe(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(m));
  });
  it('every safe method is idempotent', () => {
    for (const m of SAFE) expect(IDEMPOTENT.has(m)).toBe(true);
  });
});

describe('path parsing', () => {
  it.each([
    ['/users/{id}/orders', ['noun', 'id', 'noun'], 'orders', 'collection', 2],
    ['/orders/7', ['noun', 'id'], 'orders', 'item', 1],
    ['/orders/{id}/updateStatus', ['noun', 'id', 'verb'], 'orders', 'action', 1],
    ['/getUser', ['verb'], null, 'action', 0],
    ['/orders/', ['noun'], 'orders', 'collection', 1],
    ['/', [], null, 'root', 0],
    ['/user-settings/{id}', ['noun', 'id'], 'user-settings', 'item', 1],
  ] as const)('%s', (path, roles, resource, kind, depth) => {
    const p = parsePath(path);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.segs.map((s) => s.role)).toEqual(roles);
    expect(p.value.resource).toBe(resource);
    expect(p.value.kind).toBe(kind);
    expect(p.value.depth).toBe(depth);
  });

  it.each([
    ['', 'Type a path'], ['   ', 'Type a path'], ['orders', 'starts with /'], ['/orders?status=paid', 'query string'], ['/orders//7', 'empty segment'],
    ['/a/b/c/d/e/f/g/h/i', 'segments'], ['/orders/<b>', 'plain segment'], ['/orders/🙂', 'plain segment'], ['/orders, /users', 'plain segment'],
    ['/' + 'x'.repeat(90), 'under 80'], ['/1e400', null], ['/-1', null],
  ] as const)('hostile input %j is refused or modelled', (raw, error) => {
    const p = parsePath(raw);
    if (error === null) expect(p.ok).toBe(true);
    else {
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.error).toContain(error);
    }
  });

  it.each([
    ['getUser', 'verb'], ['updateStatus', 'verb'], ['delete-order', 'verb'], ['create_order', 'verb'], ['new', 'verb'],
    ['orders', 'noun'], ['settings', 'noun'], ['updates', 'noun'], ['newsletters', 'noun'], ['{id}', 'id'], ['42', 'id'],
  ] as const)('a verb in a path segment is flagged: %s is a %s', (seg, role) => {
    expect(roleOf(seg)).toBe(role);
  });

  it('fills placeholders with example ids by the collection before them', () => {
    expect(examplePath(shape('/users/{id}/orders'))).toBe('/users/42/orders');
    expect(examplePath(shape('/items/{id}/reviews'))).toBe('/items/3/reviews');
  });
});

describe('the validator', () => {
  const run = (id: string, method: Method, path: string) => validate(ENDPOINTS.find((e) => e.id === id)!.intent, method, shape(path));
  const rules = (id: string, method: Method, path: string) => run(id, method, path).map((f) => f.rule);

  it('labels each rule with where it really comes from', () => {
    expect(run('update-status', 'PATCH', '/orders/{id}')[0].source).toBe('RFC 5789');
    expect(run('update-status', 'PUT', '/orders/{id}')[0].source).toBe('RFC 9110 + RFC 5789');
    expect(run('create-order', 'PUT', '/orders')[0].source).toBe('RFC 9110 + convention');
    expect(run('delete-order', 'POST', '/orders/{id}')[0].source).toBe('RFC 9110 + convention');
    expect(run('get-user', 'GET', '/users/{id}')[0].source).toBe('RFC 9110');
  });
  it('GET must be safe: deleting on GET is flagged, with the crawler reason', () => {
    const f = run('delete-order', 'GET', '/orders/{id}');
    expect(verdict(f)).toBe('bad');
    expect(f[0].rule).toBe('get-must-be-safe');
    expect(f[0].text).toContain('crawler');
    expect(f[0].source).toBe('RFC 9110');
  });
  it('a create goes to the collection with 201 + Location', () => {
    const good = run('create-order', 'POST', '/orders');
    expect(verdict(good)).toBe('ok');
    expect(good[0].text).toContain('201 Created with Location: /orders/8');
    expect(rules('create-order', 'POST', '/orders/{id}')).toContain('create-on-collection');
    expect(rules('create-order', 'PUT', '/orders')).toContain('put-create');
  });
  it('PUT replaces, PATCH changes part', () => {
    expect(rules('update-status', 'PUT', '/orders/{id}')).toEqual(['put-replaces']);
    expect(verdict(run('update-status', 'PATCH', '/orders/{id}'))).toBe('ok');
    expect(verdict(run('save-profile', 'PATCH', '/users/{id}'))).toBe('warn');
    expect(verdict(run('save-profile', 'PUT', '/users/{id}'))).toBe('ok');
  });
  it('PUT and DELETE are called idempotent; POST for an update is flagged as not', () => {
    expect(run('save-profile', 'PUT', '/users/{id}')[0].text).toContain('idempotent');
    expect(run('delete-order', 'DELETE', '/orders/{id}')[0].text).toContain('idempotent');
    expect(rules('update-status', 'POST', '/orders/{id}')).toEqual(['post-not-idempotent']);
    expect(rules('delete-order', 'POST', '/orders/{id}')).toEqual(['delete-method']);
  });
  it('a read on POST is flagged as not safe', () => {
    expect(rules('get-user', 'POST', '/users/{id}')).toEqual(['read-not-safe']);
  });
  it('a verb in the path is a warning, nesting past one level is a warning', () => {
    expect(rules('update-status', 'PATCH', '/orders/{id}/updateStatus')).toEqual(['ends-in-action', 'verb-in-path']);
    const deep = run('deep', 'GET', '/users/{id}/orders/{id}/items/{id}/reviews');
    expect(deep.map((f) => [f.rule, f.level])).toEqual([['too-deep', 'warn'], ['method-fits', 'ok']]);
    expect(verdict(run('deep', 'GET', '/items/{id}/reviews'))).toBe('ok');
  });
  it('a path about another resource is wrong', () => {
    expect(rules('get-user', 'GET', '/user/get/{id}')).toEqual(['wrong-resource', 'verb-in-path']);
  });

  it('every shipped legacy endpoint has at least one flag, and its starting choice is not clean', () => {
    for (const e of ENDPOINTS) expect(verdict(validate(e.intent, e.start.method, shape(e.start.path)))).not.toBe('ok');
  });
  it('among each card\'s chips exactly one method × path is clean: the intended method on the right target', () => {
    for (const e of ENDPOINTS) {
      const clean = METHODS.flatMap((m) => e.paths.filter((p) => verdict(validate(e.intent, m, shape(p))) === 'ok').map((p) => `${m} ${p}`));
      expect(clean, e.id).toHaveLength(1);
      expect(clean[0].startsWith(METHOD_FOR[e.intent.action])).toBe(true);
    }
  });
  it('clean choices carry exactly one ok flag, and no flag has an unfilled placeholder', () => {
    for (const e of ENDPOINTS)
      for (const m of METHODS)
        for (const p of e.paths) {
          const f = validate(e.intent, m, shape(p));
          if (verdict(f) === 'ok') expect(f).toHaveLength(1);
          for (const x of f) expect(x.text).not.toContain('{collection}');
        }
  });
});

describe('status codes', () => {
  const expected: Record<string, Code[]> = {
    created: [201], async: [202], deleted: [204, 200], malformed: [400], invalid: [422, 400], missing: [404], conflict: [409], stale: [412], limited: [429],
  };
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s accepts exactly its codes', (id, s) => {
    for (const c of CODES) expect(judgeStatus(s, c).ok, `${id} ${c}`).toBe(expected[id].includes(c));
  });
  it('a wrong pick explains what the code means', () => {
    const s = SCENARIOS.find((x) => x.id === 'created')!;
    expect(judgeStatus(s, 200).text).toContain('200 OK means success, with the result in the body');
  });
  it('picking 200 for a delete is accepted and explained, never called wrong while the text calls it fine', () => {
    const s = SCENARIOS.find((x) => x.id === 'deleted')!;
    const j = judgeStatus(s, 200);
    expect(j.ok).toBe(true);
    expect(j.text).toContain('200 OK is fine too');
    expect(j.text).not.toContain('Not this one');
    for (const sc of SCENARIOS) for (const c of sc.accepted) expect(judgeStatus(sc, c).text, sc.id + ' ' + c).not.toContain('Not this one');
    expect(judgeStatus(SCENARIOS.find((x) => x.id === 'invalid')!, 400).text).toContain('accepted too');
  });
  it('429 is described with Retry-After as optional, and 400 covers validation in some APIs', () => {
    expect(SCENARIOS.find((x) => x.id === 'limited')!.why).toContain('MAY');
    expect(MEANS[429]).toContain('may say');
    expect(MEANS[400]).toContain('validation');
  });
  it('every code on the board is used by some scenario', () => {
    const used = new Set(SCENARIOS.flatMap((s) => s.accepted));
    expect(CODES.filter((c) => !used.has(c))).toEqual([]);
  });
});

describe('problem details (RFC 9457)', () => {
  it('has the five members, a matching status and the problem+json type', () => {
    expect(Object.keys(PROBLEM).sort()).toEqual(['detail', 'instance', 'status', 'title', 'type']);
    const lines = problemResponse();
    expect(lines[0]).toBe('HTTP/1.1 422 Unprocessable Content');
    expect(lines).toContain('Content-Type: application/problem+json');
    expect(JSON.parse(lines.slice(3).join('\n')).status).toBe(422);
  });
});

describe('the collection query', () => {
  it('builds the query string in a fixed order', () => {
    expect(queryString({ status: 'paid', sort: '-created_at', fields: [] })).toBe('/orders?status=paid&sort=-created_at');
    expect(queryString({ status: null, sort: '-total', fields: ['total', 'id'] })).toBe('/orders?sort=-total&fields=id,total');
  });
  it('filters and sorts (hand-worked against the fixture)', () => {
    expect(runQuery(ORDERS, { status: 'paid', sort: '-created_at', fields: ['id'] })).toEqual([{ id: 6 }, { id: 4 }, { id: 2 }]);
    expect(runQuery(ORDERS, { status: null, sort: '-total', fields: ['id', 'total'] }).slice(0, 3)).toEqual([
      { id: 6, total: 230 }, { id: 3, total: 95 }, { id: 4, total: 64 },
    ]);
    expect(runQuery(ORDERS, { status: 'shipped', sort: 'created_at', fields: [] })).toEqual([ORDERS[0], ORDERS[4]]);
  });
});
