import { b64url, enc, hmacSha256 } from '../../core/crypto';
import { fakeSecret } from '../../core/fakeSecret';

// Real HS256 JWTs (RFC 7519 compact form, signed per RFC 7515 with HMAC-SHA256 via Web
// Crypto), so tampering genuinely breaks the signature. Everything runs in the page against
// a made-up key; nothing is sent anywhere.

/** The server's signing key. Made up for the lesson. */
/**
 * The server's signing key: 32 random bytes as base64url (43 characters), so 256 random
 * bits, the minimum RFC 7518 §3.2 requires for HS256. A demo value, published in this
 * lesson's source, so never a real key.
 */
export const SERVER_SECRET = fakeSecret('KK5IRNsQ', 'KHmAZYOx', 'IgAqHPis', 'JQi2SWHP', 'wRafs759', 'h_s');
/** Random bytes behind SERVER_SECRET: 43 base64url characters carry 6 bits each, so at least 256. */
export const SERVER_KEY_BITS = 256;
/** The key the attacker tries in the Forge lane: a common word, the kind of key that gets guessed. */
export const GUESSED_SECRET = fakeSecret('pass', 'word', '123');

/** The one algorithm this server accepts. Pinning it is RFC 8725 §3.1's first rule. */
export const ALG = 'HS256';
export const HEADER = { alg: ALG, typ: 'JWT' };
/** Issued 2026-01-01 00:00 UTC, valid for 15 minutes. */
export const PAYLOAD = { sub: '42', name: 'Ada', role: 'user', iat: 1767225600, exp: 1767226500 };
/** The lesson's fixed clock: five minutes after the token was issued, so it hasn't expired. */
export const LESSON_NOW = PAYLOAD.iat + 5 * 60;
/** Access-token lifetime, in minutes, for the captions. */
export const LIFETIME_MIN = (PAYLOAD.exp - PAYLOAD.iat) / 60;

export const b64urlJson = (obj: unknown) => b64url(enc.encode(JSON.stringify(obj)));

/** HS256 signature of `data`, base64url; null without Web Crypto. */
export const hmac = (secret: string, data: string) => hmacSha256(secret, data, 'b64url');

export interface Jwt {
  header: string;
  payload: string;
  signature: string;
}

export const compact = (t: Jwt) => `${t.header}.${t.payload}.${t.signature}`;

export async function signJwt(payload: object, secret: string): Promise<Jwt | null> {
  const header = b64urlJson(HEADER);
  const body = b64urlJson(payload);
  const signature = await hmac(secret, `${header}.${body}`);
  return signature ? { header, payload: body, signature } : null;
}

/** Decode one base64url JSON part, or null if it isn't one. */
export function decodePart(part: string): Record<string, unknown> | null {
  try {
    // strict base64url (RFC 7515 §2): no padding, no '+' or '/'
    if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Compare two strings in time that depends only on their length, not on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyReason = 'ok' | 'malformed' | 'wrong-alg' | 'bad-signature' | 'missing-exp' | 'expired';

export interface Verdict {
  valid: boolean;
  reason: VerifyReason;
  /** The signature the server computes over the token's header.payload; null if it never got that far. */
  expected: string | null;
}

/**
 * What the server does on every request: check the header names the one pinned algorithm,
 * recompute the signature with ITS secret and compare in constant time, then check exp
 * against the clock. Signature first, so an unsigned claim is never trusted.
 */
export async function verifyJwt(t: Jwt, secret = SERVER_SECRET, now = LESSON_NOW): Promise<Verdict> {
  const header = decodePart(t.header);
  if (!header) return { valid: false, reason: 'malformed', expected: null };
  if (header.alg !== ALG) return { valid: false, reason: 'wrong-alg', expected: null };
  const expected = await hmac(secret, `${t.header}.${t.payload}`);
  if (expected === null || !constantTimeEqual(expected, t.signature)) return { valid: false, reason: 'bad-signature', expected };
  const claims = decodePart(t.payload);
  if (!claims) return { valid: false, reason: 'malformed', expected };
  if (typeof claims.exp !== 'number') return { valid: false, reason: 'missing-exp', expected };
  if (now >= claims.exp) return { valid: false, reason: 'expired', expected };
  return { valid: true, reason: 'ok', expected };
}

// ── The Forge lane ────────────────────────────────────────────────────

export type Resign = 'keep' | 'guess' | 'leaked';

export interface ForgeResult extends Verdict {
  jwt: Jwt;
  edited: boolean;
}

/** Longest subject the Forge lane accepts, in characters (code points). */
export const SUB_MAX = 6;

/** Trim a typed subject to SUB_MAX characters without splitting an emoji in half. */
export const clampSub = (s: string) => Array.from(s).slice(0, SUB_MAX).join('');

/** Build the attacker's token from the edited claims, signed as chosen, and ask the server. */
export async function forge(sub: string, role: string, resign: Resign): Promise<ForgeResult | null> {
  const original = await signJwt(PAYLOAD, SERVER_SECRET);
  if (!original) return null;
  const body = b64urlJson({ ...PAYLOAD, sub, role });
  const key = resign === 'guess' ? GUESSED_SECRET : SERVER_SECRET;
  const signature = resign === 'keep' ? original.signature : ((await hmac(key, `${original.header}.${body}`)) ?? '');
  const jwt = { header: original.header, payload: body, signature };
  return { jwt, ...(await verifyJwt(jwt)), edited: role !== PAYLOAD.role || sub !== PAYLOAD.sub };
}

export type TamperStory = 'genuine' | 'resigned-same' | 'forged-accepted' | 'guess-rejected' | 'edit-rejected';

/** Which story the Forge lane's caption tells, from the server's actual verdict. */
export function tamperStory(r: Pick<ForgeResult, 'valid' | 'edited'>, resign: Resign): TamperStory {
  if (r.valid) return r.edited ? 'forged-accepted' : resign === 'keep' ? 'genuine' : 'resigned-same';
  return resign === 'guess' ? 'guess-rejected' : 'edit-rejected';
}
