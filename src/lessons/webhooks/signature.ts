// Webhook signing and verification, computed for real: HMAC-SHA-256 over `timestamp.body`
// through core/crypto. Everything runs in the page; nothing is sent anywhere. The secret is a
// fake demo value assembled at runtime (core/fakeSecret), so no credential-shaped literal exists.
import { enc, hmac } from '../../core/crypto';
import { fakeSecret } from '../../core/fakeSecret';

export const SECRET = fakeSecret('whsec', '_demo_', 'not-a-real-', 'signing-secret');
/** How far a delivery's timestamp may be from the receiver's clock, in seconds (illustrative: 5 minutes). */
export const TOLERANCE_S = 300;

/** The example delivery: a fixed time and body, so every number on screen is reproducible. */
export const SIGNED_AT = 1_760_000_000;
export const BODY = '{"id":"evt_1001","type":"payment.succeeded","data":{"payment":"pay_77","amount":2500,"currency":"EUR"}}';

/** What gets signed: the timestamp, a dot, then the exact body bytes. The timestamp is inside the MAC, so it can't be swapped. */
export const signedPayload = (timestamp: string, body: string) => `${timestamp}.${body}`;

/** HMAC-SHA-256 of the signed payload as hex, or null without Web Crypto (an insecure context). */
export const sign = (secret: string, timestamp: string, body: string): Promise<string | null> =>
  hmac(enc.encode(secret), enc.encode(signedPayload(timestamp, body)), { hash: 'SHA-256', out: 'hex' });

export interface Received {
  timestampHeader: string;
  signatureHeader: string;
  body: string;
}

export const SIGNATURE_PREFIX = 'v1=';
const TIMESTAMP = /^\d{1,12}$/;
const SIGNATURE = /^v1=([0-9a-f]{64})$/i;

export type Reject = 'malformed' | 'bad-signature' | 'stale' | 'future';
export type Verdict = { ok: true } | { ok: false; reason: Reject };

export interface Inspection {
  verdict: Verdict;
  /** Seconds between the receiver's clock and the timestamp (positive: the delivery is old). */
  ageS: number | null;
  /** The HMAC the receiver computed, hex. */
  expected: string | null;
  /** The signature that arrived, hex (lower-cased), when it was well-formed. */
  given: string | null;
  /** Hex digits that differ between the two (an HMAC changes completely, not slightly). */
  differing: number | null;
}

/**
 * The receiver's checks, in the order that matters: (1) the headers are well-formed, (2) the
 * signature matches, (3) only then is the timestamp trusted, and judged against the tolerance.
 * Checking the signature first means the timestamp has been authenticated before it's believed.
 *
 * The signature comparison here is a plain `===`: nothing on this page can measure timing. A real
 * receiver compares with its language's constant-time function (Node's `crypto.timingSafeEqual`,
 * Python's `hmac.compare_digest`) after checking the lengths match.
 */
export async function inspect(secret: string, r: Received, nowS: number, toleranceS = TOLERANCE_S): Promise<Inspection | null> {
  const none = (reason: Reject): Inspection => ({ verdict: { ok: false, reason }, ageS: null, expected: null, given: null, differing: null });
  const sig = SIGNATURE.exec(r.signatureHeader);
  if (!TIMESTAMP.test(r.timestampHeader) || !sig) return none('malformed');
  const expected = await sign(secret, r.timestampHeader, r.body);
  if (expected === null) return null;
  const given = sig[1].toLowerCase();
  const ageS = nowS - Number(r.timestampHeader);
  const differing = [...expected].filter((c, i) => c !== given[i]).length;
  const verdict: Verdict = given !== expected ? { ok: false, reason: 'bad-signature' }
    : ageS > toleranceS ? { ok: false, reason: 'stale' }
      : ageS < -toleranceS ? { ok: false, reason: 'future' } : { ok: true };
  return { verdict, ageS, expected, given, differing };
}

/** The delivery the provider signs and sends for the example event. */
export async function signedDelivery(secret = SECRET, timestamp = SIGNED_AT, body = BODY): Promise<Received | null> {
  const ts = String(timestamp);
  const sig = await sign(secret, ts, body);
  return sig === null ? null : { timestampHeader: ts, signatureHeader: SIGNATURE_PREFIX + sig, body };
}

/** The body with one character changed (the "edited in transit" toggle): the amount 2500 becomes 2501. */
export const tamper = (body: string) => body.replace('"amount":2500', '"amount":2501');
