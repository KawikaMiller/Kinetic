import { describe, expect, it } from 'vitest';
import {
  REQUESTS, START_STORAGE, byteLength, cookieHeader, rejected, sendsCookie, xssReads, type Cookie, type Request,
} from './model';

const req = (id: string) => REQUESTS.find((r) => r.id === id)!;
const cookie = (patch: Partial<Cookie> = {}): Cookie => ({
  name: 'c', value: '1', httpOnly: false, secure: true, sameSite: 'Lax', domain: null, path: '/', ...patch,
});
const sent = (c: Cookie, r: Request) => sendsCookie(c, r).sent;

describe('SameSite send matrix', () => {
  // request id → [Strict, Lax, None] (all Secure, host-only, Path=/)
  const matrix: Record<string, [boolean, boolean, boolean]> = {
    nav: [true, true, true], // same-site navigation
    api: [true, true, true], // same-site fetch
    sub: [false, false, false], // host-only cookie never goes to a subdomain
    link: [false, true, true], // cross-site top-level GET: Lax is sent
    post: [false, false, true], // cross-site POST: Lax is not sent
    img: [false, false, true], // cross-site subresource: Lax is not sent
    http: [false, false, false], // Secure cookies never go over http
  };
  for (const [id, [strict, lax, none]] of Object.entries(matrix)) {
    it(`${id}: Strict ${strict}, Lax ${lax}, None ${none}`, () => {
      expect(sent(cookie({ sameSite: 'Strict' }), req(id))).toBe(strict);
      expect(sent(cookie({ sameSite: 'Lax' }), req(id))).toBe(lax);
      expect(sent(cookie({ sameSite: 'None' }), req(id))).toBe(none);
    });
  }
});

describe('other cookie attributes', () => {
  it('SameSite=None without Secure is refused outright', () => {
    const c = cookie({ sameSite: 'None', secure: false });
    expect(rejected(c)).toMatch(/needs Secure/);
    expect(sent(c, req('nav'))).toBe(false);
  });
  it('a non-Secure cookie does go over plain http', () => {
    expect(sent(cookie({ secure: false }), req('http'))).toBe(true);
  });
  it('Domain=example.com also covers subdomains; host-only does not', () => {
    expect(sent(cookie({ domain: 'example.com' }), req('sub'))).toBe(true);
    expect(sent(cookie({ domain: null }), req('sub'))).toBe(false);
  });
  it('Path=/api matches /api/orders but not /', () => {
    expect(sent(cookie({ path: '/api' }), req('api'))).toBe(true);
    expect(sent(cookie({ path: '/api' }), req('nav'))).toBe(false);
  });
  it('explains why a cookie was left behind', () => {
    const v = sendsCookie(cookie({ sameSite: 'Strict' }), req('link'));
    expect(v.sent).toBe(false);
    if (!v.sent) expect(v.reason).toMatch(/Strict/);
  });
});

describe('the Cookie header', () => {
  it('lists only the cookies that are sent, and costs bytes on every request', () => {
    const header = cookieHeader(START_STORAGE.cookies, req('nav'));
    expect(header).toBe('session=f3a9c1; theme=dark');
    expect(byteLength(header)).toBe(26);
    expect(cookieHeader(START_STORAGE.cookies, req('post'))).toBe('');
  });
});

describe('XSS', () => {
  it('reads localStorage, sessionStorage, IndexedDB and non-HttpOnly cookies, but not HttpOnly ones', () => {
    const stolen = xssReads(START_STORAGE, 'tab1');
    const byKey = Object.fromEntries(stolen.map((s) => [s.key, s]));
    expect(byKey.authToken.value).toBe('eyJhbGciOi…');
    expect(byKey.draftComment.value).not.toBeNull();
    expect(byKey.cart.value).not.toBeNull();
    expect(byKey.theme.value).toBe('dark');
    expect(byKey.session.value).toBeNull();
    expect(byKey.session.protectedBy).toMatch(/HttpOnly/);
  });
  it('a new tab has its own, empty sessionStorage', () => {
    expect(xssReads(START_STORAGE, 'tab2').some((s) => s.drawer === 'session')).toBe(false);
  });
});
