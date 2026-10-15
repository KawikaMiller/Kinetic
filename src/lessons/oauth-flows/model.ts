import { fakeSecret } from '../../core/fakeSecret';
import { s256 } from './pkce';

export type NodeId = 'browser' | 'app' | 'auth' | 'api' | 'attacker';
export type Kind = 'front' | 'back' | 'ok' | 'bad';
export type Attack = 'none' | 'steal' | 'forge' | 'redirect';
export type Held = 'state' | 'code_verifier' | 'code' | 'access_token' | 'refresh_token' | 'id_token';
/** How a run ends: the normal flow works, an attack is blocked, or it gets through. */
export type Outcome = 'printed' | 'blocked' | 'leaked' | 'hijacked';
/** Where an attack was stopped: by the authorization server before it issued a code, by the app on the callback, or at /token. */
export type BlockedAt = 'authorize' | 'callback' | 'token';

/** The three defences the lesson lets you switch, plus the scope. */
export interface Defences {
  /** The app sends a code_challenge and proves it with the code_verifier at /token. */
  pkce: boolean;
  /** The app sends a state value and checks it when the browser comes back. */
  state: boolean;
  /** The authorization server compares the whole redirect_uri with the registered one; off means it accepts any URL on the same site. */
  exactRedirect: boolean;
}
export interface Opts extends Defences {
  attack: Attack;
  /** The openid scope: the response also carries an id_token. */
  oidc: boolean;
}

/** The wires of the scene: every message travels along one of these (in either direction). */
export const SCENE_EDGES: [NodeId, NodeId][] = [
  ['browser', 'app'], ['browser', 'auth'], ['app', 'auth'], ['app', 'api'],
  ['browser', 'attacker'], ['attacker', 'auth'], ['attacker', 'api'],
];

/** The defences all on, no attacker, the openid scope: how the lesson loads. */
export const DEFAULT_OPTS: Opts = { pkce: true, state: true, exactRedirect: true, attack: 'none', oidc: true };

export const DEFENCE_NAMES: Record<keyof Defences, string> = { pkce: 'PKCE', state: 'State check', exactRedirect: 'Exact redirect_uri' };
export const countDefences = (d: Defences) => [d.pkce, d.state, d.exactRedirect].filter(Boolean).length;

// ── The made-up parties and their (fake) values ─────────────────────
export const CLIENT_ID = 'photoprint';
export const REGISTERED_REDIRECT = 'https://photoprint.app/cb';
/** What a loose server accepts: any URL under the registered site. The attacker's is a path on the app's own site that forwards elsewhere. */
export const SITE_PREFIX = 'https://photoprint.app/';
export const FORWARDING_REDIRECT = 'https://photoprint.app/forward';
export const AUTHORIZE_BASE = 'https://accounts.photos/authorize';
export const SCOPE = 'photos.read';
export const OIDC_SCOPE = 'openid photos.read';
export const VICTIM = 'ada';
export const ATTACKER = 'mallory';
export const VICTIM_STATE = 'xyz123';
export const ATTACKER_STATE = 'att456';

/** The code_verifier from the PKCE specification's own worked example, and one the attacker picks for its own flow. */
export const VICTIM_VERIFIER = fakeSecret('dBjftJeZ4CVP-mB92K27', 'uhbUJU1p1r_wW1gFWFOEjXk');
export const ATTACKER_VERIFIER = fakeSecret('attacker-chosen-verifier-', 'for-its-own-flow-00000');
/** Codes the authorization server hands out, in order. Fake values, assembled from parts. */
const CODES = [fakeSecret('SplxlOBeZQQY', 'bYS6WxSbIA'), fakeSecret('Qm4RtXz8Wd', 'LpN2vCy7Ka'), fakeSecret('Hs9GfJb3Ue', 'TkM6oRa1Zp')];

/** Illustrative lifetimes shown on the chips: made up, and not what any real server uses. */
export const ILLUSTRATIVE = { codeSeconds: 60, accessMinutes: 60 };

// ── The authorization server ────────────────────────────────────────
export interface AuthRequest {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}
export interface TokenRequest {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier?: string;
}
type Rejection = 'unknown_code' | 'code_reused' | 'client_mismatch' | 'redirect_mismatch' | 'verifier_missing' | 'verifier_mismatch';
export type AuthorizeResult = { ok: true; code: string; redirectTo: string } | { ok: false; error: 'invalid_redirect_uri' | 'unauthorized_client' };
export type TokenResult = { ok: true; account: string; grants: Held[] } | { ok: false; error: 'invalid_grant'; reason: Rejection };

interface CodeRecord extends AuthRequest {
  account: string;
  used: boolean;
}

/**
 * A small authorization server: it checks the redirect_uri before it issues a code, remembers
 * what each code was bound to, and checks those bindings at /token. Written for this lesson;
 * the checks follow RFC 6749 (single-use codes, the same redirect_uri at /token) and RFC 7636
 * (S256 challenge and verifier).
 */
export class AuthServer {
  private codes = new Map<string, CodeRecord>();
  private issued = 0;

  private readonly exactRedirect: boolean;

  constructor(exactRedirect: boolean) {
    this.exactRedirect = exactRedirect;
  }

  private redirectAllowed(uri: string) {
    return this.exactRedirect ? uri === REGISTERED_REDIRECT : uri.startsWith(SITE_PREFIX);
  }

  authorize(req: AuthRequest, account: string): AuthorizeResult {
    if (req.client_id !== CLIENT_ID) return { ok: false, error: 'unauthorized_client' };
    if (!this.redirectAllowed(req.redirect_uri)) return { ok: false, error: 'invalid_redirect_uri' };
    const code = CODES[this.issued++ % CODES.length];
    this.codes.set(code, { ...req, account, used: false });
    const query = [`code=${code}`, req.state ? `state=${req.state}` : null].filter(Boolean).join('&');
    return { ok: true, code, redirectTo: `${req.redirect_uri}?${query}` };
  }

  token(req: TokenRequest): TokenResult {
    const rec = this.codes.get(req.code);
    const fail = (reason: Rejection): TokenResult => ({ ok: false, error: 'invalid_grant', reason });
    if (!rec) return fail('unknown_code');
    if (rec.used) return fail('code_reused');
    if (rec.client_id !== req.client_id) return fail('client_mismatch');
    if (rec.redirect_uri !== req.redirect_uri) return fail('redirect_mismatch');
    if (rec.code_challenge) {
      if (!req.code_verifier) return fail('verifier_missing');
      if (s256(req.code_verifier) !== rec.code_challenge) return fail('verifier_mismatch');
    }
    rec.used = true;
    const grants: Held[] = rec.scope.split(' ').includes('openid') ? ['access_token', 'refresh_token', 'id_token'] : ['access_token', 'refresh_token'];
    return { ok: true, account: rec.account, grants };
  }
}

// ── The client app (PhotoPrint, a public client: no client secret) ──
export class Client {
  pending: { state?: string; verifier?: string } | null = null;

  private readonly d: Defences & { oidc: boolean };

  constructor(d: Defences & { oidc: boolean }) {
    this.d = d;
  }

  /** The user clicks "Connect Photos": remember what this attempt needs to check later, and build the request. */
  begin(): AuthRequest {
    this.pending = {
      ...(this.d.state ? { state: VICTIM_STATE } : {}),
      ...(this.d.pkce ? { verifier: VICTIM_VERIFIER } : {}),
    };
    return {
      client_id: CLIENT_ID,
      redirect_uri: REGISTERED_REDIRECT,
      scope: this.d.oidc ? OIDC_SCOPE : SCOPE,
      ...(this.d.state ? { state: VICTIM_STATE } : {}),
      ...(this.d.pkce ? { code_challenge: s256(VICTIM_VERIFIER), code_challenge_method: 'S256' as const } : {}),
    };
  }

  /** The browser arrives at the callback with a code: check state (if the app does), then build the /token request. */
  onCallback(params: { code: string; state?: string }): { ok: true; token: TokenRequest } | { ok: false; error: 'state_mismatch' } {
    if (this.d.state && params.state !== this.pending?.state) return { ok: false, error: 'state_mismatch' };
    return {
      ok: true,
      token: { code: params.code, client_id: CLIENT_ID, redirect_uri: REGISTERED_REDIRECT, code_verifier: this.pending?.verifier },
    };
  }
}

// ── The steps of one run ────────────────────────────────────────────
export interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
}
export interface UrlView {
  base: string;
  params: [string, string][];
}
export type StepId =
  | 'intro' | 'click' | 'verifier' | 'redirect-out' | 'arrive' | 'login' | 'consent' | 'code-back' | 'callback' | 'token' | 'verified' | 'tokens'
  | 'id-token' | 'api-call' | 'api-ok' | 'api-delete' | 'api-403' | 'summary'
  | 'grab' | 'race' | 'blocked-token' | 'leak-tokens' | 'leak-call' | 'leak-photos'
  | 'att-start' | 'att-code' | 'att-lure' | 'forged-callback' | 'state-reject' | 'forged-token' | 'forge-blocked' | 'hijacked'
  | 'crafted-link' | 'crafted-arrive' | 'redirect-error' | 'code-to-attacker' | 'redeem';

export interface Step {
  id: StepId;
  msg: Msg | null;
  busy: NodeId | null;
  url: UrlView | null;
  screen: 'none' | 'login' | 'consent' | 'error';
  app: Held[];
  att: Held[];
  signedIn: boolean;
  outcome: Outcome | null;
  photosLeaked: boolean;
  hold?: number;
  /** Facts the caption quotes: what the model decided at this step. */
  data: { redirectMatch?: 'exact' | 'site'; reason?: string; blockedAt?: BlockedAt; account?: string; grants?: Held[]; code?: string };
}

/** An authorization request as the URL bar shows it, parameters in the order a client writes them. */
export function authorizeUrl(req: AuthRequest): UrlView {
  const params: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', req.client_id],
    ['redirect_uri', req.redirect_uri],
    ['scope', req.scope.replace(' ', '%20')],
  ];
  if (req.state) params.push(['state', req.state]);
  if (req.code_challenge) params.push(['code_challenge', req.code_challenge], ['code_challenge_method', req.code_challenge_method ?? 'S256']);
  return { base: AUTHORIZE_BASE, params };
}

/** A callback URL as the URL bar shows it, from the server's redirect. */
export function callbackUrl(redirectTo: string): UrlView {
  const [base, query] = redirectTo.split('?');
  return { base, params: query.split('&').map((p) => p.split('=') as [string, string]) };
}

