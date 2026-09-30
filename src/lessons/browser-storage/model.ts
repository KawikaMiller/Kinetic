// A simulated browser's storage and the rules for when cookies ride along on a request.
// Nothing here touches the real browser's storage.

export type DrawerId = 'cookies' | 'local' | 'session' | 'idb';

export interface Drawer {
  id: DrawerId;
  name: string;
  /** Approximate: real limits vary by browser. */
  capacity: string;
  persists: string;
  api: 'sync' | 'async';
  holds: string;
  sentWithRequests: boolean;
}

export const DRAWERS: Drawer[] = [
  { id: 'cookies', name: 'Cookies', capacity: '~4 KB each', persists: 'until they expire', api: 'sync', holds: 'short strings', sentWithRequests: true },
  { id: 'local', name: 'localStorage', capacity: '~5 MB per origin', persists: 'until cleared', api: 'sync', holds: 'strings', sentWithRequests: false },
  { id: 'session', name: 'sessionStorage', capacity: '~5 MB per origin', persists: 'this tab only', api: 'sync', holds: 'strings', sentWithRequests: false },
  { id: 'idb', name: 'IndexedDB', capacity: 'large (a share of the disk)', persists: 'until cleared', api: 'async', holds: 'objects, files, blobs', sentWithRequests: false },
];

export type SameSite = 'Strict' | 'Lax' | 'None';

export interface Cookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSite;
  /** null = host-only (exactly the host that set it); 'example.com' = that domain and its subdomains. */
  domain: string | null;
  path: string;
}

/** The site that set the cookies. */
export const SITE_HOST = 'example.com';

export interface Request {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  scheme: 'https' | 'http';
  host: string;
  path: string;
  /** Which site's page started the request. */
  initiator: string;
  /** A navigation the user sees in the address bar (clicking a link), as opposed to an image, iframe or fetch. */
  topLevel: boolean;
}

export const REQUESTS: Request[] = [
  { id: 'nav', label: 'Open example.com', method: 'GET', scheme: 'https', host: 'example.com', path: '/', initiator: 'example.com', topLevel: true },
  { id: 'api', label: 'fetch /api/orders', method: 'GET', scheme: 'https', host: 'example.com', path: '/api/orders', initiator: 'example.com', topLevel: false },
  { id: 'sub', label: 'fetch api.example.com', method: 'GET', scheme: 'https', host: 'api.example.com', path: '/', initiator: 'example.com', topLevel: false },
  { id: 'link', label: 'Link from other.com', method: 'GET', scheme: 'https', host: 'example.com', path: '/', initiator: 'other.com', topLevel: true },
  { id: 'post', label: 'Form POST from other.com', method: 'POST', scheme: 'https', host: 'example.com', path: '/api/transfer', initiator: 'other.com', topLevel: true },
  { id: 'img', label: '<img> on other.com', method: 'GET', scheme: 'https', host: 'example.com', path: '/pixel.gif', initiator: 'other.com', topLevel: false },
  { id: 'http', label: 'Plain http:// visit', method: 'GET', scheme: 'http', host: 'example.com', path: '/', initiator: 'example.com', topLevel: true },
];

/** The registrable domain ("site"): good enough for these hosts (no public-suffix list needed). */
export const siteOf = (host: string) => host.split('.').slice(-2).join('.');

export type Verdict = { sent: true } | { sent: false; reason: string };

/** Browsers refuse to store a SameSite=None cookie that isn't also Secure. */
export function rejected(c: Cookie): string | null {
  return c.sameSite === 'None' && !c.secure ? 'SameSite=None needs Secure, so the browser refuses to store it' : null;
}

function domainMatches(c: Cookie, host: string): boolean {
  if (c.domain === null) return host === SITE_HOST;
  return host === c.domain || host.endsWith(`.${c.domain}`);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === '/') return true;
  return requestPath === cookiePath || requestPath.startsWith(`${cookiePath}/`);
}

/**
 * Whether the browser attaches this cookie to the request (RFC 6265bis):
 * stored at all → Secure needs https → domain and path must match → SameSite:
 * Strict only on same-site requests; Lax also on cross-site top-level GET navigations;
 * None on everything.
 */
export function sendsCookie(c: Cookie, r: Request): Verdict {
  const refused = rejected(c);
  if (refused) return { sent: false, reason: refused };
  if (c.secure && r.scheme !== 'https') return { sent: false, reason: 'Secure: only sent over https' };
  if (!domainMatches(c, r.host)) return { sent: false, reason: c.domain ? `Domain=${c.domain} doesn't cover ${r.host}` : `host-only: set by ${SITE_HOST}, not ${r.host}` };
  if (!pathMatches(c.path, r.path)) return { sent: false, reason: `Path=${c.path} doesn't match ${r.path}` };
  const sameSite = siteOf(r.initiator) === siteOf(r.host);
  if (sameSite || c.sameSite === 'None') return { sent: true };
  if (c.sameSite === 'Lax' && r.topLevel && r.method === 'GET') return { sent: true };
  return {
    sent: false,
    reason: c.sameSite === 'Strict' ? 'SameSite=Strict: never sent on cross-site requests' : 'SameSite=Lax: cross-site, and not a top-level GET navigation',
  };
}

/** The Cookie header the browser would send: "a=1; b=2". */
export function cookieHeader(cookies: Cookie[], r: Request): string {
  return cookies
    .filter((c) => sendsCookie(c, r).sent)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/** UTF-8 byte length of a header value. */
export const byteLength = (s: string) => new TextEncoder().encode(s).length;

// ─── What's in the drawers ───────────────────────────────────────────

export interface Item {
  key: string;
  value: string;
  /** Is this an auth secret? (for the "don't keep tokens here" point) */
  secret?: boolean;
}

export interface Storage {
  cookies: Cookie[];
  local: Item[];
  /** sessionStorage per tab. */
  session: Record<'tab1' | 'tab2', Item[]>;
  idb: Item[];
}

export const START_COOKIES: Cookie[] = [
  { name: 'session', value: 'f3a9c1', httpOnly: true, secure: true, sameSite: 'Lax', domain: null, path: '/' },
  { name: 'theme', value: 'dark', httpOnly: false, secure: true, sameSite: 'Lax', domain: null, path: '/' },
];

export const START_STORAGE: Storage = {
  cookies: START_COOKIES,
  local: [{ key: 'authToken', value: 'eyJhbGciOi…', secret: true }, { key: 'lang', value: 'en-GB' }],
  session: { tab1: [{ key: 'draftComment', value: 'Great post, but…' }], tab2: [] },
  idb: [{ key: 'cart', value: '{ items: 3, total: 42 }' }],
};

export type Tab = 'tab1' | 'tab2';

export interface Stolen {
  drawer: DrawerId;
  key: string;
  value: string | null;
  /** null value = the script tried but couldn't read it. */
  protectedBy?: string;
}

/**
 * What a script injected into the page (XSS) can read from this tab: every
 * localStorage, sessionStorage and IndexedDB entry, and every cookie except HttpOnly ones.
 */
export function xssReads(s: Storage, tab: Tab): Stolen[] {
  return [
    ...s.cookies
      .filter((c) => !rejected(c))
      .map((c): Stolen =>
        c.httpOnly
          ? { drawer: 'cookies', key: c.name, value: null, protectedBy: 'HttpOnly: invisible to document.cookie' }
          : { drawer: 'cookies', key: c.name, value: c.value },
      ),
    ...s.local.map((i): Stolen => ({ drawer: 'local', key: i.key, value: i.value })),
    ...s.session[tab].map((i): Stolen => ({ drawer: 'session', key: i.key, value: i.value })),
    ...s.idb.map((i): Stolen => ({ drawer: 'idb', key: i.key, value: i.value })),
  ];
}
