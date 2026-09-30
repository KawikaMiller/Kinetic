import { b64url, enc, hmacSha256 } from '../../core/crypto';

// Real HS256 JWTs via Web Crypto, so tampering genuinely breaks the signature.

export const SERVER_SECRET = 'kinetic-demo-server-secret-9f2c1a';
export const HEADER = { alg: 'HS256', typ: 'JWT' };
export const PAYLOAD = { sub: '42', name: 'Ada', role: 'user', iat: 1767225600, exp: 1767226500 };

export const b64urlJson = (obj: unknown) => b64url(enc.encode(JSON.stringify(obj)));

/** HS256 signature of `data`, base64url; null without Web Crypto. */
export const hmac = (secret: string, data: string) => hmacSha256(secret, data, 'b64url');

export interface Jwt {
  header: string;
  payload: string;
  signature: string;
}

export async function signJwt(payload: object, secret: string): Promise<Jwt | null> {
  const header = b64urlJson(HEADER);
  const body = b64urlJson(payload);
  const signature = await hmac(secret, `${header}.${body}`);
  return signature ? { header, payload: body, signature } : null;
}

/** What the server does on every request: recompute the signature with ITS secret and compare. */
export async function verifyJwt(t: Jwt, secret = SERVER_SECRET) {
  const expected = await hmac(secret, `${t.header}.${t.payload}`);
  return { valid: expected === t.signature, expected };
}
