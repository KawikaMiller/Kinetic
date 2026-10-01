import { describe, expect, it } from 'vitest';
import { corsCheck, isSafelistedHeader, isSimple, preflightRequestHeaders, send, type ClientRequest, type Method, type ServerConfig } from './cors';

const ORIGIN = 'https://app.example.com';
const req = (method: Method, headers: Record<string, string> = {}, credentials = false): ClientRequest => ({ method, path: '/orders', headers, credentials });
const OPEN: ServerConfig = { allowOrigin: 'exact', allowCredentials: true, preflight: { methods: ['GET', 'POST', 'PUT', 'DELETE'], headers: ['content-type', 'x-api-key'] } };

describe('simple requests (Fetch standard)', () => {
  it('allows only GET, HEAD and POST without a preflight', () => {
    for (const m of ['GET', 'HEAD', 'POST'] as Method[]) expect(isSimple(req(m))).toBe(true);
    for (const m of ['PUT', 'PATCH', 'DELETE'] as Method[]) expect(isSimple(req(m))).toBe(false);
  });
  it('allows only the three safelisted content types', () => {
    expect(isSimple(req('POST', { 'Content-Type': 'application/x-www-form-urlencoded' }))).toBe(true);
    expect(isSimple(req('POST', { 'Content-Type': 'multipart/form-data; boundary=x' }))).toBe(true);
    expect(isSimple(req('POST', { 'content-type': 'TEXT/PLAIN;charset=utf-8' }))).toBe(true);
    expect(isSimple(req('POST', { 'Content-Type': 'application/json' }))).toBe(false);
  });
  it('allows only the safelisted request headers', () => {
    expect(isSafelistedHeader('Accept', 'application/json')).toBe(true);
    expect(isSafelistedHeader('Accept-Language', 'en')).toBe(true);
    expect(isSafelistedHeader('Content-Language', 'en')).toBe(true);
    expect(isSimple(req('GET', { 'X-Api-Key': 'demo' }))).toBe(false);
    expect(isSimple(req('GET', { Authorization: 'Bearer demo' }))).toBe(false);
  });
  it('rejects a safelisted header whose value is over 128 bytes', () => {
    expect(isSafelistedHeader('Accept', 'x'.repeat(129))).toBe(false);
  });
});

describe('the CORS check on a response', () => {
  it('fails with no Access-Control-Allow-Origin', () => {
    expect(corsCheck([], ORIGIN, false).ok).toBe(false);
  });
  it('accepts * without credentials, and the exact origin', () => {
    expect(corsCheck([['Access-Control-Allow-Origin', '*']], ORIGIN, false).ok).toBe(true);
    expect(corsCheck([['Access-Control-Allow-Origin', ORIGIN]], ORIGIN, false).ok).toBe(true);
    expect(corsCheck([['Access-Control-Allow-Origin', 'https://other.example']], ORIGIN, false).ok).toBe(false);
  });
  it('never accepts * with credentials, and needs Allow-Credentials: true', () => {
    expect(corsCheck([['Access-Control-Allow-Origin', '*'], ['Access-Control-Allow-Credentials', 'true']], ORIGIN, true).ok).toBe(false);
    expect(corsCheck([['Access-Control-Allow-Origin', ORIGIN]], ORIGIN, true).ok).toBe(false);
    expect(corsCheck([['Access-Control-Allow-Origin', ORIGIN], ['Access-Control-Allow-Credentials', 'true']], ORIGIN, true).ok).toBe(true);
  });
});

describe('sending a request', () => {
  it('a simple GET to a server with no CORS headers still reaches the server, but the page cannot read it', () => {
    const o = send(req('GET'), { allowOrigin: 'none', allowCredentials: false, preflight: null }, ORIGIN, 'browser');
    expect(o.preflighted).toBe(false);
    expect(o.reachedServer).toBe(true);
    expect(o.readable).toBe(false);
  });
  it('a JSON POST is preflighted, and if the preflight fails the POST never reaches the server', () => {
    const o = send(req('POST', { 'Content-Type': 'application/json' }), { allowOrigin: 'exact', allowCredentials: false, preflight: null }, ORIGIN, 'browser');
    expect(o.preflighted).toBe(true);
    expect(o.reachedServer).toBe(false);
    expect(o.readable).toBe(false);
  });
  it('an allowed preflight lets the request through and the response be read', () => {
    const o = send(req('DELETE', { 'X-Api-Key': 'demo' }), OPEN, ORIGIN, 'browser');
    expect(o.steps.map((s) => s.kind)).toEqual(['preflight', 'request', 'response']);
    expect(o.readable).toBe(true);
  });
  it('a header missing from Allow-Headers fails the preflight', () => {
    const o = send(req('GET', { Authorization: 'Bearer demo' }), OPEN, ORIGIN, 'browser');
    expect(o.reachedServer).toBe(false);
  });
  it('a method missing from Allow-Methods fails the preflight (safelisted methods need no listing)', () => {
    expect(send(req('PATCH', { 'Content-Type': 'application/json' }), OPEN, ORIGIN, 'browser').reachedServer).toBe(false);
    const onlyPut: ServerConfig = { ...OPEN, preflight: { methods: ['PUT'], headers: ['content-type'] } };
    expect(send(req('POST', { 'Content-Type': 'application/json' }), onlyPut, ORIGIN, 'browser').readable).toBe(true);
  });
  it('cookies with a wildcard server: reaches the server, blocked for the page', () => {
    const o = send(req('GET', {}, true), { allowOrigin: 'wildcard', allowCredentials: true, preflight: null }, ORIGIN, 'browser');
    expect(o.reachedServer).toBe(true);
    expect(o.readable).toBe(false);
  });
  it('curl ignores all of it', () => {
    for (const r of [req('GET'), req('DELETE', { 'X-Api-Key': 'demo' }, true)]) {
      const o = send(r, { allowOrigin: 'none', allowCredentials: false, preflight: null }, ORIGIN, 'curl');
      expect(o.readable).toBe(true);
      expect(o.preflighted).toBe(false);
    }
  });
});

describe('headers on the wire', () => {
  const json: ClientRequest = { method: 'DELETE', path: '/api/items/1', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: true };
  it('the preflight asks for the method and only the non-safelisted headers', () => {
    expect(preflightRequestHeaders(json, ORIGIN)).toEqual([
      ['Origin', ORIGIN], ['Access-Control-Request-Method', 'DELETE'], ['Access-Control-Request-Headers', 'content-type'],
    ]);
  });
  it('a request the browser never sent lists no headers, and curl never sends the browser cookie', () => {
    const blocked = send(json, { allowOrigin: 'none', allowCredentials: false, preflight: null }, ORIGIN, 'browser');
    expect(blocked.reachedServer).toBe(false);
    expect(blocked.requestHeaders).toEqual([]);
    expect(blocked.preflightRequest).not.toBeNull();
    const curl = send(json, { allowOrigin: 'none', allowCredentials: false, preflight: null }, ORIGIN, 'curl');
    expect(curl.requestHeaders.some(([n]) => n === 'Cookie')).toBe(false);
  });
});
