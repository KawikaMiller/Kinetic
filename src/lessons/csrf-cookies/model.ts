// The forged-request scenario as a decision pipeline: what the browser attaches, then what the
// server checks, in the order each happens. Everything is a model of two fictional sites; nothing
// is sent anywhere. The "other site" is only ever an abstract, labelled actor.
import { fakeSecret } from '../../core/fakeSecret';

export const SHOP = 'shop.example';
export const OTHER = 'other-site.example';
export const SHOP_ORIGIN = `https://${SHOP}`;
export const OTHER_ORIGIN = `https://${OTHER}`;
/** The session cookie value shown in the request: a made-up demo value. */
export const SESSION_VALUE = fakeSecret('sess', '_demo_', '8f3a21');
/** The page's one-time token the server expects; only shop.example's own pages ever see it. */
export const CSRF_TOKEN = fakeSecret('csrf', '_demo_', 'a91c47');
/** The made-up address the forged request tries to set. */
export const NEW_EMAIL = 'someone@mailbox.example';
export const CUSTOM_HEADER = 'X-Shop-Client';

export type SameSiteMode = 'none' | 'lax' | 'strict';
/** How the other site gets your browser to send the request. */
export type ForgeKind = 'form' | 'fetch' | 'link';
export type Auth = 'cookie' | 'bearer';

export interface Config {
  auth: Auth;
  mode: SameSiteMode;
  kind: ForgeKind;
  /** A CSRF token (synchronizer or double-submit) the server requires. */
  token: boolean;
  /** The server rejects requests whose Origin (or Referer) is another site. */
  origin: boolean;
  /** The server requires a JSON content type and a custom header (which forces a CORS preflight from another site). */
  header: boolean;
}

export const DEFAULT_CONFIG: Config = { auth: 'cookie', mode: 'none', kind: 'form', token: false, origin: false, header: false };

export const KINDS: { id: ForgeKind; label: string; method: 'POST' | 'GET' }[] = [
  { id: 'form', label: 'Auto-submitted form (POST)', method: 'POST' },
  { id: 'fetch', label: 'Script on the other site (POST)', method: 'POST' },
  { id: 'link', label: 'Link you click (GET)', method: 'GET' },
];

export const methodOf = (kind: ForgeKind) => KINDS.find((k) => k.id === kind)!.method;

/**
 * Is the session cookie attached to a request that another site caused? None: always (with
 * Secure). Lax: only on a top-level GET navigation, the link click. Strict: never. The same rule
 * browser-storage teaches.
 */
export function cookieSent(mode: SameSiteMode, kind: ForgeKind): boolean {
  if (mode === 'none') return true;
  if (mode === 'lax') return kind === 'link';
  return false;
}

export type StopPoint = 'preflight' | 'no-credential' | 'origin' | 'token' | 'header';

export interface Outcome {
  /** The browser sent a CORS preflight first (a script adding the custom header makes the request non-simple). */
  preflight: boolean;
  /** The request left the browser at all. */
  sent: boolean;
  /** The browser attached the session cookie. */
  cookieSent: boolean;
  /** The request carried a credential the server can use to know who you are. */
  credential: boolean;
  stoppedAt: StopPoint | null;
  /** The server did what the other site wanted. */
  harm: boolean;
}

/** A script that must add the custom header can't send a "simple" request, so the browser asks first. */
const needsPreflight = (c: Config) => c.header && c.kind === 'fetch';

export function evaluate(c: Config): Outcome {
  if (needsPreflight(c)) {
    return { preflight: true, sent: false, cookieSent: false, credential: false, stoppedAt: 'preflight', harm: false };
  }
  const attached = c.auth === 'cookie' && cookieSent(c.mode, c.kind);
  const base = { preflight: false, sent: true, cookieSent: attached, credential: attached };
  // The server's checks run in this order: who are you, where did this come from, token, header.
  if (!attached) return { ...base, stoppedAt: 'no-credential', harm: false };
  if (c.origin) return { ...base, stoppedAt: 'origin', harm: false };
  if (c.token) return { ...base, stoppedAt: 'token', harm: false };
  if (c.header) return { ...base, stoppedAt: 'header', harm: false };
  return { ...base, stoppedAt: null, harm: true };
}

export const STOP_LABELS: Record<StopPoint, string> = {
  preflight: 'the browser, which asked first and was refused',
  'no-credential': 'the missing credential: the server sees a logged-out request',
  origin: 'the Origin check',
  token: 'the CSRF token check',
  header: 'the custom header and JSON content type check',
};

/** Compare two strings without stopping at the first difference (the token check). */
export function constantTimeEqual(a: string, b: string): { equal: boolean; looked: number } {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return { equal: false, looked: 0 };
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return { equal: diff === 0, looked: x.length };
}

/** What the forged request carries as its token: nothing, because the other site cannot read the page's token. */
export const forgedToken = (): string => '';

export const tokenValid = (sent: string, expected: string) => constantTimeEqual(sent, expected).equal;

export const MODES: SameSiteMode[] = ['none', 'lax', 'strict'];
export const FORGE_KINDS: ForgeKind[] = KINDS.map((k) => k.id);

/** Every combination of the dimensions the lesson lets you change. */
export function allConfigs(): Config[] {
  const out: Config[] = [];
  for (const auth of ['cookie', 'bearer'] as Auth[]) {
    for (const mode of MODES) {
      for (const kind of FORGE_KINDS) {
        for (const token of [false, true]) {
          for (const origin of [false, true]) {
            for (const header of [false, true]) out.push({ auth, mode, kind, token, origin, header });
          }
        }
      }
    }
  }
  return out;
}

export const SERVER_LINES = [
  'const user = sessionFor(request.cookie);',
  'if (!user) return reject(401);',
  `if (request.origin !== '${SHOP_ORIGIN}') return reject(403);`,
  'if (!constantTimeEqual(request.csrfToken, user.csrfToken)) return reject(403);',
  `if (request.header('${CUSTOM_HEADER}') !== 'web' || request.type !== 'application/json') return reject(403);`,
  'user.email = request.body.email;',
] as const;

/** Which server line each defence is, and the line that makes the change. */
export const LINE_OF: Record<'auth' | 'origin' | 'token' | 'header' | 'change', number> = { auth: 1, origin: 2, token: 3, header: 4, change: 5 };
